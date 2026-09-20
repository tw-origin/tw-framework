#!/usr/bin/env node
/**
 * create-tw-app — the fastest way to start a TW Framework project.
 *
 * npx create-tw-app@latest my-app
 * npm create tw-app@latest my-app
 * yarn create tw-app my-app
 * pnpm create tw-app my-app
 * bunx create-tw-app my-app
 *
 * This package is a thin, dependency-free launcher: it resolves the
 * installed `tw-framework` CLI and runs `tw create` with the given
 * arguments — scaffold, git init and dependency install included.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);

function printVersion() {
  let version = "1.0.0";
  try {
    version = require("../package.json").version;
  } catch {
    /* fall back to the constant */
  }
  process.stdout.write(`create-tw-app ${version}\n`);
}

function printHelp() {
  process.stdout.write(
    `
Usage: create-tw-app [project-directory] [options]

Options:
  -V, --version          output the version number
  --template <name>      scaffold with a specific template
  --skip-install         skip installing packages
  --disable-git          skip initializing a git repository
  -h, --help             display help for command

Examples:
  npx create-tw-app@latest my-app
  npm create tw-app@latest my-app

Everything after the project directory is passed to \`tw create\`.
`
  );
}

if (args.includes("-V") || args.includes("--version")) {
  printVersion();
  process.exit(0);
}
if (args.includes("-h") || args.includes("--help")) {
  printHelp();
  process.exit(0);
}

let binPath;
try {
  const pkgJsonPath = require.resolve("tw-framework/package.json");
  const pkg = require(pkgJsonPath);
  const bin = pkg.bin && (pkg.bin.tw || pkg.bin["tw-framework"]);
  if (!bin) throw new Error("tw-framework has no tw bin");
  binPath = join(dirname(pkgJsonPath), bin);
} catch {
  process.stderr.write(
    "\n  Could not resolve the tw-framework CLI.\n" +
      "  Install it alongside this package and try again:\n" +
      "    npm install create-tw-app\n" +
      "    npx create-tw-app my-app\n\n"
  );
  process.exit(1);
}

const child = spawn(process.execPath, [binPath, "create", ...args], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", () => process.exit(1));
