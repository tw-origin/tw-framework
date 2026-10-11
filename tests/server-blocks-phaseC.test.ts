/**
 * Server blocks -- Phase C (compiler-side): encoding, source stripping, name
 * collisions, static-page rules and execution.
 */

import { describe, test, expect } from "bun:test";
import {
  parseWithDetails, compileSync,
  encodeServerValue, collectServerBlocks, stripServerBlockRegions,
  serverStateCollisions, scanRequestAccess, checkServerBlocks,
  executeServerBlock, executeServerBlocks,
} from "@tw/compiler";
import { collectClientImportsFromSource, findServerOnlyViolations } from "../apps/cli/tw/commands/client-bundle";

function parseSB(src: string) {
  return parseWithDetails(src, { filePath: "<test>", cache: false, experimental: { serverBlocks: true } } as any);
}
const blocks = (src: string) => collectServerBlocks(parseSB(src).program);

describe("Phase C: encoding matches state { } (B)", () => {
  const literals: [string, unknown][] = [
    ['"hi"', "hi"], ["42", 42], ["true", true], ["null", null], ['""', ""],
    ['"say \\"hi\\""', 'say "hi"'], ['"{\\"a\\":1}"', '{"a":1}'], ['"123"', "123"],
    ['"true"', "true"], ["[1,2,3]", [1, 2, 3]], ["{x:1}", { x: 1 }],
  ];

  for (const [lit, val] of literals) {
    test(`server value ${JSON.stringify(val)} encodes like state { ${lit} }`, () => {
      const p: any = parseWithDetails(`state { v = ${lit} }`, { filePath: "s.tw", cache: false });
      const sd = p.program.directives.find((d: any) => d.type === "StateDirective");
      const stateEncoded = sd.declarations[0].value;
      expect(encodeServerValue(val)).toBe(stateEncoded);
    });
  }

  test("undefined -> empty string", () => {
    expect(encodeServerValue(undefined)).toBe("");
  });

  test("a string value '{\"a\":1}' renders as literal text, not an object", () => {
    const r = compileSync('p "{g}"', { filePath: "t.tw", stateVars: { g: '{"a":1}' } });
    expect(r.html).toContain("{&quot;a&quot;:1}");
    expect(r.html).not.toContain("<span>1</span>");
  });

  test("REPORTED: member access on a JSON-looking string is misread as an object", () => {
    // `{g}` (bare) is literal, but `{g.a}` runs the evaluator, which JSON-parses
    // the string. This is a pre-existing evaluator behaviour, not a Phase C bug.
    const r = compileSync('p "{g.a}"', { filePath: "t.tw", stateVars: { g: '{"a":1}' } });
    expect(r.html).toContain(">1<");
  });
});

describe("Phase C: strip server regions (C)", () => {
  const src = 'server {\n  import { db } from "lib/db"\n  const a = 1\n}\nh1 "x"';

  test("stripping removes the block but keeps offsets/newlines", () => {
    const stripped = stripServerBlockRegions(src, blocks(src));
    expect(stripped).not.toContain("lib/db");
    expect(stripped).not.toContain("server");
    expect(stripped.length).toBe(src.length);
    expect(stripped.split("\n").length).toBe(src.split("\n").length);
  });

  test("block imports never reach the client scan", () => {
    // Raw source: the regex scan DOES see the block's import (the bug).
    expect(collectClientImportsFromSource(src).some((l) => l.includes("lib/db"))).toBe(true);
    // Stripped: it does not.
    const stripped = stripServerBlockRegions(src, blocks(src));
    expect(collectClientImportsFromSource(stripped).some((l) => l.includes("lib/db"))).toBe(false);
    expect(findServerOnlyViolations(stripped).length).toBe(0);
  });
});

describe("Phase C: collisions (4, D)", () => {
  test("server name colliding with state { }", () => {
    const p = parseSB('state { a = 1 }\nserver { const a = 2 }').program;
    expect(serverStateCollisions(p).map((c) => c.name)).toEqual(["a"]);
    expect(checkServerBlocks(p).some((x) => x.code === "TW102")).toBe(true);
  });

  test("server name colliding with a route param", () => {
    const p = parseSB('server { const id = 1 }').program;
    const probs = checkServerBlocks(p, { paramNames: ["id"] });
    expect(probs.some((x) => x.code === "TW102")).toBe(true);
  });

  test("compile surfaces the collision", () => {
    const r = compileSync('state { a = 1 }\nserver { const a = 2 }', { filePath: "t.tw", experimental: { serverBlocks: true } });
    expect(r.diagnostics.some((d: any) => d.code === "TW102")).toBe(true);
  });
});

describe("Phase C: static-page rules (5)", () => {
  test("scanRequestAccess finds direct reads only", () => {
    expect([...scanRequestAccess("const o = {headers:1}; obj.headers; const h = headers.a")]).toEqual(["headers"]);
  });

  test("static + headers/cookies/query = TW103; params w/o generate = TW104", () => {
    const p = parseSB("server { const a = headers.a; const b = cookies.c; const c = query.q; const d = params.id }").program;
    const probs = checkServerBlocks(p, { mode: "static", hasEnumeratedParams: false });
    expect(probs.filter((x) => x.code === "TW103").length).toBe(3);
    expect(probs.some((x) => x.code === "TW104")).toBe(true);
  });

  test("static + params WITH enumerated params is fine", () => {
    const p = parseSB("server { const d = params.id }").program;
    expect(checkServerBlocks(p, { mode: "static", hasEnumeratedParams: true }).length).toBe(0);
  });

  test("ssr is not restricted", () => {
    const p = parseSB("server { const a = headers.a; const d = params.id }").program;
    expect(checkServerBlocks(p, { mode: "ssr" }).length).toBe(0);
  });

  test("layout + server block = TW105", () => {
    const p = parseSB("server { const a = 1 }").program;
    expect(checkServerBlocks(p, { isLayout: true }).some((x) => x.code === "TW105")).toBe(true);
  });
});

describe("Phase C: execution (D)", () => {
  test("transpiled TypeScript runs (types stripped)", async () => {
    const out = await executeServerBlock(blocks("server { const a: number = 1 + 1; const s: string = 'z' }")[0], {});
    expect(out).toEqual({ a: 2, s: "z" });
  });

  test("request context is frozen and includes env", async () => {
    const out = await executeServerBlock(
      blocks("server { const f = Object.isFrozen(params); const g = Object.isFrozen(env); const k = env.K }")[0],
      { context: { params: { id: "7" }, env: { K: "v" } } },
    );
    expect(out).toEqual({ f: true, g: true, k: "v" });
  });

  test("imports are resolved outside and injected", async () => {
    const out = await executeServerBlock(
      blocks('server { import { db } from "x"; const a = db.v }')[0],
      { imports: { db: { v: 5 } } },
    );
    expect(out).toEqual({ a: 5 });
  });

  test("multi-block source order shares one scope", async () => {
    const out = await executeServerBlocks(blocks("server { const a = 1 }\nserver { const b = a + 1 }"), {});
    expect(out).toEqual({ a: 1, b: 2 });
  });

  test("a later block cannot see a later name", async () => {
    const out = await executeServerBlocks(blocks("server { const a = typeof b }\nserver { const b = 1 }"), {});
    expect(out.a).toBe("undefined");
  });

  test("a throw propagates (the caller maps it to 500 / build failure)", async () => {
    await expect(executeServerBlock(blocks("server { throw new Error('boom') }")[0], {})).rejects.toThrow("boom");
  });
});
