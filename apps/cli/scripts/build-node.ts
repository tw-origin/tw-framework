/** Build the Node.js CLI bundle: apps/cli/dist/tw.mjs (run: bun apps/cli/scripts/build-node.ts) */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

// Call the esbuild binary directly (native Go binary) for maximum reliability.
const cliDir = join(import.meta.dir, "..");
const repoRoot = join(cliDir, "..", "..");
const esbuildBin = join(repoRoot, "node_modules", ".bin", "esbuild");
mkdirSync(join(cliDir, "dist"), { recursive: true });

const banner = [
  "#!/usr/bin/env node",
  'globalThis.__TW_BUNDLE_DIR = new URL(".", import.meta.url).pathname;',
  // `require` shim: bundled code contains lazy `require("node:...")` calls
  // (e.g. the native-compiler fallbacks). In an ESM bundle `require` is
  // undefined, so provide it via createRequire.
  "import { createRequire } from \"node:module\";",
  "const require = createRequire(import.meta.url);",
].join("\n");

const out = join(cliDir, "dist", "tw.mjs");
const proc = spawnSync(esbuildBin, [
  join(cliDir, "tw", "node-entry.ts"),
  "--bundle",
  "--platform=node",
  "--target=node18",
  "--format=esm",
  "--outfile=" + out,
  "--banner:js=" + banner,
  "--external:esbuild",
], { stdio: "inherit" });

if (proc.status !== 0) process.exit(proc.status ?? 1);
chmodSync(out, 0o755);

// CJS bundle of the testing helpers. Published apps import
// `@tw/server/tw/testing` in their tests; `tw test` shims that specifier to
// this file when the app does not have the monorepo workspace packages.
{
  const testingOut = join(cliDir, "dist", "testing.cjs");
  const proc2 = spawnSync(esbuildBin, [
    join(repoRoot, "packages", "server", "tw", "testing", "index.ts"),
    "--bundle",
    "--platform=node",
    "--target=node18",
    "--format=cjs",
    "--outfile=" + testingOut,
    "--external:esbuild",
  ], { stdio: "inherit" });
  if (proc2.status !== 0) process.exit(proc2.status ?? 1);
  console.log("  \x1b[32mOK\x1b[0m " + testingOut);
}

// ESM bundle of the runtime's client utilities. Pages can import
// `@tw/runtime` for browser reactivity (signal, computed, ...); the CLI
// rewrites that specifier to this file so the published package resolves
// it without a workspace install.
{
  const rtOut = join(cliDir, "dist", "tw-runtime-client.mjs");
  const proc3 = spawnSync(esbuildBin, [
    join(repoRoot, "packages", "runtime", "tw", "index.ts"),
    "--bundle",
    "--platform=browser",
    "--target=es2019",
    "--format=esm",
    "--outfile=" + rtOut,
  ], { stdio: "inherit" });
  if (proc3.status !== 0) process.exit(proc3.status ?? 1);
  console.log("  \x1b[32mOK\x1b[0m " + rtOut);
}

// Copy deployment adapter files next to the bundle so the published CLI can
// generate them without @tw/adapters being installed.
{
  const { cpSync, rmSync } = await import("node:fs");
  const src = join(repoRoot, "packages", "adapters", "tw");
  const dest = join(cliDir, "dist", "adapters");
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  console.log("  \x1b[32mOK\x1b[0m adapters -> dist/adapters/");
  copyFileSync(join(cliDir, "tw", "node-adapter.ts"), join(cliDir, "dist", "node-adapter.ts"));
  console.log("  \x1b[32mOK\x1b[0m node-adapter -> dist/node-adapter.ts");
}
console.log("  \x1b[32mOK\x1b[0m " + out + " — run with: node apps/cli/dist/tw.mjs <command>");
