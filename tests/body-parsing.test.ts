/**
 * Body parsing, compile diagnostics,
 * .twm syntax validation, derivedSignal+publicSignal.
 */
import { describe, expect, test } from "bun:test";
import { compileSync } from "../packages/compiler/tw/index.ts";
import { validateTWMSyntax } from "../packages/server/tw/routing/twm-loader.ts";
import { executeRouteHandler } from "../packages/server/tw/routing/twm-loader.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function diags(src: string) {
  const r = compileSync(src, { filePath: "t.tw" });
  return r.diagnostics || [];
}

describe("silent-garbage compile diagnostics", () => {
  test("TW094: space-separated array literal is a build ERROR", () => {
    const d = diags('page { title "x" render ssr }\nstate { items = ["apple" "banana" "cherry"] }');
    expect(d.some(x => x.code === "TW094" && x.severity === "error")).toBe(true);
  });

  test("TW094: valid colon object does NOT trigger (no false positive)", () => {
    const d = diags('page { title "x" render ssr }\nstate { cfg = { a: 1, b: 2 } }');
    expect(d.some(x => x.code === "TW094")).toBe(false);
  });

  test("comma-separated array does NOT trigger TW094 (no false positive)", () => {
    const d = diags('page { title "x" render ssr }\nstate { items = ["a", "b", "c"] }');
    expect(d.some(x => x.code === "TW094")).toBe(false);
  });

  test("TW095: bare unbracketed array iterable is an ERROR", () => {
    const d = diags('page { title "x" render ssr }\nul { for item in ["a" "b"] { li "I: {item}" } }');
    expect(d.some(x => x.code === "TW095" && x.severity === "error")).toBe(true);
  });

  test("documented {list} loop form does NOT trigger TW095", () => {
    const d = diags('page { title "x" render ssr }\nstate { list = ["a", "b"] }\nul { for it in {list} { li "{it}" } }');
    expect(d.some(x => x.code === "TW095")).toBe(false);
  });

  test("TW096: unknown state var in interpolation is a WARNING", () => {
    const d = diags('page { title "x" render ssr }\nstate { price = 10 }\nh2 "Val: {ghost_variable}"');
    const tw096 = d.find(x => x.code === "TW096");
    expect(tw096).toBeTruthy();
    expect(tw096!.severity).toBe("warning");
  });

  test("TW096: loop variables do NOT false-positive", () => {
    const d = diags('page { title "x" render ssr }\nstate { list = ["a"] }\nul { for it in {list} { li "Item: {it}" } }');
    expect(d.some(x => x.code === "TW096")).toBe(false);
  });
});

describe("derivedSignal over publicSignal", () => {
  test("stateSeed computes AND the interpolation renders the value", () => {
    const r = compileSync(
      'page { title "x" render ssr }\nstate { price = publicSignal(150.25) qty = 2 total = derivedSignal("price * qty") }\np "T: {total}"',
      { filePath: "d.tw" },
    );
    expect((r as any).stateSeed.total).toBe(300.5);
    expect(r.html).toContain("300.5");
    expect(r.html).not.toContain("price * qty");
  });
});

describe(".twm syntax validation", () => {
  const dir = mkdtempSync(join(tmpdir(), "tw-r3-"));

  test("broken route returns the syntax error message", () => {
    const f = join(dir, "broken.twm");
    writeFileSync(f, "fn get(request) {\n  return { status 200 json { ok } }\n}\n");
    const err = validateTWMSyntax(f);
    expect(err).toBeTruthy();
  });

  test("valid route returns null", () => {
    const f = join(dir, "good.twm");
    writeFileSync(f, 'fn get(request) {\n  return { status: 200, json: { ok: true } }\n}\n');
    expect(validateTWMSyntax(f)).toBeNull();
  });

  test("rule DSL validates too", () => {
    const f = join(dir, "rules.twm");
    writeFileSync(f, 'rule "block secret" {\n  match "/secret/**"\n  user_agent {\n    block ["bot"]\n  }\n  response {\n    status 403\n  }\n}\n');
    expect(validateTWMSyntax(f)).toBeNull();
  });

  test("cleanup", () => { rmSync(dir, { recursive: true, force: true }); });
});

describe("strict request-body parsing", () => {
  const dir = mkdtempSync(join(tmpdir(), "tw-r3b-"));
  const route = join(dir, "echo.twm");
  writeFileSync(route, 'fn post(request) {\n  return { status: 201, json: { received: request.body } }\n}\n');
  const url = "http://x/api/echo";

  test("malformed JSON body -> 400, not a silent {}", async () => {
    const res = await executeRouteHandler(route, "POST", new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad json",
    }), { params: {} }, route);
    expect(res.status).toBe(400);
    expect((res.json as any).error).toContain("Invalid JSON body");
  });

  test("text/plain body passes through as the raw string", async () => {
    const res = await executeRouteHandler(route, "POST", new Request(url, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello plain",
    }), { params: {} }, route);
    expect(res.status).toBe(201);
    expect((res.json as any).received).toBe("hello plain");
  });

  test("urlencoded body parses as a form object", async () => {
    const res = await executeRouteHandler(route, "POST", new Request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "a=1&b=2",
    }), { params: {} }, route);
    expect((res.json as any).received).toEqual({ a: "1", b: "2" });
  });

  test("valid JSON still parses", async () => {
    const res = await executeRouteHandler(route, "POST", new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"ok":1}',
    }), { params: {} }, route);
    expect((res.json as any).received).toEqual({ ok: 1 });
  });

  test("cleanup", () => { rmSync(dir, { recursive: true, force: true }); });
});
