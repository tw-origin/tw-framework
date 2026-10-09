import { describe, test, expect } from "bun:test";
import { resolveApiRuntime, detectApiRuntime, checkEdgeSafety, EDGE_UNSAFE_MODULES } from "../packages/shared/tw/config/api-runtimes.ts";

// strategies.api.runtime: node (default) | edge. An edge handler is checked at
// build time so a deploy never breaks at run time.

describe("api runtime: resolution", () => {
  test("defaults to node", () => {
    expect(resolveApiRuntime({})).toBe("node");
    expect(resolveApiRuntime({ strategies: { api: { runtime: "bogus" } } })).toBe("node");
  });
  test("edge is read from the strategy", () => {
    expect(resolveApiRuntime({ strategies: { api: { runtime: "edge" } } })).toBe("edge");
  });
  test("detect describes both options", () => {
    expect(detectApiRuntime("node").runtime).toBe("node");
    expect(detectApiRuntime("edge").detail).toContain("isolate");
    expect(detectApiRuntime("anything").runtime).toBe("node");
  });
});

describe("api runtime: edge safety", () => {
  test("a clean handler has no violations", () => {
    const src = [
      'import { json } from "@tw/server";',
      "export async function get(request) {",
      "  return json({ ok: true });",
      "}",
    ].join("\n");
    expect(checkEdgeSafety(src, "clean.twm")).toEqual([]);
  });

  test("a filesystem import is flagged with its line", () => {
    const src = ['import { readFileSync } from "node:fs";', "export function get() {}"].join("\n");
    const v = checkEdgeSafety(src, "a.twm");
    expect(v.length).toBe(1);
    expect(v[0].what).toContain("node:fs");
    expect(v[0].line).toBe(1);
  });

  test("child_process and process.env are flagged", () => {
    const src = ['import { execSync } from "child_process";', "export function get() { return process.env.KEY; }"].join("\n");
    const v = checkEdgeSafety(src, "b.twm");
    expect(v.some((x) => x.what.includes("child_process"))).toBe(true);
    expect(v.some((x) => x.what.includes("process"))).toBe(true);
  });

  test("Buffer and require() are flagged", () => {
    const src = "export function get() { const b = Buffer.from('x'); return b; }";
    expect(checkEdgeSafety(src, "c.twm").some((v) => v.what === "Buffer")).toBe(true);
    expect(checkEdgeSafety("const x = require('fs');", "d.twm").length).toBeGreaterThan(0);
  });

  test("a mention inside a comment or string does not count", () => {
    const src = [
      "// this handler does not use node:fs",
      'const note = "child_process is not allowed here";',
      "export function get() {}",
    ].join("\n");
    expect(checkEdgeSafety(src, "e.twm")).toEqual([]);
  });

  test("every unsafe module is recognised by name", () => {
    for (const mod of ["fs", "node:fs", "child_process", "worker_threads", "net", "tls"]) {
      expect(EDGE_UNSAFE_MODULES.has(mod)).toBe(true);
    }
  });
});
