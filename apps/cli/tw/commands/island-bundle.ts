/**
 * Island bundling for foreign (React/Preact) components.
 *   - loadSsrRenderer bundles a self-contained ESM module exporting render().
 *   - buildIslandChunk bundles an IIFE that hydrates the component's islands.
 *
 * Both are engine-aware: `render.engine: "preact"` uses preact +
 * preact-render-to-string + preact's `hydrate`, `render.engine: "react"` uses
 * react + react-dom/server + react-dom/client's `hydrateRoot`. The engine was
 * previously hardcoded to preact, so selecting react built a preact bundle.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { stripCommentsStringAware } from "@tw/shared";

export interface ForeignImport { name: string; specifier: string; fromFile: string; absPath: string; }

/** The render engines that bundle a foreign component. */
export type ForeignEngine = "react" | "preact";

const FOREIGN_RE = /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+\.(?:tsx|jsx))["']/;

const SKIP_DIRS = new Set(["node_modules", ".git", ".tw", "dist", "coverage"]);

export function collectTwFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectTwFiles(full, out);
    else if (entry.endsWith(".tw")) out.push(full);
  }
  return out;
}

/** Resolve a `@./x` specifier: `@./` is a project-root alias. */
export function resolveForeignPath(fromFile: string, specifier: string, rootDir: string): string | null {
  const rel = specifier.replace(/^@/, "").replace(/^\.?\//, "");
  const direct = join(rootDir, rel);
  if (existsSync(direct)) return direct;
  let dir = dirname(fromFile);
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir || !parent.startsWith(rootDir)) break;
    dir = parent;
  }
  return null;
}

export function scanForeignImports(rootDir: string, twFiles: string[]): ForeignImport[] {
  const found = new Map<string, ForeignImport>();
  for (const file of twFiles) {
    let src = "";
    try { src = readFileSync(file, "utf-8"); } catch { continue; }
    for (const line of src.split("\n")) {
      const m = FOREIGN_RE.exec(line);
      if (!m) continue;
      const [, name, specifier] = m;
      const absPath = resolveForeignPath(file, specifier, rootDir);
      if (!absPath) continue;
      // Key by name + resolved path, not by name alone. Two components in
      // different folders can both default-export `Counter`; keying on the name
      // alone built only the first, so the second page silently fell back to it
      // and rendered the wrong component. The same file imported by many pages
      // still dedupes to one entry, because its resolved path is identical.
      const dedupeKey = name + "\u0000" + absPath;
      if (found.has(dedupeKey)) continue;
      found.set(dedupeKey, { name, specifier, fromFile: file, absPath });
    }
  }
  return [...found.values()];
}

function hash(s: string): string { return createHash("sha256").update(s).digest("hex").slice(0, 12); }

function findEsbuildBin(rootDir: string): string {
  const candidates = [
    join(rootDir, "node_modules", ".bin", "esbuild"),
    resolve(rootDir, "..", "node_modules", ".bin", "esbuild"),
    resolve(new URL(".", import.meta.url).pathname, "..", "..", "..", "..", "node_modules", ".bin", "esbuild"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "esbuild";
}

function runEsbuild(rootDir: string, entryPath: string, outFile: string, extra: string[]): { ok: boolean; err: string } {
  const bin = findEsbuildBin(rootDir);
  const r = spawnSync(bin, [entryPath, "--bundle", "--outfile=" + outFile, ...extra], { cwd: rootDir });
  if (r.status === 0) return { ok: true, err: "" };
  return { ok: false, err: ((r.stderr && r.stderr.toString()) || String(r.error || "unknown")).split("\n")[0] };
}

// --- Per-engine code generation ------------------------------------------------

interface EngineEntry {
  /** esbuild args selecting the JSX runtime for this engine. */
  jsxArgs: string[];
  /** Source of the SSR entry: imports + `export function render(props, childrenHtml)`. */
  ssr(absPath: string): string;
  /** Source of the hydration entry: imports + the island boot loop. */
  hydrate(absPath: string, name: string, strategy: HydrateStrategy): string;
}

/**
 * React's automatic JSX runtime resolves `react/jsx-runtime` by default, so it
 * needs no `--jsx-import-source`. Preact's lives at `preact/jsx-runtime`, which
 * esbuild only picks up when told to.
 */
const ENGINES: Record<ForeignEngine, EngineEntry> = {
  preact: {
    jsxArgs: ["--jsx=automatic", "--jsx-import-source=preact"],
    ssr: (absPath) => [
      `import { h } from "preact";`,
      `import { renderToString } from "preact-render-to-string";`,
      `import Comp from ${JSON.stringify(absPath)};`,
      `export function render(props, childrenHtml) {`,
      `  var p = Object.assign({}, props);`,
      `  if (childrenHtml) p.children = childrenHtml;`,
      `  return renderToString(h(Comp, p));`,
      `}`,
    ].join("\n"),
    hydrate: (absPath, name, strategy) => [
      `import { h, hydrate } from "preact";`,
      `import Comp from ${JSON.stringify(absPath)};`,
      ...bootLoop(name, `hydrate(h(Comp, props), el)`, strategy),
    ].join("\n"),
  },
  react: {
    jsxArgs: ["--jsx=automatic"],
    ssr: (absPath) => [
      `import { createElement } from "react";`,
      `import { renderToString } from "react-dom/server";`,
      `import Comp from ${JSON.stringify(absPath)};`,
      `export function render(props, childrenHtml) {`,
      `  var p = Object.assign({}, props);`,
      `  if (childrenHtml) p.children = childrenHtml;`,
      `  return renderToString(createElement(Comp, p));`,
      `}`,
    ].join("\n"),
    hydrate: (absPath, name, strategy) => [
      `import { createElement } from "react";`,
      `import { hydrateRoot } from "react-dom/client";`,
      `import Comp from ${JSON.stringify(absPath)};`,
      ...bootLoop(name, `hydrateRoot(el, createElement(Comp, props))`, strategy),
    ].join("\n"),
  },
};

/** When an island hydrates. Chosen by the component's `@client:*` directive. */
export type HydrateStrategy = "eager" | "lazy" | "visible";

/**
 * The island boot loop, shared by both engines (only the mount call differs).
 *
 * The strategy decides *when* hydration runs:
 *   eager   -- on DOMContentLoaded (the default, and the old behaviour)
 *   lazy    -- when the browser is idle
 *   visible -- when the island scrolls into view
 *
 * The chunk is always loaded; only the timing changes.
 */
function bootLoop(name: string, mountCall: string, strategy: HydrateStrategy = "eager"): string[] {
  const sel = `tw-island[data-tw-island=${JSON.stringify(name)}]`;
  const body = [
    `function boot() {`,
    `  var els = document.querySelectorAll('${sel}');`,
    `  for (var i = 0; i < els.length; i++) {`,
    `    var el = els[i];`,
    `    if (el.__twHydrated) continue;`,
    `    var props = {};`,
    `    try { props = JSON.parse(el.getAttribute("data-tw-props") || "{}"); } catch (e) {}`,
    `    try { ${mountCall}; el.__twHydrated = true; } catch (e) {}`,
    `  }`,
    `}`,
  ];
  if (strategy === "lazy") {
    return [
      ...body,
      `function schedule() {`,
      `  if (window.requestIdleCallback) window.requestIdleCallback(boot);`,
      `  else setTimeout(boot, 200);`,
      `}`,
      `if (document.readyState !== "loading") schedule();`,
      `else document.addEventListener("DOMContentLoaded", schedule);`,
    ];
  }
  if (strategy === "visible") {
    return [
      ...body,
      `function whenVisible() {`,
      `  if (!("IntersectionObserver" in window)) { boot(); return; }`,
      `  var seen = document.querySelectorAll('${sel}:not([data-tw-seen])');`,
      `  if (!seen.length) { boot(); return; }`,
      `  var io = new IntersectionObserver(function (entries) {`,
      `    var hit = false;`,
      `    for (var i = 0; i < entries.length; i++) {`,
      `      if (entries[i].isIntersecting) { hit = true; entries[i].target.setAttribute("data-tw-seen", ""); }`,
      `    }`,
      `    if (hit) { boot(); io.disconnect(); }`,
      `  });`,
      `  for (var i = 0; i < seen.length; i++) io.observe(seen[i]);`,
      `}`,
      `if (document.readyState !== "loading") whenVisible();`,
      `else document.addEventListener("DOMContentLoaded", whenVisible);`,
    ];
  }
  return [
    ...body,
    `if (document.readyState !== "loading") boot();`,
    `else document.addEventListener("DOMContentLoaded", boot);`,
  ];
}

/**
 * The part of a file a directive may legally appear in: the leading comments
 * and the directive prologue (consecutive string-literal statements before any
 * real code).
 *
 * This mirrors how `"use client"` is read -- the prologue, not the file. Scanning
 * the whole file instead lets a string or a comment further down -- say a JSX
 * child that happens to contain the text `@client:visible` -- silently turn a
 * component into a directive it never declared.
 */
export function directiveRegion(source: string): string {
  let i = 0;
  const n = source.length;
  let out = "";
  for (;;) {
    while (i < n && /\s/.test(source[i])) i++;
    if (i >= n) break;

    // line comment
    if (source[i] === "/" && source[i + 1] === "/") {
      const j = source.indexOf("\n", i);
      const end = j === -1 ? n : j;
      out += source.slice(i, end) + "\n";
      i = end;
      continue;
    }
    // block comment
    if (source[i] === "/" && source[i + 1] === "*") {
      const j = source.indexOf("*/", i + 2);
      const end = j === -1 ? n : j + 2;
      out += source.slice(i, end) + "\n";
      i = end;
      continue;
    }
    // a leading string literal -- a directive prologue entry, like "use client"
    const q = source[i];
    if (q === '"' || q === "'") {
      let j = i + 1;
      while (j < n && source[j] !== q) { if (source[j] === "\\") j++; j++; }
      out += source.slice(i, Math.min(j + 1, n)) + "\n";
      i = Math.min(j + 1, n);
      while (i < n && /\s/.test(source[i])) i++;
      if (source[i] === ";") i++;
      continue;
    }
    break; // real code starts here
  }
  return out;
}

/**
 * Read a foreign component's source for its hydration directive. The vocabulary
 * matches the `@client:*` directives the compiler already documents:
 *
 *   @client            hydrate eagerly (the default)
 *   @client:eager      hydrate eagerly
 *   @client:lazy       hydrate when the browser is idle
 *   @client:visible    hydrate when the island scrolls into view
 *   @server            ship no JavaScript at all
 *
 * Only the file's leading comments and prologue are read, so a mention of a
 * directive in the body cannot be mistaken for one.
 */
export function parseClientStrategy(source: string): { kind: "server" | "client"; strategy: HydrateStrategy } {
  const head = directiveRegion(source);
  if (/@server\b/.test(head) || /@render\s+mode:\s*['"]server['"]/.test(head)) {
    return { kind: "server", strategy: "eager" };
  }
  if (/@client:visible/.test(head)) return { kind: "client", strategy: "visible" };
  if (/@client:lazy/.test(head)) return { kind: "client", strategy: "lazy" };
  return { kind: "client", strategy: "eager" };
}

/**
 * Which engine a foreign component belongs to, read from its own imports, so one
 * project can mix React and Preact components. Falls back to the configured
 * engine when the component imports neither (a plain component of its own).
 *
 * Strings are kept and comments are removed before matching, so a comment that
 * merely mentions `react` does not decide the engine -- but the import specifier
 * itself is a string, so it must survive. (`maskSourceStringsAndComments` blanks
 * strings too, which would erase the specifier and detect nothing.)
 *
 * The quote-anchored alternation matters too: `preact` contains `react`, so an
 * unanchored match would classify every Preact component as React.
 */
export function detectEngine(source: string, fallback: ForeignEngine): ForeignEngine {
  const code = stripCommentsStringAware(source);
  if (/(?:from|require\()\s*['"](?:react|react-dom)(?:\/[^'"]*)?['"]/.test(code)) return "react";
  if (/(?:from|require\()\s*['"]preact(?:\/[^'"]*)?['"]/.test(code)) return "preact";
  return fallback;
}

function engineEntry(engine: ForeignEngine | string | undefined): EngineEntry {
  return ENGINES[engine === "react" ? "react" : "preact"];
}

export async function loadSsrRenderer(rootDir: string, absPath: string, engine: ForeignEngine | string = "preact"): Promise<(props: Record<string, string>, childrenHtml: string) => string> {
  const entry = engineEntry(engine);
  const dir = join(rootDir, ".tw", ".island-ssr");
  mkdirSync(dir, { recursive: true });
  // The stamp includes the component's CONTENT, not just its path: the built
  // module is imported, and `import()` caches by URL. Keying only on the path
  // meant an edited component kept serving its previous render for the rest of
  // the process -- which is exactly a `tw dev` session.
  let contentHash = "";
  try { contentHash = hash(readFileSync(absPath, "utf-8")); } catch { /* keep */ }
  const stamp = hash(absPath + ":" + engine + ":" + contentHash);
  const entryPath = join(dir, "entry-" + stamp + ".mjs");
  const outFile = join(dir, "ssr-" + stamp + ".mjs");
  writeFileSync(entryPath, entry.ssr(absPath));
  const res = runEsbuild(rootDir, entryPath, outFile, ["--format=esm", "--platform=node", "--target=node18", "--log-level=error", ...entry.jsxArgs]);
  try { unlinkSync(entryPath); } catch { /* keep */ }
  if (!res.ok) throw new Error("esbuild (SSR) failed: " + res.err);
  const mod: any = await import(pathToFileURL(outFile).href);
  return mod.render as (props: Record<string, string>, childrenHtml: string) => string;
}

export function buildIslandChunk(rootDir: string, absPath: string, name: string, minify: boolean, engine: ForeignEngine | string = "preact", strategy: HydrateStrategy = "eager"): string {
  const entry = engineEntry(engine);
  const dir = join(rootDir, ".tw", ".island");
  mkdirSync(dir, { recursive: true });
  const stamp = hash(absPath + ":" + name + ":" + engine + ":" + strategy);
  const entryPath = join(dir, "entry-" + stamp + ".mjs");
  const outFile = join(dir, "out-" + stamp + ".js");
  writeFileSync(entryPath, entry.hydrate(absPath, name, strategy));
  const res = runEsbuild(rootDir, entryPath, outFile, ["--format=iife", "--target=es2019", "--log-level=error", ...entry.jsxArgs, ...(minify ? ["--minify"] : [])]);
  try { unlinkSync(entryPath); } catch { /* keep */ }
  if (!res.ok) throw new Error("esbuild (island) failed: " + res.err);
  const code = readFileSync(outFile, "utf-8");
  const url = "js/island-" + hash(code) + ".js";
  mkdirSync(join(rootDir, ".tw", "js"), { recursive: true });
  writeFileSync(join(rootDir, ".tw", url), code);
  try { unlinkSync(outFile); } catch { /* keep */ }
  return url;
}

/**
 * Clear the intermediate island directories before a build.
 *
 * `loadSsrRenderer` writes a content-stamped module per component and then
 * `import()`s it. The stamp changes whenever the component does, which is what
 * makes an edited component render fresh -- but it also means a long session
 * accumulates one module per edit. Clearing the intermediates at the start of a
 * build keeps the directory bounded, and the build regenerates whatever it
 * actually needs.
 *
 * `.tw/js` -- the real, content-hashed assets the built HTML points at -- is
 * deliberately left alone.
 */
export function pruneIslandCache(rootDir: string): number {
  let removed = 0;
  for (const name of [".island-ssr", ".island"]) {
    const dir = join(rootDir, ".tw", name);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      try { unlinkSync(join(dir, entry)); removed++; } catch { /* ignore */ }
    }
  }
  return removed;
}
