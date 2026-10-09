/**
 * TW Framework — client-side npm module system.
 *
 * Users can import npm packages DIRECTLY in .tw pages and layouts:
 *
 *   import dayjs from "dayjs"
 *   page { render interactive }
 *   state { year = 0 }
 *   button on:click "year = dayjs().year()" { "Get year" }
 *
 * Each unique npm import becomes ONE shared, content-hashed chunk
 * (`.tw/js/c-<hash>.js`) registering on the global `__twClient` namespace.
 * A page's OWN imports additionally get a scope file (`.tw/js/p-<hash>.js`)
 * exposing `__twClient.$page` — the only symbols its handlers can use.
 */
import { join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

const IMPORT_RE = /^[ \t]*import\s+([^\n]+?)\s+from\s+["'']([^"'']+)["''][; \t]*$/gm;

/** npm-style specifiers only (not components/styles/libs). */
export function isClientImportSpecifier(spec: string): boolean {
  if (spec.startsWith("@./") || spec.startsWith("./") || spec.startsWith("../")) return false;
  if (/\.(tw|tss|twm|ts|js)$/.test(spec)) return false;
  if (spec.startsWith("@tw/")) {
    // Framework client utilities (@tw/runtime) bundle like npm imports.
    return RUNTIME_CLIENT_OK_SPECIFIERS.includes(spec);
  }
  return true;
}

/** Extract client-import lines from a source string. */
export function collectClientImportsFromSource(src: string): string[] {
  const lines: string[] = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src))) {
    if (isClientImportSpecifier(m[2])) lines.push(m[0].trim().replace(/;$/, ""));
  }
  return lines;
}

/** Imported binding names from an import line, e.g. `import { a as b } from "x"` -> [b]. */
export function importNames(line: string): string[] {
  const clause = line.match(/^import\s+([\s\S]+?)\s+from/);
  if (!clause) return [];
  const c = clause[1].trim();
  const names: string[] = [];
  if (c.startsWith("*")) {
    const as = c.split(/\s+as\s+/);
    if (as[1]) names.push(as[1].trim());
  } else if (c.startsWith("{")) {
    const braces = c.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (const part of braces[1].split(",")) {
        const p = part.trim();
        if (!p) continue;
        const seg = p.split(/\s+as\s+/);
        names.push(seg[seg.length - 1].trim());
      }
    }
  } else {
    const def = c.match(/^[A-Za-z_$][\w$]*/);
    if (def) names.push(def[0]);
  }
  return names;
}
/** Locate the esbuild binary (project, parent, CLI repo, bundled CLI). */
function findEsbuildBin(rootDir: string): string | null {
  const candidates = [
    join(rootDir, "node_modules", ".bin", "esbuild"),
    resolve(rootDir, "..", "node_modules", ".bin", "esbuild"),
    // CLI repo layout (dev / source runs)
    resolve(new URL(".", import.meta.url).pathname, "..", "..", "..", "..", "node_modules", ".bin", "esbuild"),
  ];
  for (const c of candidates) {
    try { if (existsSync(c)) return c; } catch { /* skip */ }
  }
  // bundled CLI: __TW_BUNDLE_DIR = apps/cli/dist
  const bd = (globalThis as any).__TW_BUNDLE_DIR;
  if (bd) {
    const b = resolve(bd, "..", "..", "..", "node_modules", ".bin", "esbuild");
    try { if (existsSync(b)) return b; } catch { /* skip */ }
  }
  return "esbuild"; // PATH fallback
}



/**
 * TW1007: server-only imports inside a client module (page.tw / layout.tw).
 * Relative imports must be .tw/.tss (components/styles); lib/, @tw/ and
 * relative .js/.ts modules belong to the server graph only.
 */
/**
 * Builtin component imports — handled by the compiler, never bundled.
 * Derived from the compiler's own specifier list so a new builtin is exempt
 * here automatically (this list had already drifted once).
 */
function builtinClientOkSpecifiers(): string[] {
  try {
    const mod: any = require("@tw/compiler");
    const list = mod?.BUILTIN_COMPONENT_SPECIFIERS;
    if (Array.isArray(list) && list.length > 0) return list;
  } catch { /* fall through */ }
  return ["@tw/optImage", "@tw/RouterLink", "@tw/Head", "@tw/Script"];
}
export const BUILTIN_CLIENT_OK_SPECIFIERS = builtinClientOkSpecifiers();
/**
 * Framework client utilities — bundled by buildClientChunk into a shared,
 * content-hashed chunk (esbuild tree-shakes to just the imported symbols).
 */
export const RUNTIME_CLIENT_OK_SPECIFIERS = ["@tw/runtime"];

export function findServerOnlyViolations(src: string): string[] {
  const out: string[] = [];
  let m; IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[2];
    // lib/ is server-only regardless of extension ("lib/db" and "lib/db.ts"
    // both reference the same server module) — check BEFORE the bare-
    // specifier client fallback, which would otherwise treat "lib/x" as npm.
    if (spec === "lib" || spec.startsWith("lib/")) { out.push(spec); continue; }
    if (isClientImportSpecifier(spec)) continue;
    if (spec.startsWith("@tw/")) {
      if (BUILTIN_CLIENT_OK_SPECIFIERS.includes(spec)) continue;
      if (RUNTIME_CLIENT_OK_SPECIFIERS.includes(spec)) continue;
      out.push(spec); continue;
    }
    if (spec.startsWith("@./") || spec.startsWith("./") || spec.startsWith("../")) {
      // TW components/styles, and React/Preact .tsx/.jsx components (which
      // run in the browser as islands), are all fine in the client graph.
      if (/\.(tw|tss|tsx|jsx)$/.test(spec)) continue;
      out.push(spec); continue;
    }
    if (spec.startsWith("lib/")) out.push(spec);
  }
  return out;
}

function contentHash(s: string): string {
  // djb2-style over a sha256 digest slice -> short stable name
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const chunkCache = new Map<string, string>(); // import line -> chunk URL

/** build.outputDir -- where chunks land. `.tw` by default. */
let OUT_ROOT = ".tw";
export function setClientOutputRoot(dir: string): void {
  if (dir && typeof dir === "string") OUT_ROOT = dir;
}
export function getClientOutputRoot(): string {
  return OUT_ROOT;
}
/**
 * Absolute path of the vendored @tw/runtime client bundle shipped in the
 * CLI's dist/. Used to rewrite `from "@tw/runtime"` in chunk entries so
 * the specifier resolves from the CLI install, not the user's node_modules
 * (the workspace package is not published to apps).
 */
function vendoredRuntimeClient(): string | null {
  // Source mode: apps/cli/tw/commands/client-bundle.ts -> apps/cli/dist/
  const fromSrc = new URL("../../dist/tw-runtime-client.mjs", import.meta.url).pathname;
  if (existsSync(fromSrc)) return fromSrc;
  // Bundle mode: dist/tw.mjs -> dist/tw-runtime-client.mjs (sibling)
  const fromBundle = new URL("./tw-runtime-client.mjs", import.meta.url).pathname;
  if (existsSync(fromBundle)) return fromBundle;
  return null;
}

/** Rewrite @tw/runtime imports in a chunk entry to the vendored bundle. */
function rewriteRuntimeSpecifier(importLine: string): string {
  const vendored = vendoredRuntimeClient();
  if (!vendored) return importLine; // fall back to plain resolution
  const m = importLine.match(/from\s+["'](@tw\/runtime)["']/);
  if (!m) return importLine;
  return importLine.replace(m[0], `from ${JSON.stringify(vendored)}`);
}

/**
 * One npm import line -> ONE shared, content-hashed chunk `.tw/js/c-*.js`.
 * Every page that needs this dependency loads the exact same file, so the
 * browser cache is shared across pages. The chunk registers its exports on
 * the global `__twClient` namespace. Returns the script URL, "" on failure.
 */
/**
 * Minify a standalone JS source string with the same esbuild the chunks use.
 *
 * Returns the input unchanged when esbuild is unavailable or fails -- a build
 * must never break because an optional optimiser is missing.
 */
export function minifyJsSource(rootDir: string, source: string): string {
  const bin = findEsbuildBin(rootDir);
  const stamp = contentHash(source);
  const inPath = join(rootDir, OUT_ROOT, ".min-in-" + stamp + ".js");
  const outPath = join(rootDir, OUT_ROOT, ".min-out-" + stamp + ".js");
  try {
    mkdirSync(join(rootDir, OUT_ROOT), { recursive: true });
    writeFileSync(inPath, source);
    const r = spawnSync(bin, [inPath, "--minify", "--target=es2019", "--format=iife", "--outfile=" + outPath], { cwd: rootDir });
    if (r.status !== 0) return source;
    const out = readFileSync(outPath, "utf-8");
    return out || source;
  } catch {
    return source;
  } finally {
    try { unlinkSync(inPath); } catch { /* keep */ }
    try { unlinkSync(outPath); } catch { /* keep */ }
  }
}

/** build.* -- the esbuild flags a client chunk honours. */
export interface BuildChunkFlags {
  minify?: boolean;
  sourcemap?: boolean | "external" | "inline";
  format?: "esm" | "cjs" | "iife";
  treeshake?: boolean;
  define?: Record<string, string>;
  externals?: string[];
  inject?: string[];
  chunkNames?: string;
  assetNames?: string;
  loaders?: Record<string, string>;
  /** esbuild code splitting (requires format=esm). */
  splitting?: boolean;
}

/**
 * build.entryPoints -- bundle one extra JS entry (a path relative to the
 * project root) into `<outDir>/js/<name>-<hash>.js`. Returns the URL, or "".
 */
export function buildEntryPoint(rootDir: string, entry: string, flags: BuildChunkFlags = {}): string {
  const abs = join(rootDir, entry);
  if (!existsSync(abs)) return "";
  const jsDir = join(rootDir, OUT_ROOT, "js");
  mkdirSync(jsDir, { recursive: true });
  const stamp = contentHash(entry);
  const tmpOut = join(rootDir, OUT_ROOT, ".entry-tmp-" + stamp + ".js");
  const bin = findEsbuildBin(rootDir);
  const r = spawnSync(bin, [abs, ...chunkEsbuildArgs({ ...flags, format: flags.format ?? "esm" }, tmpOut)], { cwd: rootDir });
  if (r.status !== 0) {
    const errText = (r.stderr && r.stderr.toString ? r.stderr.toString() : "") || String(r.error || "unknown");
    console.error("  [tw] entry point failed (" + entry + "): " + errText.split("\n")[0]);
    try { unlinkSync(tmpOut); } catch { /* keep */ }
    return "";
  }
  const code = readFileSync(tmpOut, "utf-8");
  const url = "js/e-" + contentHash(code) + ".js";
  writeFileSync(join(rootDir, OUT_ROOT, url), code);
  try { unlinkSync(tmpOut); } catch { /* keep */ }
  return url;
}

/** build.* -> the esbuild argv for one chunk. */
export function chunkEsbuildArgs(f: BuildChunkFlags, outFile: string): string[] {
  const args = ["--bundle", "--format=" + (f.format ?? "iife"), "--target=es2019", "--outfile=" + outFile];
  if (f.minify) args.push("--minify");
  if (f.sourcemap === "external") args.push("--sourcemap=external");
  else if (f.sourcemap === "inline") args.push("--sourcemap=inline");
  else if (f.sourcemap) args.push("--sourcemap");
  if (f.treeshake === false) args.push("--tree-shaking=false");
  for (const [k, v] of Object.entries(f.define ?? {})) args.push("--define:" + k + "=" + v);
  for (const e of f.externals ?? []) args.push("--external:" + e);
  for (const i of f.inject ?? []) args.push("--inject:" + i);
  if (f.chunkNames) args.push("--chunk-names=" + f.chunkNames);
  if (f.assetNames) args.push("--asset-names=" + f.assetNames);
  for (const [ext, type] of Object.entries(f.loaders ?? {})) args.push("--loader:" + ext + "=" + type);
  // esbuild only splits ESM output; ignore it for iife/cjs.
  if (f.splitting && (f.format ?? "iife") === "esm") args.push("--splitting");
  return args;
}

export function buildClientChunk(
  rootDir: string,
  importLine: string,
  flagsOrMinify: BuildChunkFlags | boolean = true,
  sourcemap = false,
): string {
  if (!importLine) return "";
  const flags: BuildChunkFlags = typeof flagsOrMinify === "boolean"
    ? { minify: flagsOrMinify, sourcemap }
    : flagsOrMinify;
  const key = importLine + "|" + JSON.stringify(flags);
  const cached = chunkCache.get(key);
  if (cached && existsSync(join(rootDir, OUT_ROOT, cached))) return cached;

  const jsDir = join(rootDir, OUT_ROOT, "js");
  mkdirSync(jsDir, { recursive: true });

  const names = importNames(importLine);
  const entryLine = rewriteRuntimeSpecifier(importLine);
  const entry = [
    entryLine + ";",
    "globalThis.__twClient = globalThis.__twClient || {};",
    ...names.map(n => "globalThis.__twClient." + n + " = " + n + ";"),
  ].join("\n");
  const stamp = contentHash(importLine);
  const entryPath = join(rootDir, OUT_ROOT, ".chunk-entry-" + stamp + ".js");
  const tmpOut = join(rootDir, OUT_ROOT, ".chunk-tmp-" + stamp + ".js");
  writeFileSync(entryPath, entry);

  const bin = findEsbuildBin(rootDir);
  const args = [entryPath, ...chunkEsbuildArgs(flags, tmpOut)];
  const r = spawnSync(bin, args, { cwd: rootDir });
  try { unlinkSync(entryPath); } catch { /* keep */ }
  if (r.status !== 0) {
    const errText = (r.stderr && r.stderr.toString ? r.stderr.toString() : "") || String(r.error || "unknown");
    console.error("  [tw] client chunk failed (" + importLine + "): " + errText.split("\n")[0]);
    try { unlinkSync(tmpOut); } catch { /* keep */ }
    return "";
  }

  const code = readFileSync(tmpOut, "utf-8");
  const url = "js/c-" + contentHash(code) + ".js";
  writeFileSync(join(rootDir, OUT_ROOT, url), code);
  try { unlinkSync(tmpOut); } catch { /* keep */ }
  chunkCache.set(key, url);
  return url;
}

/**
 * Page scope (spec S5): ONLY the page's OWN imports get symbol access.
 * The scope file exposes those names as `__twClient.$page`, which the
 * runtime uses as its `with()` scope. Layout imports load their chunks
 * (dependency inheritance) but grant no symbol access to child pages.
 */
export function buildPageScope(rootDir: string, ownImportLines: string[]): string {
  if (!ownImportLines || ownImportLines.length === 0) return "";
  const names = ownImportLines.flatMap(l => importNames(l));
  if (names.length === 0) return "";
  mkdirSync(join(rootDir, OUT_ROOT, "js"), { recursive: true });
  const body = names.map(n => "p." + n + " = g.__twClient." + n + ";").join("\n");
  const code = "(function(g){g.__twClient=g.__twClient||{};var p={};\n" + body + "\ng.__twClient.$page=p;})(globalThis);\n";
  const url = "js/p-" + contentHash(names.slice().sort().join("|")) + ".js";
  writeFileSync(join(rootDir, OUT_ROOT, url), code);
  return url;
}
