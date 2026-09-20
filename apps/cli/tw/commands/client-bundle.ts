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
/** Builtin component imports — handled by the compiler, never bundled. */
export const BUILTIN_CLIENT_OK_SPECIFIERS = ["@tw/optImage", "@tw/RouterLink"];
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
      if (/\.(tw|tss)$/.test(spec)) continue; // TW components/styles are fine
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
export function buildClientChunk(rootDir: string, importLine: string, minify: boolean): string {
  if (!importLine) return "";
  const cached = chunkCache.get(importLine);
  if (cached && existsSync(join(rootDir, ".tw", cached))) return cached;

  const jsDir = join(rootDir, ".tw", "js");
  mkdirSync(jsDir, { recursive: true });

  const names = importNames(importLine);
  const entryLine = rewriteRuntimeSpecifier(importLine);
  const entry = [
    entryLine + ";",
    "globalThis.__twClient = globalThis.__twClient || {};",
    ...names.map(n => "globalThis.__twClient." + n + " = " + n + ";"),
  ].join("\n");
  const stamp = contentHash(importLine);
  const entryPath = join(rootDir, ".tw", ".chunk-entry-" + stamp + ".js");
  const tmpOut = join(rootDir, ".tw", ".chunk-tmp-" + stamp + ".js");
  writeFileSync(entryPath, entry);

  const bin = findEsbuildBin(rootDir);
  const args = [entryPath, "--bundle", "--format=iife", "--target=es2019", "--outfile=" + tmpOut];
  if (minify) args.push("--minify");
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
  writeFileSync(join(rootDir, ".tw", url), code);
  try { unlinkSync(tmpOut); } catch { /* keep */ }
  chunkCache.set(importLine, url);
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
  mkdirSync(join(rootDir, ".tw", "js"), { recursive: true });
  const body = names.map(n => "p." + n + " = g.__twClient." + n + ";").join("\n");
  const code = "(function(g){g.__twClient=g.__twClient||{};var p={};\n" + body + "\ng.__twClient.$page=p;})(globalThis);\n";
  const url = "js/p-" + contentHash(names.slice().sort().join("|")) + ".js";
  writeFileSync(join(rootDir, ".tw", url), code);
  return url;
}
