/**
 * tw build -- compile .tw pages to static HTML, copy .twm routes, copy static assets.
 * Output goes to .tw/ directory.
 *
 * What it does:
 *   1. Compiles all home/page.tw -> .tw/<route>/index.html (with CSS injected)
 *   2. Copies all home/route.twm -> .tw/<route>/route.twm (server-side routes)
 *   3. Copies home/users.json -> .tw/users.json
 *   4. Copies lib/ -> .tw/lib/ (application modules)
 *   5. Copies public/ -> .tw/ (static assets)
 *   6. Copies style.css -> .tw/style.css
 *   7. Copies middleware.twm -> .tw/middleware.twm
 *
 * Unlike tw dev (on-demand compilation), tw build pre-compiles everything upfront.
 * This is for production deployment.
 */

import { join, resolve, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, copyFileSync, unlinkSync, rmdirSync } from "node:fs";

// --- Compiler loader (same as dev.ts) --------------------------------------

function findCompilerPath(): string {
  const fileUrl = import.meta.url.replace("file://", "");
  const cmdDir = fileUrl.substring(0, fileUrl.lastIndexOf("/"));
  const candidates = [
    resolve(cmdDir, "../../../../packages/compiler/tw/index.ts"),
    resolve(process.cwd(), "packages/compiler/tw/index.ts"),
    resolve(process.cwd(), "node_modules/tw-framework/packages/compiler/tw/index.ts"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return resolve(process.cwd(), "packages/compiler/tw/index.ts");
}

// --- Helpers ----------------------------------------------------------------


/** Render mode from a page's frontmatter (`render static|ssr|island|edge|csr|stream|ppr`). */
export function extractRenderMode(src: string): string {
  const m = /render\s+(static|ssr|island|edge|csr|stream|ppr|signalStream)\b/.exec(src);
  return m ? m[1] : "static";
}

/**
 * CSR shell: the compiled markup ships inert inside a <template>; the
 * browser builds the visible DOM from it (no server HTML in the body).
 */
export function csrifyHtml(html: string): string {
  const m = /<body[^>]*>([\s\S]*)<\/body>/.exec(html);
  const markup = m ? m[1].trim() : "";
  return html.replace(
    /<body[^>]*>[\s\S]*<\/body>/,
    [
      "<body>",
      '<div id="tw-root"></div>',
      '<template id="tw-csr-template">' + markup + "</template>",
      "<script>(function(){var t=document.getElementById('tw-csr-template');",
      "var r=document.getElementById('tw-root');",
      "if(t&&r){r.appendChild(t.content.cloneNode(true));t.remove();}})();</script>",
      "</body>",
    ].join("\n"),
  );
}
function collectFiles(dir: string, fileName: string, results: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    // Private folders (_components) and parallel-route slots (@analytics)
    // are excluded from routing (docs/project-tree.md).
    if (entry.startsWith("_") || entry.startsWith("@")) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectFiles(fullPath, fileName, results);
    } else if (entry === fileName) {
      results.push(fullPath);
    }
  }
}

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// --- Component scanner -------------------------------------------------------
let _compilerMod: any = null;
try {
  // Literal path: esbuild bundles this into the Node CLI build.
  _compilerMod = await import("../../../../packages/compiler/tw/index.ts");
} catch {
  _compilerMod = await import(findCompilerPath());
}
const _compileSync = _compilerMod.compileSync;
const _registerComponentTemplate = _compilerMod.registerComponentTemplate;
const _clearComponentRegistry = _compilerMod.clearComponentRegistry;
const _generateWithLayout = _compilerMod.generateWithLayout;
const _generateWithLayoutChain = _compilerMod.generateWithLayoutChain;
const _compileTSS = _compilerMod.compileTSS;

/**
 * Collect the FULL layout chain for a page: outermost (home/) first,
 * innermost (page dir) last -- per docs/project-tree.md.
 */
function findLayoutChain(dir: string, homeDir: string): string[] {
  const chain: string[] = [];
  let cur = dir;
  const homeAbs = resolve(homeDir);
  for (let i = 0; i < 16; i++) {
    const cand = join(cur, "layout.tw");
    if (existsSync(cand)) chain.push(cand);
    if (resolve(cur) === homeAbs) break;
    const parent = resolve(cur, "..");
    if (parent === resolve(cur) || !parent.startsWith(homeAbs)) break;
    cur = parent;
  }
  return chain.reverse(); // outermost first
}

/**
 * Styles are applied via imports now (the documented way):
 *   `import "@./style/global.tss"` in a layout/page, compiled by the compiler.
 * Only a legacy root style.css is still injected globally for old projects.
 */
function loadGlobalStyles(rootDir: string): string {
  const legacy = join(rootDir, "style.css");
  if (existsSync(legacy)) return readFileSync(legacy, "utf-8");
  return "";
}

function registerComponentsFrom(dir: string): void {
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir).filter(f => f.endsWith(".tw"))) {
    const name = file.replace(/\.tw$/, "");
    const filePath = join(dir, file);
    try {
      const source = readFileSync(filePath, "utf-8");
      const result = _compileSync(source, { filePath, transforms: false, optimize: false, diagnostics: false });
      if (result.ast) {
        _registerComponentTemplate(name, result.ast);
        console.log("  \x1b[32m\u2713\x1b[0m component: " + name);
      }
    } catch (e: any) {
      console.log("  \x1b[33m! component " + name + ": " + e.message + "\x1b[0m");
    }
  }
}

function collectPrivateComponentDirs(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith("_")) {
      out.push(full);
    } else if (!entry.startsWith("@")) {
      collectPrivateComponentDirs(full, out);
    }
  }
}

function scanComponents(rootDir: string): void {
  _clearComponentRegistry();
  registerComponentsFrom(join(rootDir, "components"));

  const privDirs: string[] = [];
  collectPrivateComponentDirs(join(rootDir, "home"), privDirs);
  for (const d of privDirs) registerComponentsFrom(d);
}


/** Metadata API (docs/metadata.md): page frontmatter description /
 * keywords / og_* -> <meta> tags for the static output. */
function buildMetaTagsFromSource(source: string): string {
  const fm = source.match(/page\s*\{([^}]*)\}/);
  if (!fm) return "";
  const body = fm[1];
  const AMP = String.fromCharCode(38);
  const esc = (v: string) => v
    .split(AMP).join(AMP + "amp;")
    .split(String.fromCharCode(34)).join(AMP + "quot;")
    .split("<").join(AMP + "lt;");
  const pick = (key: string): string | null => {
    const i = body.indexOf(key + ' "');
    if (i === -1) return null;
    const rest = body.slice(i + key.length + 2);
    const end = rest.indexOf('"');
    if (end === -1) return null;
    return rest.slice(0, end);
  };
  let tags = "";
  const description = pick("description");
  if (description) tags += `    <meta name="description" content="${esc(description)}">` + "\n";
  const keywords = pick("keywords");
  if (keywords) tags += `    <meta name="keywords" content="${esc(keywords)}">` + "\n";
  const ogTitle = pick("og_title");
  const ogDescription = pick("og_description");
  const ogImage = pick("og_image");
  if (ogTitle || ogDescription || ogImage) {
    if (ogTitle) tags += `    <meta property="og:title" content="${esc(ogTitle)}">` + "\n";
    if (ogDescription) tags += `    <meta property="og:description" content="${esc(ogDescription)}">` + "\n";
    if (ogImage) tags += `    <meta property="og:image" content="${esc(ogImage)}">` + "\n";
    tags += `    <meta property="og:type" content="website">` + "\n";
    tags += `    <meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">` + "\n";
  }
  return tags;
}

// --- Build Command ----------------------------------------------------------

export async function buildCommand(): Promise<void> {
  const rootDir = process.cwd();
  // --profile: emit a stage-by-stage timing report (docs/build-profiler.md)
  const profile = process.argv.slice(2).includes("--profile");
  const P = _compilerMod as any;
  const begin = (n: string, files = 0) => { if (profile) P.startStage?.(n, files); };
  const end = (n: string) => { if (profile) P.endStage?.(n); };
  let needsRuntime = false;
  const homeDir = join(rootDir, "home");
  const outDir = join(rootDir, ".tw");
  const publicDir = join(rootDir, "public");
  const libDir = join(rootDir, "lib");
  const stylePath = join(rootDir, "style.css");

  console.log("\n  \x1b[36mtw build\x1b[0m -- compiling project for production\n");
  console.log("  Root:   " + rootDir);
  console.log("  Output: " + outDir + "\n");

  // Client-side npm modules via the dependency graph (spec):
  //  - each unique import -> one shared content-hashed chunk (c-*.js)
  //  - a page's OWN imports -> page scope (p-*.js) = symbol access
  //  - layout imports -> chunk loading for descendants (inheritance)
  //  - server-only imports in client modules -> TW1007 build failure
  const pageClientLines = new Map<string, { deps: string[]; own: string[] }>();
  const tw1007: { file: string; spec: string }[] = [];
  const clientChunkUrls = new Set<string>();

  // Compiler loaded at module level (see findCompilerPath above)
  if (typeof _compileSync !== "function") {
    console.log("  \x1b[31mError: Could not load compiler\x1b[0m\n");
    return;
  }

  // Load CSS: documented convention is style/*.tss (see docs/project-tree.md)
  begin("styles");
  let css = loadGlobalStyles(rootDir);
  end("styles");

  // Clean output directory
  if (existsSync(outDir)) {
    rmDirRecursive(outDir);
  }
  mkdirSync(outDir, { recursive: true });

  // Scan and register components
  begin("scan");
  scanComponents(rootDir);
  end("scan");

  // Image optimization config (breakpoints/quality for the Image component)
  try {
    const cfgPath = join(rootDir, "tw.config.ts");
    if (existsSync(cfgPath)) {
      const { twImportTs } = await import("@tw/shared/tw/node-import");
      const cfgMod: any = await twImportTs(cfgPath);
      const cfg = cfgMod.default ?? cfgMod;
      (_compilerMod as any).setBuiltinImageConfig?.((cfg as any)?.images);
    }
  } catch { /* defaults */ }

  let pageCount = 0;
  let apiCount = 0;
  let errorCount = 0;

  // -- 1. Compile all page.tw files to HTML --------------------------------
  const pageFiles: string[] = [];
  collectFiles(homeDir, "page.tw", pageFiles);
  begin("compile", pageFiles.length);
  const htmlOutputs: Array<{ outputDir: string; html: string; route: string }> = [];
  (_compilerMod as any).clearCssCapture?.();

  for (const pageFile of pageFiles) {
    let relativePath = pageFile.replace(homeDir, "").replace(/^\//, "");
    // Route groups (marketing)/ are NOT part of the URL
    relativePath = relativePath
      .split("/")
      .filter(seg => !/^\(.*\)$/.test(seg))
      .join("/");
    const routeName = relativePath.replace(/\/?page\.tw$/, "").replace(/\\/g, "/");
    const routePath = routeName === "" ? "/" : "/" + routeName;

    // generateStaticParams: a sibling params.twm with fn generate() returning
    // [{ slug: "a" }, { slug: "b" }] statically prebuilds each dynamic route.
    let paramSets: Record<string, string>[] = [{}];
    if (/\[[^\]]+\]/.test(pageFile)) {
      const paramsTwm = join(dirname(pageFile), "params.twm");
      if (existsSync(paramsTwm)) {
        try {
          const { loadTWMModule } = await import("../../../../packages/server/tw/routing/twm-loader.ts");
          const pmod: any = await loadTWMModule(paramsTwm, rootDir);
          if (typeof pmod.generate === "function") {
            const arr = pmod.generate();
            if (Array.isArray(arr) && arr.length > 0) paramSets = arr.map((x: any) => {
              const o: Record<string, string> = {};
              for (const [k, v] of Object.entries(x)) o[k] = String(v);
              return o;
            });
          }
        } catch (e: any) {
          console.log("  Warning: params.twm failed: " + e.message);
        }
      }
    }

    // Catch-all pages ([...rest] / [[...slug]]) render per-URL at runtime
    // (dev + serve SSR). A static build can only emit them through params.twm
    // enumeration -- without it there is no finite URL set, so skip the page
    // instead of writing a literal "[...rest]" folder nothing can serve.
    const isCatchAllSeg = (seg: string) => /^\[\[?\.\.\./.test(seg);
    if (routeName.split("/").some(isCatchAllSeg)) {
      const hasParams = paramSets.length > 1 || Object.keys(paramSets[0] ?? {}).length > 0;
      if (!hasParams) {
        console.log("  \x1b[33m!\x1b[0m " + routePath + " [catch-all: rendered at runtime -- add params.twm to prebuild]");
        continue;
      }
    }

    // Render mode decides what the static build emits:
    //   static/island/edge -> prebuilt HTML (current behavior)
    //   ssr/stream         -> nothing; serve renders per request (stream mode
    //                         sends the shell first and resolves Suspense holes
    //                         as separate chunks)
    //   csr                -> client-rendered shell (markup inert in a template)
    //   ppr                -> prebuilt shell + data-tw-ppr holes the client
    //                         refetches per request through /_tw/ppr
    const renderMode = extractRenderMode(readFileSync(pageFile, "utf8"));
    if (renderMode === "ssr" || renderMode === "stream") {
      console.log("  \x1b[36m~\x1b[0m " + routePath + " [" + renderMode + ": rendered at request time]");
      continue;
    }

    // Capture every stylesheet chunk this route chain uses (tss/css imports
    // + scoped <style> blocks) so css assets can be route-split after the loop.
    (_compilerMod as any).beginCssRouteCapture?.(routePath);
    for (const paramSet of paramSets) {
    try {
      const source = readFileSync(pageFile, "utf-8");
      // Route params are exposed BOTH flat ({slug}) and as an object
      // ({params.slug}) -- docs/project-tree.md documents params.slug.
      const scopeVars = { ...paramSet, params: paramSet };
      const result = _compileSync(source, { filePath: pageFile, stateVars: scopeVars } as any);
      let html = result.html;

      // Apply the FULL layout chain (root layout first, then section layouts)
      const layoutChain = findLayoutChain(dirname(pageFile), homeDir);
      if (layoutChain.length > 0) {
        const layoutPrograms = layoutChain.map(lp => {
          const ls = readFileSync(lp, "utf-8");
          const lr = _compileSync(ls, { filePath: lp });
          return lr.ast;
        }).filter(Boolean);
        if (layoutPrograms.length > 0 && _generateWithLayoutChain) {
          html = _generateWithLayoutChain(layoutPrograms, result.ast, scopeVars);
          // Page title wins over the layout title.
          const pageTitle = result.html.match(/<title>([^<]*)<\/title>/);
          if (pageTitle && pageTitle[1] && pageTitle[1] !== "TW Page") {
            html = html.replace(/<title>[^<]*<\/title>/, `<title>${pageTitle[1]}</title>`);
          }
        }
      }

      // Interpolate route params into the <title> (Catalog: {slug})
      if (Object.keys(paramSet).length > 0) {
        html = html.replace(/<title>([^<]*)<\/title>/, (m: string, t: string) =>
          "<title>" + t.replace(/\{(\w+)\}/g, (_mm: string, k: string) => (paramSet as any)[k] ?? _mm) + "</title>");
      }

      // Head injection (docs/project-tree.md): home/head.tw is GLOBAL head
      // content for every page; a head.tw sibling of the page is per-route.
      const headSources: string[] = [];
      const globalHeadTw = join(homeDir, "head.tw");
      if (existsSync(globalHeadTw)) headSources.push(globalHeadTw);
      const headTwPath = join(dirname(pageFile), "head.tw");
      if (headTwPath !== globalHeadTw && existsSync(headTwPath)) headSources.push(headTwPath);
      for (const headSrc of headSources) {
        try {
          const headSource = readFileSync(headSrc, "utf-8");
          const headResult = _compileSync(headSource, { filePath: headSrc });
          const headBody = headResult.html.match(/<body>([\s\S]*)<\/body>/);
          if (headBody && headBody[1].trim()) {
            html = html.replace("</head>", "  " + headBody[1].trim() + "\n</head>");
          }
        } catch (e: any) {
          console.log("  Warning: head.tw failed: " + e.message);
        }
      }

      // Metadata API: frontmatter description/keywords/og_* -> <meta> tags
      {
        const metaTags = buildMetaTagsFromSource(source);
        if (metaTags) html = html.replace("</head>", metaTags + "</head>");
      }

      // Inject CSS
      if (css) {
        html = html.replace("</head>", "<style>" + css + "</style>\n</head>");
      }

      // Client runtime on EVERY page (SPA router); state seed only when
      // the page is interactive (event bindings / live interpolations).
      {
        const interactive = /data-tw-event|data-tw-i/.test(html);
        if (interactive) {
          const seed: Record<string, any> = { ...paramSet, ...((result as any).stateSeed ?? {}) };
          const seedScript = `<script id="__tw_state" type="application/json">${JSON.stringify(seed).replace(/</g, "\\u003c")}</script>`;
          html = html.replace("</body>", "  " + seedScript + "\n</body>");
        }
        // Dependency graph: deps (page + layout chain) load shared chunks;
        // ONLY the page's own imports get symbol scope. TW1007 guards the
        // server/client boundary (spec S8-S9).
        let pageMods = pageClientLines.get(pageFile);
        if (!pageMods) {
          const chainFiles = findLayoutChain(dirname(pageFile), homeDir);
          const own = new Set<string>();
          const deps = new Set<string>();
          const { collectClientImportsFromSource, findServerOnlyViolations } = await import("./client-bundle");
          for (const l of collectClientImportsFromSource(source)) own.add(l);
          for (const v of findServerOnlyViolations(source)) tw1007.push({ file: pageFile, spec: v });
          for (const lf of chainFiles) {
            const ls = readFileSync(lf, "utf-8");
            for (const l of collectClientImportsFromSource(ls)) deps.add(l);
            for (const v of findServerOnlyViolations(ls)) tw1007.push({ file: lf, spec: v });
          }
          for (const l of own) deps.add(l);
          pageMods = { deps: [...deps], own: [...own] };
          pageClientLines.set(pageFile, pageMods);
        }
        const { buildClientChunk, buildPageScope } = await import("./client-bundle");
        let clientTag = "";
        for (const l of pageMods.deps) {
          const u = buildClientChunk(rootDir, l, true);
          if (u) { clientTag += `<script defer src="/${u}"></script>\n  `; clientChunkUrls.add(u); }
        }
        if (pageMods.own.length > 0) {
          const pu = buildPageScope(rootDir, pageMods.own);
          if (pu) clientTag += `<script defer src="/${pu}"></script>\n  `;
        }
        // `defer` keeps the island shell parseable without JS -- the browser
        // builds the full static DOM first, then hydration attaches (order
        // between deferred scripts is preserved).
        const runtimeTag = `<script defer src="/__tw_runtime.js"></script>`;
        html = html.replace("</body>", "  " + clientTag + runtimeTag + "\n</body>");
        needsRuntime = true;
      }

      if (renderMode === "csr") {
        html = csrifyHtml(html);
      } else if (renderMode === "ppr") {
        html = html.replace(/<div data-tw-suspense=/g, '<div data-tw-ppr data-tw-suspense=');
      } else if (renderMode === "signalStream") {
        // Signal Streaming manifest: names + permission kinds of every
        // streamed signal on this route. The client runtime reads it to
        // decide whether to open the /_tw/stream connection.
        const sigs = (result as any).streamedSignals ?? {};
        if (Object.keys(sigs).length > 0) {
          const manifest = JSON.stringify({ v: 1, route: routePath, signals: sigs })
            .replace(/</g, "\\u003c");
          html = html.replace(
            "</body>",
            '  <script id="__TW_SIGNALS__" type="application/json">' + manifest + "</script>\n</body>",
          );
        }
      }
      // Derived signals (any mode): the client runtime recomputes these
      // from other state on boot and after every stream frame.
      {
        const derived = (result as any).derivedSpecs ?? {};
        if (Object.keys(derived).length > 0) {
          const spec = JSON.stringify({ v: 1, derived })
            .replace(/</g, "\\u003c");
          html = html.replace(
            "</body>",
            '  <script id="__TW_DERIVED__" type="application/json">' + spec + "</script>\n</body>",
          );
        }
      }

      // Write to .tw/<route>/index.html -- substituting [param] segments
      // (catch-all segments [...x] / [[...x]] take multi-segment values
      // like rest = "a/b/c"; an empty optional value drops the segment)
      const outRoute = routeName.split("/").map(seg => {
        const caM = /^\[\[?\.\.\.(\w+)\]\]?$/.exec(seg);
        if (caM) {
          const v = paramSet[caM[1]];
          if (v === undefined) return seg;
          return String(v);
        }
        const m = /^\[([^\]]+)\]$/.exec(seg);
        if (m && paramSet[m[1]] !== undefined) return paramSet[m[1]];
        return seg;
      }).filter(seg => seg !== "").join("/");
      const outputDir = outRoute === "" ? outDir : join(outDir, outRoute);
      mkdirSync(outputDir, { recursive: true });
      // html is written after the page loop, once route-split css assets are known
      htmlOutputs.push({ outputDir, html, route: routePath });

      const errors = result.diagnostics.filter((d: any) => d.severity === "error");
      const displayPath = "/" + (routeName.split("/").map(seg => {
        const m = /^\[([^\]]+)\]$/.exec(seg);
        if (m && paramSet[m[1]] !== undefined) return paramSet[m[1]];
        return seg;
      }).join("/")).replace(/\/$/, "") || "/";
      if (errors.length > 0) {
        console.log("  \x1b[33m! " + displayPath + " (" + errors.length + " diagnostics)\x1b[0m");
        for (const d of errors.slice(0, 5)) {
          console.log("      " + d.line + ":" + d.col + "  " + d.message);
        }
        errorCount++;
      } else {
        console.log("  \x1b[32mOK\x1b[0m " + displayPath + " -> " + (outRoute === "" ? ".tw/index.html" : ".tw/" + outRoute + "/index.html"));
      }
      pageCount++;
    } catch (err: any) {
      console.log("  \x1b[31mX " + routePath + ": " + err.message + "\x1b[0m");
      errorCount++;
    }
    }
    (_compilerMod as any).endCssRouteCapture?.();
  }

  end("compile");

  // -- 2. Copy all route.twm files (API routes) -----------------------------
  begin("emit");
  const twmFiles: string[] = [];
  collectFiles(homeDir, "route.twm", twmFiles);

  for (const twmFile of twmFiles) {
    const relativePath = twmFile.replace(homeDir, "").replace(/^\//, "");
    const routeName = relativePath.replace(/\/route\.twm$/, "").replace(/\\/g, "/");
    const outputDir = routeName === "" ? outDir : join(outDir, routeName);
    mkdirSync(outputDir, { recursive: true });
    copyFileSync(twmFile, join(outputDir, "route.twm"));
    console.log("  \x1b[32mOK\x1b[0m /" + routeName + " [api]");
    apiCount++;
  }

  // -- 3. Copy lib/ directory -----------------------------------------------
  if (existsSync(libDir)) {
    copyDir(libDir, join(outDir, "lib"));
    console.log("  \x1b[32mOK\x1b[0m lib/");
  }

  // -- 4. Copy public/ directory --------------------------------------------
  if (existsSync(publicDir)) {
    copyDir(publicDir, outDir);
    console.log("  \x1b[32mOK\x1b[0m public/");
  }

  // -- 5. Copy style.css ----------------------------------------------------
  if (existsSync(stylePath)) {
    copyFileSync(stylePath, join(outDir, "style.css"));
    console.log("  \x1b[32mOK\x1b[0m style.css");
  }

  // -- 5b. TW1007: server-only imports never enter the client graph -----------
  if (tw1007.length > 0) {
    console.log("\n  \x1b[31m\u2717 Build failed \x2014 server-only module in client module\x1b[0m");
    for (const v of tw1007) {
      const rel = v.file.startsWith(rootDir) ? v.file.slice(rootDir.length + 1) : v.file;
      console.log("    TW1007: " + rel + " \u2192 " + v.spec);
      console.log("      Server-only modules (lib/, .twm, @tw/*) cannot be imported from page.tw / layout.tw.");
    }
    process.exit(1);
  }

  // -- 5c. Client-side npm module chunks ---------------------------------------
  if (clientChunkUrls.size > 0) {
    console.log("  \x1b[36m\u26A1\x1b[0m client modules: " + clientChunkUrls.size + " shared chunk" + (clientChunkUrls.size === 1 ? "" : "s") + " (content-hashed, tree-shaken)");
  }

  // -- 6. Copy middleware.twm -----------------------------------------------
  const mwPath = join(rootDir, "middleware.twm");
  if (existsSync(mwPath)) {
    copyFileSync(mwPath, join(outDir, "middleware.twm"));
    console.log("  \x1b[32mOK\x1b[0m middleware.twm");
  }

  // -- 7. CSS assets: route-split, deduped, content-hashed ---------------------
  end("emit");
  begin("css");
  {
    const m = _compilerMod as any;
    const routes: Map<string, string[]> = m.getCapturedCssRoutes ? m.getCapturedCssRoutes() : new Map();
    if (routes.size > 0 && m.computeCssAssets) {
      const chunks = m.getCssChunks();
      const plan = m.computeCssAssets(routes, (id: string) => chunks.get(id));
      // only files some route actually links are written out
      const linkedNames = new Set<string>();
      for (const p of plan.routes.values()) for (const l of p.links) linkedNames.add(l.replace("/assets/", ""));
      if (linkedNames.size > 0) {
        mkdirSync(join(outDir, "assets"), { recursive: true });
        for (const f of plan.files) if (linkedNames.has(f.name)) writeFileSync(join(outDir, "assets", f.name), f.css);
      }
      let inlined = 0;
      for (const out of htmlOutputs) {
        const p = plan.routes.get(out.route);
        let inject = "";
        if (p) {
          if (p.inline !== null) {
            inject = "  <style>\n" + p.inline + "\n  </style>";
            inlined++;
          } else {
            inject = p.links.map((l: string) => `  <link rel="stylesheet" href="${l}">`).join("\n");
          }
        }
        if (inject) out.html = out.html.replace("</head>", inject + "\n</head>");
        writeFileSync(join(out.outputDir, "index.html"), out.html);
      }
      const linked = htmlOutputs.length - inlined;
      console.log("  \x1b[36m\u26a1\x1b[0m styles: " + linkedNames.size + " css file" + (plan.files.length === 1 ? "" : "s") + " (route-split, content-hashed)" + (inlined > 0 ? " + " + inlined + " route" + (inlined === 1 ? "" : "s") + " inlined critical css" : "") + " [" + linked + " page" + (linked === 1 ? "" : "s") + " linked]");
    } else {
      for (const out of htmlOutputs) writeFileSync(join(out.outputDir, "index.html"), out.html);
    }
    m.clearCssCapture?.();
  }
  end("css");
  // -- Summary ---------------------------------------------------------------
  if (needsRuntime) {
    // Bundled CLI (Node) lives at apps/cli/dist; source lives at apps/cli/tw/commands.
const _bundleDir = (globalThis as any).__TW_BUNDLE_DIR;
const _fu = import.meta.url.replace("file://", "");
const _srcDir = _fu.substring(0, _fu.lastIndexOf("/"));
const runtimeSrc = _bundleDir
  ? resolve(_bundleDir, "hydration-runtime.js")
  : resolve(_srcDir, "../../../..", "packages/runtime/tw/client/hydration-runtime.js");
    if (existsSync(runtimeSrc)) {
      copyFileSync(runtimeSrc, join(outDir, "__tw_runtime.js"));
      console.log("  \x1b[36m\u26A1\x1b[0m hydration runtime: .tw/__tw_runtime.js");
    }
  }

  console.log("\n  \x1b[32mBuild complete!\x1b[0m");
  console.log("  Pages: " + pageCount + " compiled");
  console.log("  APIs:  " + apiCount + " routes");
  if (errorCount > 0) {
    console.log("  \x1b[31mErrors: " + errorCount + "\x1b[0m");
  }
  console.log("  Output: " + outDir + "\n");
  if (profile) {
    const report = P.generateReport?.([], [], { hits: 0, misses: 0, hitRate: 0, size: 0, evictions: 0 });
    if (report) console.log(P.formatReport?.(report));
  }
  if (errorCount > 0 || tw1007.length > 0) process.exit(1);
}

function rmDirRecursive(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      rmDirRecursive(fullPath);
    } else {
      try { unlinkSync(fullPath); } catch {}
    }
  }
  try { rmdirSync(dir); } catch {}
}
