/** Publish the TW CLI to npm (run: bun apps/cli/scripts/publish.ts [--publish])
 *
 * Default run is a DRY RUN: validates package.json, rebuilds dist/tw.mjs,
 * checks that everything npm will pack is present and runs `npm pack --dry-run`.
 * Pass --publish to actually run `npm publish` (requires npm login).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const cliDir = join(import.meta.dir, "..");
const root = join(cliDir, "..", "..");
const doPublish = process.argv.includes("--publish");
const sh = (cmd: string, args: string[], cwd: string) => {
  const p = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (p.status !== 0) { console.error(`  \x1b[31m✗ ${cmd} ${args.join(" ")}\x1b[0m`); process.exit(1); }
};

console.log("\n  TW Framework — npm publish check\n");

// 1. package.json sanity
const pkg = JSON.parse(readFileSync(join(cliDir, "package.json"), "utf-8"));
const problems: string[] = [];
if (pkg.version !== "1.0.0") problems.push("version should be 1.0.0");
if (pkg.main !== "./dist/tw.mjs") problems.push("main must point at ./dist/tw.mjs");
if (pkg.bin?.tw !== "./dist/tw.mjs") problems.push("bin.tw must point at ./dist/tw.mjs");
if (!pkg.files?.includes("dist")) problems.push("files must include dist");
for (const dep of Object.keys(pkg.dependencies ?? {})) {
  if (dep.startsWith("@tw/")) problems.push(`workspace dep leaked: ${dep}`);
}
if (!existsSync(join(cliDir, "LICENSE"))) problems.push("LICENSE missing in apps/cli");
if (problems.length > 0) {
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log("  ✓ package.json valid (name, bin, files, deps)");

// 2. fresh bundle
console.log("  building dist/tw.mjs ...");
sh("bun", [join(cliDir, "scripts", "build-node.ts")], root);
if (!existsSync(join(cliDir, "dist", "tw.mjs"))) { console.error("  ✗ dist/tw.mjs missing"); process.exit(1); }
console.log("  ✓ dist/tw.mjs built");

// 3. smoke: --version must work with plain node
const v = spawnSync("node", [join(cliDir, "dist", "tw.mjs"), "--version"], { encoding: "utf-8" });
if (v.status !== 0 || !String(v.stdout).includes("1.0.0")) {
  console.error("  ✗ node dist/tw.mjs --version failed");
  process.exit(1);
}
console.log("  ✓ node dist/tw.mjs --version ok");

// 4. pack (dry run by default)
if (doPublish) {
  sh("npm", ["publish", "--access", "public"], cliDir);
  console.log("\n  \x1b[32mPublished!\x1b[0m\n");
} else {
  sh("npm", ["pack", "--dry-run"], cliDir);
  console.log("\n  \x1b[32mDry run OK.\x1b[0m  Publish with: bun apps/cli/scripts/publish.ts --publish\n");
}
