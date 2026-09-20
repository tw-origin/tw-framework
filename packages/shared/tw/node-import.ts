/**
 * Runtime-agnostic TS module loader.
 * - Bun: imports the .ts file directly.
 * - Node: bundles it to a temp .mjs with esbuild, then imports that.
 *
 * Used for user files (lib/*.ts, tw.config.ts) that must load at runtime
 * on both runtimes.
 */
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

export async function twImportTs(tsPath: string): Promise<any> {
  if (!(globalThis as any).__TW_NODE) {
    return import(tsPath);
  }

  // Node resolution from a spawned test process may walk up from a temp
  // cache dir and miss the CLI's esbuild -- the runner injects the resolved
  // absolute module path via __TW_ESBUILD_MODULE.
  const esbuildMain = (globalThis as any).__TW_ESBUILD_MODULE;
  const esbuild = await (esbuildMain ? import(esbuildMain) : import("esbuild"));
  const safe = tsPath.replace(/[^a-zA-Z0-9]/g, "_").slice(-120);
  const cachePath = join(tmpdir(), "tw-" + safe + ".mjs");

  await esbuild.build({
    entryPoints: [tsPath],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    outfile: cachePath,
    logLevel: "silent",
  });

  return import(pathToFileURL(cachePath).href);
}
