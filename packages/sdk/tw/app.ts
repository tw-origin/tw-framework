/**
 * TW SDK -- Application Core.
 *
 * Unified createApp() with a fluent AppBuilder API.
 * Manages config, pages, layouts, middleware, routes, plugins,
 * and the full lifecycle: build -> serve -> close.
 *
 * Production-ready: graceful shutdown, error isolation, typed throughout.
 */

import { join, resolve } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";

import type {
  AppConfig,
  AppOptions,
  AppMode,
  BuildTarget,
  SourcemapOption,
  TWApp,
  PageDefinition,
  LayoutDefinition,
  Middleware,
  RouteDefinition,
  RouteHandler,
  PluginDefinition,
  ErrorHandler,
  NotFoundHandler,
  HookName,
  PluginContext,
  PluginLogger,
  BuildStats,
  CompileContext,
  BundleContext,
  RenderContext,
  ServeContext,
  ServerLifecycleContext,
  BuildContext,
  RequestContext,
  CookieOptions,
} from "./types";

import { createRenderPipeline, type RenderPipeline } from "@tw/server";

// --- Constants --------------------------------------------------------

export const VERSION = "0.0.1" as const;

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "0.0.0.0";

// --- AppBuilder --------------------------------------------------------

export class AppBuilder {
  private app: TWApp;
  private pluginManager: SDKPluginManager;
  private hooks: Map<HookName, Array<{ fn: (...args: unknown[]) => unknown; priority: number }>> = new Map();
  private renderPipeline: RenderPipeline | null = null;

  constructor(options: AppOptions = {}) {
    const rootDir = resolve(options.rootDir ?? process.cwd());
    const mode: AppMode = options.mode ?? (process.env.NODE_ENV === "production" ? "production" : "development");
    const isProd = mode === "production";

    const config: AppConfig = {
      rootDir,
      outDir: options.outDir ?? join(rootDir, ".tw"),
      publicDir: join(rootDir, "public"),
      pagesDir: options.pagesDir ?? join(rootDir, "home"),
      layoutsDir: options.layoutsDir ?? join(rootDir, "layouts"),
      componentsDir: options.componentsDir ?? join(rootDir, "components"),
      port: options.port ?? DEFAULT_PORT,
      host: options.host ?? DEFAULT_HOST,
      mode,
      minify: options.minify ?? isProd,
      sourcemap: (options.sourcemap ?? (isProd ? false : "inline")) as SourcemapOption,
      splitting: options.splitting ?? true,
      treeshake: options.treeshake ?? true,
      target: (options.target ?? "browser") as BuildTarget,
      define: options.define ?? {},
      external: options.external ?? [],
      i18n: options.i18n,
      security: options.securityConfig,
      cache: options.cache,
    };

    this.app = {
      name: "tw-app",
      version: VERSION,
      config,
      pages: new Map(),
      layouts: new Map(),
      middlewares: [],
      routes: [],
      plugins: [],
      ready: false,
      running: false,
      server: null,
      startTime: 0,
    };

    this.pluginManager = new SDKPluginManager({
      app: this.app,
      config,
    });

    // Load plugin paths if provided
    if (options.plugins && options.plugins.length > 0) {
      for (const pluginPath of options.plugins) {
        this.loadPlugin(pluginPath);
      }
    }
  }

  // -- Page Registration ----------------------------------------------

  page(path: string, component: unknown, opts?: Partial<Omit<PageDefinition, "path" | "component">>): this {
    const def: PageDefinition = {
      path,
      component: component as PageDefinition["component"],
      ...opts,
    };
    this.app.pages.set(path, def);
    return this;
  }

  layout(name: string, component: unknown, opts?: Partial<LayoutDefinition>): this {
    const def: LayoutDefinition = {
      name,
      component: component as LayoutDefinition["component"],
      slots: opts?.slots ?? ["default"],
      middleware: opts?.middleware,
    };
    this.app.layouts.set(name, def);
    return this;
  }

  // -- Middleware ------------------------------------------------------

  use(middleware: Middleware): this {
    this.app.middlewares.push(middleware);
    return this;
  }

  // -- Route Registration (programmatic) -------------------------------

  get(path: string, handler: RouteHandler, middleware?: string[]): this {
    this.app.routes.push({ method: "GET", path, handler, middleware });
    return this;
  }

  post(path: string, handler: RouteHandler, middleware?: string[]): this {
    this.app.routes.push({ method: "POST", path, handler, middleware });
    return this;
  }

  put(path: string, handler: RouteHandler, middleware?: string[]): this {
    this.app.routes.push({ method: "PUT", path, handler, middleware });
    return this;
  }

  patch(path: string, handler: RouteHandler, middleware?: string[]): this {
    this.app.routes.push({ method: "PATCH", path, handler, middleware });
    return this;
  }

  delete(path: string, handler: RouteHandler, middleware?: string[]): this {
    this.app.routes.push({ method: "DELETE", path, handler, middleware });
    return this;
  }

  route(method: string, path: string, handler: RouteHandler, middleware?: string[]): this {
    this.app.routes.push({ method: method.toUpperCase(), path, handler, middleware });
    return this;
  }

  // -- Plugin Registration ---------------------------------------------

  plugin(plugin: PluginDefinition): this {
    this.pluginManager.register(plugin);
    this.app.plugins.push(plugin);
    return this;
  }

  // -- Error Handling --------------------------------------------------

  errorHandler(handler: ErrorHandler): this {
    this.app.errorPage = handler;
    return this;
  }

  notFound(handler: NotFoundHandler): this {
    this.app.notFoundPage = handler;
    return this;
  }

  // -- Config Overrides -----------------------------------------------

  config(partial: Partial<AppConfig>): this {
    this.app.config = { ...this.app.config, ...partial };
    return this;
  }

  port(port: number): this {
    this.app.config.port = port;
    return this;
  }

  host(host: string): this {
    this.app.config.host = host;
    return this;
  }

  mode(mode: AppMode): this {
    this.app.config.mode = mode;
    return this;
  }

  // -- Hook Registration (for plugin authors) --------------------------

  hook(name: HookName, handler: (...args: unknown[]) => unknown, priority: number = 50): this {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    this.hooks.get(name)!.push({ fn: handler, priority });
    return this;
  }

  // -- Discovery -------------------------------------------------------

  /**
   * Auto-discover pages from the configured pagesDir.
   * Recursively scans for .tw, .ts, .tsx, .js files.
   */
  discoverPages(): this {
    const pagesDir = this.app.config.pagesDir;
    if (!existsSync(pagesDir)) {
      console.warn(`  Pages directory not found: ${pagesDir}`);
      return this;
    }

    this.scanDir(pagesDir, "");
    this.runHook("pages:discover", this.app);
    return this;
  }

  private scanDir(dir: string, prefix: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        this.scanDir(fullPath, `${prefix}/${entry}`);
      } else {
        const ext = entry.split(".").pop();
        if (!ext || !["tw", "ts", "tsx", "js"].includes(ext)) continue;

        const baseName = entry.replace(/\.(tw|ts|tsx|js)$/, "");
        const routePath = this.baseNameToRoute(baseName, prefix);
        const isDynamic = baseName.startsWith("[") && baseName.endsWith("]");

        this.app.pages.set(routePath, {
          path: routePath,
          component: { __isTWComponent: true, name: routePath, options: { name: routePath } } as PageDefinition["component"],
          serverOnly: false,
        });
      }
    }
  }

  private baseNameToRoute(baseName: string, prefix: string): string {
    if (baseName === "index") {
      return prefix || "/";
    }
    // Dynamic route [slug] -> :slug
    const param = baseName.replace(/^\[(.+)\]$/, ":$1");
    return `${prefix}/${param}`;
  }

  // -- Build -----------------------------------------------------------

  async build(): Promise<BuildContext> {
    this.app.ready = true;

    const buildCtx: BuildContext = {
      config: this.app.config,
      output: this.app.config.outDir,
      files: [],
      stats: { duration: 0, modules: 0, chunks: 0, assets: 0, errors: 0, warnings: 0 },
    };

    const start = performance.now();

    try {
      await this.runHook("before:build", buildCtx);

      // Run config:resolve hook
      this.app.config = await this.runHook("config:resolve", this.app.config);

      // Compile phase
      const compileCtx: CompileContext = {
        entry: this.app.config.pagesDir,
        output: this.app.config.outDir,
        files: Array.from(this.app.pages.keys()),
        cache: new Map(),
      };
      await this.runHook("before:compile", compileCtx);
      await this.runHook("after:compile", compileCtx);

      // Bundle phase
      const bundleCtx: BundleContext = {
        entrypoints: Array.from(this.app.pages.keys()),
        output: this.app.config.outDir,
        chunks: [],
        cache: new Map(),
      };
      await this.runHook("before:bundle", bundleCtx);
      await this.runHook("after:bundle", bundleCtx);

      buildCtx.stats.duration = performance.now() - start;
      buildCtx.stats.modules = this.app.pages.size;
      buildCtx.stats.chunks = bundleCtx.chunks.length;
      buildCtx.stats.assets = this.app.pages.size;

      await this.runHook("after:build", buildCtx);

      console.log(`\n  OK Build complete in ${buildCtx.stats.duration.toFixed(2)}ms`);
      console.log(`    Modules: ${buildCtx.stats.modules}`);
      console.log(`    Chunks: ${buildCtx.stats.chunks}`);
      console.log(`    Output: ${buildCtx.config.outDir}\n`);
    } catch (err) {
      buildCtx.stats.errors++;
      console.error(`\n  X Build failed: ${(err as Error).message}\n`);
      throw err;
    }

    return buildCtx;
  }

  // -- Serve (dev or production) ---------------------------------------

  async serve(): Promise<void> {
    if (this.app.running) {
      console.warn("  Server is already running");
      return;
    }

    if (!this.app.ready) {
      await this.build();
    }

    const { port, host } = this.app.config;
    const serveCtx: ServeContext = { port, host, url: new URL(`http://${host}:${port}`) };

    await this.runHook("before:serve", serveCtx);

    // Try to use Bun.serve (available in Bun runtime)
    const server = this.createServer();
    this.app.server = server;
    this.app.running = true;
    this.app.startTime = Date.now();

    const lifecycleCtx: ServerLifecycleContext = {
      port,
      host,
      pid: typeof process !== "undefined" ? process.pid : 0,
    };

    await this.runHook("server:start", lifecycleCtx);

    console.log(`\n  ? TW Server running at http://${host}:${port}`);
    console.log(`     Mode: ${this.app.config.mode}`);
    console.log(`     Routes: ${this.app.routes.length + this.app.pages.size}`);
    console.log(`     Plugins: ${this.app.plugins.length}`);
    console.log(`     Static: ${existsSync(this.app.config.publicDir) ? "enabled" : "disabled"}\n`);

    await this.runHook("after:serve", serveCtx);
  }

  /**
   * Alias for serve() -- common entry point.
   */
  async listen(port?: number): Promise<void> {
    if (port !== undefined) {
      this.app.config.port = port;
    }
    await this.serve();
  }

  // -- Create Server ---------------------------------------------------

  private createServer(): unknown {
    const handler = async (request: Request): Promise<Response> => {
      return this.handleRequest(request);
    };

    // Bun runtime
    if (typeof Bun !== "undefined") {
      return Bun.serve({
        port: this.app.config.port,
        hostname: this.app.config.host,
        fetch: handler,
        error: (err: Error) => {
          console.error("Server error:", err);
          return new Response("Internal Server Error", { status: 500 });
        },
      });
    }

    // Node.js fallback -- basic HTTP server
    return this.createNodeServer(handler);
  }

  private createNodeServer(handler: (req: Request) => Promise<Response>): unknown {
    // Dynamic import -- only used when not on Bun
    const http = require("node:http");
    const server = http.createServer(async (req: any, res: any) => {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
      });

      try {
        const response = await handler(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        const body = await response.arrayBuffer();
        res.end(Buffer.from(body));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });

    server.listen(this.app.config.port, this.app.config.host);
    return server;
  }

  // -- Request Handler -------------------------------------------------

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    const ctx: RequestContext = {
      request,
      url,
      method,
      path: url.pathname,
      params: {},
      query: Object.fromEntries(url.searchParams),
      headers: {},
      cookies: {},
      body: null,
      state: {},
      locals: {},
      response: null,
      redirect(to, status = 302) {
        return new Response(null, { status, headers: { Location: to } });
      },
      json(data, status = 200) {
        const body = JSON.stringify(data);
        return new Response(body, {
          status,
          headers: { "Content-Type": "application/json" },
        });
      },
      html(content, status = 200) {
        return new Response(content, {
          status,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
      text(content, status = 200) {
        return new Response(content, {
          status,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      },
      setHeader(name, value) {
        request.headers.set(name, value);
      },
      getHeader(name) {
        return request.headers.get(name);
      },
      cookie(name, value, opts: CookieOptions = {}) {
        const parts = [`${name}=${value}`];
        if (opts.httpOnly) parts.push("HttpOnly");
        if (opts.secure) parts.push("Secure");
        if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
        if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
        if (opts.path) parts.push(`Path=${opts.path}`);
        if (opts.domain) parts.push(`Domain=${opts.domain}`);
        // Stored for middleware to read
        (ctx.state as Record<string, string>)[`__cookie_${name}`] = parts.join("; ");
      },
    };

    // Parse request headers
    request.headers.forEach((value, key) => {
      ctx.headers[key] = value;
    });

    // Parse cookies
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      ctx.cookies = this.parseCookies(cookieHeader);
    }

    // Parse body for non-GET requests
    if (method !== "GET" && method !== "HEAD") {
      try {
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const text = await request.text();
          ctx.body = text ? JSON.parse(text) : null;
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          const text = await request.text();
          const params = new URLSearchParams(text);
          ctx.body = Object.fromEntries(params);
        } else if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          ctx.body = formData;
        } else {
          ctx.body = await request.text();
        }
      } catch {
        ctx.body = null;
      }
    }

    // Run route:match hook
    await this.runHook("route:match", url.pathname, ctx);

    // Run middleware pipeline
    try {
      let response: Response | null = null;

      // Execute middleware chain
      const executeMiddleware = async (index: number): Promise<void> => {
        if (index >= this.app.middlewares.length) return;
        const mw = this.app.middlewares[index];
        await mw(ctx, async () => executeMiddleware(index + 1));
      };

      await executeMiddleware(0);

      // If middleware set a response, return it
      if (ctx.response) return ctx.response;

      // Run response:before-send hook
      await this.runHook("response:before-send", ctx);

      // Check if response was set by middleware
      if (ctx.response) return ctx.response;

      // Match programmatic routes first
      const routeMatch = this.matchRoute(method, url.pathname);
      if (routeMatch) {
        ctx.params = routeMatch.params;

        const renderCtx: RenderContext = {
          url,
          path: url.pathname,
          template: "",
          data: {},
          cache: new Map(),
        };
        await this.runHook("before:render", renderCtx);

        const result = await routeMatch.route.handler(ctx);

        await this.runHook("after:render", renderCtx);

        if (result instanceof Response) {
          response = result;
        } else if (result !== undefined && result !== null) {
          response = new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        } else if (ctx.response) {
          response = ctx.response;
        } else {
          response = new Response("No Response", { status: 500 });
        }
      } else {
        // Check for API routes (.twm)
        if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/api.")) {
          try {
            const homeDir = join(this.app.rootDir, "home");
            if (existsSync(homeDir)) {
              if (!this.renderPipeline) {
                this.renderPipeline = createRenderPipeline({
                  rootDir: this.app.rootDir,
                  homeDir,
                  enableCache: false,
                  dev: true,
                });
              }
              if (this.renderPipeline) {
                const apiResponse = await this.renderPipeline.renderRoute(url.pathname, method, request, ctx.params);
                return apiResponse;
              }
            }
          } catch (apiErr: any) {
            console.error(`[tw:api] Error: ${apiErr.message}`);
            return new Response(JSON.stringify({ error: apiErr.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        // Run middleware if present
        const mwPath = join(this.app.rootDir, "middleware.twm");
        if (existsSync(mwPath)) {
          try {
            const { executeMiddleware, loadTWMModule, shouldMatchMiddleware } = await import("@tw/server");
            const mod = await loadTWMModule(mwPath);
            if (!mod.config?.matcher || shouldMatchMiddleware(mod.config.matcher, url.pathname)) {
              const mwResult = await executeMiddleware(mwPath, request);
              if (mwResult instanceof Response) return mwResult;
            }
          } catch (mwErr: any) {
            console.error(`[tw:middleware] Error: ${mwErr.message}`);
          }
        }

        // Try page-based routing
        const pageMatch = this.matchPage(url.pathname);
        if (pageMatch) {
          ctx.params = pageMatch.params;
          ctx.page = pageMatch.page;

          const renderCtx: RenderContext = {
            url,
            path: url.pathname,
            template: "",
            data: {},
            cache: new Map(),
          };
          await this.runHook("before:render", renderCtx);

          // -- Render Pipeline Integration ------------------------------
          // Use the full render pipeline: scan routes -> match -> compile -> wrap layouts -> HTML
          try {
            const homeDir = join(this.app.rootDir, "home");
            if (!this.renderPipeline && existsSync(homeDir)) {
              this.renderPipeline = createRenderPipeline({
                rootDir: this.app.rootDir,
                homeDir,
                enableCache: this.app.mode !== "development",
                cacheTTL: 60000,
                dev: this.app.mode === "development",
              });
            }

            if (this.renderPipeline) {
              const result = this.renderPipeline.render(url.pathname);
              await this.runHook("after:render", renderCtx);
              response = new Response(result.html, {
                status: result.status ?? 200,
                headers: {
                  "Content-Type": "text/html; charset=utf-8",
                  ...result.headers,
                },
              });
            } else {
              // Fallback: no home/ directory -- use compileSync directly on the page file
              const { compileSync } = await import("@tw/compiler");
              const pagePath = pageMatch.page.path;
              const { readFileSync } = await import("node:fs");
              const source = readFileSync(pagePath, "utf8");
              const compiled = compileSync(source, { filePath: pagePath });
              await this.runHook("after:render", renderCtx);
              response = new Response(compiled.html, {
                headers: { "Content-Type": "text/html; charset=utf-8" },
              });
            }
          } catch (renderErr: any) {
            console.error(`[tw:render] Error rendering ${url.pathname}:`, renderErr.message);
            await this.runHook("after:render", renderCtx);
            const errHtml = `<html><body><h1>500 -- Render Error</h1><pre>${renderErr.message}</pre></body></html>`;
            response = new Response(errHtml, {
              status: 500,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          }
        } else {
          // 404
          if (this.app.notFoundPage) {
            response = await this.app.notFoundPage(ctx) as Response;
          } else {
            response = new Response("404 Not Found", {
              status: 404,
              headers: { "Content-Type": "text/plain" },
            });
          }
        }
      }

      // Run response:before-send again before final send
      await this.runHook("response:before-send", ctx);

      return response;
    } catch (err) {
      const error = err as Error;

      // Run error hook
      await this.runHook("error", error, ctx);

      if (this.app.errorPage) {
        return await this.app.errorPage(error, ctx);
      }

      console.error(`Route error: ${error.message}`);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // -- Route Matching --------------------------------------------------

  private matchRoute(method: string, pathname: string): { route: RouteDefinition; params: Record<string, string> } | null {
    for (const route of this.app.routes) {
      if (route.method !== method && route.method !== "ANY") continue;

      const params = this.matchPattern(route.path, pathname);
      if (params !== null) {
        return { route, params };
      }
    }
    return null;
  }

  private matchPage(pathname: string): { page: PageDefinition; params: Record<string, string> } | null {
    // Check exact match
    if (this.app.pages.has(pathname)) {
      return { page: this.app.pages.get(pathname)!, params: {} };
    }

    // Check dynamic routes
    for (const [routePath, page] of this.app.pages) {
      const params = this.matchPattern(routePath, pathname);
      if (params !== null) {
        return { page, params };
      }
    }
    return null;
  }

  private matchPattern(pattern: string, pathname: string): Record<string, string> | null {
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);

    if (patternParts.length !== pathParts.length) return null;

    const params: Record<string, string> = {};
    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      const actual = pathParts[i];

      if (pp.startsWith(":")) {
        params[pp.slice(1)] = decodeURIComponent(actual);
      } else if (pp !== actual) {
        return null;
      }
    }
    return params;
  }

  // -- Cookie Parser ---------------------------------------------------

  private parseCookies(cookieStr: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieStr) return cookies;
    for (const part of cookieStr.split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      cookies[key] = val;
    }
    return cookies;
  }

  // -- Plugin Loading --------------------------------------------------

  private loadPlugin(pluginPath: string): void {
    try {
      const mod = require(pluginPath);
      const plugin = mod.default ?? mod;
      if (plugin && plugin.name) {
        this.pluginManager.register(plugin as PluginDefinition);
        this.app.plugins.push(plugin as PluginDefinition);
      }
    } catch (err) {
      console.warn(`  Failed to load plugin ${pluginPath}: ${(err as Error).message}`);
    }
  }

  // -- Hook Execution -------------------------------------------------

  private async runHooks(name: HookName, ...args: unknown[]): Promise<void> {
    // SDK-level hooks
    const sdkEntries = this.hooks.get(name);
    if (sdkEntries) {
      const sorted = [...sdkEntries].sort((a, b) => a.priority - b.priority);
      for (const entry of sorted) {
        try {
          await entry.fn(...args);
        } catch (err) {
          console.error(`  Hook error [${name}]: ${(err as Error).message}`);
        }
      }
    }

    // Plugin hooks
    await this.pluginManager.runHookParallel(name, ...args);
  }

  private async runHook<T>(name: HookName, initialValue: T, ...args: unknown[]): Promise<T> {
    let value = initialValue;

    // SDK-level hooks (sequential, waterfall)
    const sdkEntries = this.hooks.get(name);
    if (sdkEntries) {
      const sorted = [...sdkEntries].sort((a, b) => a.priority - b.priority);
      for (const entry of sorted) {
        try {
          const result = await entry.fn(value, ...args);
          if (result !== undefined) {
            value = result as T;
          }
        } catch (err) {
          console.error(`  Hook error [${name}]: ${(err as Error).message}`);
        }
      }
    }

    // Plugin hooks (sequential, waterfall)
    value = await this.pluginManager.runHook(name, value, ...args);

    return value;
  }

  // -- Shutdown --------------------------------------------------------

  async close(): Promise<void> {
    if (!this.app.running) return;

    const lifecycleCtx: ServerLifecycleContext = {
      port: this.app.config.port,
      host: this.app.config.host,
      pid: typeof process !== "undefined" ? process.pid : 0,
    };

    // Run server:stop hooks
    await this.runHook("server:stop", lifecycleCtx);

    // Graceful shutdown
    const server = this.app.server as { stop?: (force?: boolean) => void; close?: (cb?: () => void) => void };
    if (server?.stop) {
      server.stop(false);
      // Wait briefly for pending connections
      await new Promise((r) => setTimeout(r, 100));
      server.stop(true);
    } else if (server?.close) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    this.app.server = null;
    this.app.running = false;

    // Run plugin teardowns
    for (const plugin of this.app.plugins) {
      if (plugin.teardown) {
        try {
          await plugin.teardown();
        } catch (err) {
          console.error(`  Plugin teardown error [${plugin.name}]: ${(err as Error).message}`);
        }
      }
    }

    console.log("\n  TW Server stopped\n");
  }

  /**
   * Alias for close() -- graceful shutdown with timeout.
   */
  async stop(timeout: number = 5000): Promise<void> {
    if (!this.app.running) return;

    const server = this.app.server as { stop?: (force?: boolean) => void };
    if (server?.stop) {
      server.stop(false);
      const start = Date.now();
      while (Date.now() - start < timeout) {
        await new Promise((r) => setTimeout(r, 100));
      }
      server.stop(true);
    }

    this.app.server = null;
    this.app.running = false;
    console.log("\n  TW Server stopped\n");
  }

  // -- Build & Return -------------------------------------------------

  build_sync(): TWApp {
    this.app.ready = true;
    return this.app;
  }

  // -- Getters ---------------------------------------------------------

  getApp(): TWApp {
    return this.app;
  }

  getConfig(): AppConfig {
    return this.app.config;
  }

  getPlugins(): PluginDefinition[] {
    return [...this.app.plugins];
  }

  getPageCount(): number {
    return this.app.pages.size;
  }

  getRouteCount(): number {
    return this.app.routes.length;
  }
}

// --- createApp -------------------------------------------------------

/**
 * Create a new TW application with a fluent builder API.
 *
 * @example
 * const app = createApp({ port: 3000 })
 *   .page("/", HomePage)
 *   .page("/about", AboutPage)
 *   .get("/api/health", (ctx) => ctx.json({ ok: true }))
 *   .plugin(MyPlugin)
 *   .use(loggingMiddleware)
 *   .errorHandler(myErrorHandler)
 *   .notFound(my404Handler);
 *
 * await app.serve();
 */
export function createApp(options?: AppOptions): AppBuilder {
  return new AppBuilder(options);
}

// --- SDKPluginManager (internal) -------------------------------------

class SDKPluginManager {
  private plugins: PluginDefinition[] = [];
  private hookMap: Map<HookName, PluginDefinition[]> = new Map();
  private context: PluginContext;
  private errors: Array<{ plugin: string; hook: HookName; error: Error }> = [];

  constructor(context: Partial<PluginContext>) {
    this.context = {
      app: context.app ?? ({} as TWApp),
      config: context.config ?? ({} as AppConfig),
      state: new Map(),
      cache: new Map(),
      logger: undefined,
    };
  }

  register(plugin: PluginDefinition): void {
    if (!plugin.name) {
      throw new Error("Plugin must have a name");
    }

    // Replace if already registered
    if (this.plugins.some((p) => p.name === plugin.name)) {
      this.plugins = this.plugins.filter((p) => p.name !== plugin.name);
    }

    this.plugins.push(plugin);

    // Sort by priority (higher = earlier)
    this.plugins.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));

    // Run setup if present
    if (plugin.setup) {
      const api: import("./types").PluginAPI = {
        on: (hook, handler, priority = 50) => this.registerHook(hook, handler as (...args: unknown[]) => unknown, priority, plugin.name),
        once: (hook, handler) => {
          const wrapped = async (...args: unknown[]) => {
            this.unregisterHook(hook, wrapped);
            return (handler as (...args: unknown[]) => unknown)(...args);
          };
          this.registerHook(hook, wrapped, 0, plugin.name);
        },
        off: (hook, handler) => this.unregisterHook(hook, handler as (...args: unknown[]) => unknown),
        registerRoute: (method, path, handler) => {
          if (!plugin.config) plugin.config = {};
          if (!plugin.config.routes) plugin.config.routes = [];
          (plugin.config.routes as unknown[]).push({ method, path, handler });
        },
        registerMiddleware: (mw) => {
          if (!plugin.config) plugin.config = {};
          if (!plugin.config.middleware) plugin.config.middleware = [];
          (plugin.config.middleware as unknown[]).push(mw);
        },
        registerComponent: (name, component) => {
          if (!plugin.config) plugin.config = {};
          if (!plugin.config.components) plugin.config.components = {};
          (plugin.config as Record<string, Record<string, unknown>>).components![name] = component;
        },
        registerDirective: (name, handler) => {
          if (!plugin.config) plugin.config = {};
          if (!plugin.config.directives) plugin.config.directives = {};
          (plugin.config as Record<string, Record<string, unknown>>).directives![name] = handler;
        },
        getConfig: () => this.context.config,
        getLogger: () => this.getLogger(),
        emit: (hook, ctx, ...args) => (this.runHook as any)(hook, ctx, ...args),
      };
      plugin.setup(api);
    }

    // Rebuild hook map
    this.rebuildHookMap();
  }

  unregister(name: string): void {
    const plugin = this.plugins.find((p) => p.name === name);
    if (!plugin) return;

    if (plugin.teardown) {
      plugin.teardown();
    }

    this.plugins = this.plugins.filter((p) => p.name !== name);
    this.rebuildHookMap();
  }

  private rebuildHookMap(): void {
    this.hookMap.clear();
    for (const plugin of this.plugins) {
      if (!plugin.hooks) continue;
      for (const hookName of Object.keys(plugin.hooks) as HookName[]) {
        if (!this.hookMap.has(hookName)) {
          this.hookMap.set(hookName, []);
        }
        this.hookMap.get(hookName)!.push(plugin);
      }
    }
  }

  registerHook(
    name: HookName,
    handler: (...args: unknown[]) => unknown,
    priority: number = 50,
    pluginName: string = "unknown",
  ): void {
    // Create a pseudo-plugin entry for this hook
    const pseudoPlugin: PluginDefinition = {
      name: pluginName,
      version: "0.0.1",
      hooks: { [name]: handler } as Partial<import("./types").PluginHooks>,
      priority,
    };

    if (!this.hookMap.has(name)) {
      this.hookMap.set(name, []);
    }
    this.hookMap.get(name)!.push(pseudoPlugin);

    // Re-sort by priority
    this.hookMap.get(name)!.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));
  }

  unregisterHook(name: HookName, handler: (...args: unknown[]) => unknown): void {
    const entries = this.hookMap.get(name);
    if (!entries) return;

    for (const plugin of entries) {
      if (plugin.hooks && plugin.hooks[name] === handler) {
        delete plugin.hooks[name];
      }
    }

    this.hookMap.set(
      name,
      entries.filter((p) => p.hooks && p.hooks[name]),
    );
  }

  async runHook<T>(hookName: HookName, initialValue: T, ...args: unknown[]): Promise<T> {
    const plugins = this.hookMap.get(hookName);
    if (!plugins || plugins.length === 0) return initialValue;

    let value = initialValue;
    for (const plugin of plugins) {
      const hook = plugin.hooks?.[hookName];
      if (!hook) continue;
      try {
        const result = await (hook as any)(value, this.context, ...args);
        if (result !== undefined) {
          value = result as T;
        }
      } catch (error) {
        this.errors.push({ plugin: plugin.name, hook: hookName, error: error as Error });
        this.log("error", `Plugin '${plugin.name}' hook '${hookName}' error: ${(error as Error).message}`);
      }
    }
    return value;
  }

  async runHookParallel(hookName: HookName, ...args: unknown[]): Promise<void> {
    const plugins = this.hookMap.get(hookName);
    if (!plugins || plugins.length === 0) return;

    const promises = plugins.map(async (plugin) => {
      const hook = plugin.hooks?.[hookName];
      if (!hook) return;
      try {
        await (hook as any)(this.context, ...args);
      } catch (error) {
        this.errors.push({ plugin: plugin.name, hook: hookName, error: error as Error });
        this.log("error", `Plugin '${plugin.name}' hook '${hookName}' error: ${(error as Error).message}`);
      }
    });

    await Promise.all(promises);
  }

  getPlugins(): PluginDefinition[] {
    return [...this.plugins];
  }

  getErrors(): Array<{ plugin: string; hook: HookName; error: Error }> {
    return [...this.errors];
  }

  clearErrors(): void {
    this.errors = [];
  }

  hasHook(hookName: HookName): boolean {
    return this.hookMap.has(hookName) && (this.hookMap.get(hookName)?.length ?? 0) > 0;
  }

  private getLogger(): PluginLogger {
    return (
      this.context.logger ?? {
        info: (...args: unknown[]) => console.log(...args),
        warn: (...args: unknown[]) => console.warn(...args),
        error: (...args: unknown[]) => console.error(...args),
        debug: (...args: unknown[]) => console.debug(...args),
      }
    );
  }

  private log(level: "info" | "warn" | "error", message: string): void {
    if (this.context.logger) {
      this.context.logger[level](message);
    } else {
      console[level](message);
    }
  }
}

// --- Utility Functions ------------------------------------------------

export function isDevelopment(app: TWApp): boolean {
  return app.config.mode === "development";
}

export function isProduction(app: TWApp): boolean {
  return app.config.mode === "production";
}

export function loadConfig(rootDir: string): AppConfig {
  const configPath = join(rootDir, "tw.config.ts");
  if (existsSync(configPath)) {
    // Dynamic import would happen here in a full implementation
    // For now, return defaults
  }
  return new AppBuilder({ rootDir }).getConfig();
}
