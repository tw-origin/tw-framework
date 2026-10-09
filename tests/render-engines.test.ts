import { describe, test, expect } from "bun:test";
import { detectRenderEngine, renderEnginePackages, ensureRenderEngine, resolveRenderEngine } from "../packages/shared/tw/config/render-engines.ts";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tmp(): string { return mkdtempSync(join(tmpdir(), "tw-render-")); }
function fakePkg(dir: string, name: string, version = "11.0.0"): void {
  const p = join(dir, "node_modules", name);
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, "package.json"), JSON.stringify({ name, version }));
}

describe("render engine: packages", () => {
  test("preact and react map to their packages", () => {
    expect(renderEnginePackages("preact")).toEqual(["preact", "preact-render-to-string"]);
    expect(renderEnginePackages("react")).toEqual(["react", "react-dom"]);
  });
  test("built-in engines need nothing", () => {
    expect(renderEnginePackages("tw-vdom")).toEqual([]);
    expect(renderEnginePackages("none")).toEqual([]);
  });
});

describe("render engine: detection", () => {
  test("tw-vdom and none are built in and always available", () => {
    const dir = tmp();
    try { expect(detectRenderEngine(dir, "tw-vdom").kind).toBe("builtin"); expect(detectRenderEngine(dir, "tw-vdom").available).toBe(true); expect(detectRenderEngine(dir, "none").available).toBe(true); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("preact reports unavailable when it is missing", () => {
    const dir = tmp();
    try { const i = detectRenderEngine(dir, "preact"); expect(i.kind).toBe("foreign"); expect(i.available).toBe(false); expect(i.detail).toContain("preact"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("preact reports available once both packages are installed", () => {
    const dir = tmp();
    try {
      fakePkg(dir, "preact");
      expect(detectRenderEngine(dir, "preact").available).toBe(false);
      fakePkg(dir, "preact-render-to-string");
      const i = detectRenderEngine(dir, "preact");
      expect(i.available).toBe(true); expect(i.detail).toBe("preact found");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("render engine: ensure", () => {
  test("a built-in engine needs no install", async () => {
    const dir = tmp();
    try { const r = await ensureRenderEngine(dir, "tw-vdom", { interactive: false }); expect(r.ok).toBe(true); expect(r.installed).toBe(false); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("non-interactive with a missing engine returns a message, not a throw", async () => {
    const dir = tmp();
    try { const r = await ensureRenderEngine(dir, "preact", { interactive: false }); expect(r.ok).toBe(false); expect(String(r.message)).toContain("npm install -D preact"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("interactive 'no' skips the install and explains how to do it later", async () => {
    const dir = tmp();
    try { const r = await ensureRenderEngine(dir, "preact", { interactive: true, confirm: async () => false }); expect(r.ok).toBe(false); expect(String(r.message)).toContain("skipped"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("an already-installed engine passes without prompting", async () => {
    const dir = tmp();
    try {
      fakePkg(dir, "preact"); fakePkg(dir, "preact-render-to-string");
      let asked = false;
      const r = await ensureRenderEngine(dir, "preact", { interactive: true, confirm: async () => { asked = true; return true; } });
      expect(r.ok).toBe(true); expect(r.installed).toBe(false); expect(asked).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("render engine: config resolution", () => {
  test("reads strategies.render.engine, defaulting to tw-vdom", () => {
    expect(resolveRenderEngine({ strategies: { render: { engine: "preact" } } })).toBe("preact");
    expect(resolveRenderEngine({})).toBe("tw-vdom");
    expect(resolveRenderEngine({ strategies: { render: { engine: "bogus" } } })).toBe("tw-vdom");
  });
});
