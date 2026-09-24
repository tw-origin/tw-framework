/**
 * Render Pipeline -- End-to-end: file read -> compileSync -> wrap in layouts -> HTML response.
 *
 * This connects the file-based routing system to the compiler and produces
 * a complete HTML document ready to serve.
 *
 * Flow:
 *   1. Scan home/ directory -> build route tree
 *   2. Match incoming URL to a route node
 *   3. Resolve layout chain (root -> leaf)
 *   4. Read page.tw file -> compileSync() -> { html, css, js }
 *   5. Read each layout.tw in chain -> compileSync() -> { html }
 *   6. Wrap page HTML inside layouts (outermost first)
 *   7. If loading.twm exists, inject as a suspense boundary (markup only)
 *   8. If error.twm exists, inject as an error boundary (markup only)
 *   9. If head.twm exists, inject into <head>
 *  10. Assemble full HTML document with <head>, <style>, <body>, <script>
 *  11. Return Response with proper Content-Type and status
 *
 * .tw files go through compileSync() (full pipeline -- HTML + CSS + JS)
 * .twm files go through compileSync() but only HTML is used (no JS, no CSS)
 *
 * @module server/routing/render-pipeline
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { compileSync, registerComponentTemplate, type CompileResult } from "@tw/compiler";
import { maskSourceStringsAndComments, sha256, extractCacheDirective, resolveCache, readCacheProfilesSync, type ResolvedCache } from "@tw/shared";
import { executeRouteHandler } from "./twm-loader";
import type {
  RouteNode,
  RouteFile,
  RouteMatchResult,
  RouteRenderResult,
  CompiledFileEntry,
  RenderPipelineOptions,
} from "@tw/shared";
import { scanRouteTree, matchRoute } from "./scanner";
import { resolveLayoutChain, findGlobalError, findRootError, findRootNotFound, collectParallelPages } from "./layout-chain";
import { join } from "../../../sdk/tw/helpers";
import { loadTWMModule } from "../index";
import { shouldMatchMiddleware } from "./twm-loader";
import { executeMiddleware } from "../index";

/**
 * RenderPipeline -- the main class that handles end-to-end rendering.
 *
 * @example
 * const pipeline = new RenderPipeline({
 *   rootDir: process.cwd(),
 *   homeDir: join(process.cwd(), "home"),
 *   enableCache: true,
 * });
 *
 * const result = pipeline.render("/blog/hello-world");
 * // result.html -> complete HTML document
 */
/** Cache-profile resolution (docs/cache-tags.md): tw.config.ts
 * cache.profiles, loaded once per rootDir. User profiles override the
 * built-ins inside resolveCache(). */
let __profilesCache: { rootDir: string; profiles: Record<string, any> } | null = null;
function getCacheProfiles(rootDir: string): Record<string, any> {
  if (__profilesCache && __profilesCache.rootDir === rootDir) return __profilesCache.profiles;
  let profiles: Record<string, any> = {};
  try {
    profiles = readCacheProfilesSync(rootDir);
  } catch { /* defaults only */ }
  __profilesCache = { rootDir, profiles };
  return profiles;
}

export class RenderPipeline {
  private rootDir: string;
  private homeDir: string;
  private enableCache: boolean;
  private cacheTTL: number;
  /** ISR: paths currently re-rendering in the background (stampede guard). */
  private pendingRefresh = new Set<string>();
  private dev: boolean;
  private routeTree: RouteNode | null = null;
  private compiledCache: Map<string, CompiledFileEntry> = new Map();
  /**
   * Render cache (docs/cache-tags.md). Entry fields:
   *   expiresAt -- v1.0.5 compat: fresh-until timestamp (same as freshUntil)
   *   freshUntil -- age < freshUntil -> HIT (zero work)
   *   expireAt -- freshUntil <= age < expireAt -> STALE + background
   *               refresh; age >= expireAt -> dropped (blocking MISS)
   *   cache -- resolved cache config (null for plain TTL entries); its
   *   `tag` is the single source of truth for revalidateTag() -- the tag
   *   "index" is derived by scanning entries (<= 100), which is the
   *   documented lazy rebuild (design 6.3).
   */
  private renderCache: Map<string, {
    result: RouteRenderResult;
    expiresAt: number;
    freshUntil?: number;
    expireAt?: number;
    cache?: ResolvedCache | null;
    createdAt?: number;
    pathname?: string;
  }> = new Map();

  constructor(opts: RenderPipelineOptions) {
    this.rootDir = opts.rootDir;
    this.homeDir = opts.homeDir;
    this.enableCache = opts.enableCache ?? true;
    this.cacheTTL = opts.cacheTTL ?? 60000;
    this.dev = opts.dev ?? false;
  }

  /**
   * Scan the home directory and build the route tree.
   * Call this once at startup or when files change (HMR).
   */
  rebuild(): void {
    this.routeTree = scanRouteTree({
      homeDir: this.homeDir,
      rootDir: this.rootDir,
    });
    this.compiledCache.clear();
    this.renderCache.clear();
  }

  /**
   * Get the route tree (builds it if needed).
   */
  getRouteTree(): RouteNode | null {
    if (!this.routeTree) this.rebuild();
    return this.routeTree;
  }

  /**
   * Render a URL path to a complete HTML response.
   *
   * @param pathname -- URL path like "/blog/hello-world"
   * @param stateVars -- Optional state variables for SSR
   * @returns RouteRenderResult with complete HTML
   */
  render(pathname: string, stateVars?: Record<string, string>): RouteRenderResult {
    // Unicode routes: the request pathname arrives percent-encoded (browsers
    // always encode non-ASCII); the route tree stores decoded segments.
    // Decode each segment so Hindi/emoji route folders match.
    pathname = pathname.split("/").map(seg => {
      try { return decodeURIComponent(seg); } catch { return seg; }
    }).join("/");
    const startTime = performance.now();

    // Check render cache
    // SPA navigations render `(.)page.tw` interceptors -- a different result
      // than a direct visit, so the nav flag must be part of the cache key.
      const cacheKey = sha256(`${pathname}:${JSON.stringify(stateVars ?? {})}:${(this as any).navRequest ? "nav" : ""}`);
    if (this.enableCache) {
      const cached = this.renderCache.get(cacheKey);
      const now = Date.now();
      // Freshness windows (docs/cache-tags.md). Plain TTL entries (no
      // cache directive) only set expiresAt -> HIT then miss, as in v1.0.5.
      const freshUntil = cached ? (cached.freshUntil ?? cached.expiresAt) : 0;
      const expireAt = cached ? (cached.expireAt ?? freshUntil) : 0;
      if (cached && now < freshUntil) {
        return {
          ...cached.result,
          fromCache: true,
          durationMs: 0,
          headers: this.stampCacheHeaders(cached.result.headers, cached, now, "HIT"),
        };
      }
      // Stale-while-revalidate: serve the stale entry immediately and
      // re-render in the background -- never blocking a visitor. An entry
      // past expireAt is dropped and the request falls through to a
      // blocking MISS render.
      if (cached && now < expireAt && (cached as any).swr && !this.pendingRefresh.has(cacheKey)) {
        this.pendingRefresh.add(cacheKey);
        void Promise.resolve().then(() => {
          try { this.render(pathname, stateVars); } catch { /* background */ }
          finally { this.pendingRefresh.delete(cacheKey); }
        });
        return {
          ...cached.result,
          fromCache: true,
          stale: true,
          durationMs: 0,
          headers: this.stampCacheHeaders(cached.result.headers, cached, now, "STALE"),
        };
      }
      if (cached && now >= expireAt) this.renderCache.delete(cacheKey);
    }

    const tree = this.getRouteTree();
    if (!tree) {
      return this.renderError("home/ directory not found", 500, startTime);
    }

    // Match the route
    const match = matchRoute(tree, pathname);
    if (!match) {
      // Try root not-found.twm
      const rootNotFound = findRootNotFound(tree);
      if (rootNotFound) {
        const compiled = this.compileFile(rootNotFound);
        // not-found.tw compiles to a full document; keep only its body
        // content so it does not nest a second <html> inside the
        // assembled 404 page.
        let nf = String(compiled.html || "");
        const nfm = nf.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        nf = (nfm ? nfm[1] : nf).replace(/<\/?html[^>]*>/gi, "").replace(/<\/?body[^>]*>/gi, "");
        const html = this.assembleHTML(nf, compiled.css, "", "Not Found");
        const result: RouteRenderResult = {
          html,
          css: compiled.css,
          js: "",
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
          fromCache: false,
          durationMs: performance.now() - startTime,
        };
        return result;
      }
      return this.renderError(`Route not found: ${pathname}`, 404, startTime);
    }

    // Resolve the full context (layouts, loading, error, etc.)
    const ctx = resolveLayoutChain(match);

    // Intercepting routes (docs/intercepting-routes.md): an SPA navigation
    // (the client runtime's link fetch sends X-TW-Navigate: 1) renders the
    // `(.)page.tw` interceptor instead of the full page -- the modal case.
    // Direct visits keep the full page.
    if ((this as any).navRequest && match.node) {
      const interceptor = match.node.files.find(f => (f as any).type === "intercept-page");
      if (interceptor) (ctx as any).page = interceptor;
    }

    // If no page file found, check if it's a route.twm (API endpoint)
    if (!ctx.page) {
      const routeFile = ctx.node.files.find(f => f.type === "route");
      if (routeFile) {
        // API route -- execute the .twm module handlers
        // The TWM loader extracts GET/POST/etc functions and calls them
        return {
          html: '{"error":"API routes require async execution. Use executeRouteHandler() from twm-loader."}',
          css: "",
          js: "",
          status: 200,
          headers: { "Content-Type": "application/json" },
          fromCache: false,
          durationMs: performance.now() - startTime,
          routeFile: routeFile.absolutePath,
        } as RouteRenderResult;
      }
      return this.renderError(`No page file found for: ${pathname}`, 404, startTime);
    }

    try {
      // Compile the page (.tw -- full pipeline). Merge route params (e.g.
      // {slug} from /blog/[slug]) into the state so interpolations resolve.
      // Params are exposed BOTH flat ({slug}) and as an object ({params.slug}).
      const pageState: Record<string, any> = { ...(stateVars ?? {}), ...(match.params ?? {}), params: match.params ?? {} };
      // Request-time vars (route params, caller stateVars) win over
      // compile-time state defaults -- snapshot the keys BEFORE compiling.
      const requestVarKeys = new Set(Object.keys({ ...(stateVars ?? {}), ...(match.params ?? {}) }));
      const pageCompiled = this.compileFile(ctx.page, pageState);
      // State-block defaults (state { count = 0 }) must seed __tw_state on
      // SSR pages exactly like the static build does (result.stateSeed) --
      // without them every handler referencing a state var throws
      // "x is not defined" and interpolation spans render empty.
      // NOTE: compileFile(stateVars=pageState) MUTATES pageState -- the
      // compiler writes raw declaration STRINGS into it (ctx.stateVars =
      // stateVars; decl.value is always a string), so `count = 0` would
      // become "0" and `count = count + 1` would do string concatenation.
      // Re-apply the PARSED values from stateSeed afterwards, keeping
      // request-time vars untouched.
      {
        const seed: Record<string, any> = (pageCompiled as any).stateSeed;
        if (seed && typeof seed === "object") {
          for (const [k, v] of Object.entries(seed)) {
            if (!requestVarKeys.has(k)) pageState[k] = v;
          }
        }
      }

      // Start with the page HTML
      let bodyHTML = pageCompiled.html;
      let allCSS = pageCompiled.css;

      // Parallel routes (docs/parallel-routes.md): @slot folders beside the
      // matched page render their trees into the matching capitalized
      // component usage (`Stats { }` for @stats). Without this the raw
      // <Stats> element ships empty.
      try {
        const parentNode = (match as any)?.node as any;
        if (parentNode && Array.isArray(parentNode.children)) {
          const parallelPages = collectParallelPages(parentNode, pathname.split("/").filter(Boolean), 0);
          for (const [slotName, slotFile] of parallelPages) {
            const slotCompiled = this.compileFile(slotFile as any);
            let slotBody = String(slotCompiled.html || "");
            const sbm = slotBody.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (sbm) slotBody = sbm[1];
            slotBody = slotBody.replace(/<\/?html[^>]*>/gi, "").replace(/<\/?body[^>]*>/gi, "");
            const comp = slotName.charAt(0).toUpperCase() + slotName.slice(1);
            const slotRe = new RegExp(`<${comp}(\s[^>]*)?>([\s\S]*?)<\/${comp}>|<${comp}(\s[^>]*)?/>`, "gi");
            bodyHTML = bodyHTML.replace(slotRe, slotBody);
            if (slotCompiled.css) allCSS = slotCompiled.css + "\n" + allCSS;
          }
        }
      } catch { /* parallel slots are optional */ }
      let allJS = pageCompiled.js;

      // Compile and apply layouts (.tw -- full pipeline, root -> leaf = outermost first)
      // We wrap from innermost (leaf) to outermost (root)
      for (let i = ctx.layouts.length - 1; i >= 0; i--) {
        const layoutCompiled = this.compileFile(ctx.layouts[i], stateVars);
        allCSS = layoutCompiled.css + "\n" + allCSS;
        allJS = layoutCompiled.js + "\n" + allJS;
        // Wrap page HTML inside layout via slot replacement
        bodyHTML = this.wrapInLayout(layoutCompiled.html, bodyHTML);
      }

      // Apply templates (.tw -- re-render on navigation)
      for (let i = ctx.templates.length - 1; i >= 0; i--) {
        const templateCompiled = this.compileFile(ctx.templates[i], stateVars);
        allCSS = templateCompiled.css + "\n" + allCSS;
        allJS = templateCompiled.js + "\n" + allJS;
        bodyHTML = this.wrapInLayout(templateCompiled.html, bodyHTML);
      }

      let layoutTitle: string | undefined;
      const liftedParts: string[] = [];
      {
        for (const headMatch of bodyHTML.matchAll(/<head[^>]*>([\s\S]*?)<\/head>/gi)) {
          const headInner = headMatch[1];
          const tMatch = headInner.match(/<title>([^<]*)<\/title>/i);
          // The lifted title comes from COMPILED html, so it is already
          // HTML-escaped; assembleHTML escapes again -- decode it first
          // (round 4: this double-escaped `"` into `&quot;` in titles).
          if (tMatch) layoutTitle = tMatch[1].trim()
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&");
          const kids = headInner
            .replace(/<title>[^<]*<\/title>/gi, "")
            .replace(/<meta[^>]+charset[^>]*>/gi, "")
            .replace(/<meta[^>]+viewport[^>]*>/gi, "")
            .trim();
          if (kids) liftedParts.push(kids);
        }
        bodyHTML = bodyHTML.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
        bodyHTML = bodyHTML.replace(/<\/?(?:html|body)[^>]*>/gi, "");
        // Layout/page composition can stack multiple document shells;
        // every stray <!DOCTYPE> must go -- only the outermost document
        // (assembleHTML) may carry one.
        bodyHTML = bodyHTML.replace(/<!DOCTYPE[^>]*>/gi, "");
      }
      const liftedHead = liftedParts.join("\n");

      // Wrap in error boundary if error.twm exists (markup only -- no JS)
      if (ctx.error) {
        const errorCompiled = this.compileFile(ctx.error);
        allCSS = errorCompiled.css + "\n" + allCSS;
        bodyHTML = `<div data-error-boundary>${bodyHTML}</div>`;
      }

      // Wrap in loading boundary if loading.twm exists (markup only).
      // loading.tw compiles to a FULL document -- embed only its body
      // content, or a nested <!DOCTYPE html>/<html>/<body> lands inside
      // the page body.
      if (ctx.loading) {
        const loadingCompiled = this.compileFile(ctx.loading);
        allCSS = loadingCompiled.css + "\n" + allCSS;
        let lh = String(loadingCompiled.html || "");
        const lm = lh.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        lh = (lm ? lm[1] : lh).replace(/<\/?html[^>]*>/gi, "").replace(/<\/?body[^>]*>/gi, "");
        bodyHTML = `<div data-loading-boundary data-loading-style="display:none" style="display:none">${lh}</div>\n${bodyHTML}`;
      }

      const pageTitle = this.extractTitle(ctx.page) || "TW Page";
      let title = pageTitle;
      if (layoutTitle !== undefined) {
        title = layoutTitle.replace(/\{\s*page\.title\s*\}/g, pageTitle);
        if (!title.trim()) title = pageTitle;
      }

      // Metadata API: frontmatter description/keywords/og_* -> <meta> tags
      const metaTags = this.buildMetaTags(ctx.page);

      // Head injection (docs/project-tree.md): home/head.tw is GLOBAL head
      // content; a head.tw sibling of the page is per-route SEO. Both are
      // compiled and appended into <head> (global first).
      let headExtra = "";
      try {
        const headCandidates: string[] = [];
        const globalHead = join(this.rootDir, "home", "head.tw");
        if (existsSync(globalHead)) headCandidates.push(globalHead);
        const siblingHead = join(dirname(ctx.page.absolutePath), "head.tw");
        if (siblingHead !== globalHead && existsSync(siblingHead)) headCandidates.push(siblingHead);
        for (const hp of headCandidates) {
          const headCompiled = this.compileFile({ absolutePath: hp, type: "head" } as any);
          const m = headCompiled.html.match(/<body>([\s\S]*)<\/body>/);
          // head.tw compiles without transforms: unescape the documented
          // brace escapes here, same as the build path.
          if (m && m[1].trim()) headExtra += m[1].trim().replace(/\\([{}])/g, "$1") + "\n";
        }
        if (liftedHead) headExtra += liftedHead + "\n";
      } catch { /* head.tw is optional */ }

      // Assemble the full HTML document
      let fullHTML = this.assembleHTML(bodyHTML, allCSS, allJS, title, metaTags + headExtra);

      // Client runtime + state seed (matches the static build output):
      // without these an SSR page ships ZERO scripts -- no SPA navigation,
      // no hydration, no events. (Interceptors, RouterLink, bindings all
      // depend on this.)
      if (!/__tw_runtime\.js/.test(fullHTML)) {
        let stateSeed = "{}";
        try { stateSeed = JSON.stringify(pageState ?? {}); } catch { /* ignore */ }
        fullHTML = fullHTML.replace(
          "</body>",
          `  <script id="__tw_state" type="application/json">${stateSeed}</script>\n  <script defer src="/__tw_runtime.js"></script>\n</body>`
        );
      }

      const result: RouteRenderResult = {
        html: fullHTML,
        css: allCSS,
        js: allJS,
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        fromCache: false,
        durationMs: performance.now() - startTime,
        renderMode: this.extractRenderMode(ctx.page),
      } as any;

      // Cache the result. ISR/cache directive (docs/cache-tags.md): a
      // page's resolved cache config overrides the global cacheTTL for
      // this entry and enables stale-while-revalidate.
      const pageCache = this.extractCacheConfig(ctx.page);
      if (this.enableCache) {
        if (this.renderCache.size >= 100) {
          const oldest = this.renderCache.keys().next().value;
          if (oldest) this.renderCache.delete(oldest);
        }
        const freshMs = pageCache ? pageCache.revalidate * 1000 : this.cacheTTL;
        const expireMs = pageCache ? pageCache.expire * 1000 : this.cacheTTL;
        this.renderCache.set(cacheKey, {
          result,
          expiresAt: Date.now() + freshMs,
          freshUntil: Date.now() + freshMs,
          expireAt: Date.now() + expireMs,
          swr: !!pageCache,
          cache: pageCache,
          createdAt: Date.now(),
          pathname,
        } as any);
      }

      return { ...result, headers: this.stampCacheHeaders(result.headers, this.renderCache.get(cacheKey), Date.now(), "MISS") };
    } catch (err) {
      // Try global-error.twm
      const globalError = findGlobalError(tree);
      if (globalError) {
        const compiled = this.compileFile(globalError);
        const html = this.assembleHTML(compiled.html, compiled.css, "", "Error");
        return {
          html,
          css: compiled.css,
          js: "",
          status: 500,
          headers: { "Content-Type": "text/html; charset=utf-8" },
          fromCache: false,
          durationMs: performance.now() - startTime,
        };
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      return this.renderError(errMsg, 500, startTime);
    }
  }

  /**
   * Compile a single .tw or .twm file, using cache when possible.
   * .tw files go through full compileSync (HTML + CSS + JS)
   * .twm files go through compileSync but we only use HTML (no JS needed for markup)
   */
  private __compsRegistered = false;

  /**
   * SSR/serve compiles must expand `components/*.tw` exactly like the build
   * does (docs/syntax-components.md: "Components are expanded at compile
   * time" -- true for static pages, and required for SSR pages too).
   * Without this, `<Header>` on an SSR page ships as a raw empty tag.
   */
  private ensureComponentsRegistered(): void {
    if (this.__compsRegistered) return;
    this.__compsRegistered = true;
    try {
      const { readdirSync } = require("node:fs") as typeof import("node:fs");
      const { join } = require("node:path") as typeof import("node:path");
      const dir = join(this.rootDir, "components");
      if (!require("node:fs").existsSync(dir)) return;
      for (const f of readdirSync(dir).filter(f => f.endsWith(".tw"))) {
        try {
          const src = require("node:fs").readFileSync(join(dir, f), "utf-8");
          const r: any = compileSync(src, { filePath: join(dir, f), transforms: false, optimize: false, diagnostics: false });
          if (r.ast) registerComponentTemplate(f.replace(/\.tw$/, ""), r.ast);
        } catch { /* skip broken component -- diagnostics cover it in build */ }
      }
    } catch { /* components dir optional */ }
  }

  private compileFile(file: RouteFile, stateVars?: Record<string, string>): CompileResult {
    this.ensureComponentsRegistered();
    // Cache key MUST include stateVars: dynamic routes like /blog/[slug]
    // compile the same file with different param values.
    const cacheKey = file.absolutePath + ":" + JSON.stringify(stateVars ?? {});
    const cached = this.compiledCache.get(cacheKey);
    if (cached && !this.dev) {
      return {
        ast: {} as CompileResult["ast"],
        html: cached.html,
        css: cached.css,
        js: cached.js,
        hasVdom: false,
        hasInteractivity: cached.hasInteractivity,
        diagnostics: [],
        metadata: {
          parseTime: 0,
          codegenTime: 0,
          totalTime: 0,
          fromCache: true,
          nodeCount: 0,
        },
      };
    }

    if (!existsSync(file.absolutePath)) {
      throw new Error(`Route file not found: ${file.absolutePath}`);
    }

    const source = readFileSync(file.absolutePath, "utf-8");
    const result = compileSync(source, {
      filePath: file.absolutePath,
      optimize: true,
      diagnostics: false,
      transforms: true,
      stateVars,
    });

    // For .twm files (route, middleware), JS is used for server-side execution
    // For .tw files, everything goes through the full pipeline
    const isServerModule = file.extension === ".twm";
    this.compiledCache.set(cacheKey, {
      html: result.html,
      css: isServerModule ? "" : result.css,
      js: isServerModule ? "" : result.js,
      hasInteractivity: isServerModule ? false : result.hasInteractivity,
      isMarkupOnly: isServerModule,
      compiledAt: Date.now(),
    });

    return {
      ...result,
      css: isServerModule ? "" : result.css,
      js: isServerModule ? "" : result.js,
    };
  }

  /**
   * Wrap inner HTML inside a layout.
   * Replaces slot { }, <slot/>, {{children}}, {{slot}} with inner content.
   * If no slot found, appends inner content after layout's body.
   */
  private wrapInLayout(layoutHTML: string, innerHTML: string): string {
    // Try various slot patterns:
    // 1. slot { }  -- TW syntax
    // 2. <slot />
    // 3. <slot></slot>
    // 4. {{children}}
    // 5. {{slot}}

    const patterns = [
      /<!-- tw:slot:[\w-]+ -->[\s\S]*?<!-- \/tw:slot:[\w-]+ -->/,
      /slot\s*\{\s*\}/,
      /<slot\s*\/>/i,
      /<slot\s*><\/slot>/i,
      /\{\{children\}\}/,
      /\{\{slot\}\}/,
    ];

    for (const pattern of patterns) {
      if (pattern.test(layoutHTML)) {
        return layoutHTML.replace(pattern, innerHTML);
      }
    }

    // No slot found -- try to inject before closing </body> tag
    if (/<\/body>/i.test(layoutHTML)) {
      return layoutHTML.replace(/<\/body>/i, `${innerHTML}</body>`);
    }

    // Fallback: append inner HTML
    return layoutHTML + "\n" + innerHTML;
  }

  /**
   * On-demand ISR invalidation (docs/isr.md): drop cached renders for a
   * path so the next request re-renders. Exact match, or prefix matching
   * with { prefix: true } (e.g. revalidatePath("/blog", { prefix: true })
   * drops every /blog/... entry). Returns the number of dropped entries.
   */
  revalidatePath(pathname: string, opts?: { prefix?: boolean }): number {
    let dropped = 0;
    const want = pathname.startsWith("/") ? pathname : "/" + pathname;
    for (const [key, entry] of this.renderCache) {
      const p = (entry as any).pathname;
      if (p === undefined) continue;
      const hit = opts?.prefix
        ? (p === want || p.startsWith(want.endsWith("/") ? want : want + "/"))
        : p === want;
      if (hit) {
        this.renderCache.delete(key);
        dropped++;
      }
    }
    return dropped;
  }

  /**
   * Extract page title from the page config in source.
   * Looks for: page { title "..."; }
   */
  private extractTitle(file: RouteFile): string | null {
    try {
      const source = readFileSync(file.absolutePath, "utf-8");
      // Mask strings + comments: the words `title "x"` inside a quoted
      // example must not fake a page title. Match on the masked source,
      // read the value from the ORIGINAL by position (same length).
      const masked = maskSourceStringsAndComments(source);
      const m = masked.match(/page\s*\{[^}]*title\s+"/);
      if (!m || m.index === undefined) return null;
      const start = m.index + m[0].length;
      const end = source.indexOf('"', start);
      if (end === -1 || end === start) return null;
      return source.slice(start, end).replace(/\\([{}"])/g, "$1");
    } catch {
      return null;
    }
  }

  /**
   * ISR (docs/isr.md): extract `revalidate N` (seconds) from the page
   * frontmatter. `revalidate 60` -> the render cache entry lives 60s and is
   * then served stale while a background render refreshes it.
   */
  /** Page frontmatter render mode (static|ssr|island|edge|csr|stream|ppr). */
  private extractRenderMode(file: RouteFile): string {
    try {
      const src = readFileSync(file.absolutePath, "utf8");
      // Mask strings + comments: example text must not flip the mode.
      const m = /render\s+(static|ssr|island|edge|csr|stream|ppr)\b/.exec(
        maskSourceStringsAndComments(src),
      );
      return m ? m[1] : "static";
    } catch {
      return "static";
    }
  }

  /**
   * Cache tags (docs/cache-tags.md): expire every render-cache entry
   * whose `cache { tag "..." }` family matches. The next request for those
   * routes renders fresh (MISS). Entries are the single source of truth;
   * scanning them is the derived tag index (rebuilt by construction).
   * Returns the number of dropped entries.
   */
  revalidateTag(tag: string): number {
    let dropped = 0;
    for (const [key, entry] of this.renderCache) {
      const c = (entry as any).cache as ResolvedCache | null | undefined;
      if (c && c.tag === tag) {
        this.renderCache.delete(key);
        dropped++;
      }
    }
    return dropped;
  }

  /**
   * Cache headers on every cacheable response (docs/cache-tags.md):
   *   x-tw-cache: HIT | STALE | MISS (existing contract, unchanged)
   *   x-tw-cache-age: seconds since the entry was rendered (observation)
   *   Cache-Control: public, max-age=<stale>, stale-while-revalidate=...
   *     only when `stale > 0` -- the client-side hint. The server
   *     render-cache never reads `stale`.
   */
  private stampCacheHeaders(
    headers: Record<string, string> | undefined,
    entry: { cache?: ResolvedCache | null; createdAt?: number } | null | undefined,
    now: number,
    verdict: "HIT" | "STALE" | "MISS",
  ): Record<string, string> {
    const out: Record<string, string> = { ...(headers ?? {}), "x-tw-cache": verdict };
    const c = entry?.cache;
    if (c) {
      const ageSec = entry?.createdAt ? Math.max(0, Math.floor((now - entry.createdAt) / 1000)) : 0;
      out["x-tw-cache-age"] = String(ageSec);
      if (c.stale > 0) {
        const swr = Number.isFinite(c.expire) ? ", stale-while-revalidate=" + Math.max(0, c.expire - c.stale) : "";
        out["Cache-Control"] = "public, max-age=" + c.stale + swr;
      }
    }
    return out;
  }

  private extractRevalidate(file: RouteFile): number | null {
    try {
      const source = readFileSync(file.absolutePath, "utf-8");
      // Mask strings + comments: `revalidate 60` shown as example text
      // must not fake an ISR window on the serve path.
      const m = maskSourceStringsAndComments(source).match(/page\s*\{[^}]*revalidate\s+(\d+)/);
      if (m) {
        const n = Number(m[1]);
        return Number.isFinite(n) && n > 0 ? n : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Cache config (docs/cache-tags.md): resolve a page's `cache { }`
   * directive against tw.config.ts cache.profiles, falling back to the
   * legacy `revalidate N` ISR form. The legacy form desugars to
   * { revalidate: N, stale: 0, expire: Infinity } -- the exact v1.0.5
   * behavior (fresh for N seconds, then stale-while-revalidate forever).
   */
  private extractCacheConfig(file: RouteFile): ResolvedCache | null {
    try {
      const source = readFileSync(file.absolutePath, "utf-8");
      const meta = extractCacheDirective(source);
      if (meta) {
        try {
          return resolveCache(meta, getCacheProfiles(this.rootDir));
        } catch (e) {
          // TW092 (unknown profile): fail safe -- serve the page uncached.
          console.error("[tw] " + (e as Error).message + " (" + file.absolutePath + ")");
          return null;
        }
      }
      const legacy = this.extractRevalidate(file);
      if (legacy != null) {
        return { revalidate: legacy, stale: 0, expire: Infinity };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Metadata API (docs/metadata.md): description / keywords / og_title /
   * og_description / og_image in the page frontmatter become <meta> tags --
   * automatic SEO without writing head.tw by hand.
   */
  private buildMetaTags(file: RouteFile): string {
    try {
      const source = readFileSync(file.absolutePath, "utf-8");
      // Mask strings + comments, then cut the frontmatter body from
      // the ORIGINAL by position: a `page {` shown inside a quoted
      // example must not hijack the meta tags, but the real body's
      // own quoted values must survive.
      const masked = maskSourceStringsAndComments(source);
      const fm = masked.match(/page\s*\{/);
      if (!fm || fm.index === undefined) return "";
      const bodyStart = fm.index + fm[0].length;
      const bodyEnd = masked.indexOf("}", bodyStart);
      if (bodyEnd === -1) return "";
      const body = source.slice(bodyStart, bodyEnd);
      const AMP = String.fromCharCode(38);
      const esc = (v: string) => v
        .split(AMP).join(AMP + "amp;")
        .split(String.fromCharCode(34)).join(AMP + "quot;")
        .split("<").join(AMP + "lt;");
      const pick = (key: string): string | null => {
        const i = body.indexOf(key + ' "');
        if (i === -1) return null;
        const rest = body.slice(i + key.length + 2);
        // escape-aware closing-quote scan (see build.ts pick): a value
        // with an escaped quote must not truncate at it.
        let end = -1;
        for (let j = 0; j < rest.length; j++) {
          if (rest[j] === "\\") { j++; continue; }
          if (rest[j] === '"') { end = j; break; }
        }
        if (end === -1) return null;
        // brace + quote escapes; HTML escaping stays with esc() below.
        return rest.slice(0, end).replace(/\\([{}"])/g, "$1");
      };
      let tags = "";
      const description = pick("description");
      if (description) tags += `    <meta name="description" content="${esc(description)}">\n`;
      const keywords = pick("keywords");
      if (keywords) tags += `    <meta name="keywords" content="${esc(keywords)}">\n`;
      const ogTitle = pick("og_title");
      const ogDescription = pick("og_description");
      const ogImage = pick("og_image");
      if (ogTitle || ogDescription || ogImage) {
        if (ogTitle) tags += `    <meta property="og:title" content="${esc(ogTitle)}">\n`;
        if (ogDescription) tags += `    <meta property="og:description" content="${esc(ogDescription)}">\n`;
        if (ogImage) tags += `    <meta property="og:image" content="${esc(ogImage)}">\n`;
        tags += `    <meta property="og:type" content="website">\n`;
        tags += `    <meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">\n`;
      }
      return tags;
    } catch {
      return "";
    }
  }

  /**
   * Assemble the complete HTML document.
   */
  private assembleHTML(bodyHTML: string, css: string, js: string, title: string, headExtra?: string): string {
    const styleTag = css.trim() ? `<style>\n${css}\n</style>` : "";
    const scriptTag = js.trim() ? `<script type="module">\n${js}\n</script>` : "";
    const devScript = this.dev ? '<script type="module" src="/__tw_hmr"></script>' : "";
    const headContent = headExtra ? headExtra : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHTML(title)}</title>
  ${headContent}
  ${styleTag}
</head>
<body>
${bodyHTML}
${scriptTag}
${devScript}
</body>
</html>`;
  }

  private escapeHTML(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  private renderError(message: string, status: number, startTime: number): RouteRenderResult {
    // The project convention (docs/commands-reference.md): error.tw is the
    // user's error page. 5xx render errors use it before the built-in page;
    // the error message itself never leaks to the client (log only).
    if (status >= 500) {
      try {
        const tree = this.getRouteTree();
        const errFile = tree ? findRootError(tree) : null;
        if (errFile) {
          const compiled = this.compileFile(errFile, {});
          let eh = String(compiled.html || "");
          const em = eh.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          eh = (em ? em[1] : eh).replace(/<\/?html[^>]*>/gi, "").replace(/<\/?body[^>]*>/gi, "").replace(/<!DOCTYPE[^>]*>/gi, "");
          const html = this.assembleHTML(eh, compiled.css, "", `Error ${status}`);
          console.error(`[render] ${status}: ${message}`);
          return {
            html,
            css: compiled.css,
            js: "",
            status,
            renderMode: "ssr",
            durationMs: performance.now() - startTime,
          } as unknown as RouteRenderResult;
        }
      } catch { /* fall back to the built-in error page */ }
    }
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error ${status}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0d1117; }
    .error-card { background: #161b22; padding: 2rem; border-radius: 8px; border: 1px solid #30363d; max-width: 500px; }
    .error-code { font-size: 3rem; font-weight: bold; color: ${status === 404 ? "#58a6ff" : "#f85149"}; margin: 0; }
    .error-msg { color: #8b949e; margin: 0.5rem 0 0; }
  </style>
</head>
<body>
  <div class="error-card">
    <h1 class="error-code">${status}</h1>
    <p class="error-msg">${this.escapeHTML(message)}</p>
  </div>
</body>
</html>`;

    return {
      html,
      css: "",
      js: "",
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      fromCache: false,
      durationMs: performance.now() - startTime,
    };
  }

  /**
   * Render an API route (.twm) -- execute the handler for the given HTTP method.
   * Returns a Response object from the handler.
   */
  async renderRoute(
    pathname: string,
    method: string,
    request: Request,
    params?: Record<string, string>
  ): Promise<Response> {
    const tree = this.getRouteTree();
    if (!tree) {
      return new Response(JSON.stringify({ error: "home/ directory not found" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const match = matchRoute(tree, pathname);
    if (!match) {
      return new Response(JSON.stringify({ error: "Route not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const routeFile = match.node.files.find(f => f.type === "route");
    if (!routeFile) {
      return new Response(JSON.stringify({ error: "Not an API route" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Route params go ON the request (request.params.id etc.);
    // the 4th argument is the project rootDir for lib/ imports.
    const reqWithParams: any = request;
    try { reqWithParams.params = params || match.params; } catch { /* frozen */ }
    const result = await executeRouteHandler(
      routeFile.absolutePath, method, reqWithParams,
      (this as any).rootDir || (this as any).options?.rootDir,
    );
    // Convert the {status, json|html|text} result into a proper Response.
    // json (or the legacy `body` alias) -> application/json; html -> text/html;
    // text -> text/plain.
    const contentType =
      result.html !== undefined ? "text/html; charset=utf-8"
      : result.text !== undefined ? "text/plain; charset=utf-8"
      : "application/json";
    const body =
      result.html !== undefined ? result.html
      : result.text !== undefined ? result.text
      : JSON.stringify(result.json ?? {});
    return new Response(body, {
      status: result.status,
      headers: { "Content-Type": contentType, ...(result.headers ?? {}) },
    });
  }

  /**
   * Execute root middleware.twm if it exists.
   * Returns a Response if middleware intercepted, or void to continue.
   */
  async runMiddleware(pathname: string, request: Request): Promise<Response | void> {
    const middlewarePath = join(this.rootDir, "middleware.twm");
    if (!existsSync(middlewarePath)) return;

    // Check if the middleware should match this path
    const mod = await loadTWMModule(middlewarePath, this.rootDir);
    if (mod.config?.matcher && !shouldMatchMiddleware(mod.config.matcher, pathname)) {
      return; // Path not matched -- skip middleware
    }

    return executeMiddleware(middlewarePath, request, this.rootDir);
  }

  /** Clear all caches. */
  clearCache(): void {
    this.compiledCache.clear();
    this.renderCache.clear();
  }

  /** Get cache statistics. */
  getCacheStats(): { compiled: number; renders: number; routeCount: number } {
    return {
      compiled: this.compiledCache.size,
      renders: this.renderCache.size,
      routeCount: this.routeTree ? this.countNodes(this.routeTree) : 0,
    };
  }

  private countNodes(node: RouteNode): number {
    let count = node.files.length;
    for (const child of node.children) {
      count += this.countNodes(child);
    }
    return count;
  }
}

/**
 * Create a render pipeline instance.
 */
export function createRenderPipeline(opts: RenderPipelineOptions): RenderPipeline {
  return new RenderPipeline(opts);
}
