/**
 * Server-block toolkit  — pure helpers the build and serve paths use:
 * value encoding, source stripping, name-collision checks, static-page rules
 * and execution of a block's raw TypeScript body.
 *
 * Nothing here runs at parse time; execution happens only where the caller
 * asks for it (build / ssr).
 */

import { validateSerializable, containsSecret, toJsonSafe, ServerSerializationError, scanNonSerializableInitializers, scanEnvInMarkup, lintSql, lintSsrf, collectReferencedNames, secretEnvValues } from "./serialize";
import * as ts from "typescript";
import type { Program, ServerBlock } from "../ast/nodes";

// --- Encoding (matches `state { }`) -----------------------------------------

/**
 * Encode a runtime value into the template scope exactly the way a `state { }`
 * literal of the same value is encoded: strings as-is, numbers/booleans via
 * `String`, `null` as "null", `undefined` as "", objects/arrays as JSON.
 * (See the state-literal encoding table in the report.)
 */
export function encodeServerValue(v: unknown): string {
  if (v === undefined) return "";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "";
  }
}

/** Encode a whole `{ ...declaredNames }` result into stateVars. */
export function encodeServerValues(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(values)) out[k] = encodeServerValue(values[k]);
  return out;
}

// --- Collect / strip ---------------------------------------------------------

export function collectServerBlocks(program: Program): ServerBlock[] {
  return ((program.directives as any[]) ?? []).filter((d) => d.type === "ServerBlock") as ServerBlock[];
}

/**
 * Replace every server-block region with spaces, keeping offsets and newlines
 * intact, so a raw-source scan (e.g. client-import collection) never sees the
 * block or its imports. Uses the block's char offsets, not a regex.
 */
export function stripServerBlockRegions(source: string, blocks: ServerBlock[]): string {
  if (!blocks.length) return source;
  const chars = source.split("");
  for (const b of blocks) {
    const start = Math.max(0, b.startOffset);
    const end = Math.min(chars.length, b.endOffset);
    for (let i = start; i < end; i++) {
      if (chars[i] !== "\n") chars[i] = " ";
    }
  }
  return chars.join("");
}

// --- Collisions --------------------------------------------------------------

/** Names declared in both a `server { }` block and `state { }` on the same page. */
export function serverStateCollisions(program: Program): { name: string; line: number; col: number }[] {
  const stateNames = new Set<string>();
  for (const d of (program.directives as any[]) ?? []) {
    if (d.type === "StateDirective") for (const decl of d.declarations ?? []) stateNames.add(decl.name);
  }
  const out: { name: string; line: number; col: number }[] = [];
  for (const b of collectServerBlocks(program)) {
    for (const n of b.declaredNames) {
      if (stateNames.has(n)) out.push({ name: n, line: b.line, col: b.col });
    }
  }
  return out;
}

/** Server-declared names that clash with a route param name. */
export function serverRouteParamCollisions(blocks: ServerBlock[], paramNames: Iterable<string>): { name: string; line: number; col: number }[] {
  const params = new Set(paramNames);
  const out: { name: string; line: number; col: number }[] = [];
  for (const b of blocks) {
    for (const n of b.declaredNames) {
      if (params.has(n)) out.push({ name: n, line: b.line, col: b.col });
    }
  }
  return out;
}

// --- Static-page rules (direct access only) ---------------------------------

const REQUEST_IDENTIFIERS = new Set(["headers", "cookies", "query", "params"]);

/**
 * Which request-context names a block reads **directly** (as a bare identifier
 * or the object of a member/element access). Uses a real TS AST walk, not a
 * regex. Indirect access (aliases, helpers) is left to the runtime guard.
 */
export function scanRequestAccess(body: string): Set<string> {
  const found = new Set<string>();
  if (!body.trim()) return found;
  const sf = ts.createSourceFile("s.ts", body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node: ts.Node) => {
    // Direct member/element access (`cookies.x`, `headers["y"]`). A bare
    // binding (`const c = cookies`) is left to the runtime trap, which fires
    // on the first property access.
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const obj = node.expression;
      if (ts.isIdentifier(obj) && REQUEST_IDENTIFIERS.has(obj.text)) found.add(obj.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// --- Execution ---------------------------------------------------------------

export interface ServerRequestContext {
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  env?: Record<string, string>;
  /** The request's existing session (attached by the middleware), or null. */
  session?: any;
  /** server.loginPath from tw.config.ts (default "/login"). */
  loginPath?: string;
}

/** Remove the block's own `import ...` statements from its body. */
function stripImports(body: string, imports: { source: string }[]): string {
  let out = body;
  for (const imp of imports) {
    const idx = out.indexOf(imp.source);
    if (idx >= 0) out = out.slice(0, idx) + out.slice(idx + imp.source.length);
  }
  return out;
}

function runOne(block: ServerBlock, bindings: Record<string, unknown>): Promise<Record<string, unknown>> {
  const body = stripImports(block.source, block.imports);
  const names = block.declaredNames;
  const params = Object.keys(bindings);
  const src =
    `async function __tw_server_block(${params.join(", ")}) {\n${body}\n` +
    `return { ${names.map((n) => `${JSON.stringify(n)}: typeof ${n} !== "undefined" ? ${n} : undefined`).join(", ")} };\n}`;
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  // The code is the project's own authored source — the same trust level as any
  // server code the app runs (mirrors the .twm loader).
  const factory = new Function(`${js}\nreturn __tw_server_block;`)() as (...a: unknown[]) => Promise<Record<string, unknown>>;
  return factory(...params.map((p) => bindings[p]));
}

/**
 * Run a block. The request context is frozen; `env` is included. `scope`
 * carries names declared by earlier blocks (they run in source order sharing
 * one scope). `imports` are the block's resolved import bindings.
 */
export async function executeServerBlock(
  block: ServerBlock,
  opts: { context?: ServerRequestContext; imports?: Record<string, unknown>; scope?: Record<string, unknown>; omit?: string[]; omitRuntime?: string[]; label?: string; signal?: RedirectSignal; fetch?: any; trapCode?: string } = {},
): Promise<Record<string, unknown>> {
  const ctx = Object.freeze({
    params: Object.freeze({ ...(opts.context?.params ?? {}) }),
    query: Object.freeze({ ...(opts.context?.query ?? {}) }),
    headers: Object.freeze({ ...(opts.context?.headers ?? {}) }),
    cookies: Object.freeze({ ...(opts.context?.cookies ?? {}) }),
    env: Object.freeze({ ...(opts.context?.env ?? {}) }),
  });
  const signal = opts.signal;
  const helpers = makeRuntimeHelpers(opts.context?.session ?? null, opts.context?.loginPath ?? "/login", signal);
  const bindings: Record<string, unknown> = {
    ...(opts.scope ?? {}),
    ...(opts.imports ?? {}),
    params: ctx.params,
    query: ctx.query,
    headers: ctx.headers,
    cookies: ctx.cookies,
    env: ctx.env,
    getSession: helpers.getSession,
    requireUser: helpers.requireUser,
    redirect: helpers.redirect,
    notFound: helpers.notFound,
    // The `fetch` seen inside a block is the serverFetch shim (timeout, cache,
    // dedupe). Falls back to the platform fetch when the caller passes none.
    fetch: opts.fetch ?? globalThis.fetch,
  };
  // A static page's block must not see headers/cookies/query (or params without
  // enumerated params): bind them to a value that throws a named error on any
  // access, so aliasing/destructuring is caught at build time too.
  for (const name of opts.omit ?? []) bindings[name] = unavailable(name, opts.label, opts.trapCode);
  for (const name of opts.omitRuntime ?? []) bindings[name] = unavailableHelper(name, opts.label, opts.trapCode);

  // A redirect/notFound recorded at throw time is honoured even if user code
  // caught the exception.
  let out: Record<string, unknown> | undefined;
  try {
    out = await runOne(block, bindings);
  } catch (e) {
    if (signal?.redirect) throw new ServerRedirect(signal.redirect);
    if (signal?.notFound) throw new ServerNotFound();
    throw e;
  }
  if (signal?.redirect) throw new ServerRedirect(signal.redirect);
  if (signal?.notFound) throw new ServerNotFound();
  return out ?? {};
}

/** A stand-in for an unavailable context name: any access throws TW106. */
function unavailable(name: string, label?: string, code = "TW106"): any {
  const msg = `${code}: '${name}' is not available in this server block${label ? ` (${label})` : ""}`;
  const boom = (): never => { throw new Error(msg); };
  return new Proxy({}, { get: boom, has: boom, ownKeys: boom, getOwnPropertyDescriptor: boom });
}

/** A stand-in for a runtime helper unavailable in a static block (TW107/TW108). */
function unavailableHelper(name: string, label?: string, codeOverride?: string): any {
  const code = codeOverride ?? (name === "getSession" || name === "requireUser" ? "TW107" : "TW108");
  const msg = `${code}: ${name}() is not available in this server block${label ? ` (${label})` : ""}`;
  return (..._a: any[]): never => { throw new Error(msg); };
}

/** Run every block in source order, threading one shared scope. Each block
 * run is bounded by `timeoutMs` (default 10s); the timeout stops waiting but
 * does not cancel the running block. */
export async function executeServerBlocks(
  blocks: ServerBlock[],
  opts: { context?: ServerRequestContext; imports?: Record<string, unknown>; timeoutMs?: number; omit?: string[]; omitRuntime?: string[]; label?: string; signal?: RedirectSignal; fetch?: any; trapCode?: string; referenced?: Set<string>; maxPayloadBytes?: number; secrets?: { name: string; value: string }[]; scope?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> {
  const scope: Record<string, unknown> = { ...(opts.scope ?? {}) };
  const ms = opts.timeoutMs ?? DEFAULT_SERVER_BLOCK_TIMEOUT_MS;
  const signal = opts.signal ?? {};
  const secrets = opts.secrets ?? [];
  for (const b of blocks) {
    const vals = await withTimeout(
      executeServerBlock(b, { context: opts.context, imports: opts.imports, scope, omit: opts.omit, omitRuntime: opts.omitRuntime, label: opts.label, signal, fetch: opts.fetch, trapCode: opts.trapCode }),
      ms,
      `block at line ${b.line}`,
    );
    // Only referenced declared names cross; each is validated, checked for
    // secrets and counted toward the size cap.
    for (const [k, v] of Object.entries(vals)) {
      if (opts.referenced && !opts.referenced.has(k)) continue;
      validateSerializable(v, opts.label ?? "<block>", k);
      const sec = containsSecret(v, secrets);
      if (sec) throw new ServerSerializationError("class-instance", opts.label ?? "<block>", k, "");
      scope[k] = v;
    }
  }
  if (opts.maxPayloadBytes && opts.maxPayloadBytes > 0) {
    let bytes = 0;
    for (const v of Object.values(scope)) bytes += toJsonSafe(v).length;
    if (bytes > opts.maxPayloadBytes) {
      throw new Error(`TW114: server-block payload is ${bytes} bytes, over the ${opts.maxPayloadBytes}-byte cap${opts.label ? ` [${opts.label}]` : ""}`);
    }
  }
  return scope;
}

// --- Runtime helpers (available inside server blocks only) -------------------

export const SERVER_REDIRECT_BRAND = Symbol.for("tw.serverRedirect");
export const SERVER_NOT_FOUND_BRAND = Symbol.for("tw.serverNotFound");

/** Thrown by redirect(); carries the validated target. */
export class ServerRedirect extends Error {
  readonly [SERVER_REDIRECT_BRAND] = true;
  constructor(public target: string) { super("TW server redirect: " + target); this.name = "ServerRedirect"; }
}
/** Thrown by notFound(). */
export class ServerNotFound extends Error {
  readonly [SERVER_NOT_FOUND_BRAND] = true;
  constructor() { super("TW server not found"); this.name = "ServerNotFound"; }
}
export const isServerRedirect = (e: any): e is ServerRedirect => !!(e && (e as any)[SERVER_REDIRECT_BRAND]);
export const isServerNotFound = (e: any): e is ServerNotFound => !!(e && (e as any)[SERVER_NOT_FOUND_BRAND]);

/**
 * Same-origin internal path check, by PARSING. Rejects absolute URLs,
 * protocol-relative `//`, `\` and `%5C` variants, `%2F` at position 1,
 * control characters (raw or percent-encoded), non-`/` schemes, empty or
 * non-string values, and relative paths without a leading `/`.
 */
export function isValidRedirectTarget(target: unknown): target is string {
  if (typeof target !== "string" || target.length === 0) return false;
  if (!target.startsWith("/")) return false;
  if (target.startsWith("//")) return false;
  if (target[1] === "\\") return false;
  if (/^\/%2f/i.test(target) || /^\/%5c/i.test(target)) return false;
  if (/[\u0000-\u001f\u007f]/.test(target)) return false;
  if (/%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(target)) return false;
  try {
    const u = new URL(target, "http://x.invalid");
    if (u.origin !== "http://x.invalid") return false;
    if (!u.pathname.startsWith("/")) return false;
    return true;
  } catch { return false; }
}

export interface ServerRuntimeHelpers {
  getSession: () => any;
  requireUser: () => any;
  redirect: (target: string) => never;
  notFound: () => never;
}

/**
 * The four runtime helpers, built from the request's existing session.
 * `requireUser()` mapping: `session.user` if present, else `session.data`,
 * else the session object itself.
 */
export function makeRuntimeHelpers(session: any, loginPath: string, signal?: RedirectSignal): ServerRuntimeHelpers {
  // Only `{ id, ...data }` is exposed -- never sessionId, ipHash, userAgentHash
  // or the raw session object. A session with no userId is anonymous.
  const sanitize = (s: any) =>
    (s && typeof s === "object" && s.userId) ? { id: s.userId, ...(s.data ?? {}) } : null;
  return {
    getSession: () => sanitize(session),
    requireUser: () => {
      const u = sanitize(session);
      if (!u) { if (signal) signal.redirect = loginPath; throw new ServerRedirect(loginPath); }
      return u;
    },
    redirect: (target: string) => {
      if (!isValidRedirectTarget(target)) throw new Error("TW109: redirect() target must be a same-origin internal path: " + String(target));
      if (signal) signal.redirect = target;
      throw new ServerRedirect(target);
    },
    notFound: () => { if (signal) signal.notFound = true; throw new ServerNotFound(); },
  };
}

/** Records a redirect/notFound at THROW time so a user try/catch cannot hide it. */
export interface RedirectSignal { redirect?: string; notFound?: boolean; }

// --- Imports + timeout -------------------------------------------------------

export const DEFAULT_SERVER_BLOCK_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (!(ms > 0)) return p;
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`server block timed out after ${ms}ms (${label})`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

/** Names an `import ... from "x"` statement introduces, best-effort. */
function importBindingNames(stmt: string): string[] {
  const names: string[] = [];
  const s = stmt.replace(/^import\s+(type\s+)?/, "");
  const fromIdx = s.lastIndexOf(" from ");
  if (fromIdx < 0) return names;
  const clause = s.slice(0, fromIdx).trim();
  if (clause.startsWith("{")) {
    for (const part of clause.slice(1, -1).split(",")) {
      const t = part.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      names.push((as[1] ?? as[0]).trim());
    }
  } else if (clause.startsWith("*")) {
    const as = clause.split(/\s+as\s+/);
    if (as[1]) names.push(as[1].trim());
  } else {
    const first = clause.split(",")[0].trim();
    if (first && /^[A-Za-z_$]/.test(first)) names.push(first);
  }
  return names;
}

/** Resolve a block's imports relative to the page file, using the .twm loader's
 * TS module path. In dev, a changed file is re-imported (cache-busted). */
export async function resolveServerImports(
  block: ServerBlock,
  pageFile: string,
  opts: { dev?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (!block.imports.length) return {};
  const out: Record<string, unknown> = {};
  const { twImportTs } = await import("@tw/shared/tw/node-import");
  const { dirname, resolve } = await import("node:path");
  const { statSync } = await import("node:fs");
  for (const imp of block.imports) {
    if (!imp.specifier) continue;
    const spec = imp.specifier;
    let mod: any;
    if (spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@./")) {
      const rel = spec.startsWith("@./") ? spec.slice(2) : spec;
      const abs = resolve(dirname(pageFile), rel);
      let bust: number | undefined;
      if (opts.dev) { try { bust = statSync(abs).mtimeMs; } catch { /* missing */ } }
      mod = await twImportTs(abs, bust);
    } else {
      mod = await import(spec);
    }
    const names = importBindingNames(imp.source);
    for (const n of names) out[n] = mod?.[n] ?? mod?.default;
  }
  return out;
}

// --- Diagnostics -------------------------------------------------------------

export interface ServerBlockCheckOptions {
  /** Render mode of the page ("static" | "ssr" | ...). */
  mode?: string;
  /** Route param names of the page (from the router match / filename). */
  paramNames?: string[];
  /** True when the file is a layout. */
  isLayout?: boolean;
  /** True when the dynamic route has enumerated params (params.twm / fn generate()). */
  hasEnumeratedParams?: boolean;
  /** True when the page is a cached page (server block + page { cache { } }). */
  cachedPage?: boolean;
  /** True when the page declares cache { vary: [...] }. */
  hasVary?: boolean;
  /** Identifiers referenced by the page template (for the serialization checks). */
  referenced?: Set<string>;
}

export interface ServerBlockProblem {
  severity: "error";
  code: string;
  message: string;
  line: number;
  col: number;
  category: string;
}

/** Every compile-time problem a page's server blocks have, given its route context. */
export function checkServerBlocks(program: Program, opts: ServerBlockCheckOptions = {}): ServerBlockProblem[] {
  const blocks = collectServerBlocks(program);
  if (!blocks.length) return [];
  const out: ServerBlockProblem[] = [];
  const push = (code: string, message: string, line: number, col: number) =>
    out.push({ severity: "error", code, message, line, col, category: "semantic" });

  if (opts.isLayout) {
    for (const b of blocks) push("TW105", "server blocks in layouts are not supported yet", b.line, b.col);
    return out;
  }

  for (const c of serverStateCollisions(program)) {
    push("TW102", `server block declares '${c.name}', which is already declared in state { }`, c.line, c.col);
  }
  if (opts.paramNames && opts.paramNames.length) {
    for (const c of serverRouteParamCollisions(blocks, opts.paramNames)) {
      push("TW102", `server block declares '${c.name}', which collides with the route param '${c.name}'`, c.line, c.col);
    }
  }

  if (opts.mode === "static") {
    for (const b of blocks) {
      const used = scanRequestAccess(b.source);
      for (const name of ["headers", "cookies", "query"]) {
        if (used.has(name)) push("TW103", `a static page's server block cannot read '${name}'`, b.line, b.col);
      }
      if (used.has("params") && !opts.hasEnumeratedParams) {
        push("TW104", "a static page's server block cannot read 'params' without enumerated params (add params.twm / fn generate())", b.line, b.col);
      }
      const calls = scanRuntimeCalls(b.source);
      if (calls.getSession || calls.requireUser) push("TW107", "getSession()/requireUser() are not available in a static page's server block", b.line, b.col);
      if (calls.redirect || calls.notFound) push("TW108", "redirect()/notFound() are not available in a static page's server block", b.line, b.col);
    }
  }

  // A literal redirect() target that is not a same-origin internal path.
  for (const b of blocks) {
    for (const lit of scanRuntimeCalls(b.source).redirectLiterals) {
      if (!isValidRedirectTarget(lit)) push("TW109", `redirect(${JSON.stringify(lit)}) target must be a same-origin internal path`, b.line, b.col);
    }
  }

  // A cached fetch that sets a credential header (literal case -> build error).
  for (const b of blocks) {
    for (const h of scanCachedCredentialHeaders(b.source)) {
      push("TW110", `a cached fetch must not set a credential header (${h})`, b.line, b.col);
    }
  }

  // Cached page (server block + page { cache { } }): direct reads are a lint error.
  if (opts.cachedPage) {
    for (const b of blocks) {
      for (const a of cachedPageDirectReads(b.source)) {
        push("TW111", `a cached page's server block cannot read '${a}'`, b.line, b.col);
      }
    }
  }
  // vary on a static page is a compile error.
  if (opts.mode === "static" && opts.hasVary) {
    for (const b of blocks) push("TW112", "cache { vary } is only valid on an ssr page (not static)", b.line, b.col);
  }

  // Deferred blocks (`server:defer { }`) run after the response has begun, so
  // they cannot drive control flow -- a redirect or notFound would arrive too
  // late to change the response. (Their values are delivered to the client as a
  // deferred seed, not rendered into the markup; the markup cannot read them.)
  for (const b of blocks) {
    if (!b.deferred) continue;
    const calls = scanRuntimeCalls(b.source);
    if (calls.redirect || calls.notFound) {
      push("TW118", "a deferred server block cannot redirect() or notFound() -- the response has already begun", b.line, b.col);
    }
  }

  // Compile-time serialization + env checks (only for referenced names) + lints.
  for (const b of blocks) {
    if (opts.referenced && opts.referenced.size) {
      for (const x of scanNonSerializableInitializers(b.source, opts.referenced)) {
        push("TW113", `'${x.name}' is not serializable (${x.kind})`, b.line, b.col);
      }
      for (const n of scanEnvInMarkup(b.source, opts.referenced)) {
        push("TW115", `'${n}' reads env and would cross to markup`, b.line, b.col);
      }
    }
    for (const _ of lintSql(b.source)) push("TW116", "SQL-looking template literal interpolates request data", b.line, b.col);
    for (const _ of lintSsrf(b.source)) push("TW117", "fetch() with a request-derived URL (SSRF)", b.line, b.col);
  }

  return out;
}

/** Direct calls to the runtime helpers inside a block body (AST walk). */
export function scanRuntimeCalls(body: string): {
  getSession: boolean; requireUser: boolean; redirect: boolean; notFound: boolean; redirectLiterals: string[];
} {
  const out = { getSession: false, requireUser: false, redirect: false, notFound: false, redirectLiterals: [] as string[] };
  if (!body.trim()) return out;
  const sf = ts.createSourceFile("s.ts", body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const n = node.expression.text;
      if (n === "getSession") out.getSession = true;
      else if (n === "requireUser") out.requireUser = true;
      else if (n === "redirect") {
        out.redirect = true;
        const a0 = node.arguments[0];
        if (a0 && ts.isStringLiteral(a0)) out.redirectLiterals.push(a0.text);
      } else if (n === "notFound") out.notFound = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Credential headers a cached fetch must not set (AST scan of the literal case). */
export function scanCachedCredentialHeaders(body: string): string[] {
  const out: string[] = [];
  if (!body.trim()) return out;
  const creds = new Set(["authorization", "proxy-authorization", "cookie"]);
  const sf = ts.createSourceFile("s.ts", body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "fetch") {
      const arg1 = node.arguments[1];
      if (arg1 && ts.isObjectLiteralExpression(arg1)) {
        const hasCache = arg1.properties.some((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "cache");
        const headersProp = arg1.properties.find((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "headers");
        if (hasCache && headersProp && ts.isPropertyAssignment(headersProp) && ts.isObjectLiteralExpression(headersProp.initializer)) {
          for (const hp of headersProp.initializer.properties) {
            if (ts.isPropertyAssignment(hp) && (ts.isStringLiteral(hp.name) || ts.isIdentifier(hp.name))) {
              const name = ts.isStringLiteral(hp.name) ? hp.name.text : hp.name.text;
              if (creds.has(name.toLowerCase())) out.push(name);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// --- Cached pages ------------------------------------------------------

/** The `vary` list from a page's `cache { ... }` (lowercased, sorted, unique). */
export function extractVary(source: string): string[] {
  const m = /cache\s*\{([\s\S]*?)\}/.exec(source);
  if (!m) return [];
  const body = m[1];
  const arr = /vary\s*:\s*\[([^\]]*)\]/.exec(body) || /vary\s*\[([^\]]*)\]/.exec(body);
  const names: string[] = [];
  if (arr) {
    for (const part of arr[1].split(",")) {
      const t = part.trim().replace(/^["']|["']$/g, "").toLowerCase();
      if (t) names.push(t);
    }
  } else {
    const single = /vary\s+["']([^"']+)["']/.exec(body);
    if (single) names.push(single[1].toLowerCase());
  }
  // lowercased, sorted, unique; first occurrence wins
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) if (!seen.has(n)) { seen.add(n); out.push(n); }
  return out.sort();
}

/** Build the visible/limited query for a cached page (vary keys only). */
export function varyQuery(query: Record<string, string>, vary: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of vary) {
    const v = query[k] ?? query[k.toLowerCase()];
    if (v !== undefined) out[k] = String(v).trim().slice(0, 200);
  }
  return out;
}

/** Canonical vary-query string for the cache key (sorted, empty dropped). */
export function canonicalVaryQuery(vq: Record<string, string>): string {
  return Object.keys(vq).sort().filter((k) => vq[k] !== "").map((k) => `${k}=${vq[k]}`).join("&");
}

/** Direct reads of the request context inside a cached page's block (lint). */
export function cachedPageDirectReads(body: string): string[] {
  const used = scanRequestAccess(body);
  const calls = scanRuntimeCalls(body);
  const out: string[] = [];
  for (const n of ["headers", "cookies"]) if (used.has(n)) out.push(n);
  if (calls.getSession) out.push("getSession");
  if (calls.requireUser) out.push("requireUser");
  return out;
}

/** A page's own cache window (revalidate/expire/tag), tolerant of `vary`. */
export function parsePageCache(source: string): { revalidate: number; expire: number; tag?: string } | null {
  const m = /cache\s*\{([\s\S]*?)\}/.exec(source);
  if (!m) return null;
  const body = m[1];
  const num = (k: string) => { const r = new RegExp(`\\b${k}\\s*:?\\s*(\\d+)`).exec(body); return r ? Number(r[1]) : undefined; };
  const revalidate = num("revalidate");
  const expire = num("expire");
  const tagM = /\btag\s*:?\s*["']([^"']+)["']/.exec(body);
  if (revalidate === undefined && expire === undefined) return null;
  const rv = revalidate ?? 60;
  return { revalidate: rv, expire: expire ?? rv, tag: tagM ? tagM[1] : undefined };
}
