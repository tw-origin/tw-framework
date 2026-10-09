/**
 * Strategy layer tests — every subsystem's options, the resolver, the
 * validator (with "did you mean" suggestions) and the CLI flag parser.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_STRATEGIES,
  STRATEGY_OPTIONS,
  changedStrategies,
  describeStrategies,
  parseStrategyFlags,
  resolveStrategies,
  validateStrategies,
} from "@tw/shared";

describe("strategies: defaults are today's behaviour", () => {
  test("resolve with no input returns the defaults", () => {
    const r = resolveStrategies();
    expect(r.signals.transport).toBe("sse");
    expect(r.css.engine).toBe("tss");
    expect(r.render.engine).toBe("tw-vdom");
    expect(r.cache.mode).toBe("isr");
    expect(r.packages.manager).toBe("auto");
  });

  test("every family has at least two options (no forced single choice)", () => {
    for (const [path, allowed] of Object.entries(STRATEGY_OPTIONS)) {
      expect(allowed.length).toBeGreaterThan(1);
    }
  });

  test("partial config merges per-field, others stay default", () => {
    const r = resolveStrategies({ css: { engine: "tailwind" } } as any);
    expect(r.css.engine).toBe("tailwind");
    expect(r.signals.transport).toBe("sse");   // untouched
    expect(r.render.engine).toBe("tw-vdom");   // untouched
  });

  test("unknown fields are ignored, not fatal", () => {
    const r = resolveStrategies({ nope: { x: 1 }, css: { engine: "css" } } as any);
    expect(r.css.engine).toBe("css");
    expect((r as any).nope).toBeUndefined();
  });
});

describe("strategies: validation with suggestions", () => {
  test("valid config has no issues", () => {
    expect(validateStrategies({ signals: { transport: "ws" }, css: { engine: "scss" } } as any)).toEqual([]);
  });

  test("invalid value is rejected with allowed list", () => {
    const issues = validateStrategies({ signals: { transport: "websocket" } } as any);
    expect(issues.length).toBe(1);
    expect(issues[0].path).toBe("signals.transport");
    expect(issues[0].message).toContain("Allowed: sse, ws, long-poll");
  });

  test("near-miss gets a 'did you mean' suggestion", () => {
    const issues = validateStrategies({ signals: { transport: "wss" } } as any);
    expect(issues[0].suggestion).toBe("ws");
    expect(issues[0].message).toContain('did you mean "ws"');
  });

  test("garbage value: no suggestion, still an error", () => {
    const issues = validateStrategies({ css: { engine: "zzzzzzzz" } } as any);
    expect(issues[0].suggestion).toBeUndefined();
    expect(issues[0].message).toContain("Invalid css.engine");
  });
});

describe("strategies: CLI flags", () => {
  test("--flag=value form", () => {
    const o: any = parseStrategyFlags(["--css=tailwind", "--signals=ws"]);
    expect(o.css.engine).toBe("tailwind");
    expect(o.signals.transport).toBe("ws");
  });

  test("--flag value form", () => {
    const o: any = parseStrategyFlags(["--render", "react", "--api", "edge"]);
    expect(o.render.engine).toBe("react");
    expect(o.api.runtime).toBe("edge");
  });

  test("unrelated flags are ignored", () => {
    const o: any = parseStrategyFlags(["--port", "3000", "--verbose"]);
    expect(Object.keys(o).length).toBe(0);
  });

  test("invalid flag value survives to validation (so it can be rejected)", () => {
    const o: any = parseStrategyFlags(["--signals=bogus"]);
    const issues = validateStrategies(o);
    expect(issues.length).toBe(1);
    expect(issues[0].path).toBe("signals.transport");
  });
});

describe("strategies: reporting", () => {
  test("changedStrategies lists only non-default fields", () => {
    const r = resolveStrategies({ css: { engine: "tailwind" }, cache: { mode: "swr" } } as any);
    const changed = changedStrategies(r);
    const paths = changed.map((c) => c.path).sort();
    expect(paths).toEqual(["cache.mode", "css.engine"]);
  });

  test("describeStrategies returns one line per family", () => {
    const lines = describeStrategies(DEFAULT_STRATEGIES);
    expect(lines.length).toBe(Object.keys(STRATEGY_OPTIONS).length);
    expect(lines[0]).toContain("signals.transport");
  });
});

describe("tw doctor", () => {
  test("runs on a project and reports active strategies", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-doctor-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }));
      const tw = join(import.meta.dir, "..", "apps", "cli", "tw", "bin.ts");
      const r = spawnSync("bun", [tw, "doctor"], { cwd: dir, encoding: "utf8" });
      const out = (r.stdout ?? "") + (r.stderr ?? "");
      expect(out).toContain("tw doctor");
      expect(out).toContain("Active strategies");
      expect(out).toContain("signals.transport");
      expect(out).toContain("Availability");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rejects an invalid strategy flag with exit code 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-doctor-bad-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }));
      const tw = join(import.meta.dir, "..", "apps", "cli", "tw", "bin.ts");
      const r = spawnSync("bun", [tw, "doctor", "--css=nope"], { cwd: dir, encoding: "utf8" });
      const out = (r.stdout ?? "") + (r.stderr ?? "");
      expect(out).toContain("Invalid css.engine");
      expect(r.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
