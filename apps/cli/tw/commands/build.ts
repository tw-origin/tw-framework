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

import { join, resolve, dirname, extname } from "node:path";
import { createHash } from "node:crypto";
import { parseCacheBody as parseCacheBodyShared, resolveCache as resolveCacheShared, maskSourceStringsAndComments } from "@tw/shared";
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
  // Mask strings + comments first: the words "render ssr" inside a quoted
  // string (docs pages showing examples) must never flip a page's mode.
  const m = /render\s+(static|ssr|island|edge|csr|stream|ppr|signalStream)\b/.exec(
    maskSourceStringsAndComments(src),
  );
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
/**
 * Does this directory entry name a page file?
 *
 * A page is MARKUP, so its extension is `.tw` -- decided by the file type
 * (`getExtensionForType()`), not by configuration. `.twm` is the server-side
 * module extension: API routes and middleware, JS functions rather than markup,
 * so `page.twm` is not a thing.
 */
function matchesPageFile(entry: string, stem: string): boolean {
  return entry === stem || entry === stem + ".tw";
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
    } else if (matchesPageFile(entry, fileName)) {
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

const registeredComponentNames = new Set<string>();

function collectComponentUsages(node: any, out: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (node.type === "Element" && typeof node.tag === "string" && /^[A-Z]/.test(node.tag) && node.tag !== "Suspense") {
    out.add(node.tag);
  }
  const kids: any[] = Array.isArray(node.children) ? node.children : (Array.isArray(node.body) ? node.body : []);
  for (const k of kids) collectComponentUsages(k, out);
  if (Array.isArray(node.body) && Array.isArray(node.children)) {
    for (const k of node.body) collectComponentUsages(k, out);
  }
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
        registeredComponentNames.add(name);
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
    // find the closing quote, skipping escaped characters: a directive
    // value like `description "He said \\"hi\\" loudly"` must not end at
    // the escaped quote (it used to, truncating the value).
    let end = -1;
    for (let j = 0; j < rest.length; j++) {
      if (rest[j] === "\\") { j++; continue; }
      if (rest[j] === '"') { end = j; break; }
    }
    if (end === -1) return null;
    // raw-source extraction: convert brace + quote escapes (HTML escaping
    // stays with the emitter's esc()).
    return rest.slice(0, end).replace(/\\([{}"])/g, "$1");
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

/**
 * Post-build transform pass (docs/plugins.md). Walks the written output and
 * chains the content hooks -- transform:css, transform:js and optimize:asset.
 * A plugin returns the replacement content, or undefined to leave it alone.
 * The whole walk is skipped when no plugin registers any of the three, so a
 * project without plugins pays nothing.
 */
async function transformEmittedFiles(outDir: string, pm: any): Promise<void> {
  if (!pm?.runHookChain || !pm?.hooks?.get) return;
  const has = (h: string) => (pm.hooks.get(h)?.length ?? 0) > 0;
  const js = has("transform:js"), css = has("transform:css"), asset = has("optimize:asset");
  if (!js && !css && !asset) return;

  const walk = async (dir: string): Promise<void> => {
    let entries: any[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      const ext = extname(e.name).toLowerCase();
      const rel = p.slice(outDir.length).replace(/^[\\/]/, "");
      try {
        if (js && (ext === ".js" || ext === ".mjs")) {
          const out = await pm.runHookChain("transform:js", readFileSync(p, "utf-8"), { file: rel });
          if (typeof out === "string") writeFileSync(p, out);
        } else if (css && ext === ".css") {
          const out = await pm.runHookChain("transform:css", readFileSync(p, "utf-8"), { file: rel });
          if (typeof out === "string") writeFileSync(p, out);
        } else if (asset && ![".html", ".json", ".js", ".mjs", ".css"].includes(ext)) {
          const buf = readFileSync(p);
          const out = await pm.runHookChain("optimize:asset", buf, { file: rel });
          if (out && out !== buf) writeFileSync(p, out as any);
        }
      } catch { /* one file never fails the build */ }
    }
  };
  await walk(outDir);
}


// Builtin template components (optImage, RouterLink, Head, Script, ...) are
// resolved by the compiler and never have a components/*.tw file. Derive the
// alias set from the compiler's own specifier list so it cannot drift.
function builtinAliases(): Set<string> {
  const specifiers: string[] = (_compilerMod as any).BUILTIN_COMPONENT_SPECIFIERS ?? [];
  const names = new Set<string>();
  for (const spec of specifiers) {
    const tail = spec.split("/").pop() ?? "";
    if (tail) names.add(tail);
  }
  // spellings users actually write in a template
  for (const n of ["Link", "RouterLink", "Image", "optImage", "Suspense", "Head", "Script", "Form"]) {
    names.add(n);
  }
  return names;
}

/**
 * css.autoprefixer -- add the common vendor prefixes for a small set of
 * properties that still need them. `css.targets` is recorded for tooling; the
 * built-in prefixer always emits this fixed set.
 */
function autoprefixCss(css: string, targets: string[] = []): string {
  // css.targets: -ms-/-moz- variants only matter for older browsers.
  const legacy = targets.length === 0 || targets.some(t => /ie\s*\d|not dead|last [2-9]|> [0-9.]+%/.test(t));
  const NEED: Record<string, string[]> = {
    "user-select": legacy
      ? ["-webkit-user-select", "-moz-user-select", "-ms-user-select"]
      : ["-webkit-user-select"],
    "appearance": legacy ? ["-webkit-appearance", "-moz-appearance"] : ["-webkit-appearance"],
    "backdrop-filter": ["-webkit-backdrop-filter"],
  };
  const out: string[] = [];
  for (const line of css.split("\n")) {
    const m = /^(\s*)([a-z-]+)\s*:\s*(.+?);?\s*$/.exec(line);
    if (m) {
      const [, indent, prop, val] = m;
      if (prop === "position" && val.trim() === "sticky") out.push(indent + "-webkit-position: sticky;");
      const pf = NEED[prop];
      if (pf) for (const p of pf) out.push(indent + p + ": " + val + ";");
    }
    out.push(line);
  }
  return out.join("\n");
}

export async function buildCommand(): Promise<void> {
  const rootDir = process.cwd();
  // --profile: emit a stage-by-stage timing report (docs/build-profiler.md)
  const profile = process.argv.slice(2).includes("--profile");
  const P = _compilerMod as any;
  const begin = (n: string, files = 0) => { if (profile) P.startStage?.(n, files); };
  const end = (n: string) => { if (profile) P.endStage?.(n); };
  let needsRuntime = false;
  // build.incremental -- a page-level build cache. A page whose own source and
  // layout chain are unchanged (and whose output exists) is not recompiled.
  let skippedPages = 0;
  let incCache: Record<string, string> = {};
  const incNext: Record<string, string> = {};
  const incHash = (t: string): string => createHash("sha256").update(t).digest("hex").slice(0, 16);
  const homeDir = join(rootDir, "home");
  let outDir = join(rootDir, ".tw");
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
  // cacheLife profiles (docs/cache-tags.md) -- assigned when tw.config.ts loads
  let cacheProfiles: Record<string, any> = {};
  // Strategy layer: the signal transport is baked into each streamed page's
  // __TW_SIGNALS__ manifest so the client runtime knows which transport to
  // open (sse | ws | long-poll). CLI flag wins over config, config over default.
  let signalTransport: "sse" | "ws" | "long-poll" = "sse";
  // strategies.hydration.mode -- "none" ships zero client JS for static pages.
  let hydrationMode: "auto" | "full" | "islands" | "none" = "auto";
  // strategies.css.engine -- "tailwind" runs the project's Tailwind at build
  // time and merges its output into the global stylesheet.
  let cssEngine: "tss" | "tailwind" | "css" | "scss" = "tss";
  // strategies.api.runtime -- "node" (default) allows every Node/Bun API;
  // "edge" restricts .twm handlers to the portable surface (no fs, no native).
  let apiRuntime: "node" | "edge" = "node";
  // strategies.state.model -- signals (default) | hooks | store.
  let stateModel: "signals" | "hooks" | "store" = "signals";
  let dataLayer = "routes";
  let cacheMode: "isr" | "swr" | "none" | "cdn" = "isr";
  let authModel = "session";
  // strategies.render.engine -- tw-vdom (default) is built in. react/preact
  // are optional: when selected and missing the build offers to install them
  // (interactive) or fails with a clear message (CI).
  let renderEngine = "tw-vdom";
  // build.* -- these were written by the scaffold and read by nothing, so
  // `build.minify: false` silently still minified. Captured here so the
  // options mean what they say. Defaults match today's behaviour.
  // Only the two that can apply to a client chunk. `splitting` cannot -- the
  // chunks are IIFE, and esbuild's splitting needs ESM -- and `target` is the
  // runtime, which lives at strategies.runtime.server.
  let cfgMinify = true;
  let cfgSourcemap = true;
  // The resolved build / compiler / css groups. resolve*Options fills every
  // field with the framework default, so an unset field keeps today's
  // behaviour and a set field actually reaches the build.
  let buildOpts: any = null;
  let compilerOpts: any = null;
  let cssOpts: any = null;
  // build.* -> the esbuild flags every client chunk honours.
  const chunkFlags = (): any => buildOpts
    ? {
        minify: buildOpts.minify,
        sourcemap: buildOpts.sourcemap,
        format: buildOpts.format,
        treeshake: buildOpts.treeshake,
        splitting: buildOpts.splitting || buildOpts.codeSplitting,
        define: buildOpts.define,
        externals: buildOpts.externals,
        inject: buildOpts.inject,
        chunkNames: buildOpts.chunkNames,
        assetNames: buildOpts.assetNames,
        loaders: buildOpts.loaders,
      }
    : { minify: cfgMinify, sourcemap: cfgSourcemap };
  // build.publicPath -- prefix for emitted asset/chunk URLs.
  const withPublicPath = (u: string): string => {
    const base = buildOpts?.publicPath ?? "/";
    return (base.endsWith("/") ? base : base + "/") + u.replace(/^\/+/, "");
  };
  // build.assetsDir -- where emitted css/assets land (default "assets").
  const assetsDirName = (): string => buildOpts?.assetsDir ?? "assets";
  // compiler.* -> the compile passes. `optimization` maps to optimize
  // (none = off); the rest pass straight through to the compiler so each
  // fine-grained field reaches the pass it names.
  const compilePassOpts = (): any =>
    compilerOpts
      ? {
          optimize: compilerOpts.optimization !== "none",
          incremental: compilerOpts.incremental,
          compiler: {
            hoistDirectives: compilerOpts.hoistDirectives,
            ssrAttributes: compilerOpts.ssrAttributes,
            foldConstants: compilerOpts.foldConstants,
            deadCode: compilerOpts.deadCode,
            treeShaking: compilerOpts.treeShaking,
            removeEmptyBlocks: compilerOpts.removeEmptyBlocks,
            // css.modules: false also turns off `.module.tss` scoping.
            scopedStyles: (compilerOpts.scopedStyles === false || cssOpts?.modules === false) ? false : compilerOpts.scopedStyles,
            cssPrefix: cssOpts?.prefix,
            cssImportPaths: cssOpts?.importPaths,
            inlineComponents: compilerOpts.inlineComponents,
            sourceMaps: compilerOpts.sourceMaps,
            cacheSize: compilerOpts.cacheSize,
            minifyHTML: compilerOpts.minifyHTML,
            minifyCSS: compilerOpts.minifyCSS,
            minifyJS: compilerOpts.minifyJS,
            preserveComments: compilerOpts.preserveComments,
            looseDiagnostics: compilerOpts.strict === false,
          },
        }
      : {};
  // Plugins (docs/plugins.md): load from plugins/ per tw.config.ts and fire the
  // build hooks. A broken plugin never fails the build -- the loader isolates it.
  let pluginManager: any = null;
  const runBuildHook = async (name: string, ctx: any = {}): Promise<void> => {
    if (!pluginManager) return;
    try { await pluginManager.runHook?.(name, ctx); } catch { /* isolated */ }
  };
  // Value-chaining hook: the plugin receives the content and may return a
  // replacement. Used by transform:html (docs/plugins.md).
  const runBuildHookValue = async <T>(name: string, value: T, ctx: any = {}): Promise<T> => {
    if (!pluginManager?.runHookChain) return value;
    try { return await pluginManager.runHookChain(name, value, ctx); } catch { return value; }
  };

  try {
    const cfgPath = join(rootDir, "tw.config.ts");
    if (existsSync(cfgPath)) {
      const { twImportTs } = await import("@tw/shared/tw/node-import");
      const cfgMod: any = await twImportTs(cfgPath);
      const cfg = cfgMod.default ?? cfgMod;
      // Plugins load here so the config is already resolved when setup() runs.
      try {
        const { loadPlugins } = await import("@tw/plugins");
        pluginManager = await loadPlugins(rootDir, cfg);
        await runBuildHook("config:resolve", { config: cfg, rootDir });
      } catch { /* plugins are optional */ }
      (_compilerMod as any).setBuiltinImageConfig?.((cfg as any)?.images);
      // cacheLife profiles (docs/cache-tags.md): user profiles resolve at
      // BUILD time into absolute seconds in routes.json.
      cacheProfiles = (cfg as any)?.cache?.profiles ?? {};
      const b = (cfg as any)?.build ?? {};
      if (typeof b.minify === "boolean") cfgMinify = b.minify;
      if (typeof b.sourcemap === "boolean") cfgSourcemap = b.sourcemap;
      // build.* / compiler.* / css.* -- resolved centrally so every field in
      // those groups actually reaches the build.
      try {
        const { resolveBuildOptions, resolveCompilerOptions, resolveCssOptions } = await import("@tw/shared");
        buildOpts = resolveBuildOptions(cfg);
        compilerOpts = resolveCompilerOptions(cfg);
        cssOpts = resolveCssOptions(cfg);
        cfgMinify = buildOpts.minify;
        cfgSourcemap = buildOpts.sourcemap !== false;
        cssEngine = cssOpts.engine as any;
      } catch { /* keep bare defaults */ }

      // build.* that shape the OUTPUT rather than one chunk.
      if (buildOpts) {
        outDir = join(rootDir, buildOpts.outputDir);
        if (buildOpts.incremental) {
          try { incCache = JSON.parse(readFileSync(join(outDir, ".build-cache.json"), "utf-8")); } catch { incCache = {}; }
        }
        try {
          const { setClientOutputRoot } = await import("./client-bundle");
          setClientOutputRoot(buildOpts.outputDir);
        } catch { /* default .tw */ }
      }

      // strategies.signals.transport (validated values only)
      const t = (cfg as any)?.strategies?.signals?.transport;
      if (t === "sse" || t === "ws" || t === "long-poll") signalTransport = t;
      const h = (cfg as any)?.strategies?.hydration?.mode;
      if (h === "auto" || h === "full" || h === "islands" || h === "none") hydrationMode = h;
      const ce = (cfg as any)?.strategies?.css?.engine;
      if (ce === "tss" || ce === "tailwind" || ce === "css" || ce === "scss") cssEngine = ce;
      const ar = (cfg as any)?.strategies?.api?.runtime;
      if (ar === "node" || ar === "edge") apiRuntime = ar;
      const sm = (cfg as any)?.strategies?.state?.model;
      if (sm === "signals" || sm === "hooks" || sm === "store") stateModel = sm;
      const dl = (cfg as any)?.strategies?.data?.layer;
      if (dl === "routes" || dl === "graphql" || dl === "trpc") dataLayer = dl;
      const cm = (cfg as any)?.strategies?.cache?.mode;
      if (cm === "isr" || cm === "swr" || cm === "none" || cm === "cdn") cacheMode = cm;
      const am = (cfg as any)?.strategies?.auth?.model;
      if (am === "session" || am === "jwt" || am === "oauth") authModel = am;
      const re = (cfg as any)?.strategies?.render?.engine;
      if (re === "tw-vdom" || re === "react" || re === "preact" || re === "none") renderEngine = re;
    }
  } catch { /* defaults */ }

  // CLI flag overrides config: --signals=ws / --transport=long-poll
  {
    const { parseStrategyFlags, resolveStrategies, validateStrategies } = await import("@tw/shared");
    const fromFlags: any = parseStrategyFlags(process.argv.slice(2));
    if (Object.keys(fromFlags).length > 0) {
      const bad = validateStrategies(fromFlags);
      for (const issue of bad) console.warn("  ! " + issue.message);
      const r = resolveStrategies({ signals: fromFlags.signals, hydration: fromFlags.hydration } as any);
      if (r.signals.transport) signalTransport = r.signals.transport as any;
      if ((fromFlags as any).hydration?.mode) hydrationMode = (fromFlags as any).hydration.mode;
      const fe = (fromFlags as any).css?.engine;
      if (fe === "tss" || fe === "tailwind" || fe === "css" || fe === "scss") cssEngine = fe;
      const far = (fromFlags as any).api?.runtime;
      if (far === "node" || far === "edge") apiRuntime = far;
      const fsm = (fromFlags as any).state?.model;
      if (fsm === "signals" || fsm === "hooks" || fsm === "store") stateModel = fsm;
      const fdl = (fromFlags as any).data?.layer;
      if (fdl === "routes" || fdl === "graphql" || fdl === "trpc") dataLayer = fdl;
      const fcm = (fromFlags as any).cache?.mode;
      if (fcm === "isr" || fcm === "swr" || fcm === "none" || fcm === "cdn") cacheMode = fcm;
      const fre = (fromFlags as any).render?.engine;
      if (fre === "tw-vdom" || fre === "react" || fre === "preact" || fre === "none") renderEngine = fre;
    }
  }

  // Render engine: TW's VDOM is built in. React/Preact are optional -- if the
  // engine is selected but not installed, offer to install it (interactive)
  // or stop with a clear message (CI).
  if (renderEngine === "react" || renderEngine === "preact") {
    const { ensureRenderEngine } = await import("@tw/shared");
    const res = await ensureRenderEngine(rootDir, renderEngine);
    if (!res.ok) {
      console.log("\n  \x1b[31m\u2717 Build failed \u2014 render.engine=" + renderEngine + "\x1b[0m");
      console.log("    " + (res.message ?? "render engine not available"));
      process.exit(3);
    }
    if (res.installed) console.log("  \x1b[32mOK\x1b[0m " + renderEngine + " installed");
  }

  // Foreign components (React/Preact .tsx / .jsx): render each to HTML at
  // build time and register the renderer, so the compiler emits an island.
  //
  // The engine is read from each component's OWN imports, so one project can mix
  // React and Preact; `render.engine` is the fallback for a component that
  // imports neither. Each component's `@client:*` directive decides when it
  // hydrates -- `@server` ships no JavaScript at all.
  if (renderEngine === "react" || renderEngine === "preact") {
    const ib: any = await import("./island-bundle.ts");
    // Start from a clean slate: the intermediate module directory grows by one
    // file per edit, and a build regenerates everything it needs anyway.
    ib.pruneIslandCache(rootDir);
    const foreign = ib.scanForeignImports(rootDir, ib.collectTwFiles(rootDir));
    if (foreign.length > 0) {
      const plan = foreign.map((fi: any) => {
        let src = "";
        try { src = readFileSync(fi.absPath, "utf-8"); } catch { /* fall back to the configured engine */ }
        return { fi, engine: ib.detectEngine(src, renderEngine), ...ib.parseClientStrategy(src) };
      });

      // Any engine a component pulled in on its own must be installed too.
      const { ensureRenderEngine } = await import("@tw/shared");
      const extra = [...new Set(plan.map((p: any) => p.engine))].filter((e: any) => e !== renderEngine);
      for (const engine of extra) {
        const res = await ensureRenderEngine(rootDir, engine as string);
        if (!res.ok) {
          console.log("\n  \x1b[31m\u2717 Build failed \u2014 render.engine=" + engine + "\x1b[0m");
          console.log("    " + (res.message ?? "render engine not available"));
          process.exit(3);
        }
        if (res.installed) console.log("  \x1b[32mOK\x1b[0m " + engine + " installed");
      }

      const reg = (_compilerMod as any).registerForeignComponent;
      for (const p of plan) {
        try {
          const render = await ib.loadSsrRenderer(rootDir, p.fi.absPath, p.engine);
          const url = p.kind === "server"
            ? null
            : ib.buildIslandChunk(rootDir, p.fi.absPath, p.fi.name, true, p.engine, p.strategy);
          reg(p.fi.name, p.fi.specifier, { engine: p.engine, source: p.fi.absPath, chunkUrl: url ? "/" + url : undefined, strategy: p.kind === "server" ? undefined : p.strategy, render });
          const how = p.kind === "server" ? "server" : p.strategy;
          console.log("  \x1b[36m\u26A1\x1b[0m island: " + p.fi.name + " (" + p.engine + ", " + how + ")");
        } catch (err: any) {
          console.log("\n  \x1b[31m\u2717 Build failed \u2014 island " + p.fi.name + "\x1b[0m");
          console.log("    " + (err?.message ?? String(err)));
          process.exit(1);
        }
      }
    }
  }

  // Tailwind engine: generate the stylesheet from the project's own classes
  // and merge it into the global CSS every page already inlines.
  if (cssEngine === "tailwind") {
    const m = _compilerMod as any;
    if (typeof m.runTailwind === "function") {
      const globs = [
        join(rootDir, "home") + "/**/*.tw",
        join(rootDir, "components") + "/**/*.tw",
        join(rootDir, "layouts") + "/**/*.tw",
      ];
      try {
        const twCss = m.runTailwind({ rootDir, content: globs, extraArgs: ["--minify"] });
        if (twCss) {
          css = (css ? css + "\n" : "") + twCss;
          console.log("  \x1b[32mOK\x1b[0m tailwind (" + twCss.length + " bytes)");
        }
      } catch (err: any) {
        console.log("\n  \x1b[31m\u2717 Build failed \u2014 css.engine=tailwind\x1b[0m");
        console.log("    " + (err?.message ?? String(err)));
        process.exit(3);
      }
    }
  }

  // css.* -- variables, autoprefixer and minify on the global stylesheet.
  if (cssOpts) {
    if (cssOpts.variables && Object.keys(cssOpts.variables).length > 0) {
      const decls = Object.entries(cssOpts.variables)
        .map(([k, v]) => "  " + (k.startsWith("--") ? k : "--" + k) + ": " + v + ";")
        .join("\n");
      css = ":root {\n" + decls + "\n}\n" + css;
    }
    if (cssOpts.autoprefixer) css = autoprefixCss(css, cssOpts.targets);
    if (cssOpts.minify) {
      const m = _compilerMod as any;
      if (typeof m.minifyCSS === "function") { try { css = m.minifyCSS(css); } catch { /* keep */ } }
    }
  }

  // Optional data layers and the oauth auth model need their packages; offer
  // to install them, or stop with a clear message (CI).
  {
    const { describeDataLayer, describeAuthModel, ensurePackages } = await import("@tw/shared");
    const dl = describeDataLayer(dataLayer, rootDir);
    if (!dl.available) {
      const r = await ensurePackages(rootDir, dl.packages, `data.layer=${dl.layer}`);
      if (!r.ok) { console.log("\n  \x1b[31m\u2717 Build failed \u2014 data.layer=" + dl.layer + "\x1b[0m"); console.log("    " + r.message); process.exit(3); }
    }
    const am = describeAuthModel(authModel, rootDir);
    if (!am.available) {
      const r = await ensurePackages(rootDir, am.packages, `auth.model=${am.model}`);
      if (!r.ok) { console.log("\n  \x1b[31m\u2717 Build failed \u2014 auth.model=" + am.model + "\x1b[0m"); console.log("    " + r.message); process.exit(3); }
    }
  }

  // State model "hooks" needs a React-compatible renderer: the hooks live in
  // the component runtime. Fail here with the fix rather than at run time.
  if (stateModel === "hooks" && renderEngine !== "react" && renderEngine !== "preact") {
    console.log("\n  \x1b[31m\u2717 Build failed \u2014 state.model=hooks\x1b[0m");
    console.log("    state.model=hooks needs render.engine=\"react\" or \"preact\" (currently " + renderEngine + ").");
    console.log("    Set strategies.render.engine, or use state.model=\"signals\".");
    process.exit(2);
  }

  // API runtime "edge": a V8 isolate cannot reach the filesystem, native
  // modules or child processes. Check every .twm BEFORE shipping, so a deploy
  // fails here with a fix rather than at run time.
  if (apiRuntime === "edge") {
    const { checkEdgeSafety } = await import("@tw/shared");
    const apiFiles: string[] = [];
    collectFiles(homeDir, "route.twm", apiFiles);
    const violations: any[] = [];
    for (const f of apiFiles) {
      try { violations.push(...checkEdgeSafety(readFileSync(f, "utf-8"), f)); } catch { /* unreadable */ }
    }
    if (violations.length > 0) {
      console.log("\n  \x1b[31m\u2717 Build failed \u2014 api.runtime=edge\x1b[0m");
      for (const v of violations) {
        const rel = v.file.startsWith(rootDir) ? v.file.slice(rootDir.length + 1) : v.file;
        console.log("    " + rel + ":" + v.line + "  " + v.what);
      }
      console.log("    Edge isolates have no filesystem, native modules or child processes.");
      console.log("    Move this work behind a service, or set strategies.api.runtime=\"node\".");
      process.exit(2);
    }
  }

  let pageCount = 0;
  // Minor (v1.0.8): request-time-rendered pages were invisible in the
  // summary -- "Pages: 1" while the site had many SSR routes looked broken.
  let requestRenderedCount = 0;
  let apiCount = 0;
  let errorCount = 0;
  const isrRoutes = new Map<string, number | Record<string, any>>();

  // -- 1. Compile all page.tw files to HTML --------------------------------
  const pageFiles: string[] = [];
  collectFiles(homeDir, "page", pageFiles);
  // page.tw + index.tw in one directory resolve
  // to the same route with index.tw winning at runtime -- and the build
  // said nothing. Warn loudly instead.
  for (const pf of pageFiles) {
    if (existsSync(join(dirname(pf), "index.tw"))) {
      console.log("  \x1b[33m!\x1b[0m " + dirname(pf).replace(homeDir, "").replace(/^\//, "") + "/ has BOTH page.tw and index.tw");
      console.log("      index.tw wins this route -- delete one of them");
    }
  }
  begin("compile", pageFiles.length);
  // Plugins see the discovered routes before any compilation happens.
  await runBuildHook("pages:discover", { pages: pageFiles, rootDir });
  await runBuildHook("before:build", { pages: pageFiles, rootDir, outDir });
  const htmlOutputs: Array<{ outputDir: string; html: string; route: string }> = [];
  (_compilerMod as any).clearCssCapture?.();

  for (const pageFile of pageFiles) {
    let relativePath = pageFile.replace(homeDir, "").replace(/^\//, "");
    // Route groups (marketing)/ are NOT part of the URL
    relativePath = relativePath
      .split("/")
      .filter(seg => !/^\(.*\)$/.test(seg))
      .join("/");
    // Strip the page file name for the route. This matched the literal
    // `page.tw`, so a `page.twm` page (allowed by router.pageExtensions) leaked
    // its extension into the URL: /d/page.twm instead of /d.
    const routeName = relativePath.replace(/\/?page(?:\.tw)?$/, "").replace(/\\/g, "/");
    const routePath = routeName === "" ? "/" : "/" + routeName;

    // build.incremental: reuse an unchanged page's previous output.
    if (buildOpts?.incremental) {
      const deps = [pageFile, ...findLayoutChain(dirname(pageFile), homeDir)];
      let raw = "";
      for (const d of deps) { try { raw += d + "\u0000" + readFileSync(d, "utf-8"); } catch { /* skip */ } }
      const h = incHash(raw);
      incNext[pageFile] = h;
      const outHtml = join(outDir, routeName, "index.html");
      if (incCache[pageFile] === h && existsSync(outHtml)) { skippedPages++; continue; }
    }

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
            if (Array.isArray(arr) && arr.length > 0) {
              // the DOCS form returns plain values
              // (`return ["one", "two", "three"]` next to a [item]/page.tw).
              // Object.entries() on a string produced garbage ({0:"o",...})
              // so every variant wrote the same literal [item] output path
              // with empty interpolation. Map plain values to the route's
              // dynamic segment; object entries map as before.
              const dynNames = pageFile
                .split("/")
                .map((seg: string) => /^\[([^\]]+)\]$/.exec(seg)?.[1])
                .filter(Boolean) as string[];
              paramSets = arr.map((x: any) => {
                if (x !== null && typeof x !== "object") {
                  const o: Record<string, string> = {};
                  const key = dynNames[0] ?? "slug";
                  o[key] = String(x);
                  return o;
                }
                const o: Record<string, string> = {};
                for (const [k, v] of Object.entries(x)) o[k] = String(v);
                return o;
              });
            }
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
    // ISR manifest: record `revalidate N` windows (docs/isr.md) so serve can
    // route these through the render pipeline instead of frozen static HTML.
    {
      // Cache manifest (docs/cache-tags.md): a `cache { }` directive
      // resolves against tw.config.ts profiles into absolute seconds;
      // the legacy `revalidate N` form stays a bare number (v1.0.5 shape).
      const pageSrc = readFileSync(pageFile, "utf-8");
      const { extractCacheDirective, resolveCache } = await import("@tw/shared");
      const cacheMeta = extractCacheDirective(pageSrc);
      let resolved: any = null;
      if (cacheMeta) {
        try {
          resolved = resolveCache(cacheMeta, cacheProfiles);
        } catch (e: any) {
          console.error("  \x1b[31m\u2717\x1b[0m " + e.message + " (" + pageFile + ")");
          errorCount++;
        }
      }
      const revM = resolved ? null : /page\s*\{[^}]*revalidate\s+(\d+)/.exec(maskSourceStringsAndComments(pageSrc));
      if (resolved || revM) {
        for (const ps of paramSets) {
          const rp = routePath.split("/").map(seg => {
            const m = /^\[([^\]]+)\]$/.exec(seg);
            return m && ps[m[1]] !== undefined ? String(ps[m[1]]) : seg;
          }).join("/");
          const isrPath = ("/" + rp).replace(/\/+$/, "").replace(/^\/+/, "/");
          const entry = resolved
            ? {
              revalidate: resolved.revalidate,
              stale: resolved.stale,
              // JSON has no Infinity -- the legacy infinite-SWR form only
              // arises from the bare-number path, so clamp explicit blocks.
              expire: Number.isFinite(resolved.expire) ? resolved.expire : resolved.revalidate,
              ...(resolved.tag ? { tag: resolved.tag } : {}),
            }
            : Number(revM![1]);
          isrRoutes.set(isrPath === "" ? "/" : isrPath, entry);
        }
      }
    }
    // A params.twm beside a dynamic route switches it to STATIC generation
    // at build time (docs/dynamic-routes.md) -- even for `render ssr` pages,
    // the enumerated param sets are prebuilt like static ones.
    const hasExplicitParams = paramSets.length > 1 || Object.keys(paramSets[0] ?? {}).length > 0;
    if ((renderMode === "ssr" || renderMode === "stream") && !hasExplicitParams) {
      requestRenderedCount++;
      console.log("  \x1b[36m~\x1b[0m " + routePath + " [" + renderMode + ": rendered at request time]");
      try {
        const src = readFileSync(pageFile, "utf-8");
        const r = _compileSync(src, { filePath: pageFile, ...compilePassOpts() });
        const errs = (r.diagnostics || []).filter((d: any) => d.severity === "error");
        if (errs.length > 0) {
          console.log("  \x1b[33m! " + routePath + " (" + errs.length + " diagnostics)\x1b[0m");
          for (const d of errs.slice(0, 5)) console.log("      " + d.line + ":" + d.col + "  " + d.message);
          errorCount++;
        }
        // SSR pages print warnings too, not just
        // the static-compile path.
        const warns = (r.diagnostics || []).filter((d: any) => d.severity !== "error");
        if (warns.length > 0) {
          console.log("      \x1b[33m" + warns.length + " warning" + (warns.length === 1 ? "" : "s") + "\x1b[0m");
          for (const d of warns.slice(0, 3)) {
            console.log("        " + d.line + ":" + d.col + "  " + d.code + "  " + d.message);
          }
          if (warns.length > 3) console.log("        ... " + (warns.length - 3) + " more (tw check)");
        }
        // SSR pages skipped the unknown-component check the
        // static path had -- a missing component only failed for static pages.
        {
          const used = new Set<string>();
          collectComponentUsages(r.ast, used);
          const BUILTIN_ALIASES = builtinAliases();
          const unknownSsr = [...used].filter(t => !BUILTIN_ALIASES.has(t) && !registeredComponentNames.has(t) && !(_compilerMod as any).resolveForeignComponent?.(t));
          if (unknownSsr.length > 0) {
            const importSpecs = new Map<string, string>();
            for (const im of src.matchAll(/import\s+([A-Za-z_]\w*)\s+from\s+["']([^"']+)["']/g)) {
              importSpecs.set(im[1], im[2]);
            }
            const hints = unknownSsr.map(t =>
              importSpecs.has(t)
                ? `<${t}> (imported from ${importSpecs.get(t)} -- file not found)`
                : `<${t}> (no components/${t}.tw found)`);
            console.log("  \x1b[31m✗ " + routePath + ": unknown component" + (unknownSsr.length > 1 ? "s" : "") + " " + hints.join(", ") + "\x1b[0m");
            errorCount++;
          }
        }
      } catch (e: any) {
        console.log("  \x1b[33m! " + routePath + ": " + (e && e.message ? e.message : e) + "\x1b[0m");
        errorCount++;
      }
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
      const result = _compileSync(source, { filePath: pageFile, stateVars: scopeVars, ...compilePassOpts() } as any);
      {
        const used = new Set<string>();
        collectComponentUsages(result.ast, used);
        const BUILTIN_ALIASES = builtinAliases();
        const unknown = [...used].filter(t => !BUILTIN_ALIASES.has(t) && !registeredComponentNames.has(t) && !(_compilerMod as any).resolveForeignComponent?.(t));
        if (unknown.length > 0) {
          // for explicitly-imported components the
          // old message pointed at the CONVENTION path (components/<Name>.tw)
          // even though the import named a different file. Show the actual
          // import path when there is one.
          const importSpecs = new Map<string, string>();
          for (const im of source.matchAll(/import\s+([A-Za-z_]\w*)\s+from\s+["']([^"']+)["']/g)) {
            importSpecs.set(im[1], im[2]);
          }
          const hints = unknown.map(t =>
            importSpecs.has(t)
              ? `<${t}> (imported from ${importSpecs.get(t)} -- file not found)`
              : `<${t}> (no components/${t}.tw found)`);
          console.error("  \x1b[31m\u2717 " + pageFile.replace(rootDir + "/", "") + ": unknown component" + (unknown.length > 1 ? "s" : "") + " " + hints.join(", ") + " -- create the file or fix the import\x1b[0m");
          process.exit(1);
        }
      }
      let html = result.html;

      // Apply the FULL layout chain (root layout first, then section layouts)
      const layoutChain = findLayoutChain(dirname(pageFile), homeDir);
      if (layoutChain.length > 0) {
        const layoutPrograms = layoutChain.map(lp => {
          const ls = readFileSync(lp, "utf-8");
          const lr = _compileSync(ls, { filePath: lp, ...compilePassOpts() });
          return lr.ast;
        }).filter(Boolean);
        if (layoutPrograms.length > 0 && _generateWithLayoutChain) {
          html = _generateWithLayoutChain(layoutPrograms, result.ast, scopeVars);
          // Page title wins over the layout title.
          const pageTitle = result.html.match(/<title>([^<]*)<\/title>/);
          if (pageTitle && pageTitle[1]) {
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
            // head.tw compiles with transforms off (no interpolation), so
            // the documented \{ / \} brace escapes are NOT processed --
            // unescape them here like an in-page head { } block.
            html = html.replace(
              "</head>",
              "  " + headBody[1].trim().replace(/\\([{}])/g, "$1") + "\n</head>",
            );
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
          const u = buildClientChunk(rootDir, l, chunkFlags());
          if (u) { clientTag += `<script defer src="${withPublicPath(u)}"></script>\n  `; clientChunkUrls.add(u); }
          else {
            // A failed client chunk means the page's imports are undefined
            // at runtime -- every handler using them breaks. Never green.
            console.error(`  \x1b[31mERROR\x1b[0m ${pageFile.replace(homeDir, "").replace(/^\//, "")}: client chunk failed for ${l}`);
            errorCount++;
          }
        }
        if (pageMods.own.length > 0) {
          const pu = buildPageScope(rootDir, pageMods.own);
          if (pu) clientTag += `<script defer src="/${pu}"></script>\n  `;
        }
        // Zero-JS static pages the runtime used to ship on
        // EVERY page, breaking the "static pages ship 0 bytes of JavaScript"
        // promise (~21KB per page, even for plain /about). Only pages that
        // actually need the client ship it: interactive markers, client
        // imports, or CSR/PPR/stream/signalStream modes.
        // `defer` keeps the island shell parseable without JS -- the browser
        // builds the full static DOM first, then hydration attaches (order
        // between deferred scripts is preserved).
        const needsClient = interactive
          || pageMods.deps.length > 0
          || pageMods.own.length > 0
          || renderMode === "csr" || renderMode === "ppr"
          || renderMode === "stream" || renderMode === "signalStream";
        // strategies.hydration.mode overrides the per-page decision:
        //   none    -> zero client JS,   islands -> only island-marked pages,
        //   full    -> always hydrate interactive pages,  auto -> heuristic.
        let shipClient = needsClient;
        if (hydrationMode === "none") shipClient = false;
        else if (hydrationMode === "islands") {
          // island pages only (data-tw-i is an interpolation, not an island)
          shipClient = renderMode === "island" || /data-tw-island/.test(html);
        }
        else if (hydrationMode === "full") shipClient = needsClient || /data-tw-s=|data-tw-state/.test(html);
        if (shipClient) {
          const runtimeTag = `<script defer src="/__tw_runtime.js"></script>`;
          html = html.replace("</body>", "  " + clientTag + runtimeTag + "\n</body>");
          needsRuntime = true;
        }
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
          const manifest = JSON.stringify({ v: 1, route: routePath, transport: signalTransport, signals: sigs })
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
      // warnings were collected but never shown --
      // `tw check` flags <ul2> while `tw build` printed nothing. Surface
      // them (capped) so both surfaces agree.
      const warnings = result.diagnostics.filter((d: any) => d.severity !== "error");
      if (warnings.length > 0) {
        console.log("      \x1b[33m" + warnings.length + " warning" + (warnings.length === 1 ? "" : "s") + "\x1b[0m");
        for (const d of warnings.slice(0, 3)) {
          console.log("        " + d.line + ":" + d.col + "  " + d.code + "  " + d.message);
        }
        if (warnings.length > 3) console.log("        ... " + (warnings.length - 3) + " more (tw check)");
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
    // a syntax-broken.twm used to pass the build
    // ("OK /api/broken [api]") and only fail at runtime with a misleading
    // 405. Validate the file's syntax now -- failure = build error.
    const { validateTWMSyntax } = await import("../../../../packages/server/tw/routing/twm-loader.ts");
    const syntaxError = validateTWMSyntax(twmFile);
    if (syntaxError) {
      console.log("  \x1b[31mX\x1b[0m /" + routeName + " [api] -- .twm syntax error");
      console.log("      " + twmFile.replace(rootDir + "/", "") + ": " + syntaxError);
      errorCount++;
    } else {
      console.log("  \x1b[32mOK\x1b[0m /" + routeName + " [api]");
      apiCount++;
    }
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

  // Cache mode "cdn": hand caching to the CDN and write the purge manifest the
  // deploy can use to invalidate routes by path or tag.
  if (cacheMode === "cdn") {
    const { purgeManifest } = await import("@tw/shared");
    const routes: Array<{ path: string; tags: string[] }> = [];
    for (const out of htmlOutputs) { const rp = String(out.route ?? ""); routes.push({ path: rp.startsWith("/") ? rp : "/" + rp, tags: [] }); }
    const manifest = purgeManifest(routes);
    if (manifest) {
      writeFileSync(join(outDir, "cdn-purge.json"), JSON.stringify(manifest, null, 2));
      console.log("  \x1b[36m\u26A1\x1b[0m cdn: purge manifest for " + routes.length + " route" + (routes.length === 1 ? "" : "s"));
    }
  }

  // -- 6b. Islands: hydrate chunks for foreign components ----------------------
  {
    const urls = new Set<string>();
    let deferred = 0;
    for (const out of htmlOutputs) {
      for (const m of out.html.matchAll(/data-tw-src="([^"]+)"/g)) urls.add(m[1]);
      for (const _ of out.html.matchAll(/data-tw-defer-src="[^"]+"/g)) deferred++;
    }
    if (urls.size > 0) {
      const tags = [...urls].map((u) => '<script defer src="' + u + '"></script>').join("\n");
      for (const out of htmlOutputs) {
        if (out.html.includes("</body>")) out.html = out.html.replace("</body>", tags + "\n</body>");
        else out.html += tags;
      }
      console.log("  \x1b[36m\u26A1\x1b[0m islands: " + urls.size + " hydrate chunk" + (urls.size === 1 ? "" : "s"));
    }
    // @client:visible islands get no script tag. A loader fetches each chunk
    // when that island scrolls into view, so the bytes are never downloaded for
    // a part of the page the visitor does not reach.
    if (deferred > 0) {
      const loader = '<script>(function(){' +
        'var n=document.querySelectorAll("tw-island[data-tw-defer-src]");if(!n.length)return;' +
        'function go(el){var u=el.getAttribute("data-tw-defer-src");if(!u||el.__twLoaded)return;el.__twLoaded=1;' +
        'var s=document.createElement("script");s.src=u;document.head.appendChild(s);}' +
        'if(!("IntersectionObserver" in window)){for(var i=0;i<n.length;i++)go(n[i]);return;}' +
        'var io=new IntersectionObserver(function(es){for(var i=0;i<es.length;i++){if(es[i].isIntersecting){go(es[i].target);io.unobserve(es[i].target);}}});' +
        'for(var i=0;i<n.length;i++)io.observe(n[i]);})();</script>';
      for (const out of htmlOutputs) {
        if (!out.html.includes("data-tw-defer-src")) continue;
        if (out.html.includes("</body>")) out.html = out.html.replace("</body>", loader + "\n</body>");
        else out.html += loader;
      }
      console.log("  \x1b[36m\u26A1\x1b[0m islands: " + deferred + " deferred until visible");
    }
  }

  // -- 7. CSS assets: route-split, deduped, content-hashed ---------------------
  end("emit");
  begin("css");
  {
    const m = _compilerMod as any;
    const routes: Map<string, string[]> = m.getCapturedCssRoutes ? m.getCapturedCssRoutes() : new Map();
    if (cssOpts?.extract !== false && routes.size > 0 && m.computeCssAssets) {
      const chunks = m.getCssChunks();
      const plan = m.computeCssAssets(routes, (id: string) => chunks.get(id));
      // only files some route actually links are written out
      const linkedNames = new Set<string>();
      for (const p of plan.routes.values()) for (const l of p.links) linkedNames.add(l.replace("/assets/", ""));
      if (linkedNames.size > 0) {
        mkdirSync(join(outDir, assetsDirName()), { recursive: true });
        const postCss = (body: string): string => {
          let out = cssOpts?.autoprefixer ? autoprefixCss(body, cssOpts.targets) : body;
          if (cssOpts?.minify) { try { out = (_compilerMod as any).minifyCSS?.(out) ?? out; } catch { /* keep */ } }
          return out;
        };
        for (const f of plan.files) if (linkedNames.has(f.name)) writeFileSync(join(outDir, assetsDirName(), f.name), postCss(f.css));
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
            inject = p.links.map((l: string) => `  <link rel="stylesheet" href="${withPublicPath(l)}">`).join("\n");
          }
        }
        if (inject) out.html = out.html.replace("</head>", inject + "\n</head>");
        // transform:html -- the route-split branch writes here; see the else branch.
        const finalHtml = await runBuildHookValue("transform:html", out.html, { route: out.route });
        writeFileSync(join(out.outputDir, "index.html"), finalHtml);
      }
      const linked = htmlOutputs.length - inlined;
      console.log("  \x1b[36m\u26a1\x1b[0m styles: " + linkedNames.size + " css file" + (plan.files.length === 1 ? "" : "s") + " (route-split, content-hashed)" + (inlined > 0 ? " + " + inlined + " route" + (inlined === 1 ? "" : "s") + " inlined critical css" : "") + " [" + linked + " page" + (linked === 1 ? "" : "s") + " linked]");
    } else {
      for (const out of htmlOutputs) {
        // transform:html -- a plugin may rewrite the final HTML (minify,
        // inject a tag, add an attribute). Returns the html unchanged when
        // nothing is registered.
        const finalHtml = await runBuildHookValue("transform:html", out.html, { route: out.route });
        writeFileSync(join(out.outputDir, "index.html"), finalHtml);
      }
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
      // The runtime ships on every page that needs the client, so its comments
      // and whitespace are pure payload. Minify it the same way app chunks are
      // minified; fall back to the source verbatim if esbuild is unavailable.
      const raw = readFileSync(runtimeSrc, "utf-8");
      let code = raw;
      try {
        const cb: any = await import("./client-bundle.ts");
        code = cb.minifyJsSource?.(rootDir, raw) ?? raw;
      } catch { /* keep the unminified source */ }
      writeFileSync(join(outDir, "__tw_runtime.js"), code);
      const saved = raw.length - code.length;
      console.log("  \x1b[36m\u26A1\x1b[0m hydration runtime: .tw/__tw_runtime.js"
        + (saved > 0 ? " (" + (saved / 1024).toFixed(1) + " KB smaller)" : ""));
    }
  }

  // transform:css / transform:js / optimize:asset -- a post-pass over the
  // written output, so a plugin sees every emitted file (route-split css,
  // client chunks, the hydration runtime, and everything from public/).
  await transformEmittedFiles(outDir, pluginManager);

  console.log("\n  \x1b[32mBuild complete!\x1b[0m");
  // The build is written -- let plugins post-process it (write an index,
  // copy a file, report). A throw here is isolated by the loader.
  await runBuildHook("after:build", { rootDir, outDir, pages: pageFiles });
  console.log("  Pages: " + pageCount + " compiled" + (requestRenderedCount > 0 ? " (+" + requestRenderedCount + " rendered at request time)" : ""));
  if (pageCount === 0) console.warn("  [!] No static pages were compiled -- every page is SSR/API. Static hosts (Vercel/Cloudflare Pages output) will serve an empty site. Use `render static` or check your render modes.");
  console.log("  APIs:  " + apiCount + " routes");
  if (buildOpts?.incremental) {
    try { writeFileSync(join(outDir, ".build-cache.json"), JSON.stringify(incNext)); } catch { /* best effort */ }
    if (skippedPages > 0) console.log("  \x1b[36m~\x1b[0m incremental: " + skippedPages + " page(s) unchanged, reused");
  }

  // build.entryPoints -- extra JS entries bundled alongside the pages.
  if (buildOpts?.entryPoints?.length) {
    try {
      const { buildEntryPoint } = await import("./client-bundle");
      for (const e of buildOpts.entryPoints) {
        const u = buildEntryPoint(rootDir, e, chunkFlags());
        if (u) console.log("  \x1b[36m\u26a1\x1b[0m entry: " + e + " -> " + withPublicPath(u));
        else console.warn("  [!] entry point not found or failed: " + e);
      }
    } catch { /* entries are optional */ }
  }

  // build.metafile / build.bundleAnalysis -- a size manifest of the output.
  if (buildOpts?.metafile || buildOpts?.bundleAnalysis) {
    try {
      const files: { path: string; size: number }[] = [];
      const walk = (dir: string) => {
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
          const fp = join(dir, ent.name);
          if (ent.isDirectory()) walk(fp);
          else {
            const rel = fp.slice(outDir.length + 1).replace(/\\/g, "/");
            if (rel.startsWith(".")) continue;
            files.push({ path: rel, size: statSync(fp).size });
          }
        }
      };
      walk(outDir);
      files.sort((a, b) => b.size - a.size);
      const total = files.reduce((n, f) => n + f.size, 0);
      if (buildOpts.metafile) {
        writeFileSync(join(outDir, "build-meta.json"), JSON.stringify({ total, files }, null, 2));
      }
      if (buildOpts.bundleAnalysis) {
        console.log("\n  Bundle analysis (largest first):");
        for (const f of files.slice(0, 10)) console.log("    " + (f.size / 1024).toFixed(1).padStart(8) + " KB  " + f.path);
        console.log("    " + (total / 1024).toFixed(1).padStart(8) + " KB  TOTAL (" + files.length + " files)");
      }
    } catch { /* report is best-effort */ }
  }
  // ISR manifest (docs/isr.md): serve reads this to route revalidate pages
  // through the render pipeline (MISS/HIT/STALE) instead of static files.
  if (isrRoutes.size > 0) {
    // routes.json (docs/cache-tags.md): value is a bare number (legacy
    // `revalidate N`) or an object with revalidate/stale/expire/tag.
    const manifest: Record<string, number | Record<string, any>> = {};
    for (const [k, v] of isrRoutes) manifest[k] = v;
    writeFileSync(join(outDir, "routes.json"), JSON.stringify(manifest, null, 2));
    console.log("  \x1b[36m~\x1b[0m ISR: " + isrRoutes.size + " route(s) with cache windows -> .tw/routes.json");
  }

  // Build-time cached-handler checks (docs/cache-tags.md): TW091 purity
  // must fail the build; TW090/TW092/TW093 surface here too. Serve logs
  // the same diagnostics, but a broken cache config should stop CI.
  {
    const { readdirSync: rds, existsSync: ex, readFileSync: rd } = await import("node:fs");
    const twmFiles: string[] = [];
    const walkTwm = (dir: string) => {
      for (const ent of rds(dir, { withFileTypes: true })) {
        if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
        const fp = join(dir, ent.name);
        if (ent.isDirectory()) walkTwm(fp);
        else if (ent.name === "route.twm" || ent.name === "middleware.twm") twmFiles.push(fp);
      }
    };
    const homeDirB = join(rootDir, "home");
    if (ex(homeDirB)) walkTwm(homeDirB);
    for (const f of twmFiles) {
      const src = rd(f, "utf8");
      if (!/\bfn\s+cached\b/.test(src)) continue;
      const cleaned = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/gm, "");
      const fnCached = /\bfn\s+cached\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/g;
      for (const cm of cleaned.matchAll(fnCached)) {
        const name = cm[1];
        const after = cleaned.slice((cm.index ?? 0) + cm[0].length);
        // depth-scan the balanced handler body (after starts INSIDE the
        // fn body, past its opening brace -- depth starts at 1)
        let depth = 1, end = after.length, inStr: string | null = null;
        for (let i = 0; i < after.length; i++) {
          const ch = after[i];
          if (inStr) { if (ch === "\\") i++; else if (ch === inStr) inStr = null; continue; }
          if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
          if (ch === "{") depth++;
          else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        const body = after.slice(0, end);
        const cacheBlock = /^\s*cache\s*\{([^}]*)\}/.exec(after);
        const meta = cacheBlock ? parseCacheBodyShared(cacheBlock[1]) : {};
        if (meta.revalidate == null && !meta.life) {
          console.error("  \x1b[31m\u2717 TW090\x1b[0m fn cached " + name + " in " + f + " needs cache { revalidate N } or cache { life \"profile\" }");
          errorCount++;
          continue;
        }
        const impure = /request\s*\.\s*(cookies|headers|body)/.test(body) || /\bsetSignal\s*\(/.test(body);
        if (impure) {
          console.error("  \x1b[31m\u2717 TW091\x1b[0m fn cached " + name + " in " + f + " is impure (request.cookies/headers/body or setSignal) -- remove fn cached or the impure access");
          errorCount++;
          continue;
        }
        if (/\b(?:Date\s*\.\s*now\s*\(|Math\s*\.\s*random\s*\(|crypto\s*\.\s*randomUUID\s*\()/.test(body)) {
          console.warn("  \x1b[33m~ TW093\x1b[0m fn cached " + name + " in " + f + " calls a non-deterministic function -- the value freezes into the cache entry");
        }
        if (meta.life) {
          try {
            resolveCacheShared(meta, cacheProfiles);
          } catch (e: any) {
            console.error("  \x1b[31m\u2717\x1b[0m " + e.message + " (" + f + ":" + name + ")");
            errorCount++;
          }
        }
      }
    }
  }

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
