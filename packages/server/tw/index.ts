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


import { cacheControlFor, ipAddress, resolveI18nOptions, setTrustProxy } from "@tw/shared";
import { createImageHandler } from "@tw/optImage";
import { configureI18n } from "./i18n";
import { WebSocketManager } from "./websocket-manager";
import { getSignalHub } from "./routing";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { parseRules } from "./routing/twm-rules";
import { RouteRegistry, type RouteContext } from "./router";
import { MiddlewarePipeline, corsMiddleware, loggingMiddleware, rateLimitMiddleware, securityHeadersMiddleware, bodyParserMiddleware, compressionMiddleware, requestTimeoutMiddleware, requestConcurrencyMiddleware, type Middleware } from "./middleware";
import { compress, isLargeEnough, negotiateEncoding } from "./compression";
import { createSignalStream, writeSignalFromClient } from "./routing/signal-stream";
import { attachSignalSocket, createSignalLongPoll, detachSignalSocket } from "./routing/signal-transports";
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
  cors?: boolean | {
    enabled?: boolean;
    origin?: string | string[];
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
  };
  rateLimit?: { windowMs: number; max: number };
  compression?: boolean | "gzip" | "brotli" | "none" | "auto";
  securityHeaders?: boolean;
  ssl?: { cert: string; key: string; ca?: string };
  workers?: number;
  cluster?: boolean;
  /** Max request body size in bytes (Bun maxRequestBodySize). 0 = no limit. */
  bodyLimit?: number;
  /** Per-request timeout in ms; a slow handler answers 408. 0 = off. */
  timeout?: number;
  keepAlive?: boolean;
  keepAliveTimeout?: number;
  maxConnections?: number;
  /** Trust X-Forwarded-For / Forwarded for the client IP. */
  trustProxy?: boolean;
  gracefulShutdown?: boolean;
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

  /** strategies.cache.mode -- governs the Cache-Control on every response. */
  private cacheMode(): "isr" | "swr" | "none" | "cdn" {
    const m = (this.options as any).config?.strategies?.cache?.mode;
    return m === "swr" || m === "none" || m === "cdn" ? m : "isr";
  }

  /** The Cache-Control value for a route, per the configured cache mode. */
  private cacheControlForRoute(revalidateSeconds: number): string {
    return cacheControlFor(this.cacheMode(), revalidateSeconds > 0 ? revalidateSeconds : 60);
  }

  private cspEnabled(): boolean {
    return !!(this.options.security as any)?.csp;
  }
  private ssr: SSRRenderer | null = null;
  private server: any = null;
  private compressionMode: "off" | "gzip" | "brotli" = "off";
  /** server.cors (full block): applied to every response. */
  private corsConfig: any = null;
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
      // mistyped redirect fields were silently
      // ignored -- a Next.js-style entry (source/destination/permanent)
      // built fine and then 404'd at runtime. Map the known aliases AND
      // warn about anything still unrecognized.
      if (Array.isArray(cfgIn.redirects)) {
        const REDIRECT_KNOWN = new Set(["from", "to", "status", "source", "destination", "permanent"]);
        let redirectDropped = false;
        const normalizedRedirects = cfgIn.redirects.map((r: any) => {
          if (!r || typeof r !== "object") return r;
          let touched = false;
          const mapped: any = { ...r };
          if (mapped.from === undefined && mapped.source !== undefined) { mapped.from = mapped.source; touched = true; }
          if (mapped.to === undefined && mapped.destination !== undefined) { mapped.to = mapped.destination; touched = true; }
          if (mapped.status === undefined && mapped.permanent !== undefined) {
            mapped.status = mapped.permanent ? 301 : 302;
            touched = true;
          }
          const unknown = Object.keys(mapped).filter((k) => !REDIRECT_KNOWN.has(k));
          if (unknown.length > 0) {
            console.warn("[tw] redirects: unrecognized field" + (unknown.length > 1 ? "s" : "") + " " + unknown.join(", ") +
              " in entry { from: " + JSON.stringify(mapped.from) + " } -- accepted fields: from, to, status");
          }
          if (typeof mapped.from !== "string" || typeof mapped.to !== "string") {
            console.warn("[tw] redirects: entry missing from/to after normalization -- skipped (" + JSON.stringify(r).slice(0, 80) + ")");
            redirectDropped = true;
            return null;
          }
          // preserve object identity for already-clean entries (deep-round
          // config normalization test relies on pass-through)
          return touched ? mapped : r;
        }).filter((x: any) => x !== null || (redirectDropped = true));
        // keep the ORIGINAL array reference when nothing changed at all
        if (redirectDropped || normalizedRedirects.some((x: any, i: number) => x !== cfgIn.redirects[i])) {
          cfgIn.redirects = normalizedRedirects.filter(Boolean);
        }
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

    // i18n.* -- configure the i18n runtime from tw.config.ts. Unset fields
    // keep the built-in defaults, so a project without i18n is unaffected.
    try {
      const cfgIn2: any = (this.options as any).config;
      if (cfgIn2?.i18n || cfgIn2?.router?.locales?.length) {
        const i = resolveI18nOptions(cfgIn2);
        configureI18n({
          locales: i.locales,
          defaultLocale: i.defaultLocale,
          strategy: i.strategy,
          fallback: i.fallback,
          loading: i.loading,
        });
      }
    } catch { /* i18n stays at defaults */ }

    // server.trustProxy -- when false, forwarded headers are ignored and the
    // connection's own address is used.
    setTrustProxy(this.options.trustProxy !== false);

    // `compression` was accepted but never wired --
    // compressionMiddleware() was a deliberate no-op and no response path
    // compressed anything. Resolve the mode ONCE here.
    {
      const raw = (this.options.compression ?? true) as any;
      if (raw === false || raw === "none" || raw === "off" || raw === "false") this.compressionMode = "off";
      else if (raw === "gzip") this.compressionMode = "gzip";
      else this.compressionMode = "brotli"; // true / "brotli": negotiate, br preferred
    }

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
      const co: any = this.options.cors;
      if (co === true) {
        // Legacy default: keep the pipeline middleware (today's behaviour).
        this.pipeline.use("cors", corsMiddleware({ origin: "*", credentials: true }));
      } else if (co.enabled !== false) {
        // Full server.cors block from tw.config.ts. The pipeline writes to
        // ctx.headers (request headers), which never reach the response -- so
        // the block is applied to EVERY response in applyCors() instead.
        this.corsConfig = co;
      }
    }
    // server.timeout: answer a slow handler with 408 instead of hanging.
    if (typeof this.options.timeout === "number" && this.options.timeout > 0) {
      this.pipeline.use("timeout", requestTimeoutMiddleware(this.options.timeout));
    }
    // server.maxConnections: cap in-flight requests.
    if (typeof this.options.maxConnections === "number" && this.options.maxConnections > 0) {
      this.pipeline.use("concurrency", requestConcurrencyMiddleware(this.options.maxConnections));
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
      // print what each rule will do. A rule with
      // only `match` + `response` (no condition blocks) applies to EVERY
      // matching request -- a fail-closed guard that is easy to misread as
      // "inert". Naming it at startup removes the guesswork.
      try {
        const src = readFileSync(middlewarePath, "utf-8");
        const rules = parseRules(src, "middleware.twm");
        for (const r of rules) {
          const conds: string[] = [];
          if (r.userAgent) conds.push("user_agent");
          if (r.path) conds.push("path");
          if (r.auth) conds.push("auth");
          if (r.rateLimit) conds.push("rate_limit");
          if (r.origin) conds.push("origin");
          if (r.methods && r.methods.length > 0) conds.push("methods");
          const label = conds.length > 0
            ? conds.join(" + ")
            : "no conditions -> every matching request gets this response";
          console.log(`    \u2022 "${r.name}" [${label}]`);
        }
      } catch {
        /* rule syntax errors surface loudly on the first request */
      }
    }
    return this;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    const host = this.options.host ?? "0.0.0.0";
    const wanted = this.options.port ?? 8000;

    // server.ssl -> Bun tls; server.bodyLimit -> maxRequestBodySize;
    // server.keepAlive/keepAliveTimeout -> idleTimeout (seconds);
    // server.cluster / workers>1 -> reusePort so several processes can share.
    const ssl = this.options.ssl;
    const tlsOpt = ssl?.cert && ssl?.key
      ? { tls: { cert: ssl.cert, key: ssl.key, ...(ssl.ca ? { ca: ssl.ca } : {}) } }
      : {};
    const limitOpt = typeof this.options.bodyLimit === "number" && this.options.bodyLimit > 0
      ? { maxRequestBodySize: this.options.bodyLimit } : {};
    const idleOpt = this.options.keepAlive === false
      ? { idleTimeout: 0 }
      : (typeof this.options.keepAliveTimeout === "number" && this.options.keepAliveTimeout > 0
        ? { idleTimeout: Math.max(1, Math.round(this.options.keepAliveTimeout / 1000)) }
        : {});
    const clusterOpt = (this.options.cluster || (this.options.workers ?? 1) > 1) ? { reusePort: true } : {};

    // the "running" banner printed BEFORE binding and a
    // busy port crashed with a raw EADDRINUSE stack trace (the user was
    // told the server was up when it was dead). Bind FIRST -- trying
    // wanted, wanted+1 ... wanted+9 as the docs promise -- then announce.
    let port = wanted;
    let bound: any = null;
    let lastErr: any = null;
    for (let p = wanted; p < wanted + 10; p++) {
      try {
        bound = (typeof Bun !== "undefined" ? Bun : null as any)?.serve({
          port: p,
          hostname: host,
          ...tlsOpt,
          ...limitOpt,
          ...idleOpt,
          ...clusterOpt,
          fetch: async (request: Request) => {
            // /_tw/ws — WebSocket signal transport. Upgraded before routing so
            // the socket speaks the same frame protocol as SSE (strategy
            // signals.transport="ws").
            try {
              const u = new URL(request.url);
              if (u.pathname === "/_tw/ws") {
                // Try the upgrade directly: Bun does not always surface the
                // `Upgrade` header on the Request, so gating on it is
                // unreliable. upgrade() returns false for a plain GET.
                const server: any = this.server ?? bound;
                if (server?.upgrade?.(request, { url: request.url })) return undefined as any;
                return new Response("WebSocket upgrade required", { status: 426 });
              }
            } catch { /* fall through to normal routing */ }

            const res = await this.handleRequest(request);
            let withHeaders = res;
            if (this.securityHeaders) {
              try { withHeaders = this.securityHeaders.apply(res); } catch { withHeaders = res; }
            }
            return this.compressResponse(withHeaders, request);
          },
          websocket: {
            // one hub client per socket; data carries the connection URL
            open: (ws: any) => {
              try {
                const u = new URL(ws.data?.url ?? "http://localhost/_tw/ws");
                ws.data.signalClient = attachSignalSocket(ws, u);
              } catch { /* leave the socket unregistered */ }
            },
            message: (ws: any, raw: any) => {
              // Client -> server signal writes ride the same gated path as
              // POST /_tw/signal (public-only, config-gated).
              try {
                const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed.name === "string") {
                  this.handleSocketSignalWrite(parsed).then((out) => {
                    try { ws.send(JSON.stringify(out)); } catch { /* closed */ }
                  }).catch(() => { /* ignored */ });
                }
              } catch { /* ignore malformed frames */ }
            },
            close: (ws: any) => { detachSignalSocket(ws.data?.signalClient ?? null); },
          },
          error: (err: Error) => {
            console.error("Server error:", err);
            return new Response("Internal Server Error", { status: 500 });
          },
        });
        port = p;
        break;
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? e);
        if (!/address already in use|EADDRINUSE|Failed to start server/i.test(msg)) throw e;
        if (p < wanted + 9) console.log(`  Port ${p} busy — trying ${p + 1}...`);
      }
    }
    if (!bound) {
      console.error(`\n  ERROR: could not bind ${host} on ports ${wanted}–${wanted + 9}.`);
      console.error(`  ${lastErr?.message ?? lastErr}\n`);
      throw lastErr ?? new Error("could not start server");
    }
    this.server = bound;
    this.options.port = port;
    this.isRunning = true;

    // Strategy check: WebSocket signal transport is served by Bun's native
    // WebSocket support. On Node (no Bun), say so once instead of leaving the
    // client to reconnect forever -- long-poll/SSE work everywhere.
    try {
      const { setApiRuntime } = await import("./routing/twm-loader");
      const rt = (this.options as any).config?.strategies?.api?.runtime;
      setApiRuntime(rt === "edge" ? "edge" : "node");
      const t = (this.options as any).config?.strategies?.signals?.transport;
      if (t === "ws" && typeof (globalThis as any).Bun === "undefined") {
        console.warn("  ! signals.transport=ws needs Bun's WebSocket server (or the `ws` package).");
        console.warn("    On Node, use --signals=sse or --signals=long-poll.");
      }
    } catch { /* no config */ }
    console.log(`\n  TW Server running at ${tlsOpt ? "https" : "http"}://${host}:${port}\n`);
    // Lifecycle hook: the server is accepting traffic.
    try { await (this.pluginManager as any)?.runHook?.("server:start", { host, port, rootDir: this.options.rootDir }); } catch { /* isolated */ }
    console.log(`  Routes: ${this.router.size()}`);
    console.log(`  Static: ${this.staticHandler ? "enabled" : "disabled"}`);
    console.log(`  SSR: ${this.ssr ? "enabled" : "disabled"}\n`);
  }

  // Graceful shutdown -- stops accepting new connections,
  // finishes ongoing requests, then closes
  async gracefulShutdown(timeout: number = 5000): Promise<void> {
    // Lifecycle hook: give plugins a chance to flush before connections drain.
    // Fired once -- a second signal must not run a plugin's teardown twice.
    if (this.isRunning) {
      try { await (this.pluginManager as any)?.runHook?.("server:stop", { rootDir: this.options.rootDir }); } catch { /* isolated */ }
    }
    this.isRunning = false;
    // v2: close every signal-stream client so SSE sockets free immediately
    try { getSignalHub().closeAll(); } catch { /* no hub */ }
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
 /** real response compression. `compression` in
   * tw.config.ts was silently ignored -- the middleware was a no-op and
   * nothing on the response path ever set Content-Encoding. */
  private async compressResponse(res: Response, request: Request): Promise<Response> {
    if (this.compressionMode === "off") return res;
    try {
      if (res.headers.get("content-encoding")) return res;
      const ct = res.headers.get("content-type") || "";
      // SSE / stream responses must never be buffered
      if (ct.includes("text/event-stream")) return res;
      if ((res as any).__twRawStream) return res;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!isLargeEnough(buf.length)) return new Response(buf, { status: res.status, headers: res.headers });
      const accept = request.headers.get("accept-encoding") || "";
      let enc = negotiateEncoding(accept);
      if (this.compressionMode === "gzip" && enc === "brotli") enc = "gzip";
      if (!enc) return new Response(buf, { status: res.status, headers: res.headers });
      const out = await compress(buf, enc);
      // Never serve a LARGER body than the raw one.
      if (out.length >= buf.length) return new Response(buf, { status: res.status, headers: res.headers });
      const h = new Headers(res.headers);
      h.set("Content-Encoding", enc === "brotli" ? "br" : enc);
      h.set("Vary", "Accept-Encoding");
      h.delete("Content-Length");
      return new Response(out as any, { status: res.status, headers: h });
    } catch {
      return res; // compression must never break a response
    }
  }

 /** public now -- serverless adapters (Vercel
   *  functions, edge runtimes) drive the server through this entry. */
  async handleRequest(request: Request): Promise<Response> {
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
      const ip = this.clientIpFor(request);
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
    return this.applyCors(request, response);
  }

  /**
   * The client IP for rate limiting. With `server.trustProxy: false` the
   * connection's own address is used, so a spoofed X-Forwarded-For cannot
   * rotate the bucket; otherwise the forwarded headers are honoured.
   */
  private clientIpFor(request: Request): string {
    if (this.options.trustProxy === false) {
      try {
        const info = (this.server as any)?.requestIP?.(request);
        if (info?.address) return String(info.address);
      } catch { /* fall through */ }
    }
    return ipAddress(request) || "local";
  }

  /**
   * Apply the tw.config.ts `server.cors` block to a response. The pipeline
   * CORS middleware wrote to ctx.headers (request headers), so the block never
   * reached the response; this applies it to EVERY response -- static, SSR and
   * API alike.
   */
  private applyCors(request: Request, response: Response): Response {
    const c = this.corsConfig;
    if (!c) return response;
    const reqOrigin = request.headers.get("origin") || "";
    let allow = "*";
    if (typeof c.origin === "string") allow = c.origin;
    else if (Array.isArray(c.origin)) allow = c.origin.includes(reqOrigin) ? reqOrigin : "*";
    const out: Record<string, string> = {
      "access-control-allow-origin": allow,
      "access-control-allow-methods": (c.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).join(", "),
      "access-control-allow-headers": (c.allowedHeaders ?? ["Content-Type", "Authorization"]).join(", "),
      "access-control-max-age": String(c.maxAge ?? 86400),
    };
    if (Array.isArray(c.exposedHeaders) && c.exposedHeaders.length > 0) out["access-control-expose-headers"] = c.exposedHeaders.join(", ");
    if (c.credentials) out["access-control-allow-credentials"] = "true";

    // A CORS preflight for an unmatched path is answered directly.
    if (request.method === "OPTIONS" && response.status === 404) {
      return new Response(null, { status: 204, headers: out });
    }
    for (const k of Object.keys(out)) {
      try { if (!response.headers.has(k)) response.headers.set(k, out[k]); } catch { /* skip */ }
    }
    return response;
  }

  /**
   * Signal stream endpoint: a ReadableStream kept open for the life of the
   * connection. Browsers receive batched signal updates as
   * `data: {"v":1,"seq":N,"updates":[...]}` frames.
   */
  private handleSignalStream(request: Request, url: URL): Response {
    const cfg = (this.options as any).config?.signalStream;
    return createSignalStream(request, url, cfg ? { maxClients: cfg.maxClients, maxHistory: cfg.maxHistory } : undefined);
  }

  private async handleClientSignalWrite(request: Request): Promise<Response> {
    const cfg = (this.options as any).config?.signalStream;
    return writeSignalFromClient(request, { clientWrites: cfg?.clientWrites });
  }

  /**
   * WebSocket client->server signal write. Same gating as the POST route:
   * disabled unless `signalStream.clientWrites` is on, public signals only.
   * Returns a plain object so the socket can echo it as one JSON frame.
   */
  private async handleSocketSignalWrite(body: any): Promise<Record<string, unknown>> {
    const cfg = (this.options as any).config?.signalStream;
    if (!cfg?.clientWrites) return { ok: false, error: "client signal writes are disabled" };
    const name = body?.name;
    if (typeof name !== "string" || !("value" in (body ?? {}))) {
      return { ok: false, error: "body must be { name, value }" };
    }
    const hub = getSignalHub();
    const kind = (hub.getStats().signals ?? {})[name];
    if (kind && kind !== "public") {
      return { ok: false, error: "only public signals are client-writable" };
    }
    const res = hub.setSignal(name, body.value);
    if (!res.queued) return { ok: false, error: res.error ?? "rejected" };
    return { ok: true, kind: res.kind };
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
          enableCache: true, hydrationMode: (this.options as any).config?.strategies?.hydration?.mode,
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
    const streamRes = new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    (streamRes as any).__twRawStream = true; // never buffer a streamed shell
    return streamRes;
  }

  private async handleRequestInner(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    // URL canonicalization. //about, /about/ and
    // the percent-encoded /%2f%2fabout all used to serve the same content
    // as /about with a 200 (SEO duplicate content). Answer 308 (method and
    // body preserved) to the canonical form instead.
    let rawPath = url.pathname;
    try {
      const decoded = decodeURIComponent(rawPath);
      if (decoded !== rawPath) rawPath = decoded;
    } catch { /* malformed escape: keep raw */ }
    let canonical = normalizePathname(rawPath);
    if (canonical.length > 1 && canonical.endsWith("/")) {
      canonical = canonical.slice(0, -1);
    }
    // compare against the DECODED form, not url.pathname: a unicode route
    // is percent-ENCODED in url.pathname -- comparing against the raw form
    // built a Location header carrying raw unicode (500 from the header
    // validator) and would re-encode to the same URL anyway.
    if (canonical !== rawPath) {
      return new Response(null, {
        status: 308,
        headers: { Location: encodeURI(canonical) + url.search },
      });
    }
    const pathname = canonical;

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

    // /_tw/poll — long-poll signal transport (strategy signals.transport=
    // "long-poll"). Answers with {"v":1,"frames":[...]} straight away when
    // frames are pending, otherwise holds the request open briefly.
    if (pathname === "/_tw/poll") {
      return createSignalLongPoll(request, url);
    }

    // /_tw/signal — v2 client->server push (config-gated, public-only)
    if (pathname === "/_tw/signal" && method === "POST") {
      return this.handleClientSignalWrite(request);
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
                enableCache: true, hydrationMode: (this.options as any).config?.strategies?.hydration?.mode,
                dev: false,
              });
              setActivePipeline(this.renderPipeline);
            }
            const renderPipeline = this.renderPipeline;
            // cache.mode=none: no server-side cache at all -- every request
            // renders fresh (the header above already tells clients no-store).
            if (this.cacheMode() === "none") (renderPipeline as any).cacheTTL = 0;
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
              // strategies.cache.mode decides what the browser and any CDN in
              // front see. A page's own cache block still wins for `isr`; the
              // other modes are explicit policy and override it.
              {
                const mode = this.cacheMode();
                // The route's own revalidate window (routes.json / cache block)
                // sets max-age; the mode decides the rest of the policy.
                const rv = this.isrRoutes.get(pathname);
                const rvSecs = typeof rv === "number" ? rv
                  : (rv && typeof rv === "object" ? Number((rv as any).revalidate) || 0 : 0);
                const window = rvSecs || Number(result.revalidate) || 0;
                if (mode !== "isr" || !outHeaders["Cache-Control"]) {
                  outHeaders["Cache-Control"] = this.cacheControlForRoute(window);
                }
              }
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
export { DEFAULT_I18N_CONFIG, configureI18n, formatCurrency, formatDate, formatNumber, formatRelative, getHtmlDir, getHtmlLang, getI18nConfig, getLocale, getTextDirection, isRTL, loadTranslations, localizePath, normalizeI18nStrategy, parseLocalePath, setLocale, t } from "./i18n";
export type { I18nConfig, LocaleRouteResult } from "./i18n";
export { DEFAULT_IMAGE_CONFIG, imgTag, optimizeImage, processImage } from "./image";
export type { ImageOptimizerConfig, OptimizedImage } from "./image";
export { BodyParser, MemoryStore, MiddlewarePipeline, acceptFilter, anyBody, bodyParse, bodyParserMiddleware, cacheHeaders, clearCookie, combinedSecurityMiddleware, compressionMiddleware, concurrencyLimit, conditionalGet, contentTypeFilter, cookieParser, cookieSerializer, corsMiddleware, cspMiddleware, csrfProtection, errorBoundary, favicon, healthCheck, hostFilter, hstsMiddleware, httpsOnly, ipFilter, jsonBody, limitBodySize, loggingMiddleware, lowerCasePaths, methodFilter, methodOverride, mount, multipartBody, noCache, nonWWWRedirect, notFound, poweredBy, protocolFilter, queryParser, rangeRequest, rateLimit, rateLimitMiddleware, rawBody, redirectToHTTPS, redirectToNonWWW, redirectToWWW, refererFilter, removeHeader, sanitizeBody, securityHeadersMiddleware, sessionMiddleware, setHeaders, signedCookie, slowDown, textBody, timeoutMiddleware, trailingSlash, urlEncodedBody, userAgentFilter, validateBody, verifySignedCookie, vhost, wwwRedirect } from "./middleware";
export type { BodyParserOptions, Middleware, ParsedBody, RateLimitStore } from "./middleware";
export { buildCSPHeader, buildHSTSHeader, buildPermissionsPolicyHeader, createDevCSP, createProdCSP, generateNonce, generateNonceForCSP, generateSecurityHeaders } from "./security-headers";
export type { SecurityHeadersOptions } from "./security-headers";
export { RouteRegistry } from "./router";
export type { Route, RouteContext, RouteHandler, RouteMatch } from "./router";
export { RenderPipeline, clearTWMCache, collectParallelDefaults, collectParallelPages, createRenderPipeline, executeMiddleware, executeRouteHandler, findGlobalError, findRootNotFound, flattenRoutes, loadTWMModule, matchFlatRoute as matchRoute, matchRoute as matchRouteTree, parseSlots, printRouteTree, renderParallel, resolveLayoutChain, scanRouteTree, scanRouteTree as scanRoutes, shouldMatchMiddleware, revalidatePath, revalidateTag } from "./routing";
export type { FlatRouteDefinition, FlatRouteMatch, ScannerOptions, TWMModule } from "./routing";
export { SSRRenderer, generatePreloadHints, getCachedSSR, invalidateSSRCache, setCachedSSR } from "./ssr";
export type { SSROptions, SSRResult } from "./ssr";
export { StaticHandler } from "./static";
export type { StaticOptions } from "./static";

export { WebSocketManager };
export type { WebSocketConnection, ConnectionMeta } from "./websocket-manager";

export { createI18n, parseAcceptLanguage } from "./i18n-runtime";
export type { I18nRuntimeConfig, I18nInstance } from "./i18n-runtime";
export { createPluginHost } from "./plugin-host";
export type { Plugin, PluginHost, PluginContext, HookName } from "./plugin-host";
export { createDb, createSqlAdapter, createKvAdapter, createVectorAdapter } from "./db-runtime";
export type { Db, DbConfig, DbAdapter, DbAdapterName, SqlAdapter, KvAdapter, VectorAdapter, VectorRecord, VectorMatch } from "./db-runtime";
export { createImageLoader, buildImageUrl, buildSrcSet, preloadLink, isAllowedSource } from "./image-loader";
export type { ImageLoader, ImageLoaderConfig, ImageLoaderName, ImageRequest } from "./image-loader";
export { createEdgeAdapter, EDGE_BLOCKED_GLOBALS } from "./edge-runtime";
export type { EdgeAdapter, EdgeLimits, EdgeResult } from "./edge-runtime";
export { createGraphQL, parseGraphQL, createTrpcRouter } from "./data-runtime";
export type { GraphQLSchema, GraphQLResult, GraphQLExecutor, TrpcRouter, ProcedureDef } from "./data-runtime";
export { createAuth } from "./auth-runtime";

// Request-context helpers (docs/request-context.md). Re-exported here so the
// user-facing `"tw"` specifier resolves them -- `import { clientIp } from "tw"`.
// A project has only `tw-framework` installed, so `@tw/sdk/*` is not a path a
// user can import; `"tw"` is.
export {
  after, background, clearDynamicReasons, clearMetrics, clientIp, collectedMetrics,
  connection, counter, deadline, defer, dynamic, dynamicReasons, env, gauge, geolocation,
  getDeadline, getEnv, histogram, inCidr, ipAddress, isPrivateIp, metric, normalizeIp,
  parseDuration, pendingTasks, setMetricSink, setWaitUntilHook, staticRoute, timer,
  trustProxy, userAgent, waitUntil,
} from "@tw/shared";
export type {
  ClientIp, Deadline, DeferredTask, Duration, EnvSchemaResult, EnvType, EnvValues,
  Geo, MetricPoint, UserAgentInfo,
} from "@tw/shared";
export {
  badRequest, forbidden, jsonResponse, notFound as notFoundResponse, permanentRedirect,
  redirect, unauthorized,
} from "@tw/shared";
export { cache, cached, draftMode, getCache, resetCache, setDraftSecret, verifyDraftCookie } from "@tw/shared";
export { CookieJar, TWRequest, TWResponse, twRequest } from "@tw/shared";
