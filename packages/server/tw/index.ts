/** TW Server -- production server with routing, middleware, SSR, and static serving. */

/**
 * Collapse duplicate slashes in a pathname. The WHATWG URL parser already
 * resolves `.` and `..` segments but PRESERVES `//`, so `//admin` used to
 * slip past middleware guards written as `path.indexOf("/admin") === 0`.
 */
function normalizePathname(p: string): string {
  return p.replace(/\/{2,}/g, "/");
}

/**
 * Apply tw.config.ts rewrites to a pathname. Returns the rewritten pathname,
 * or null when no rule matches. Rules support:
 *   - exact match:        from "/games"              -> to "/category/games"
 *   - :param segments:    from "/app/:slug"           -> to "/game/:slug"
 *   - glob (configPathMatch): from "/legacy/**"      -> to "/new"
 */
export function applyRewrites(rewrites: Array<{ from: string; to: string }>, pathname: string): string | null {
  for (const r of rewrites) {
    if (!r?.from || !r?.to) continue;
    const fromSegs = r.from.split("/").filter(Boolean);
    const pathSegs = pathname.split("/").filter(Boolean);

    if (r.from.includes(":")) {
      if (fromSegs.length !== pathSegs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < fromSegs.length; i++) {
        const f = fromSegs[i];
        if (f.startsWith(":")) {
          params[f.slice(1)] = decodeURIComponent(pathSegs[i]);
        } else if (f !== pathSegs[i]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // Substitute captured params into the target.
      let target = r.to;
      for (const [k, v] of Object.entries(params)) {
        target = target.split(":" + k).join(encodeURIComponent(v));
      }
      return target.startsWith("/") ? target : "/" + target;
    }

    // Plain/glob forms reuse the same semantics as redirects matching.
    if (r.from === "/**" || r.from === "/*") return r.to;
    if (r.from === pathname) return r.to;
    if (r.from.endsWith("/**") || r.from.endsWith("/*")) {
      const prefix = r.from.replace(/\/*\*+$/, "");
      if (pathname === prefix || pathname.startsWith(prefix + "/")) {
        const suffix = pathname.slice(prefix.length);
        return r.to.replace(/\/+$/, "") + (suffix === "/" ? "/" : suffix);
      }
    }
  }
  return null;
}


import { createImageHandler } from "@tw/optImage";
import { WebSocketManager } from "./websocket-manager";
import { getSignalHub } from "./routing";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { RouteRegistry, type RouteContext } from "./router";
import { MiddlewarePipeline, corsMiddleware, loggingMiddleware, rateLimitMiddleware, securityHeadersMiddleware, bodyParserMiddleware, compressionMiddleware, type Middleware } from "./middleware";
import { StaticHandler } from "./static";
import { createSecurityHeaders, strictSecurityHeaders, devSecurityHeaders } from "@tw/security";
import { SSRRenderer } from "./ssr";
// sha256 import removed -- was unused

export interface TWServerOptions {
  rootDir: string;
  port: number;
  host: string;
  staticDir?: string;
  /**
   * Security headers applied to every response. Presets come from
   * @tw/security: "standard" (serve default), "strict", "dev" (dev default),
   * "off" disables. tw.config.ts: security: { headers: "..." }.
   */
  security?: { headers?: "standard" | "strict" | "dev" | "off"; csp?: boolean };
  /** Parsed tw.config.ts (redirects, headers, ...) */
  config?: any;
  pagesDir?: string;
  cors?: boolean;
  rateLimit?: { windowMs: number; max: number };
  compression?: boolean;
  securityHeaders?: boolean;
  ssl?: { cert: string; key: string };
  workers?: number;
  /** Plugin manager from @tw/plugins -- enables onRequest/onResponse/onError
   *  hooks, plugin routes and plugin middleware. Optional. */
  plugins?: any;
  /** tw.config.ts `images` — quality/formats/breakpoints/remoteAllowHosts. */
  images?: any;
}

export class TWServer {
  private options: TWServerOptions;
  private router: RouteRegistry;
  private pipeline: MiddlewarePipeline;
  private staticHandler: StaticHandler | null = null;
  /** ISR routes (from .tw/routes.json): pathname -> revalidate seconds
   * (bare number, legacy) or { revalidate, stale, expire, tag } object
   * (docs/cache-tags.md). Presence decides pipeline-vs-static routing. */
  private isrRoutes: Map<string, number | Record<string, any>> = new Map();
  private securityHeaders: { apply(res: Response): Response } | null = null;

  /**
   * CSP nonces (docs/csp-nonce.md): generate a per-response nonce, stamp
   * every <script> tag in the HTML with it, and return the matching
   * Content-Security-Policy header. Enabled via tw.config.ts:
   * security: { csp: true }.
   */
  private applyCspNonce(html: string): { html: string; headers: Record<string, string> } {
    // node:crypto randomBytes via the already-bundled require shim
    const rand = require("node:crypto").randomBytes(24).toString("hex");
    const stamped = html.replace(/<script(?![^>]*\bnonce=)(\s|>)/gi, `<script nonce="${rand}"$1`);
    return {
      html: stamped,
      headers: {
        // 'unsafe-eval' is required by the client runtime: interactive page
        // handlers (data-tw-event) are evaluated via new Function() at
        // runtime. The nonce still blocks injected third-party scripts.
        "Content-Security-Policy": `script-src 'nonce-${rand}' 'self' 'unsafe-eval'; object-src 'none'; base-uri 'self'`,
      },
    };
  }

  private cspEnabled(): boolean {
    return !!(this.options.security as any)?.csp;
  }
  private ssr: SSRRenderer | null = null;
  private server: any = null;
  private isRunning = false;
  private pluginManager: any = null;
  private imageHandler: { handle(request: Request): Promise<Response | null> } | null = null;

  constructor(options: TWServerOptions) {
    this.options = {
      cors: true,
      compression: true,
      securityHeaders: true,
      ...options,
    };
    // Normalize tw.config.ts shapes: both forms work everywhere.
    //   redirects: { "/old": "/new" }          (docs form)
    //   redirects: [{ from, to, status }]      (array form)
    //   headers:   { "/path": { ...headers } }
    //   headers:   [{ source, headers }]
    const cfgIn: any = (this.options as any).config;
    if (cfgIn && typeof cfgIn === "object") {
      if (cfgIn.redirects && !Array.isArray(cfgIn.redirects)) {
        const entries = Object.entries(cfgIn.redirects) as [string, any][];
        cfgIn.redirects = entries.map(([from, to]) =>
          typeof to === "string" ? { from, to } : { from, ...to });
      }
      if (cfgIn.headers && !Array.isArray(cfgIn.headers)) {
        const entries = Object.entries(cfgIn.headers) as [string, any][];
        cfgIn.headers = entries.map(([source, headers]) => ({ source, headers }));
      }
      //   rewrites: { "/games": "/category/games" }   (docs form)
      //   rewrites: [{ from, to }]                   (array form)
      if (cfgIn.rewrites && !Array.isArray(cfgIn.rewrites)) {
        const entries = Object.entries(cfgIn.rewrites) as [string, any][];
        cfgIn.rewrites = entries.map(([from, to]) =>
          typeof to === "string" ? { from, to } : { from, ...to });
      }
      // Header values must be single-line: strip CR/LF so an invalid value
      // can never smuggle extra headers (Node would 500, Bun would drop it).
      for (const h of cfgIn.headers ?? []) {
        if (h?.headers && typeof h.headers === "object") {
          for (const k of Object.keys(h.headers)) {
            h.headers[k] = String(h.headers[k]).replace(/[\r\n]/g, "");
          }
        }
      }
    }
    this.pluginManager = this.options.plugins ?? null;

    // Image optimizer: /_tw/img/* (source: public/, cache: .tw/img)
    try {
      this.imageHandler = createImageHandler({
        rootDir: this.options.rootDir,
        ...(this.options.images?.sourceDir ? { sourceDir: this.options.images.sourceDir } : {}),
        config: this.options.images,
      });
    } catch { /* images stay off */ }
    this.router = new RouteRegistry();
    this.pipeline = new MiddlewarePipeline();

    // Setup built-in middleware
    if (this.options.securityHeaders) {
      this.pipeline.use("security", securityHeadersMiddleware());
    }
    if (this.options.cors) {
      this.pipeline.use("cors", corsMiddleware({ origin: "*", credentials: true }));
    }
    this.pipeline.use("bodyParser", bodyParserMiddleware());
    if (this.options.rateLimit) {
      this.pipeline.use("rateLimit", rateLimitMiddleware(this.options.rateLimit));
    }
    if (this.options.compression) {
      this.pipeline.use("compression", compressionMiddleware());
    }
    this.pipeline.use("logging", loggingMiddleware());

    // Setup static file handler
    // Security headers (@tw/security presets) -- serve default: standard
    const headersMode = this.options.security?.headers ?? "standard";
    if (headersMode !== "off") {
      try {
        if (headersMode === "strict") this.securityHeaders = strictSecurityHeaders();
        else if (headersMode === "dev") this.securityHeaders = devSecurityHeaders();
        else this.securityHeaders = createSecurityHeaders();
        if (headersMode === "standard" || headersMode === "strict") {
          console.log(`  Security headers: ${headersMode}`);
        }
      } catch {
        // @tw/security unavailable -- serve without extra headers
      }
    }

    const staticDir = this.options.staticDir ?? join(options.rootDir, ".tw");
    if (existsSync(staticDir)) {
      // ISR manifest (docs/isr.md): routes with a revalidate window are
      // served through the render pipeline, never as frozen static files.
      try {
        const manifestPath = join(staticDir, "routes.json");
        if (existsSync(manifestPath)) {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
          for (const [route, secs] of Object.entries(manifest)) {
            // routes.json (docs/cache-tags.md): bare number = legacy
            // `revalidate N`; object = resolved cache windows + tag.
            (this as any).isrRoutes.set(route, secs);
          }
          if (Object.keys(manifest).length > 0) {
            console.log(`  ISR: ${Object.keys(manifest).length} revalidate route(s)`);
          }
        }
      } catch { /* routes.json is optional */ }
      this.staticHandler = new StaticHandler({
        root: staticDir,
        etag: true,
        maxAge: 3600,
        spa: false,
      });
    }

    // Setup SSR renderer -- uses home/ directory (not pages/)
    const homeDir = this.options.pagesDir ?? join(options.rootDir, "home");
    if (existsSync(homeDir)) {
      this.ssr = new SSRRenderer({ pagesDir: homeDir, enableCache: true, cacheTTL: 60000 });
    }
  }

  // Route registration
  get(pattern: string, handler: (ctx: RouteContext) => any, middleware?: string[]): this {
    this.router.get(pattern, handler, middleware);
    return this;
  }

  post(pattern: string, handler: (ctx: RouteContext) => any, middleware?: string[]): this {
    this.router.post(pattern, handler, middleware);
    return this;
  }

  put(pattern: string, handler: (ctx: RouteContext) => any, middleware?: string[]): this {
    this.router.put(pattern, handler, middleware);
    return this;
  }

  patch(pattern: string, handler: (ctx: RouteContext) => any, middleware?: string[]): this {
    this.router.patch(pattern, handler, middleware);
    return this;
  }

  delete(pattern: string, handler: (ctx: RouteContext) => any, middleware?: string[]): this {
    this.router.delete(pattern, handler, middleware);
    return this;
  }

  use(middleware: Middleware): this {
    this.pipeline.useFn(middleware);
    return this;
  }

  notFound(handler: (ctx: RouteContext) => any): this {
    this.router.notFound(handler);
    return this;
  }

  onError(handler: (err: Error, ctx: RouteContext) => Response): this {
    this.router.onError(handler);
    return this;
  }

  // Load routes from home directory
  loadRoutes(pagesDir?: string): this {
    const dir = pagesDir ?? join(this.options.rootDir, "home");
    this.router.loadFromDir(dir);
    return this;
  }

  // Load root-level middleware.twm file
  private middlewarePath: string | null = null;
  loadMiddleware(): this {
    const middlewarePath = join(this.options.rootDir, "middleware.twm");
    if (existsSync(middlewarePath)) {
      this.middlewarePath = middlewarePath;
      console.log("  Middleware: middleware.twm loaded");
    }
    return this;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    const { port, host } = this.options;

    this.server = (typeof Bun !== "undefined" ? Bun : null as any)?.serve({
      port,
      hostname: host,
      fetch: async (request: Request) => {
        const res = await this.handleRequest(request);
        if (this.securityHeaders) {
          try { return this.securityHeaders.apply(res); } catch { return res; }
        }
        return res;
      },
      error: (err: Error) => {
        console.error("Server error:", err);
        return new Response("Internal Server Error", { status: 500 });
      },
    });

    this.isRunning = true;
    console.log(`\n  TW Server running at http://${host}:${port}\n`);
    console.log(`  Routes: ${this.router.size()}`);
    console.log(`  Static: ${this.staticHandler ? "enabled" : "disabled"}`);
    console.log(`  SSR: ${this.ssr ? "enabled" : "disabled"}\n`);
  }

  // Graceful shutdown -- stops accepting new connections,
  // finishes ongoing requests, then closes
  async gracefulShutdown(timeout: number = 5000): Promise<void> {
    this.isRunning = false;
    if (this.server) {
      // Stop accepting new connections
      this.server.stop?.(false); // Bun API -- wait for pending
      // Wait for timeout or all connections to close
      const start = Date.now();
      while (Date.now() - start < timeout) {
        await new Promise(r => setTimeout(r, 100));
      }
      // Force close
      this.server.stop?.(true);
      this.server = null;
    }
  }

  stop(): void {
    if (this.server) {
      this.server.stop?.();
      this.server = null;
      this.isRunning = false;
      console.log("\n  TW Server stopped\n");
    }
  }

  /**
   * Public request handler -- runs user middleware.twm first.
   * Middleware may:
   *   - return a Response          -> intercept (redirects, 401 guards, ...)
   *   - return { headers: {...} }  -> headers merged into the final response
   *   - return null/undefined      -> continue
   */
  private async handleRequest(request: Request): Promise<Response> {
    // Normalize the request URL once, up front: collapse duplicate slashes
    // (`//admin` -> `/admin`). The WHATWG URL parser preserves `//`, and user
    // middleware.twm re-parses request.url itself, so the rewritten URL must
    // be what everything downstream sees -- otherwise path guards written as
    // `path.indexOf("/x") === 0` can be bypassed with a leading `//`.
    try {
      const u = new URL(request.url);
      const norm = u.pathname.replace(/\/{2,}/g, "/");
      if (norm !== u.pathname) {
        u.pathname = norm;
        request = new Request(u.toString(), request);
      }
    } catch { /* keep original request */ }

    // --- Plugins: routes and onRequest hooks ---------------------------------
    // Runs after URL normalization (so `//x` tricks do not bypass plugin
    // route matching) and before config redirects and site routing.
    if (this.pluginManager) {
      const pm: any = this.pluginManager;
      try {
        const purl = new URL(request.url);
        const ppath = purl.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
        for (const plugin of pm.list?.() ?? []) {
          for (const route of plugin.routes ?? []) {
            if (String(route.method ?? "GET").toUpperCase() === request.method && route.path === ppath) {
              const out = await route.handler({ request, url: purl });
              if (out instanceof Response) return out;
              if (out && typeof out === "object") {
                const isJson = out.json !== undefined;
                return new Response(isJson ? JSON.stringify(out.json) : String(out.text ?? ""), {
                  status: out.status ?? 200,
                  headers: {
                    "Content-Type": isJson ? "application/json" : "text/plain; charset=utf-8",
                    ...(out.headers ?? {}),
                  },
                });
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`  [plugins] route error: ${err?.message ?? err}`);
      }
      // onRequest hooks -- a hook may return a Response to intercept.
      try {
        const res = await pm.runHook?.("onRequest", { request, url: new URL(request.url) });
        if (res instanceof Response) return res;
      } catch (err: any) {
        console.warn(`  [plugins] onRequest error: ${err?.message ?? err}`);
      }
    }

    const __twStart = performance.now();
    let cfgHeaders: Record<string, string> | null = null;

    // tw.config.ts rewrites: [{ from, to }] — the URL is rewritten in place,
    // the browser never sees a redirect. Supports :param segments
    // (/app/:slug -> /game/:slug). Runs before redirects and site routing.
    {
      const cfgRw: any = (this.options as any).config;
      if (cfgRw?.rewrites?.length) {
        const url = new URL(request.url);
        const rewritten = applyRewrites(cfgRw.rewrites, url.pathname);
        if (rewritten !== null && rewritten !== url.pathname) {
          url.pathname = rewritten;
          request = new Request(url.toString(), request);
        }
      }
    }

    // tw.config.ts redirects: [{ from, to, status }]
    const cfg: any = (this.options as any).config;
    if (cfg?.redirects?.length) {
      const url = new URL(request.url);
      for (const r of cfg.redirects) {
        if (!r?.from || !r?.to) continue;
        if (this.configPathMatch(r.from, normalizePathname(url.pathname))) {
          const status = [301, 302, 307, 308].includes(r.status) ? r.status : 301;
          let loc = r.to.startsWith("http") ? r.to : new URL(r.to, request.url).toString();
          // Preserve the query string unless the target has its own.
          if (url.search && !loc.includes("?")) loc += url.search;
          return new Response(null, { status, headers: { Location: loc } });
        }
      }
    }

    // tw.config.ts headers: [{ source, headers: {...} }]
    if (cfg?.headers?.length) {
      const url = new URL(request.url);
      for (const h of cfg.headers) {
        if (!h?.source || !h?.headers) continue;
        if (this.configPathMatch(h.source, url.pathname)) {
          cfgHeaders = { ...(cfgHeaders ?? {}), ...h.headers };
        }
      }
    }

    let response: Response;
    try {
      response = await this.handleRequestWithMiddleware(request, cfgHeaders);
    } catch (err) {
      if (this.pluginManager) {
        try { await (this.pluginManager as any).runHook?.("onError", { request, error: err }); } catch { /* isolated */ }
      }
      throw err;
    }

    // Plugins: onResponse -- a hook may return a replacement Response.
    if (this.pluginManager) {
      try {
        const res = await (this.pluginManager as any).runHook?.("onResponse", { request, response });
        if (res instanceof Response) response = res;
      } catch (err: any) {
        console.warn(`  [plugins] onResponse error: ${err?.message ?? err}`);
      }
    }

    // Structured request log (one line per request)
    const ms = Math.round((performance.now() - __twStart) * 10) / 10;
    console.log(`  [${new Date().toISOString()}] ${request.method} ${new URL(request.url).pathname} -> ${response.status} (${ms}ms)`);

    return response;
  }

  /** Glob-ish matcher: exact, /prefix/*, /prefix/** */
  private configPathMatch(pattern: string, pathname: string): boolean {
    if (pattern === "/**" || pattern === "/*") return true;
    if (pattern === pathname) return true;
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      return pathname === prefix || pathname.startsWith(prefix + "/");
    }
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      return pathname === prefix || pathname.startsWith(prefix + "/");
    }
    return false;
  }
  private rateLimitStore = new Map<string, { count: number; reset: number }>();
  /** Singleton SSR render pipeline -- the ISR cache must survive across
   *  requests, and revalidatePath() must reach the live instance. */
  private renderPipeline: any = null;

  private async handleRequestWithMiddleware(request: Request, cfgHeaders: Record<string, string> | null): Promise<Response> {
    let mwHeaders: Record<string, string> | null = cfgHeaders;

    // config.rateLimit: simple in-memory fixed-window limiter
    const rl: any = (this.options as any).rateLimit;
    if (rl?.windowMs && rl?.max) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
      const now = Date.now();
      const entry = this.rateLimitStore.get(ip);
      if (!entry || now > entry.reset) {
        this.rateLimitStore.set(ip, { count: 1, reset: now + rl.windowMs });
      } else {
        entry.count += 1;
        if (entry.count > rl.max) {
          return new Response(JSON.stringify({ ok: false, error: "Too Many Requests" }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((entry.reset - now) / 1000)) },
          });
        }
      }
    }
    if (this.middlewarePath) {
      try {
        const { executeMiddleware, loadTWMModule, shouldMatchMiddleware } = await import("./routing/twm-loader");
        const mod = await loadTWMModule(this.middlewarePath);
        const pathname = normalizePathname(new URL(request.url).pathname);
        if (!mod.config?.matcher || shouldMatchMiddleware(mod.config.matcher, pathname)) {
          const mwResult: any = await executeMiddleware(this.middlewarePath, request);
          if (mwResult instanceof Response) return mwResult;
          if (mwResult && typeof mwResult === "object" && mwResult.headers && !mwResult.status && !mwResult.json) {
            mwHeaders = { ...(mwHeaders ?? {}), ...mwResult.headers };
          }
        }
      } catch (err: any) {
        console.error(`[middleware] Error: ${err.message}`);
      }
    }

    const response = await this.handleRequestInner(request);

    // Merge middleware-provided headers (security headers, CORS, ...)
    if (mwHeaders) {
      for (const key of Object.keys(mwHeaders)) {
        try { if (!response.headers.has(key)) response.headers.set(key, mwHeaders[key]); } catch { /* skip */ }
      }
    }
    return response;
  }

  /**
   * Signal stream endpoint: a ReadableStream kept open for the life of the
   * connection. Browsers receive batched signal updates as
   * `data: {"v":1,"seq":N,"updates":[...]}` frames.
   */
  private handleSignalStream(request: Request, url: URL): Response {
    const hub = getSignalHub();
    const names = (url.searchParams.get("s") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const since = Number(url.searchParams.get("since") ?? "0") || 0;
    const declared = new Map<string, string>();
    for (const n of names) declared.set(n, "public"); // kind refined on updates
    // Per-user private delivery: the session key comes from the tw_session
    // cookie (docs/signal-streaming.md, security layer docs/52).
    let session: string | undefined;
    try {
      const header = request.headers.get("cookie") ?? "";
      const m = /(?:^|;\s*)tw_session=([^;]+)/.exec(header);
      if (m) session = decodeURIComponent(m[1].trim().replace(/^"|"$/g, ""));
    } catch { /* anonymous stream */ }

    const enc = new TextEncoder();
    const sse = (payload: string) => enc.encode("data: " + payload + "\n\n");

    const stream = new ReadableStream({
      start(controller) {
        const client = hub.register(declared, session);
        client.send = (payload: string) => {
          try { controller.enqueue(sse(payload)); } catch { client.close(); }
        };
        client.close = () => {
          try { controller.close(); } catch { /* already closed */ }
          hub["clients" as never]; // no-op type access guard
        };
        // Resume: replay missed updates or send a fresh snapshot
        for (const payload of hub.connectPayloads(since, declared, session)) {
          try { controller.enqueue(sse(payload)); } catch { break; }
        }
        // Keep-alive comment every 25s so proxies do not idle the connection
        const keepAlive = setInterval(() => {
          try { controller.enqueue(enc.encode(": keep-alive\n\n")); } catch { clearInterval(keepAlive); }
        }, 25000);
        (client as any).close = () => {
          clearInterval(keepAlive);
          try { controller.close(); } catch { /* already closed */ }
        };
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  }

  /**
   * PPR hole fill: render the page fresh and return only the requested
   * Suspense boundary's content (HTML fragment). Unknown routes/boundaries
   * answer 404 -- the client keeps the fallback it already shows.
   */
  private async handlePPRHoleFill(url: URL): Promise<Response> {
    const routePath = normalizePathname(url.searchParams.get("path") ?? "/");
    const boundaryId = url.searchParams.get("id") ?? "";
    if (!boundaryId || !/^[A-Za-z0-9_-]+$/.test(boundaryId)) {
      return new Response("Bad Request", { status: 400 });
    }
    const homeDir = join(this.options.rootDir, "home");
    if (!existsSync(homeDir)) return new Response("Not Found", { status: 404 });
    try {
      const { createRenderPipeline } = await import("./routing");
      if (!this.renderPipeline) {
        this.renderPipeline = createRenderPipeline({
          rootDir: this.options.rootDir,
          homeDir,
          enableCache: true,
          dev: false,
        });
        const { setActivePipeline } = await import("./routing");
        setActivePipeline(this.renderPipeline);
      }
      const result: any = this.renderPipeline.render(routePath);
      if (!result || !result.html) return new Response("Not Found", { status: 404 });
      const re = new RegExp(
        "<template data-tw-content=\"" + boundaryId + "\" hidden>([\\s\\S]*?)</template>",
      );
      const m = re.exec(result.html);
      if (!m) return new Response("Not Found", { status: 404 });
      return new Response(m[1], {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }

  /**
   * `render stream` response: flush the shell (fallbacks visible, content
   * templates stripped) immediately, then stream each Suspense boundary's
   * content as a __TW_RESOLVE__ chunk. The client swaps without
   * reconciliation -- the markup arrives over the wire, after the shell.
   */
  private streamSSRResponse(html: string): Response {
    const templates: Array<{ id: string; content: string }> = [];
    for (const m of html.matchAll(/<template data-tw-content="([^"]+)" hidden>([\s\S]*?)<\/template>/g)) {
      templates.push({ id: m[1], content: m[2] });
    }
    let shell = html;
    for (const t of templates) {
      shell = shell.replace(
        "<template data-tw-content=\"" + t.id + "\" hidden>" + t.content + "</template>",
        "",
      );
    }
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(enc.encode(shell));
        for (const t of templates) {
          // Yield to the event loop so the shell is flushed first
          await new Promise((r) => setTimeout(r, 15));
          const payload = JSON.stringify(t.content).replace(/</g, "\\u003c");
          controller.enqueue(
            enc.encode("<script>window.__TW_RESOLVE__(" + JSON.stringify(t.id) + ", " + payload + ");</script>"),
          );
        }
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  private async handleRequestInner(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const pathname = normalizePathname(url.pathname);

    // /_tw/img/* — optimized image variants (served before static routing so
    // the .tw cache dir and raw sources are never exposed).
    if (pathname === "/_tw/img" || pathname.startsWith("/_tw/img/")) {
      const imgRes = await this.imageHandler!.handle(request);
      if (imgRes) return imgRes;
    }

    // /_tw/stream — Signal Streaming (docs/183): persistent SSE-style stream
    // for `render signalStream` pages. ?s=price,trend declares the page's
    // signals (private delivery filter), ?since=N resumes after a drop.
    if (pathname === "/_tw/stream") {
      return this.handleSignalStream(request, url);
    }

    // /_tw/ppr — PPR hole fills: `render ppr` pages serve a prebuilt static
    // shell and the client runtime fetches fresh content for each marked
    // Suspense boundary from here (?path=<route>&id=<boundary-id>).
    if (pathname === "/_tw/ppr") {
      return this.handlePPRHoleFill(url);
    }

    // Build context
    const ctx: RouteContext = {
      request,
      url,
      method,
      params: {},
      query: Object.fromEntries(url.searchParams),
      headers: {},
      body: null,
      state: {},
    };

    // Copy request headers
    request.headers.forEach((value, key) => {
      ctx.headers[key] = value;
    });


    // Check if this is an API route (.twm)
    if (pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith("/api.")) {
      try {
        const { createRenderPipeline } = await import("./routing");
        const homeDir = join(this.options.rootDir, "home");
        if (existsSync(homeDir)) {
          const pipeline = createRenderPipeline({
            rootDir: this.options.rootDir,
            homeDir,
            enableCache: false,
            dev: true,
          });
          const response = await pipeline.renderRoute(pathname, method, request);
          return response;
        }
      } catch (err: any) {
        console.error(`[api] Error: ${err.message}\n${err.stack ?? ""}`);
        // Do not leak internal error details to the client.
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Try static file serving first (prebuilt .tw/ output) -- EXCEPT for
    // ISR routes with a revalidate window: those must go through the render
    // pipeline below so they re-render (MISS -> HIT -> STALE + background
    // refresh) instead of serving frozen HTML forever.
    const isrLookupPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    if (this.staticHandler && !(this as any).isrRoutes.has(isrLookupPath)) {
      let staticResponse = await this.staticHandler.serve(pathname, request);
      // CSP nonces for prebuilt (static) HTML pages too. Read as raw bytes:
      // the static handler may have gzip-encoded the body, and reading it
      // as text() would be lossy. Gunzip, stamp, serve uncompressed.
      if (staticResponse && this.cspEnabled() && (staticResponse.headers.get("content-type") || "").includes("text/html")) {
        try {
          let buf = Buffer.from(await staticResponse.arrayBuffer());
          if ((staticResponse.headers.get("content-encoding") || "").includes("gzip")) {
            buf = require("node:zlib").gunzipSync(buf);
          }
          const cspRes = this.applyCspNonce(buf.toString("utf8"));
          const h = new Headers(staticResponse.headers);
          // The re-stamped body differs from the file bytes -- the copied
          // Content-Length would TRUNCATE the response, and Content-Encoding
          // would mislabel the now-uncompressed body.
          h.delete("Content-Length");
          h.delete("Content-Encoding");
          Object.entries(cspRes.headers).forEach(([k, v]) => h.set(k, v));
          staticResponse = new Response(cspRes.html, { status: staticResponse.status, headers: h });
        } catch { /* never break static serving */ }
      }
      if (staticResponse.status !== 404) {
        return staticResponse;
      }
    }

    // SSR via the render pipeline for non-static routes -- handles dynamic
    // [param] routes (with params as state), layouts, and not-found pages.
    if (this.ssr && pathname !== "/api" && !pathname.startsWith("/api/")) {
      // Skip if request is for a static asset
      const ext = pathname.split(".").pop();
      if (!ext || !["js", "css", "png", "jpg", "jpeg", "gif", "svg", "woff", "woff2", "ttf", "ico", "webp", "avif", "mp4", "webm"].includes(ext)) {
        try {
          const { createRenderPipeline, setActivePipeline } = await import("./routing");
          const homeDir = join(this.options.rootDir, "home");
          if (existsSync(homeDir)) {
            if (!this.renderPipeline) {
              this.renderPipeline = createRenderPipeline({
                rootDir: this.options.rootDir,
                homeDir,
                enableCache: true,
                dev: false,
              });
              setActivePipeline(this.renderPipeline);
            }
            const renderPipeline = this.renderPipeline;
            // SPA navigation signal (client runtime link fetch): lets the
            // render pipeline serve `(.)page.tw` interceptors (modals).
            (renderPipeline as any).navRequest = request.headers.get("x-tw-navigate") === "1";
            const result: any = renderPipeline.render(pathname);
            if (result && result.html) {
              // `render stream`: shell first, Suspense holes as streamed chunks
              if (result.renderMode === "stream") {
                return this.streamSSRResponse(result.html);
              }
              let outHtml = result.html;
              const outHeaders: Record<string, string> = result.headers ?? { "Content-Type": "text/html; charset=utf-8" };
              if (this.cspEnabled()) {
                try {
                  const cspRes = this.applyCspNonce(outHtml);
                  outHtml = cspRes.html;
                  Object.assign(outHeaders, cspRes.headers);
                } catch { /* CSP stamping must never break a page */ }
              }
              return new Response(outHtml, {
                status: result.status ?? 200,
                headers: outHeaders,
              });
            }
          }
        } catch (err: any) {
          console.error(`[ssr] Error: ${err.message}`);
        }
      }
    }

    // Try API routes
    const match = this.router.match(method, pathname);
    if (match) {
      ctx.params = match.params;

      try {
        const response = await this.pipeline.run(ctx, async () => {
          return match.route.handler(ctx);
        });

        if (response instanceof Response) {
          return response;
        }

        // If handler returned data, convert to JSON
        if (response !== undefined && response !== null) {
          return new Response(JSON.stringify(response), {
            headers: {
              "Content-Type": "application/json",
              // Response headers -- do NOT spread ctx.headers (request headers) into response
            },
          });
        }

        // If ctx has response set by middleware
        if ((ctx as any).response instanceof Response) {
          return (ctx as any).response;
        }

        return new Response("No Response", { status: 500 });
      } catch (err: any) {
        const errorHandler = this.router.getErrorHandler();
        if (errorHandler) {
          return errorHandler(err, ctx);
        }
        console.error(`Route error: ${err.message}\n${err.stack ?? ""}`);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 404
    const notFoundHandler = this.router.getNotFoundHandler();
    if (notFoundHandler) {
      const response = await notFoundHandler(ctx);
      if (response instanceof Response) return response;
    }

    return new Response("404 Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

// Edge Runtime (Next.js Edge parity)

// Image Optimizer (Next.js Image parity)

// Font Optimizer (Next.js Font parity)

// i18n (Next.js i18n parity)

// Compression (gzip/deflate/brotli)

// Security Headers

// New routing system

export { StreamingCompressor, compress, compressResponse, createCompressionHeaders, decompress, isLargeEnough, negotiateEncoding, shouldCompress } from "./compression";
export type { CompressionOptions } from "./compression";
export { createCloudflareWorker, createDenoHandler, createEdgeHandler } from "./edge";
export type { EdgeConfig, EdgeRequest, EdgeResponse } from "./edge";
export { generateFontCSS, generateFontPreload, optimizeFont } from "./font";
export type { FontConfig, FontFile, FontMetrics, OptimizedFont } from "./font";
export { DEFAULT_I18N_CONFIG, formatCurrency, formatDate, formatNumber, formatRelative, getHtmlDir, getHtmlLang, getLocale, getTextDirection, isRTL, loadTranslations, localizePath, parseLocalePath, setLocale, t } from "./i18n";
export type { I18nConfig, LocaleRouteResult } from "./i18n";
export { DEFAULT_IMAGE_CONFIG, imgTag, optimizeImage, processImage } from "./image";
export type { ImageOptimizerConfig, OptimizedImage } from "./image";
export { BodyParser, MemoryStore, MiddlewarePipeline, acceptFilter, anyBody, bodyParse, bodyParserMiddleware, cacheHeaders, clearCookie, combinedSecurityMiddleware, compressionMiddleware, concurrencyLimit, conditionalGet, contentTypeFilter, cookieParser, cookieSerializer, corsMiddleware, cspMiddleware, csrfProtection, errorBoundary, favicon, healthCheck, hostFilter, hstsMiddleware, httpsOnly, ipFilter, jsonBody, limitBodySize, loggingMiddleware, lowerCasePaths, methodFilter, methodOverride, mount, multipartBody, noCache, nonWWWRedirect, notFound, poweredBy, protocolFilter, queryParser, rangeRequest, rateLimit, rateLimitMiddleware, rawBody, redirectToHTTPS, redirectToNonWWW, redirectToWWW, refererFilter, removeHeader, sanitizeBody, securityHeadersMiddleware, sessionMiddleware, setHeaders, signedCookie, slowDown, textBody, timeoutMiddleware, trailingSlash, urlEncodedBody, userAgentFilter, validateBody, verifySignedCookie, vhost, wwwRedirect } from "./middleware";
export type { BodyParserOptions, Middleware, ParsedBody, RateLimitStore } from "./middleware";
export { buildCSPHeader, buildHSTSHeader, buildPermissionsPolicyHeader, createDevCSP, createProdCSP, generateNonce, generateNonceForCSP, generateSecurityHeaders } from "./security-headers";
export type { SecurityHeadersOptions } from "./security-headers";
export { RouteRegistry } from "./router";
export type { Route, RouteContext, RouteHandler, RouteMatch } from "./router";
export { RenderPipeline, clearTWMCache, collectParallelDefaults, collectParallelPages, createRenderPipeline, executeMiddleware, executeRouteHandler, findGlobalError, findRootNotFound, flattenRoutes, loadTWMModule, matchFlatRoute as matchRoute, matchRoute as matchRouteTree, parseSlots, printRouteTree, renderParallel, resolveLayoutChain, scanRouteTree, scanRouteTree as scanRoutes, shouldMatchMiddleware } from "./routing";
export type { FlatRouteDefinition, FlatRouteMatch, ScannerOptions, TWMModule } from "./routing";
export { SSRRenderer, generatePreloadHints, getCachedSSR, invalidateSSRCache, setCachedSSR } from "./ssr";
export type { SSROptions, SSRResult } from "./ssr";
export { StaticHandler } from "./static";
export type { StaticOptions } from "./static";

export { WebSocketManager };
export type { WebSocketConnection, ConnectionMeta } from "./websocket-manager";
