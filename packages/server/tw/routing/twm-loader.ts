/**
 * TWM Module Loader -- loads and executes .twm files as server-side modules.
 *
 * Exports (consumers: routing/index.ts, render-pipeline.ts, tw/index.ts):
 *   - loadTWMModule(path, rootDir?) -> TWMModule (no side effects, just parse)
 *   - executeRouteHandler(path, method, request, rootDir?) -> { status, json }
 *   - executeMiddleware(path, request, rootDir?) -> Response | void
 *   - shouldMatchMiddleware(matcher[], pathname) -> boolean
 *   - clearTWMCache() -> void
 *
 * @module server/routing/twm-loader
 */

import { readFileSync, existsSync } from "node:fs";
import {
  revalidatePath as pipelineRevalidatePath,
  revalidateTag as registryRevalidateTag,
  registerTwmTagInvalidator,
} from "./revalidate";
import { setSignal } from "./signal-stream";
import { join } from "node:path";
import { isRuleDsl, parseRules, evaluateRules, type MiddlewareRule } from "./twm-rules";
import { sha256, parseCacheBody, resolveCache, canonicalizeQuery, readCacheProfilesSync, type ResolvedCache } from "@tw/shared";

// --- Types -------------------------------------------------------------------

export interface TWMModule {
  get?: (req: any) => any;
  post?: (req: any) => any;
  put?: (req: any) => any;
  delete?: (req: any) => any;
  patch?: (req: any) => any;
  middleware?: (req: any) => any;
  /** params.twm: build-time static route generation */
  generate?: () => Record<string, string>[];
  config?: { matcher?: string[] };
  /** rule DSL middleware (docs/middleware.md form), when the file uses it */
  rules?: MiddlewareRule[];
  /** Server action: default handler for POST ?_action= (no name) */
  action?: (req: any) => any;
  /** Route-level ISR: seconds a GET response may be cached (module const) */
  revalidate?: number;
  /** Named server actions (fn actionCreate / actionDelete) — same-origin POST only */
  [actionName: string]: any;
}

// --- Cache --------------------------------------------------------------------

const moduleCache = new Map<string, TWMModule>();

export function clearTWMCache(): void {
  moduleCache.clear();
}

// --- Lib module loader -------------------------------------------------------

const libCache = new Map<string, Record<string, any>>();

/**
 * String-aware comment stripping. A naive `//` regex eats URL strings
 * ("https://x" loses everything after the scheme's slashes -> unclosed
 * string -> the whole module fails to parse -> 405 at serve time, with
 * the build silent). Walk the source and only strip comments that are
 * NOT inside ' " ` string literals.
 */
export function stripCommentsSafe(src: string): string {
  let out = "";
  let i = 0;
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  while (i < src.length) {
    const c = src[i];
    const n = i + 1 < src.length ? src[i + 1] : "";
    if (mode === "code") {
      if (c === "/" && n === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "block"; i += 2; continue; }
      if (c === "'") { mode = "sq"; out += c; i++; continue; }
      if (c === '"') { mode = "dq"; out += c; i++; continue; }
      if (c === "`") { mode = "tpl"; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; }
      i++; continue;
    }
    if (mode === "block") {
      if (c === "*" && n === "/") { mode = "code"; out += " "; i += 2; continue; }
      i++; continue;
    }
    // string modes: emit, honor escapes, close on the matching quote
    out += c;
    if (c === "\\") { if (n) { out += n; i += 2; continue; } }
    else if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) {
      mode = "code";
    }
    i++;
  }
  return out;
}

async function loadLibModule(rootDir: string, name: string): Promise<Record<string, any>> {
  // Normalize: "db", "lib/db", "./lib/db", "@lib/db" -> "db"
  let rel = name
    .replace(/^@\//, "")
    .replace(/^\.\//, "")
    .replace(/^lib\//, "");
  const cacheKey = rootDir + "/" + rel;
  if (libCache.has(cacheKey)) return libCache.get(cacheKey)!;

  const libPath = join(rootDir, "lib", rel + ".ts");
  if (!existsSync(libPath)) {
    throw new Error("Module '" + name + "' not found. Create lib/" + name + ".ts");
  }

  try {
    const { twImportTs } = await import("@tw/shared/tw/node-import");
    const mod = await twImportTs(libPath);
    libCache.set(cacheKey, mod);
    return mod;
  } catch (e: any) {
    throw new Error("Failed to load lib/" + name + ".ts: " + e.message);
  }
}

// --- TWM source -> JS conversion ----------------------------------------------

function parseTwm(source: string, rootDir: string): { handlers: Record<string, any> | null; config: any; jsCode?: string; imports?: any } {
  // 1. Strip comments FIRST
  const cleaned = stripCommentsSafe(source);

  // 2. Parse imports
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
  const imports: { names: string[]; module: string }[] = [];
  let match;
  while ((match = importRegex.exec(cleaned)) !== null) {
    const names = match[1].split(",").map(function(s: string) { return s.trim(); }).filter(Boolean);
    imports.push({ names, module: match[2] });
  }

  // 3. Strip imports, convert TWM -> JS
  let codeWithoutImports = cleaned.replace(importRegex, "");
  const jsCode = codeWithoutImports
    // `cache { ... }` hoist (docs/cache-tags.md): the directive block is
    // metadata, not JS -- strip it from the body (metadata is collected
    // separately in loadTWMModule).
    .replace(/^[ \t]*cache\s*\{[^}]*\}[ \t]*;?[ \t]*$/gm, "")
    // Rename ONLY the DSL handler declaration (`fn delete(...)`) -- a blanket
    // `\bdelete\b` replace would also rewrite the JS `delete obj.prop`
    // statement in handler bodies into a syntax error.
    .replace(/\bfn\s+cached\s+delete\b/g, "function deleteFn")
    .replace(/\bfn\s+cached\s+/g, "function ")
    .replace(/\bfn\s+delete\b/g, "function deleteFn")
    .replace(/\bfn\s+/g, "function ");

  return { handlers: null, config: null, jsCode, imports };
}

// --- Synchronous TWM compilation (no execution, no side effects) --------------

function compileTwm(source: string): string {
  const cleaned = stripCommentsSafe(source);

  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
  const codeWithoutImports = cleaned.replace(importRegex, "");

  return codeWithoutImports
    // `export` is not valid inside new Function -- accept both documented
    // (`fn get(...)`) and natural-JS (`export function get(...)`) forms.
    .replace(/\bexport\s+(?=(async\s+)?(function|const|let|var|class))/g, "")
    // `cache { ... }` hoist (docs/cache-tags.md) -- strip the metadata
    // block; loadTWMModule collects it before this conversion runs.
    .replace(/^[ \t]*cache\s*\{[^}]*\}[ \t]*;?[ \t]*$/gm, "")
    // Rename ONLY the DSL handler declaration -- see note above.
    // Handlers compile to ASYNC functions: docs (sessions, cookies.sign,
    // data fetching) all show `await` inside `fn` bodies, and async
    // wrappers are transparent for sync returns (executor awaits both).
    // `fn cached` (docs/cache-tags.md) is the cacheable-handler marker;
    // the metadata comes from the (now stripped) cache { } block.
    .replace(/\bfn\s+cached\s+delete\b/g, "async function deleteFn")
    .replace(/\bfn\s+cached\s+/g, "async function ")
    .replace(/\bfn\s+delete\b/g, "async function deleteFn")
    .replace(/\bfn\s+/g, "async function ");
}

function extractImports(source: string): { names: string[]; module: string }[] {
  const cleaned = stripCommentsSafe(source);

  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
  const imports: { names: string[]; module: string }[] = [];
  let match;
  while ((match = importRegex.exec(cleaned)) !== null) {
    const names = match[1].split(",").map(function(s: string) { return s.trim(); }).filter(Boolean);
    imports.push({ names, module: match[2] });
  }
  return imports;
}

function stripImports(source: string): string {
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
  return source.replace(importRegex, "");
}

// --- loadTWMModule: parse only, NO execution, NO side effects ----------------

export async function loadTWMModule(filePath: string, rootDir?: string): Promise<TWMModule> {
  const cacheKey = filePath;
  const cached = moduleCache.get(cacheKey);
  if (cached) return cached;

  if (!existsSync(filePath)) {
    throw new Error("TWM module not found: " + filePath);
  }

  const source = readFileSync(filePath, "utf-8");
  const rd = rootDir || process.cwd();

  // Rule DSL form (rule "name" { ... }) — parse declaratively, no JS execution.
  if (isRuleDsl(source)) {
    try {
      const rules = parseRules(source, filePath);
      const mod: TWMModule = { rules };
      moduleCache.set(cacheKey, mod);
      return mod;
    } catch (err) {
      console.error("[twm-loader] Error parsing rules in " + filePath + ":", (err as Error).message);
      const mod: TWMModule = {};
      moduleCache.set(cacheKey, mod);
      return mod;
    }
  }

  // Parse imports
  const imports = extractImports(source);
  const jsCode = compileTwm(source);
  const codeWithoutImports = stripImports(jsCode);

  // Load requested lib modules
  const injected: Record<string, any> = {};
  for (const imp of imports) {
    // `import { revalidatePath } from "tw"` injects framework built-ins
    // (on-demand ISR invalidation) instead of a lib/ module.
    if (imp.module === "tw" || imp.module === "@tw/server") {
      for (const name of imp.names) {
        if (name === "revalidatePath") injected.revalidatePath = pipelineRevalidatePath;
        else if (name === "revalidateRoute") injected.revalidateRoute = revalidateRoute;
        else if (name === "revalidateTag") injected.revalidateTag = registryRevalidateTag;
        else if (name === "setSignal") injected.setSignal = setSignal;
      }
      // The documented `import { ... } from "@tw/server"` surface (bodyParse,
      // generateSecurityHeaders, scanRouteTree, ...) resolves from the
      // server package itself (docs/api-routes.md, security-headers-api.md).
      try {
        const server: any = await import("../index");
        for (const name of imp.names) {
          if (!(name in injected) && name in server) injected[name] = server[name];
        }
      } catch { /* not available in this build */ }
      continue;
    }
    // `import { initI18n, t } from "@tw/runtime"` (docs/i18n.md): the
    // vendored client runtime bundle carries the public surface; resolve
    // it from the published package's dist/ (bundle mode: __TW_BUNDLE_DIR).
    if (imp.module === "@tw/runtime") {
      let runtime: any = null;
      try {
        const base = (globalThis as any).__TW_BUNDLE_DIR;
        if (base) runtime = await import(base + "tw-runtime-client.mjs");
      } catch { runtime = null; }
      if (!runtime) {
        try {
          const { pathToFileURL } = await import("node:url");
          const { join } = await import("node:path");
          runtime = await import(pathToFileURL(join(rd, "node_modules", "tw-framework", "dist", "tw-runtime-client.mjs")).href);
        } catch { runtime = null; }
      }
      if (runtime) {
        for (const name of imp.names) {
          if (name in runtime) injected[name] = runtime[name];
        }
        continue;
      }
    }
    // `import { createSessionManager } from "@tw/security"` (docs/sessions.md,
    // docs/cookie-manager-api.md): the framework bundles @tw/security --
    // resolve it from the bundle instead of requiring a lib/ shim.
    if (imp.module === "@tw/security") {
      try {
        const security: any = await import("@tw/security");
        for (const name of imp.names) {
          if (name in security) injected[name] = security[name];
        }
        continue;
      } catch { /* fall through to lib/ lookup */ }
    }
    try {
      const mod = await loadLibModule(rd, imp.module);
      for (const name of imp.names) {
        if (name in mod) {
          injected[name] = mod[name];
        }
      }
    } catch (e) {
      // Lib not found -- skip, will error at runtime if used
    }
  }

  // Server actions + ISR: collect every declared `action*` handler and the
  // `revalidate` const so the return object can expose them (function
  // declarations are local to the Function body -- only listed names escape).
  const actionNames = new Set<string>();
  for (const m of codeWithoutImports.matchAll(/\bfunction\s+(action[A-Za-z0-9_]*)\s*\(/g)) actionNames.add(m[1]);
  for (const m of codeWithoutImports.matchAll(/\b(?:const|let|var)\s+(action[A-Za-z0-9_]*)\s*=/g)) actionNames.add(m[1]);

  // `fn cached` handlers (docs/cache-tags.md): resolve each handler's
  // cache { } metadata against tw.config.ts profiles, with TW091 purity
  // and TW093 non-determinism checks on the body.
  const cachedHandlers: Record<string, HandlerCacheConf> = {};
  const cleanedSource = stripCommentsSafe(source);
  const fnCachedRegex = /\bfn\s+cached\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/g;
  for (const cm of cleanedSource.matchAll(fnCachedRegex)) {
    const fnName = cm[1] === "delete" ? "deleteFn" : cm[1];
    const after = cleanedSource.slice((cm.index ?? 0) + cm[0].length);
    const bodyEnd = handlerBodyEnd(after);
    const body = after.slice(0, bodyEnd);
    const cacheBlock = /^\s*cache\s*\{([^}]*)\}/.exec(after);
    const meta = cacheBlock ? parseCacheBody(cacheBlock[1]) : {};
    if (meta.revalidate == null && !meta.life) {
      console.error("[tw] TW090: fn cached " + cm[1] + " in " + filePath + " needs cache { revalidate N } or cache { life \"profile\" } -- not cached");
      continue;
    }
    let impure: string | null = null;
    for (const [pattern, label] of IMPURE_PATTERNS) {
      if (pattern.test(body)) { impure = label; break; }
    }
    if (impure) {
      console.error("[tw] TW091: fn cached " + cm[1] + " in " + filePath + " is impure (" + impure + ") -- handler excluded from caching");
      continue;
    }
    if (NONDET_PATTERN.test(body)) {
      console.warn("[tw] TW093: fn cached " + cm[1] + " in " + filePath + " calls a non-deterministic function -- the value freezes into the cache entry");
    }
    try {
      const resolved = resolveCache(meta, twmCacheProfiles(rd));
      if (resolved) cachedHandlers[fnName] = resolved;
    } catch (e) {
      console.error("[tw] " + (e as Error).message + " (" + filePath + ":" + cm[1] + ")");
    }
  }

  // Execute via new Function to get handler references (NO fake request).
  // Trust boundary: the code is the project's OWN .twm file written by the
  // developer -- same trust level as any server-side source the app runs.
  const moduleCode = codeWithoutImports +
    "\nreturn { get: typeof get !== 'undefined' ? get : null, " +
    "post: typeof post !== 'undefined' ? post : null, " +
    "put: typeof put !== 'undefined' ? put : null, " +
    "patch: typeof patch !== 'undefined' ? patch : null, " +
    "deleteFn: typeof deleteFn !== 'undefined' ? deleteFn : null, " +
    // JS-form exports often use the exact HTTP verb: GET/POST/PUT/PATCH/DELETE.
    // Also accept HEAD as a GET alias at lookup time.
    "GET: typeof GET !== 'undefined' ? GET : null, " +
    "POST: typeof POST !== 'undefined' ? POST : null, " +
    "PUT: typeof PUT !== 'undefined' ? PUT : null, " +
    "PATCH: typeof PATCH !== 'undefined' ? PATCH : null, " +
    "DELETE: typeof DELETE !== 'undefined' ? DELETE : null, " +
    "middleware: typeof middleware !== 'undefined' ? middleware : null, " +
    "generate: typeof generate !== 'undefined' ? generate : null, " +
    "config: typeof config !== 'undefined' ? config : null, " +
    "action: typeof action !== 'undefined' ? action : null, " +
    "revalidate: typeof revalidate !== 'undefined' ? revalidate : null, " +
    [...actionNames].map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : null`).join(", ") + " };";

  const injectedKeys = Object.keys(injected);
  let module: TWMModule = {};

  try {
    const moduleFunc = new Function(...injectedKeys, moduleCode);
    const handlers = moduleFunc(...injectedKeys.map(function(k: string) { return injected[k]; }));

    const H = handlers as any;
    module = {
      get: H.get || H.GET || undefined,
      post: H.post || H.POST || undefined,
      put: H.put || H.PUT || undefined,
      delete: H.deleteFn || H.DELETE || undefined,
      patch: H.patch || H.PATCH || undefined,
      middleware: H.middleware || undefined,
      generate: H.generate || undefined,
      config: H.config || undefined,
      action: H.action || undefined,
      revalidate: typeof H.revalidate === "number" && H.revalidate > 0 ? H.revalidate : undefined,
    };
    for (const n of actionNames) if (H[n]) (module as any)[n] = H[n];
  } catch (err) {
    console.error("[twm-loader] Error parsing " + filePath + ":", err);
  }

  // Cached-handler metadata (docs/cache-tags.md): resolved cache config
  // per handler, consumed by executeRouteHandler. Only GET/HEAD handlers
  // are cacheable; other names are ignored at serve time.
  (module as any).__twCached = cachedHandlers;

  moduleCache.set(cacheKey, module);
  return module;
}

// --- executeRouteHandler: run a route.twm handler ---------------------------

/** Parse a "cookie" request header into a name->value helper object. */
function parseCookies(headerVal: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headerVal) return out;
  for (const part of headerVal.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  }
  return out;
}

/**
 * Server-action same-origin guard (fail-closed): a POST to ?_action= must
 * carry an Origin (or Referer) whose host matches the request host.
 */
function sameOriginAllowed(req: { url: string; headers: Record<string, string> }): boolean {
  try {
    const host = new URL(req.url).host;
    const origin = req.headers["origin"] || req.headers["Origin"];
    if (origin) return new URL(origin).host === host;
    const referer = req.headers["referer"] || req.headers["Referer"];
    if (referer) return new URL(referer).host === host;
  } catch { /* malformed URL -- reject */ }
  return false;
}

/** Route-level ISR cache: revalidate seconds -> cached GET responses. */
const routeCache = new Map<string, { result: any; expiresAt: number; pathname: string }>();

export function clearRouteCache(): void {
  routeCache.clear();
  handlerCache.clear();
}

// --- Cached handlers (docs/cache-tags.md, `fn cached`) -------------------------

/**
 * Purity scan (TW091): a cached handler must depend only on key inputs.
 * request.cookies / request.headers / request.body / setSignal(...) make
 * the response request-specific and are hard errors -- the handler is
 * excluded from caching (build fails with TW091; serve logs and skips).
 */
const IMPURE_PATTERNS: [RegExp, string][] = [
  [/request\s*\.\s*cookies/, "request.cookies"],
  [/request\s*\.\s*headers/, "request.headers"],
  [/request\s*\.\s*body/, "request.body"],
  [/\bsetSignal\s*\(/, "setSignal(...)"],
];

/**
 * Non-determinism scan (TW093): Date.now() / Math.random() /
 * crypto.randomUUID() freeze their first value into the cache entry.
 * Warning only -- "generated at" stamps are a legitimate use.
 */
const NONDET_PATTERN = /\b(?:Date\s*\.\s*now\s*\(|Math\s*\.\s*random\s*\(|crypto\s*\.\s*randomUUID\s*\()/;

/** Extract a balanced-brace body from `after` (which starts inside the fn,
 * i.e. just past the function's opening brace -- so depth starts at 1). */
function handlerBodyEnd(after: string): number {
  let depth = 1;
  let inStr: string | null = null;
  for (let i = 0; i < after.length; i++) {
    const ch = after[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return after.length;
}

/** cache.profiles from tw.config.ts, loaded once per rootDir. */
const __twmProfiles = new Map<string, Record<string, any>>();
function twmCacheProfiles(rootDir: string): Record<string, any> {
  if (__twmProfiles.has(rootDir)) return __twmProfiles.get(rootDir)!;
  let profiles: Record<string, any> = {};
  try {
    profiles = readCacheProfilesSync(rootDir);
  } catch { /* built-ins only */ }
  __twmProfiles.set(rootDir, profiles);
  return profiles;
}

/** Resolved cache config per cached handler, keyed by JS function name. */
interface HandlerCacheConf extends ResolvedCache {}

/** fn-cached handler responses: freshUntil/expireAt windows + tags. */
const handlerCache = new Map<string, {
  result: any;
  freshUntil: number;
  expireAt: number;
  conf: HandlerCacheConf;
  createdAt: number;
  pathname: string;
}>();

/** Background-refresh stampede guard for cached handlers. */
const pendingHandlerRefresh = new Set<string>();

// Tag invalidation reaches this cache through the registry (no circular
// import): every entry carries its own tag (single source of truth).
registerTwmTagInvalidator(function(tag: string): number {
  let dropped = 0;
  for (const [key, entry] of handlerCache) {
    if (entry.conf && (entry.conf as any).tag === tag) { handlerCache.delete(key); dropped++; }
  }
  return dropped;
});

/**
 * On-demand route ISR invalidation: drop cached GET responses whose path
 * matches (exact, or prefix with { prefix: true }). Returns dropped count.
 */
export function revalidateRoute(pathname: string, opts?: { prefix?: boolean }): number {
  const want = pathname.startsWith("/") ? pathname : "/" + pathname;
  let dropped = 0;
  for (const [key, entry] of routeCache) {
    const hit = opts?.prefix
      ? (entry.pathname === want || entry.pathname.startsWith(want.endsWith("/") ? want : want + "/"))
      : entry.pathname === want;
    if (hit) {
      routeCache.delete(key);
      dropped++;
    }
  }
  return dropped;
}

export async function executeRouteHandler(
  filePath: string,
  method: string,
  request: any,
  rootDir?: string,
): Promise<{ status: number; json: any; html?: string; text?: string; headers?: Record<string, string> }> {
  const mod = await loadTWMModule(filePath, rootDir);
  const methodLower = method.toLowerCase();
  // Is this a server-action POST? Compute early so an action-only route
  // (fn action, no fn post) does not hit the 405 below.
  let earlyAction: string | undefined;
  if (method.toUpperCase() === "POST") {
    try {
      earlyAction = new URL(request?.url ?? "http://local").searchParams.get("_action")
        ?? new URL(request?.url ?? "http://local").searchParams.get("action")
        ?? undefined;
    } catch { /* no URL */ }
  }
  // Exact method matching (HEAD falls back to GET). Unknown methods -> 405.
  const handler = methodLower === "delete"
    ? mod.delete
    : (mod as any)[methodLower]
      ?? (methodLower === "head" ? mod.get : undefined)
      // accept the exact-cased export too (GET/POST/... in JS-form routes)
      ?? (mod as any)[method];

  if (!handler && earlyAction === undefined) {
    return { status: 405, json: { ok: false, error: "Method " + method + " not allowed" } };
  }

  // Request body size guard (DoS): cap JSON bodies at 10 MB. Larger
  // requests answer 413 without being read or parsed.
  const MAX_BODY_BYTES = 10 * 1024 * 1024;
  const contentLength = Number(request?.headers?.get?.("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { status: 413, json: { ok: false, error: "Payload too large" } };
  }

  // Normalize the raw Request into a plain object handlers expect:
  // request.body = parsed JSON, request.query = URL search params.
  let parsedBody: any = {};
  // multipart/form-data (docs/multipart-forms.md): request.body.multipart =
  // { fields: {...}, files: [{ filename, contentType, data }] }. Plain JSON
  // bodies parse as before; multipart arrives via request.formData().
  const __ct = String((request as any)?.headers?.get?.("content-type") ?? "").toLowerCase();
  if (__ct.includes("multipart/form-data") && typeof request?.formData === "function") {
    try {
      const fd = await request.formData();
      const fields: Record<string, string> = {};
      const files: any[] = [];
      for (const [k, v] of (fd as any).entries()) {
        if (v && typeof v === "object" && typeof (v as any).arrayBuffer === "function") {
          const data = Buffer.from(await (v as any).arrayBuffer());
          files.push({ filename: (v as any).name, contentType: (v as any).type, data });
        } else {
          fields[k] = String(v);
        }
      }
      parsedBody = { ...fields, multipart: { fields, files } };
    } catch { parsedBody = {}; }
  } else if (typeof request?.json === "function") {
    try { parsedBody = await request.json(); } catch { parsedBody = {}; }
  } else if (request?.body && typeof request.body === "object") {
    parsedBody = request.body;
  }
  let query: Record<string, string> = {};
  try {
    const u = new URL(request.url);
    query = Object.fromEntries(u.searchParams.entries());
  } catch { /* ignore */ }
  const headersObj: Record<string, string> =
    typeof request.headers?.entries === "function"
      ? Object.fromEntries(request.headers.entries())
      : (request.headers ?? {});
  const cookies = parseCookies(headersObj["cookie"] ?? headersObj["Cookie"]);
  const req: any = {
    method: request.method ?? method,
    url: request.url ?? "",
    params: (request as any)?.params ?? {},
    headers: headersObj,
    query,
    body: parsedBody,
    cookies: {
      ...cookies,
      get: (name: string) => (name in cookies ? cookies[name] : undefined),
      getAll: () => ({ ...cookies }),
      has: (name: string) => name in cookies,
    },
  };
  // Pass through dev-server extras (session, ip) so handlers see the same
  // request in `tw dev` as the documented shape.
  if ((request as any)?.session !== undefined) req.session = (request as any).session;
  if ((request as any)?.ip !== undefined) req.ip = (request as any).ip;

  // --- Server actions (docs/server-actions.md) ---------------------------
  // POST ?_action=<name> dispatches `action<Name>` (or the default `action`).
  // Same-origin is enforced fail-closed: no Origin/Referer, or a mismatched
  // host, answers 403.
  const actionName = method.toUpperCase() === "POST" ? (query._action ?? query.action) : undefined;
  if (actionName !== undefined) {
    if (!sameOriginAllowed(req)) {
      return { status: 403, json: { ok: false, error: "Forbidden: server actions require a same-origin request" } };
    }
    const fn = actionName === ""
      ? mod.action
      : (mod as any)["action" + actionName.charAt(0).toUpperCase() + actionName.slice(1)];
    if (typeof fn !== "function") {
      return { status: 404, json: { ok: false, error: "Unknown action: " + actionName } };
    }
    let actionResult: any;
    try {
      actionResult = await fn(req);
    } catch (err: any) {
      console.error("[tw] action error (" + filePath + "):", err?.message ?? err);
      return { status: 500, json: { ok: false, error: "Internal Server Error" } };
    }
    if (!actionResult || typeof actionResult !== "object") {
      return { status: 500, json: { ok: false, error: "Internal Server Error" } };
    }
    // docs/cache-tags.md -- updateTag semantics (read-your-writes): an
    // action returning { revalidateTag: "family" } expires that family in
    // this same request. The client runtime already re-fetches the page
    // with cache: "reload" after an action, so the user sees the fresh
    // render without a manual reload.
    let revalidatedTag: string | undefined;
    if (typeof actionResult.revalidateTag === "string" && actionResult.revalidateTag) {
      revalidatedTag = actionResult.revalidateTag;
      registryRevalidateTag(revalidatedTag);
    }
    return {
      status: typeof actionResult.status === "number" ? actionResult.status : 200,
      json: actionResult.json || actionResult.body || {},
      html: typeof actionResult.html === "string" ? actionResult.html : undefined,
      text: typeof actionResult.text === "string" ? actionResult.text : undefined,
      headers: revalidatedTag
        ? { ...(actionResult.headers ?? {}), "x-tw-revalidated": revalidatedTag }
        : actionResult.headers,
    };
  }

  // --- Route-level ISR (module `revalidate` const, seconds) ------------------
  // GET responses are cached per path+query for revalidate seconds.
  const rv = (mod as any).revalidate;
  const isCacheableMethod = method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD";
  let routeCacheKey: string | null = null;
  if (rv && isCacheableMethod && !actionName) {
    try {
      const u = new URL(request.url ?? "http://local");
      routeCacheKey = filePath + ":" + u.pathname + u.search;
    } catch { routeCacheKey = filePath; }
    const hit = routeCache.get(routeCacheKey);
    if (hit && Date.now() < hit.expiresAt) {
      return {
        ...hit.result,
        headers: { ...(hit.result.headers ?? {}), "x-tw-route-cache": "HIT" },
      };
    }
  }

  // --- Cached handler (docs/cache-tags.md, `fn cached`) --------------------
  // GET/HEAD responses of a `fn cached` handler are cached per canonical
  // key: sha256(method + pathname + canonical query + params) -- query
  // order-independent, empty values dropped. Fresh/HIT, stale/STALE +
  // background refresh, past expire -> blocking re-execution.
  const upperMethod = method.toUpperCase();
  let handlerConf: HandlerCacheConf | null = null;
  let handlerCacheKey: string | null = null;
  if ((upperMethod === "GET" || upperMethod === "HEAD") && (mod as any).__twCached) {
    const handlerKey = methodLower === "delete" ? "deleteFn"
      : (methodLower === "head" ? "get" : methodLower.toLowerCase());
    handlerConf = (mod as any).__twCached[handlerKey] ?? null;
    if (handlerConf) {
      try {
        const u = new URL(request.url ?? "http://local");
        handlerCacheKey = sha256(
          upperMethod + "\n" + u.pathname + "\n" + canonicalizeQuery(u.search) +
          "\n" + JSON.stringify((request as any)?.params ?? {}),
        );
      } catch { handlerCacheKey = null; }
    }
    if (handlerCacheKey) {
      const hEntry = handlerCache.get(handlerCacheKey);
      const hNow = Date.now();
      if (hEntry && hNow < hEntry.freshUntil) {
        return {
          ...hEntry.result,
          headers: {
            ...(hEntry.result.headers ?? {}),
            "x-tw-cache": "HIT",
            "x-tw-cache-age": String(Math.max(0, Math.floor((hNow - hEntry.createdAt) / 1000))),
          },
        };
      }
      if (hEntry && hNow < hEntry.expireAt && !pendingHandlerRefresh.has(handlerCacheKey)) {
        pendingHandlerRefresh.add(handlerCacheKey);
        void (async () => {
          try { await executeRouteHandler(filePath, method, request, rootDir); }
          catch { /* background */ }
          finally { pendingHandlerRefresh.delete(handlerCacheKey!); }
        })();
        return {
          ...hEntry.result,
          headers: {
            ...(hEntry.result.headers ?? {}),
            "x-tw-cache": "STALE",
            "x-tw-cache-age": String(Math.max(0, Math.floor((hNow - hEntry.createdAt) / 1000))),
          },
        };
      }
      if (hEntry && hNow >= hEntry.expireAt) handlerCache.delete(handlerCacheKey);
    }
  }

  // Handlers may be sync or async (DB/HTTP calls) — await both.
  let result: any;
  try {
    result = await handler(req);
  } catch (err: any) {
    // Never leak handler internals (stack, message) to the client.
    console.error("[tw] route handler error (" + filePath + "):", err?.message ?? err);
    return { status: 500, json: { ok: false, error: "Internal Server Error" } };
  }
  if (!result || typeof result !== "object") {
    console.error("[tw] route handler returned no result (" + filePath + ")");
    return { status: 500, json: { ok: false, error: "Internal Server Error" } };
  }
  const finalResult = {
    status: typeof result.status === "number" ? result.status : 200,
    json: result.json || result.body || {},
    html: typeof (result as any).html === "string" ? (result as any).html : undefined,
    text: typeof (result as any).text === "string" ? (result as any).text : undefined,
    headers: result.headers,
  };
  if (routeCacheKey && finalResult.status === 200) {
    let cachedPath = "";
    try { cachedPath = new URL(request.url ?? "http://local").pathname; } catch { cachedPath = ""; }
    routeCache.set(routeCacheKey, { result: finalResult, expiresAt: Date.now() + rv * 1000, pathname: cachedPath });
  }
  if (handlerCacheKey && handlerConf && finalResult.status === 200) {
    const now = Date.now();
    let cachedPath = "";
    try { cachedPath = new URL(request.url ?? "http://local").pathname; } catch { cachedPath = ""; }
    handlerCache.set(handlerCacheKey, {
      result: finalResult,
      freshUntil: now + handlerConf.revalidate * 1000,
      expireAt: now + handlerConf.expire * 1000,
      conf: handlerConf,
      createdAt: now,
      pathname: cachedPath,
    });
    // Cache-Control client hint (docs/cache-tags.md): the server cache
    // never reads `stale`; it is only the browser/CDN reusability hint.
    const cc = handlerConf.stale > 0
      ? "public, max-age=" + handlerConf.stale +
        (Number.isFinite(handlerConf.expire) ? ", stale-while-revalidate=" + Math.max(0, handlerConf.expire - handlerConf.stale) : "")
      : null;
    return {
      ...finalResult,
      headers: {
        ...(finalResult.headers ?? {}),
        "x-tw-cache": "MISS",
        "x-tw-cache-age": "0",
        ...(cc ? { "Cache-Control": cc } : {}),
      },
    };
  }
  return finalResult;
}

// --- executeMiddleware: run middleware.twm ------------------------------------

export async function executeMiddleware(
  filePath: string,
  request: any,
  rootDir?: string,
): Promise<any> {
  const mod = await loadTWMModule(filePath, rootDir);

  // Rule DSL: evaluate the declarative rules against the raw request.
  if (mod.rules) {
    const block = evaluateRules(mod.rules, request as Request);
    if (block) return block;

    // CORS: allowed origins get real CORS headers; OPTIONS preflights are
    // answered directly (204) instead of falling through to a route 405.
    const { corsHeadersFor } = await import("./twm-rules");
    const cors = corsHeadersFor(mod.rules, request as Request);
    const req = request as Request;
    const isPreflight = (req.method ?? (req as any).method ?? "").toUpperCase() === "OPTIONS"
      && !!req.headers?.get?.("access-control-request-method");
    if (isPreflight) {
      return new Response(null, { status: 204, headers: cors });
    }
    if (Object.keys(cors).length > 0) return { headers: cors };
    return null;
  }

  if (!mod.middleware) {
    return null;
  }

  return mod.middleware(request);
}

// --- shouldMatchMiddleware: check if path matches any matcher pattern --------

export function shouldMatchMiddleware(matchers: string[], pathname: string): boolean {
  if (!matchers || matchers.length === 0) return true;

  for (const pattern of matchers) {
    if (pattern === "/*" || pattern === "/**") return true;
    if (pattern === pathname) return true;
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
    }
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
    }
  }

  return false;
}
