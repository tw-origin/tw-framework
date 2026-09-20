#!/usr/bin/env bun
/**
 * link-workspaces.ts -- ensures node_modules/@tw/<pkg> symlinks exist for
 * every workspace package under packages/*.
 *
 * Why this is needed: on some bun versions/install strategies, `bun install`
 * resolves workspace:* dependencies internally without creating real
 * node_modules symlinks. That's fine for plain `import "@tw/pkg"`, but
 * subpath exports (e.g. `import "@tw/compiler/native"`) require a real
 * node_modules/@tw/<pkg> entry for Node/Bun's package.json "exports" map
 * resolution to kick in. This script creates those symlinks explicitly so
 * the project works regardless of that behavior. Safe to run any number of
 * times (it just re-links, doesn't error if links already exist).
 */
import { existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const packagesDir = join(root, "packages");
const nodeModulesDir = join(root, "node_modules");

if (!existsSync(packagesDir)) {
  console.log("[link-workspaces] no packages/ directory found, skipping");
  process.exit(0);
}

let linked = 0;
for (const dirName of readdirSync(packagesDir)) {
  const pkgDir = join(packagesDir, dirName);
  const pkgJsonPath = join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) continue;

  const pkgJson = JSON.parse(require("node:fs").readFileSync(pkgJsonPath, "utf-8"));
  const name: string | undefined = pkgJson.name;
  if (!name || !name.includes("/")) continue;

  const [scope, short] = name.split("/");
  const scopeDir = join(nodeModulesDir, scope);
  const linkPath = join(scopeDir, short);

  mkdirSync(scopeDir, { recursive: true });

  // Re-create the link if it's missing or points somewhere else.
  let needsLink = true;
  if (existsSync(linkPath)) {
    try {
      const stat = lstatSync(linkPath);
      if (stat.isSymbolicLink()) needsLink = false;
    } catch { /* fall through and relink */ }
  }

  if (needsLink) {
    try {
      if (existsSync(linkPath)) unlinkSync(linkPath);
    } catch { /* ignore */ }
    symlinkSync(pkgDir, linkPath, "dir");
    linked++;
  }
}

console.log(`[link-workspaces] linked ${linked} workspace package(s) into node_modules/@tw`);
