/**
 * Cross-field compatibility tests — the combinations that actually break,
 * the supported matrix CI relies on, and `tw doctor`'s machine-readable
 * output + exit codes.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  COMPAT_RULES,
  SUPPORTED_MATRIX,
  checkCompatibility,
  compatErrors,
  createDefaultConfig,
  matrixEntryToConfig,
  resolveStrategies,
  validateConfig,
} from "@tw/shared";

const tw = join(import.meta.dir, "..", "apps", "cli", "tw", "bin.ts");
const cfg = (s: any) => resolveStrategies(s);

describe("compat: unsupported combinations are caught", () => {
  const cases: Array<[string, any]> = [
    ["ws-needs-bun", { signals: { transport: "ws" }, runtime: { server: "node" } }],
    ["ws-needs-bun", { signals: { transport: "ws" }, runtime: { server: "edge" } }],
    ["no-renderer-no-hydration", { render: { engine: "none" }, hydration: { mode: "full" } }],
    ["islands-need-a-renderer", { render: { engine: "none" }, hydration: { mode: "islands" } }],
    ["zero-js-vs-client-model", { hydration: { mode: "none" }, state: { model: "hooks" } }],
    ["zero-js-vs-client-model", { hydration: { mode: "none" }, render: { engine: "react" } }],
    ["isr-needs-writable-cache", { cache: { mode: "isr" }, runtime: { server: "edge" } }],
    ["hooks-need-react", { state: { model: "hooks" }, render: { engine: "tw-vdom" } }],
    ["store-needs-client-js", { state: { model: "store" }, hydration: { mode: "none" } }],
  ];

  for (const [id, partial] of cases) {
    test(`${id} fires for ${JSON.stringify(partial)}`, () => {
      const issues = compatErrors(cfg(partial));
      expect(issues.map((i) => i.id)).toContain(id);
      const issue = issues.find((i) => i.id === id)!;
      expect(issue.tier).toBe("unsupported");
      expect(issue.fix.length).toBeGreaterThan(10);   // every conflict teaches a fix
    });
  }

  test("defaults have no conflicts at all", () => {
    expect(checkCompatibility(cfg({}))).toEqual([]);
  });

  test("best-effort warnings exist but are not errors", () => {
    const edgeSafe = { signals: { transport: "sse" }, runtime: { server: "edge" }, cache: { mode: "cdn" }, api: { runtime: "edge" } };
    const sse = checkCompatibility(cfg(edgeSafe));
    expect(sse.some((i) => i.id === "sse-on-edge-timeouts" && i.tier === "best-effort")).toBe(true);
    expect(compatErrors(cfg(edgeSafe))).toEqual([]);
  });
});

describe("compat: the supported matrix CI runs", () => {
  test("every supported combo is conflict-free", () => {
    for (const entry of SUPPORTED_MATRIX) {
      const resolved = cfg(matrixEntryToConfig(entry));
      const issues = checkCompatibility(resolved);
      const hard = issues.filter((i) => i.tier === "unsupported");
      expect({ entry, hard }).toEqual({ entry, hard: [] });
    }
  });

  test("the matrix actually varies the families it claims to cover", () => {
    const transports = new Set(SUPPORTED_MATRIX.map((e) => e["signals.transport"]));
    const css = new Set(SUPPORTED_MATRIX.map((e) => e["css.engine"]));
    const runtimes = new Set(SUPPORTED_MATRIX.map((e) => e["runtime.server"]));
    expect(transports.size).toBeGreaterThanOrEqual(3);
    expect(css.size).toBeGreaterThanOrEqual(3);
    expect(runtimes.size).toBeGreaterThanOrEqual(3);
  });

  test("every rule id is unique", () => {
    const ids = COMPAT_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("compat: config validation surfaces it as a hard error", () => {
  test("ws + node fails the config with the fix in the message", () => {
    const c: any = createDefaultConfig();
    c.strategies = { signals: { transport: "ws" }, runtime: { server: "node" } };
    const errs = validateConfig(c);
    expect(errs.length).toBe(1);
    expect(errs[0].message).toContain("unsupported combination");
    expect(errs[0].message).toContain("fix:");
  });

  test("a typo is reported first (compat is not checked until fields are valid)", () => {
    const c: any = createDefaultConfig();
    c.strategies = { signals: { transport: "wss" }, runtime: { server: "node" } };
    const errs = validateConfig(c);
    expect(errs.length).toBe(1);                 // only the typo, no compat noise
    expect(errs[0].path).toBe("signals.transport");
  });
});

describe("tw doctor: json + exit codes", () => {
  function run(dir: string, args: string[]) {
    return spawnSync("bun", [tw, "doctor", ...args], { cwd: dir, encoding: "utf8" });
  }
  const dir = mkdtempSync(join(tmpdir(), "tw-doc2-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }));

  test("clean config exits 0", () => {
    expect(run(dir, []).status).toBe(0);
  });
  test("invalid value exits 1", () => {
    expect(run(dir, ["--css=nope"]).status).toBe(1);
  });
  test("unsupported combination exits 2", () => {
    expect(run(dir, ["--signals=ws", "--runtime=node"]).status).toBe(2);
  });
  test("unavailable option exits 3", () => {
    expect(run(dir, ["--css=tailwind"]).status).toBe(3);
  });
  test("--json is machine readable and carries the same verdict", () => {
    const r = run(dir, ["--signals=ws", "--runtime=node", "--json"]);
    expect(r.status).toBe(2);
    const report = JSON.parse(r.stdout);
    expect(report.ok).toBe(false);
    expect(report.exitCode).toBe(2);
    expect(report.conflicts[0].id).toBe("ws-needs-bun");
    expect(report.conflicts[0].fix).toContain("bun");
    expect(report.strategies.signals.transport).toBe("ws");
    expect(Array.isArray(report.availability)).toBe(true);
  });
  test("human output has a Conflicts section with fixes", () => {
    const out = run(dir, ["--signals=ws", "--runtime=node"]).stdout;
    expect(out).toContain("Conflicts");
    expect(out).toContain("fix:");
  });
  test("cleanup", () => { rmSync(dir, { recursive: true, force: true }); });
});
