/** TW Framework -- Build Script
 * Uses esbuild to bundle all packages for production.
 * Output goes to .tw/build/
 */

import { build } from "esbuild";
import { existsSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, ".tw", "build");

interface BuildTarget {
  name: string;
  entry: string;
  outdir: string;
  external?: string[];
  format?: "esm" | "cjs" | "iife";
  platform?: "browser" | "node" | "bun";
}

const targets: BuildTarget[] = [
  { name: "shared", entry: "packages/shared/tw/index.ts", outdir: ".tw/build/shared", platform: "node" },
  { name: "compiler", entry: "packages/compiler/tw/index.ts", outdir: ".tw/build/compiler", external: ["@tw/shared"], platform: "node" },
  { name: "runtime", entry: "packages/runtime/tw/index.ts", outdir: ".tw/build/runtime", platform: "browser" },
  { name: "server", entry: "packages/server/tw/index.ts", outdir: ".tw/build/server", external: ["@tw/shared", "@tw/compiler", "@tw/runtime"], platform: "node" },
  { name: "lsp", entry: "packages/lsp/tw/index.ts", outdir: ".tw/build/lsp", platform: "node" },
  { name: "plugins", entry: "packages/plugins/tw/index.ts", outdir: ".tw/build/plugins", platform: "node" },
  { name: "security", entry: "packages/security/tw/index.ts", outdir: ".tw/build/security", platform: "node" },
  { name: "sdk", entry: "packages/sdk/tw/index.ts", outdir: ".tw/build/sdk", external: ["@tw/shared", "@tw/compiler", "node:fs", "node:path", "node:crypto", "node:http"], platform: "node" },
  { name: "cli", entry: "apps/cli/tw/bin.ts", outdir: ".tw/build/cli", external: ["@tw/shared", "@tw/compiler", "@tw/runtime", "@tw/server", "@tw/dev-server", "@tw/builder", "@tw/lsp", "@tw/plugins", "@tw/security", "@tw/sdk"], platform: "node" },
];

async function buildAll(): Promise<void> {
  const startTime = performance.now();
  console.debug("\n  TW Framework Build\n");
  console.debug(`  Output: ${OUT_DIR}\n`);

  // Clean output
  mkdirSync(OUT_DIR, { recursive: true });

  let success = 0;
  let failed = 0;
  let totalSize = 0;

  for (const target of targets) {
    const entryPath = join(ROOT, target.entry);
    if (!existsSync(entryPath)) {
      console.debug(`  ? ${target.name}: entry not found (${target.entry})`);
      continue;
    }

    const targetOutDir = join(ROOT, target.outdir);

    try {
      const result = await build({
        entryPoints: [entryPath],
        bundle: true,
        format: target.format ?? "esm",
        target: target.platform === "browser" ? "es2022" : "esnext",
        platform: target.platform ?? "bun",
        outdir: targetOutDir,
        sourcemap: "external",
        minify: true,
        treeShaking: true,
        splitting: false,
        external: target.external ?? [],
        metafile: true,
        logLevel: "silent",
        define: {
          "process.env.NODE_ENV": '"production"',
        },
      });

      // Calculate output size
      let pkgSize = 0;
      const outFiles = readdirSync(targetOutDir);
      for (const f of outFiles) {
        const fpath = join(targetOutDir, f);
        if (existsSync(fpath)) {
          pkgSize += statSync(fpath).size;
        }
      }
      totalSize += pkgSize;

      const sizeStr = pkgSize > 1024 ? `${(pkgSize / 1024).toFixed(1)}KB` : `${pkgSize}B`;
      console.debug(`  OK ${target.name.padEnd(12)} ${sizeStr.padStart(10)}`);
      success++;
    } catch (err: any) {
      console.debug(`  X ${target.name}: ${err.message?.slice(0, 100)}`);
      failed++;
    }
  }

  const elapsed = (performance.now() - startTime).toFixed(0);
  const totalStr = totalSize > 1024 ? `${(totalSize / 1024).toFixed(1)}KB` : `${totalSize}B`;

  console.debug(`\n  ${success} succeeded, ${failed} failed in ${elapsed}ms`);
  console.debug(`  Total output: ${totalStr}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

buildAll().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
