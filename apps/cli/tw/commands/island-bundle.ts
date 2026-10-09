/**
 * Island bundling for foreign (React/Preact) components.
 *   - loadSsrRenderer bundles a self-contained ESM module exporting render().
 *   - buildIslandChunk bundles an IIFE that hydrates the component's islands.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export interface ForeignImport { name: string; specifier: string; fromFile: string; absPath: string; }

const FOREIGN_RE = /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+\.(?:tsx|jsx))["']/;

export function collectTwFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
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
      if (found.has(name)) continue;
      const absPath = resolveForeignPath(file, specifier, rootDir);
      if (absPath) found.set(name, { name, specifier, fromFile: file, absPath });
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

export async function loadSsrRenderer(rootDir: string, absPath: string): Promise<(props: Record<string, string>, childrenHtml: string) => string> {
  const dir = join(rootDir, ".tw", ".island-ssr");
  mkdirSync(dir, { recursive: true });
  const stamp = hash(absPath);
  const entryPath = join(dir, "entry-" + stamp + ".mjs");
  const outFile = join(dir, "ssr-" + stamp + ".mjs");
  const entry = [
    `import { h } from "preact";`,
    `import { renderToString } from "preact-render-to-string";`,
    `import Comp from ${JSON.stringify(absPath)};`,
    `export function render(props, childrenHtml) {`,
    `  var p = Object.assign({}, props);`,
    `  if (childrenHtml) p.children = childrenHtml;`,
    `  return renderToString(h(Comp, p));`,
    `}`,
  ].join("\n");
  writeFileSync(entryPath, entry);
  const res = runEsbuild(rootDir, entryPath, outFile, ["--format=esm", "--platform=node", "--target=node18", "--log-level=error", "--jsx=automatic", "--jsx-import-source=preact"]);
  try { unlinkSync(entryPath); } catch { /* keep */ }
  if (!res.ok) throw new Error("esbuild (SSR) failed: " + res.err);
  const mod: any = await import(pathToFileURL(outFile).href);
  return mod.render as (props: Record<string, string>, childrenHtml: string) => string;
}

export function buildIslandChunk(rootDir: string, absPath: string, name: string, minify: boolean): string {
  const dir = join(rootDir, ".tw", ".island");
  mkdirSync(dir, { recursive: true });
  const stamp = hash(absPath + ":" + name);
  const entryPath = join(dir, "entry-" + stamp + ".mjs");
  const outFile = join(dir, "out-" + stamp + ".js");
  const entry = [
    `import { h, hydrate } from "preact";`,
    `import Comp from ${JSON.stringify(absPath)};`,
    `function boot() {`,
    `  var els = document.querySelectorAll('tw-island[data-tw-island=${JSON.stringify(name)}]');`,
    `  for (var i = 0; i < els.length; i++) {`,
    `    var el = els[i];`,
    `    if (el.__twHydrated) continue;`,
    `    var props = {};`,
    `    try { props = JSON.parse(el.getAttribute("data-tw-props") || "{}"); } catch (e) {}`,
    `    try { hydrate(h(Comp, props), el); el.__twHydrated = true; } catch (e) {}`,
    `  }`,
    `}`,
    `if (document.readyState !== "loading") boot();`,
    `else document.addEventListener("DOMContentLoaded", boot);`,
  ].join("\n");
  writeFileSync(entryPath, entry);
  const res = runEsbuild(rootDir, entryPath, outFile, ["--format=iife", "--target=es2019", "--log-level=error", "--jsx=automatic", "--jsx-import-source=preact", ...(minify ? ["--minify"] : [])]);
  try { unlinkSync(entryPath); } catch { /* keep */ }
  if (!res.ok) throw new Error("esbuild (island) failed: " + res.err);
  const code = readFileSync(outFile, "utf-8");
  const url = "js/island-" + hash(code) + ".js";
  mkdirSync(join(rootDir, ".tw", "js"), { recursive: true });
  writeFileSync(join(rootDir, ".tw", url), code);
  try { unlinkSync(outFile); } catch { /* keep */ }
  return url;
}
