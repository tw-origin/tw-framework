/** Build the Node.js CLI bundle: apps/cli/dist/tw.mjs (run: bun apps/cli/scripts/build-node.ts) */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
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

// server bundle for serverless adapters (Vercel
// functions etc.). `import { TWServer } from "tw-framework/server"`.
{
  const serverOut = join(cliDir, "dist", "tw-server.mjs");
  const proc3 = spawnSync(esbuildBin, [
    join(repoRoot, "packages", "server", "tw", "index.ts"),
    "--bundle", "--platform=node", "--target=node18", "--format=esm",
    "--outfile=" + serverOut,
    "--external:esbuild",
  ], { stdio: "inherit" });
  if (proc3.status !== 0) process.exit(proc3.status ?? 1);
}

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

// Ship the hydration runtime so tw build (npm installs) can copy it into .tw/__tw_runtime.js
copyFileSync(join(repoRoot, "packages", "runtime", "tw", "client", "hydration-runtime.js"), join(cliDir, "dist", "hydration-runtime.js"));
// Public type declarations: a project's tw.config.ts does
// `import type { TwConfig } from "tw-framework"`, which resolves through the
// package's `types` field. Without this the import fails to typecheck.
copyFileSync(join(cliDir, "types", "index.d.ts"), join(cliDir, "dist", "index.d.ts"));
console.log("  OK dist/index.d.ts");
console.log("  OK dist/hydration-runtime.js");

// Ship the changelog with the package, from its single source at the repo root.
// npm no longer includes CHANGELOG automatically, so it must be in `files` AND
// present in apps/cli/ at pack time.
const changelog = join(repoRoot, "CHANGELOG.md");
if (existsSync(changelog)) {
  copyFileSync(changelog, join(cliDir, "CHANGELOG.md"));
  console.log("  OK CHANGELOG.md");
} else {
  console.warn("  ! CHANGELOG.md missing at the repo root — the package will ship without it");
}
