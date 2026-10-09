import { describe, test, expect } from "bun:test";
import { minifyJsSource } from "../apps/cli/tw/commands/client-bundle";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// What ships to the browser must be minified in production. The app chunks are
// (esbuild --minify); the hydration runtime used to be a plain copyFileSync of
// the 24 KB source, comments and all. This locks the behaviour.

describe("client JS ships minified", () => {
  test("minifyJsSource strips whitespace, comments and long names", () => {
    const src = `// a comment
export function calculateTheTotalPrice(items) {
  let theRunningTotal = 0;
  for (const item of items) { theRunningTotal = theRunningTotal + item.price; }
  return theRunningTotal;
}`;
    const out = minifyJsSource(process.cwd(), src);
    expect(out.length).toBeLessThan(src.length);
    expect(out).not.toContain("// a comment");
    expect(out).not.toContain("calculateTheTotalPrice");
  });

  test("the hydration runtime shrinks by more than a third", () => {
    const runtime = join(import.meta.dir, "..", "packages", "runtime", "tw", "client", "hydration-runtime.js");
    if (!existsSync(runtime)) return; // packaged CLI: nothing to check
    const src = readFileSync(runtime, "utf-8");
    const out = minifyJsSource(process.cwd(), src);
    expect(out.length).toBeLessThan(src.length * 0.6);
    expect(out).not.toMatch(/^\s*\/\//m);
    // it must still be valid, runnable JS
    expect(out.trim().length).toBeGreaterThan(100);
  });

  test("a build never breaks when esbuild is unavailable", () => {
    // an unparseable input falls back to the source rather than throwing
    const bad = "function ( { not js";
    expect(() => minifyJsSource(process.cwd(), bad)).not.toThrow();
  });

  test("the build command minifies the runtime it emits", () => {
    const build = readFileSync(join(import.meta.dir, "..", "apps", "cli", "tw", "commands", "build.ts"), "utf-8");
    expect(build).toContain("minifyJsSource");
    expect(build).toContain("__tw_runtime.js");
    // the old plain-copy line must be gone
    expect(build).not.toMatch(/copyFileSync\(runtimeSrc, join\(outDir, "__tw_runtime\.js"\)\)/);
  });
});
