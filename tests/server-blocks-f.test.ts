/**
 * Phase F -- serialization contract, size cap, env guard, lints.
 */

import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateSerializable, toJsonSafe, collectReferencedNames, scanNonSerializableInitializers,
  scanEnvInMarkup, secretEnvValues, containsSecret, lintSql, lintSsrf, ServerSerializationError,
  checkServerBlocks, parseWithDetails, collectServerBlocks, executeServerBlocks,
} from "@tw/compiler";

const { RenderPipeline } = await import("../packages/server/tw/routing/render-pipeline.ts") as any;
const SB = { filePath: "<t>", cache: false, experimental: { serverBlocks: true } } as any;

describe("F: serialization guard", () => {
  const okVals: [string, any][] = [
    ["string", "x"], ["number", 1], ["bool", true], ["null", null], ["undef", undefined],
    ["date", new Date("2020-01-02T03:04:05.000Z")],
    ["nested", { a: [1, { b: "c" }] }],
  ];
  for (const [label, v] of okVals) test(`allows ${label}`, () => expect(() => validateSerializable(v, "f.tw", "x")).not.toThrow());

  test("Date serializes to an ISO string", () => {
    expect(toJsonSafe({ d: new Date("2020-01-02T03:04:05.000Z") })).toBe('{"d":"2020-01-02T03:04:05.000Z"}');
  });

  const badVals: [string, any][] = [
    ["function", () => 1], ["symbol", Symbol("s")], ["bigint", BigInt(1)], ["number", NaN],
    ["number", Infinity], ["map", new Map()], ["set", new Set()], ["weakmap", new WeakMap()],
    ["promise", Promise.resolve(1)], ["class-instance", new (class { x = 1 })()],
  ];
  for (const [kind, v] of badVals) {
    test(`rejects ${kind} (no value in the message)`, () => {
      let err: any;
      try { validateSerializable(v, "f.tw", "secretName"); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(ServerSerializationError);
      expect(err.kind).toBe(kind);
      expect(err.variable).toBe("secretName");
      expect(err.message).toContain("not serializable");
    });
  }

  test("rejects a cycle and over-depth", () => {
    const a: any = {}; a.self = a;
    expect(() => validateSerializable(a, "f.tw", "x")).toThrow(/cycle/);
    let deep: any = 1; for (let i = 0; i < 25; i++) deep = { n: deep };
    expect(() => validateSerializable(deep, "f.tw", "x")).toThrow(/depth/);
  });
});

describe("F: referenced names", () => {
  test("collectReferencedNames finds template identifiers", () => {
    const r = collectReferencedNames('p "{name} has {items.length}"\n');
    expect(r.has("name")).toBe(true);
    expect(r.has("items")).toBe(true);
    expect(r.has("unused")).toBe(false);
  });

  test("payload excludes unreferenced declared names", async () => {
    const blocks = collectServerBlocks(parseWithDetails('server {\n  const helper = () => 1\n  const big = [1,2,3]\n  const name = "ok"\n}\np "n={name}"\n', SB).program);
    const vals = await executeServerBlocks(blocks, { context: { params: {} }, referenced: new Set(["name"]) });
    expect(Object.keys(vals)).toEqual(["name"]);
  });
});

describe("F: compile-time checks + lints", () => {
  test("TW113: a referenced function/Map initializer", () => {
    const prog = parseWithDetails('server {\n  const f = () => 1\n  const m = new Map()\n}\np "a={f} b={m}"\n', SB).program;
    const probs = checkServerBlocks(prog, { referenced: new Set(["f", "m"]) });
    expect(probs.filter((p: any) => p.code === "TW113").length).toBe(2);
  });

  test("an unreferenced helper function is fine", () => {
    const prog = parseWithDetails('server {\n  const f = () => 1\n  const n = "x"\n}\np "n={n}"\n', SB).program;
    expect(checkServerBlocks(prog, { referenced: new Set(["n"]) }).some((p: any) => p.code === "TW113")).toBe(false);
  });

  test("TW115: env read (syntactic) and alias", () => {
    const prog = parseWithDetails('server {\n  const k = env.SECRET\n}\np "k={k}"\n', SB).program;
    expect(checkServerBlocks(prog, { referenced: new Set(["k"]) }).some((p: any) => p.code === "TW115")).toBe(true);
  });

  test("TW116 SQL lint fires; a constant query does not", () => {
    const bad = parseWithDetails('server {\n  const q = `SELECT * FROM t WHERE id = ${params.id}`\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(bad).some((p: any) => p.code === "TW116")).toBe(true);
    const good = parseWithDetails('server {\n  const q = `SELECT * FROM t WHERE id = ?`\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(good).some((p: any) => p.code === "TW116")).toBe(false);
  });

  test("TW117 SSRF lint fires; a constant URL does not", () => {
    const bad = parseWithDetails('server {\n  const r = await fetch(`https://a/${params.host}`)\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(bad).some((p: any) => p.code === "TW117")).toBe(true);
    const good = parseWithDetails('server {\n  const r = await fetch("https://api.example.com/x")\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(good).some((p: any) => p.code === "TW117")).toBe(false);
  });
});

describe("F: env runtime backstop", () => {
  test("secret-looking env values are detected", () => {
    const secrets = secretEnvValues({ API_KEY: "supersecretvalue", SHORT: "abc", OTHER: "x" });
    expect(secrets.map((s) => s.name)).toEqual(["API_KEY"]);
  });

  test("a secret embedded in a larger string is caught; a short value is not", () => {
    const secrets = secretEnvValues({ API_KEY: "supersecretvalue" });
    expect(containsSecret("prefix supersecretvalue suffix", secrets)).toBe("API_KEY");
    expect(containsSecret("nothing here", secrets)).toBe(null);
    expect(containsSecret("abc", secretEnvValues({ X: "abc" }))).toBe(null);
  });
});

describe("F: size cap", () => {
  test("executeServerBlocks throws TW114 over the cap", async () => {
    const blocks = collectServerBlocks(parseWithDetails('server {\n  const big = "x".repeat(200)\n}\np "b={big}"\n', SB).program);
    await expect(executeServerBlocks(blocks, { context: { params: {} }, referenced: new Set(["big"]), maxPayloadBytes: 50, label: "p.tw" })).rejects.toThrow(/TW114/);
  });

  test("ssr over the cap -> 500", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-f-"));
    mkdirSync(join(dir, "home"), { recursive: true });
    writeFileSync(join(dir, "tw.config.ts"), "export default {}");
    writeFileSync(join(dir, "home", "page.tw"), 'server {\n  const big = "x".repeat(300)\n}\np "b={big}"\n');
    const p = new RenderPipeline({ rootDir: dir, homeDir: join(dir, "home"), enableCache: true, serverBlocks: true });
    (p as any).maxPayloadBytes = 50;
    const r = await p.renderWithServerBlocks("/", new Request("http://localhost/"));
    expect(r.status).toBe(500);
    expect(r.html).not.toContain("xxx");
  });
});
