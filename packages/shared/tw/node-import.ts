/**
 * Runtime-agnostic TS module loader.
 * - Bun: imports the .ts file directly.
 * - Node: bundles it to a temp .mjs with esbuild, then imports that.
 *
 * Used for user files (lib/*.ts, tw.config.ts) that must load at runtime
 * on both runtimes.
 */
import { join, dirname, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { writeFileSync, rmSync } from "node:fs";

/**
 * Load a TS/JS module.
 *
 * `opts.source` is an optional override: the module is loaded from that text
 * instead of the file on disk, while `tsPath` stays the module's identity and
 * the base for its relative imports. Without it the behaviour is exactly what
 * it was before -- same import, same esbuild bundle, same cache key.
 */
let overrideSeq = 0;

export async function twImportTs(tsPath: string, bust?: number, opts?: { source?: string }): Promise<any> {
  const q = bust ? "?v=" + bust : "";
  const override = opts?.source;
  if (!(globalThis as any).__TW_NODE) {
    if (override === undefined) return import(tsPath + q);
    // Bun imports the file itself, so the override has to exist on disk. A
    // sibling file keeps every relative import resolving from the original
    // directory; it is removed as soon as the import settles.
    const ext = extname(tsPath) || ".ts";
    // Unique per call: two concurrent imports of the same module must not write
    // to the same file. Same directory, so relative imports still resolve from
    // the original location.
    const unique = process.pid + "-" + (overrideSeq++).toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const tmpPath = join(dirname(tsPath), "." + basename(tsPath, ext) + ".tw-override-" + unique + ext);
    writeFileSync(tmpPath, override, "utf-8");
    try {
      return await import(tmpPath + q);
    } finally {
      try { rmSync(tmpPath, { force: true }); } catch { /* best effort */ }
    }
  }

  // Node resolution from a spawned test process may walk up from a temp
  // cache dir and miss the CLI's esbuild -- the runner injects the resolved
  // absolute module path via __TW_ESBUILD_MODULE.
  const esbuildMain = (globalThis as any).__TW_ESBUILD_MODULE;
  const esbuild = await (esbuildMain ? import(esbuildMain) : import("esbuild"));
  const safe = tsPath.replace(/[^a-zA-Z0-9]/g, "_").slice(-120);
  const cachePath = join(tmpdir(), "tw-" + safe + (bust ? "-" + bust : "") + ".mjs");

  await esbuild.build({
    // stdin + resolveDir keeps relative imports resolving from the original
    // file's directory, and sourcefile keeps error locations on the real file.
    ...(override === undefined
      ? { entryPoints: [tsPath] }
      : { stdin: { contents: override, resolveDir: dirname(tsPath), sourcefile: tsPath, loader: extname(tsPath) === ".js" ? "js" : "ts" } }),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    outfile: cachePath,
    logLevel: "silent",
  });

  return import(pathToFileURL(cachePath).href + q);
}
