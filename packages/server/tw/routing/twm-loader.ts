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
import { revalidatePath as pipelineRevalidatePath } from "./revalidate";
import { setSignal } from "./signal-stream";
import { join } from "node:path";
import { isRuleDsl, parseRules, evaluateRules, type MiddlewareRule } from "./twm-rules";

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
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/gm, "");

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
    // Rename ONLY the DSL handler declaration (`fn delete(...)`) -- a blanket
    // `\bdelete\b` replace would also rewrite the JS `delete obj.prop`
    // statement in handler bodies into a syntax error.
    .replace(/\bfn\s+delete\b/g, "function deleteFn")
    .replace(/\bfn\s+/g, "function ");

  return { handlers: null, config: null, jsCode, imports };
}

// --- Synchronous TWM compilation (no execution, no side effects) --------------

function compileTwm(source: string): string {
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/gm, "");

  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
  const codeWithoutImports = cleaned.replace(importRegex, "");

  return codeWithoutImports
    // `export` is not valid inside new Function -- accept both documented
    // (`fn get(...)`) and natural-JS (`export function get(...)`) forms.
    .replace(/\bexport\s+(?=(async\s+)?(function|const|let|var|class))/g, "")
    // Rename ONLY the DSL handler declaration -- see note above.
    // Handlers compile to ASYNC functions: docs (sessions, cookies.sign,
    // data fetching) all show `await` inside `fn` bodies, and async
    // wrappers are transparent for sync returns (executor awaits both).
    .replace(/\bfn\s+delete\b/g, "async function deleteFn")
    .replace(/\bfn\s+/g, "async function ");
}

function extractImports(source: string): { names: string[]; module: string }[] {
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/gm, "");

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
}

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
    return {
      status: typeof actionResult.status === "number" ? actionResult.status : 200,
      json: actionResult.json || actionResult.body || {},
      html: typeof actionResult.html === "string" ? actionResult.html : undefined,
      text: typeof actionResult.text === "string" ? actionResult.text : undefined,
      headers: actionResult.headers,
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
