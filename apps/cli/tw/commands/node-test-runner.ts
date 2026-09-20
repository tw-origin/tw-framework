/**
 * tw test -- Node runtime path.
 *
 * Transpiles each test file with esbuild to CJS, then runs them in a Node
 * child process where `require("bun:test")` resolves to a small built-in
 * shim (test / expect / describe) — so the same test files run unchanged
 * on both Bun and Node.
 */

import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const MINI_BUN_TEST = `
const queue = [];
let pass = 0, fail = 0, only = null;
function test(name, fn) { queue.push({ name, fn }); }
test.only = (name, fn) => { only = { name, fn }; };
test.skip = () => {};
function describe(name, fn) { fn(); }
const it = test;
function fmt(v) { try { return typeof v === "string" ? JSON.stringify(v) : String(v); } catch { return String(v); } }
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function makeApi(actual, isNot) {
  const check = (cond, msg) => {
    if (isNot ? cond : !cond) throw new Error((isNot ? "NOT: " : "") + msg);
  };
  return {
    toBe(exp) { check(Object.is(actual, exp), "expected " + fmt(exp) + ", got " + fmt(actual)); },
    toEqual(exp) { check(deepEq(actual, exp), "expected " + fmt(exp) + ", got " + fmt(actual)); },
    toBeTruthy() { check(!!actual, "expected truthy, got " + fmt(actual)); },
    toBeFalsy() { check(!actual, "expected falsy, got " + fmt(actual)); },
    toBeNull() { check(actual === null, "expected null, got " + fmt(actual)); },
    toBeUndefined() { check(actual === undefined, "expected undefined, got " + fmt(actual)); },
    toBeDefined() { check(actual !== undefined, "expected defined, got " + fmt(actual)); },
    toContain(x) { check(actual != null && (actual.includes ? actual.includes(x) : (actual || []).indexOf(x) !== -1), "expected to contain " + fmt(x)); },
    toHaveLength(n) { check(actual && actual.length === n, "expected length " + n + ", got " + (actual ? actual.length : "none")); },
    toBeGreaterThan(n) { check(actual > n, "expected " + fmt(actual) + " > " + n); },
    toBeLessThan(n) { check(actual < n, "expected " + fmt(actual) + " < " + n); },
    toBeGreaterThanOrEqual(n) { check(actual >= n, "expected " + fmt(actual) + " >= " + n); },
    toBeLessThanOrEqual(n) { check(actual <= n, "expected " + fmt(actual) + " <= " + n); },
    toBeCloseTo(n, tol) { check(Math.abs(actual - n) <= (tol || 5), "expected " + fmt(actual) + " close to " + n); },
    toMatch(re) { check(typeof actual === "string" && (re instanceof RegExp ? re.test(actual) : actual.includes(re)), "expected match " + fmt(re)); },
    toThrow() {
      let threw = false;
      try { actual(); } catch { threw = true; }
      check(threw, "expected function to throw");
    },
    toHaveProperty(key) { check(actual != null && key in Object(actual), "expected property " + key); },
  };
}
function expect(actual) {
  const api = makeApi(actual, false);
  api.not = makeApi(actual, true);
  return api;
}
expect.any = () => ({});
module.exports = { test, it, describe, expect, beforeAll: (f) => queue.push({ name: "__beforeAll", fn: f }), afterAll: (f) => queue.push({ name: "__afterAll", fn: f }), __run: async () => {
  const list = only ? [only] : queue;
  for (const t of list) {
    if (t.name.startsWith("__")) { try { await t.fn(); } catch {} continue; }
    try { await t.fn(); pass++; console.log("  \\x1b[32m(pass)\\x1b[0m " + t.name); }
    catch (e) { fail++; console.log("  \\x1b[31m(fail)\\x1b[0m " + t.name + " — " + (e && e.message)); }
  }
  console.log("");
  console.log(" " + pass + " pass, " + fail + " fail");
  process.exit(fail > 0 ? 1 : 0);
} };
`;

const RUNNER = `
const Module = require("module");
const path = require("path");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "bun:test") return path.join(__dirname, "mini-bun-test.cjs");
  return origResolve.call(this, request, parent, ...rest);
};
const mini = require("./mini-bun-test.cjs");
(async () => {
  for (const f of process.argv.slice(2)) {
    try { require(path.resolve(f)); }
    catch (e) { console.error("  load error:", f, e && e.message); process.exitCode = 1; }
  }
  await mini.__run();
})();
`;

export async function runNodeTests(files: string[], rootDir: string): Promise<number> {
  const cacheDir = join(rootDir, ".tw", ".tests");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "mini-bun-test.cjs"), MINI_BUN_TEST);
  // Resolve the CLI's esbuild main module once (in this parent process) and
  // hand the absolute path to the spawned runner: the child's own
  // `import("esbuild")` would resolve from the app's node_modules, which may
  // not have esbuild installed.
  let esbuildMain = "";
  try {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    esbuildMain = req.resolve("esbuild");
  } catch { /* bun runtime: child uses plain import("esbuild") */ }
  const runnerSrc = esbuildMain
    ? `globalThis.__TW_ESBUILD_MODULE = ${JSON.stringify(esbuildMain)};\n` + RUNNER
    : RUNNER;
  writeFileSync(join(cacheDir, "runner.cjs"), runnerSrc);

  const esbuild = await import("esbuild");
  const { basename } = await import("node:path");
  const compiled: string[] = [];
  for (const f of files) {
    const outPath = join(cacheDir, basename(f).replace(/\.(ts|tsx|js)$/, ".cjs"));
    // bundle (not transform) so @tw/* TS packages resolve into plain JS;
    // "bun:test" stays external and is redirected to our shim by the runner.
    // Inject the Node adapter first so Request/Response/Bun shims exist
    // inside the spawned test process too.
    const adapterPath = join(cacheDir, "node-adapter.ts");
    try {
      writeFileSync(adapterPath, readFileSync(join(new URL(".", import.meta.url).pathname, "node-adapter.ts"), "utf-8"));
    } catch {
      // bundled CLI: source lives relative to the bundle dir
      const bd = (globalThis as any).__TW_BUNDLE_DIR as string | undefined;
      const src = bd ? join(bd, "..", "tw", "node-adapter.ts") : "";
      if (src) { try { writeFileSync(adapterPath, readFileSync(src, "utf-8")); } catch { /* skip */ } }
    }
    await esbuild.build({
      entryPoints: [f],
      bundle: true,
      format: "cjs",
      platform: "node",
      target: "node18",
      outfile: outPath,
      external: ["bun:test", "esbuild"],
      inject: [adapterPath],
      logLevel: "silent",
    });
    compiled.push(outPath);
  }

  // Build a plain-JS compiler bundle for the spawned child: testPage's
  // findCompiler() needs a .js entry it can import under Node (the .ts
  // source only imports natively on Bun).
  let compilerEntry = "";
  try {
    const srcCandidates = [
      join(new URL(".", import.meta.url).pathname, "..", "..", "..", "..", "packages", "compiler", "tw", "index.ts"),
    ];
    const bd = (globalThis as any).__TW_BUNDLE_DIR as string | undefined;
    if (bd) srcCandidates.push(join(bd, "..", "..", "..", "packages", "compiler", "tw", "index.ts"));
    const fs2 = await import("node:fs");
    const src = srcCandidates.find(c => { try { return fs2.existsSync(c); } catch { return false; } });
    if (src) {
      compilerEntry = join(cacheDir, "tw-compiler.cjs");
      await esbuild.build({
        entryPoints: [src],
        bundle: true,
        format: "cjs",
        platform: "node",
        target: "node18",
        outfile: compilerEntry,
        external: ["esbuild"],
        logLevel: "silent",
      });
    }
  } catch { /* child falls back to the standard search path */ }

  // .env support: the test environment must mirror `tw dev` / `tw serve`.
  // Bun loads .env automatically; Node does not, so read it here and pass it
  // to the child (without overwriting already-set variables).
  const childEnv: Record<string, string> = { ...process.env };
  try {
    const envFile = readFileSync(join(rootDir, ".env"), "utf-8");
    for (const line of envFile.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in childEnv)) childEnv[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env -- fine */ }
  if (compilerEntry) childEnv.TW_COMPILER_PATH = compilerEntry;

  const proc = spawnSync("node", [join(cacheDir, "runner.cjs"), ...compiled], {
    cwd: rootDir,
    stdio: "inherit",
    env: childEnv,
  });
  if ((proc.status === null || (proc.status ?? 0) !== 0) && proc.stderr) {
    const err = proc.stderr.toString();
    if (/WebAssembly|Wasm memory/i.test(err)) {
      console.log("  \x1b[33m! Node's bundled undici could not allocate its WASM memory.\x1b[0m");
      console.log("  \x1b[33m! Raise the process virtual memory limit, e.g.: ulimit -Sv unlimited\x1b[0m");
    }
  }
  return proc.status ?? 1;
}
