#!/usr/bin/env node
/**
 * Publish both TW Framework npm packages, in dependency order:
 *   1. tw-framework   (the CLI + framework)
 *   2. create-tw-app  (depends on tw-framework)
 *
 * Default run is a DRY RUN: builds, validates and packs both packages.
 * Pass --publish to run `npm publish` for real (requires npm login).
 *
 * Usage:
 *   bun run scripts/publish-all.ts            # dry run
 *   bun run scripts/publish-all.ts --publish  # real publish
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const doPublish = process.argv.includes("--publish");

function run(cmd, args, cwd, label) {
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`\n  ✗ ${label} failed`);
    process.exit(1);
  }
}

console.log("\n  TW Framework — publish all packages\n");
if (!doPublish) console.log("  (dry run — pass --publish to publish for real)\n");

// 1. tw-framework (CLI)
console.log("  [1/2] tw-framework");
const cliDir = join(root, "apps", "cli");
if (!existsSync(join(cliDir, "package.json"))) {
  console.error("  ✗ apps/cli missing");
  process.exit(1);
}
run(
  "bun",
  ["scripts/publish.ts", ...(doPublish ? ["--publish"] : [])],
  cliDir,
  "tw-framework publish check"
);

// 2. create-tw-app
console.log("\n  [2/2] create-tw-app");
const cnaDir = join(root, "apps", "create-tw-app");
if (!existsSync(join(cnaDir, "package.json"))) {
  console.error("  ✗ apps/create-tw-app missing");
  process.exit(1);
}
if (!existsSync(join(cnaDir, "dist", "create.mjs"))) {
  console.error("  ✗ apps/create-tw-app/dist/create.mjs missing");
  process.exit(1);
}
run("npm", ["pack"], cnaDir, "create-tw-app npm pack");
if (doPublish) {
  run("npm", ["publish"], cnaDir, "create-tw-app npm publish");
}

console.log(
  doPublish
    ? "\n  ✓ Both packages published: tw-framework, create-tw-app\n"
    : "\n  ✓ Dry run OK. Publish with: bun run scripts/publish-all.ts --publish\n"
);
