/**
 * Hardening tests for the strategy layer:
 *  - a bad strategy value is a hard config error (with a suggestion)
 *  - strategies.hydration.mode actually changes what ships to the browser
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createDefaultConfig, validateConfig } from "@tw/shared";

const tw = join(import.meta.dir, "..", "apps", "cli", "tw", "bin.ts");

function appWith(html: string, config: string) {
  const dir = mkdtempSync(join(tmpdir(), "tw-hyd-"));
  mkdirSync(join(dir, "home", "p"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }));
  writeFileSync(join(dir, "home", "p", "page.tw"), html);
  writeFileSync(join(dir, "tw.config.ts"), config);
  return dir;
}

const build = (dir: string, args: string[] = []) =>
  spawnSync("bun", [tw, "build", ...args], { cwd: dir, encoding: "utf8" });

const builtHtml = (dir: string) => readFileSync(join(dir, ".tw", "p", "index.html"), "utf8");

describe("strategy validation is part of config validation", () => {
  test("a good strategy set produces no errors", () => {
    const c: any = createDefaultConfig();
    c.strategies = { css: { engine: "tailwind" }, signals: { transport: "ws" } };
    expect(validateConfig(c)).toEqual([]);
  });

  test("a typo is a hard error with a did-you-mean suggestion", () => {
    const c: any = createDefaultConfig();
    c.strategies = { css: { engine: "taiwind" } };
    const errs = validateConfig(c);
    expect(errs.length).toBe(1);
    expect(errs[0].path).toBe("css.engine");
    expect(errs[0].message).toContain('did you mean "tailwind"');
  });

  test("an invalid transport is rejected too", () => {
    const c: any = createDefaultConfig();
    c.strategies = { signals: { transport: "websocket" } };
    const errs = validateConfig(c);
    expect(errs[0].path).toBe("signals.transport");
    expect(errs[0].message).toContain("Allowed: sse, ws, long-poll");
  });
});

describe("strategies.hydration.mode changes what ships", () => {
  const INTERACTIVE = 'page { title "P" render static }\nstate { n = 0 }\ndiv { button on:click "n = n + 1" { "Inc" } p "{n}" }\n';

  test("default (auto): an interactive page ships the runtime", () => {
    const dir = appWith(INTERACTIVE, "export default {};\n");
    try {
      build(dir);
      expect(builtHtml(dir)).toContain("__tw_runtime.js");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("hydration.mode=none ships zero client JS", () => {
    const dir = appWith(INTERACTIVE, 'export default { strategies: { hydration: { mode: "none" } } };\n');
    try {
      build(dir);
      expect(builtHtml(dir)).not.toContain("__tw_runtime.js");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("--hydration=none flag does the same", () => {
    const dir = appWith(INTERACTIVE, "export default {};\n");
    try {
      build(dir, ["--hydration=none"]);
      expect(builtHtml(dir)).not.toContain("__tw_runtime.js");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("hydration.mode=islands skips pages without island markers", () => {
    const dir = appWith(INTERACTIVE, 'export default { strategies: { hydration: { mode: "islands" } } };\n');
    try {
      build(dir);
      expect(builtHtml(dir)).not.toContain("__tw_runtime.js");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("invalid hydration value fails the config, not silently", () => {
    const c: any = createDefaultConfig();
    c.strategies = { hydration: { mode: "sometimes" } };
    const errs = validateConfig(c);
    expect(errs.length).toBe(1);
    expect(errs[0].path).toBe("hydration.mode");
  });
});
