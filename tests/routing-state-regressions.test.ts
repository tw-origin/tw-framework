/**
 * — regressions.
 * (middleware exact match), 30/31 (state literals), 33 (OPTIONS),
 * 34 (while condition), 36 (bare returns), 32 (unresolvable components).
 */
import { describe, expect, test } from "bun:test";
import { compileSync } from "../packages/compiler/tw/index.ts";
import { executeRouteHandler, executeMiddleware } from "../packages/server/tw/routing/twm-loader.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function ps(src: string) {
  return compileSync(src, { filePath: "t.tw" });
}

describe("state literal forms", () => {
  test("negative number renders as a number (was '-')", () => {
    const r = ps('page { title "x" render ssr }\nstate { neg = -42 }\np "neg: {neg}"');
    expect(r.html).toContain("neg: -42");
    expect((r as any).stateSeed.neg).toBe(-42);
  });

  test("numeric separators (1_000_000) render the evaluated number", () => {
    const r = ps('page { title "x" render ssr }\nstate { big = 1_000_000 }\np "big: {big}"');
    expect(r.html).toContain("big: 1000000");
    expect((r as any).stateSeed.big).toBe(1000000);
  });

  test("exponent literal (1e3) renders the evaluated number", () => {
    const r = ps('page { title "x" render ssr }\nstate { sci = 1e3 }\np "sci: {sci}"');
    expect(r.html).toContain("sci: 1000");
    expect((r as any).stateSeed.sci).toBe(1000);
  });

  test("plain strings/floats/booleans unchanged (no false positive)", () => {
    const r = ps('page { title "x" render ssr }\nstate { s = "Raj" f = 12.5 b = true }\np "{s} {f} {b}"');
    expect(r.html).toContain("Raj 12.5 true");
  });
});

describe("while condition parsing", () => {
  test("while n < 3 parses the full condition and renders body once when truthy", () => {
    const r = ps('page { title "x" render ssr }\nstate { n = 2 }\ndiv.wp { while n < 3 { p "n is {n}" } }');
    expect(r.html).toContain("<p>n is 2</p>");
  });

  test("falsy comparison renders nothing (still correct)", () => {
    const r = ps('page { title "x" render ssr }\nstate { n = 5 }\ndiv.wp { while n < 3 { p "no" } }');
    expect(r.html).not.toContain("<p>no</p>");
  });

  test("documented boolean while still renders", () => {
    const r = ps('page { title "x" render ssr }\nstate { loading = true }\ndiv { while loading { p "L" } }');
    expect(r.html).toContain("<p>L</p>");
  });
});

describe("unresolvable components fail loudly", () => {
  test("unimported capitalized tag -> comment, not raw HTML", () => {
    const r = ps('page { title "x" render ssr }\ndiv { Nope { p "hi" } }');
    expect(r.html).not.toContain("<Nope");
    expect(r.html).toContain("unknown component 'Nope'");
  });

  test("import { RouterLink } from \"tw\" resolves to a real <a>", () => {
    const r = ps('import { RouterLink } from "tw"\npage { title "x" render ssr }\ndiv.nav { RouterLink { href "/about" "About" } }');
    expect(r.html).toContain("<a href=\"/about\"");
    expect(r.html).not.toContain("<RouterLink");
  });

  test("RouterLink accepts Next-style `to` as an href alias", () => {
    const r = ps('import RouterLink from "@tw/RouterLink"\npage { title "x" render ssr }\ndiv.nav { RouterLink { to "/about" "About" } }');
    expect(r.html).toContain("<a href=\"/about\"");
  });
});

describe("unconditional middleware rules fire on exact match", () => {
  const dir = mkdtempSync(join(tmpdir(), "tw-r4-mw-"));
  const mw = join(dir, "middleware.twm");

  test("exact-path rule with no conditions fires", async () => {
    writeFileSync(mw, 'rule "exact-test" {\n  match "/api/hello"\n  response { status 200, json { matched "exact-rule-fired" } }\n}\n');
    const res = await executeMiddleware(mw, new Request("http://x/api/hello"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(await res!.text()).toContain("exact-rule-fired");
  });

  test("other paths still pass through", async () => {
    const res = await executeMiddleware(mw, new Request("http://x/api/other"));
    expect(res).toBeNull();
  });

  test("conditional rules unchanged (ua block still works)", async () => {
    const mw2 = join(dir, "mw2.twm");
    writeFileSync(mw2, 'rule "bots" {\n  match "/**"\n  user_agent { block ["curl"] }\n  response { status 403 }\n}\n');
    const blocked = await executeMiddleware(mw2, new Request("http://x/any", { headers: { "user-agent": "curl/1" } }));
    expect(blocked?.status).toBe(403);
    const ok = await executeMiddleware(mw2, new Request("http://x/any", { headers: { "user-agent": "Mozilla/5" } }));
    expect(ok).toBeNull();
  });

  test("cleanup", () => { rmSync(dir, { recursive: true, force: true }); });
});

describe("route handler dispatch + return shapes", () => {
  const dir = mkdtempSync(join(tmpdir(), "tw-r4-rh-"));
  const url = "http://x/api/r";

  test("fn options dispatches (was silent 405)", async () => {
    const f = join(dir, "opt.twm");
    writeFileSync(f, 'fn get(request) { return { status: 200, json: { get: true } } }\nfn options(request) { return { status: 204, json: { opt: true } } }\n');
    const r = await executeRouteHandler(f, "OPTIONS", new Request(url, { method: "OPTIONS" }));
    expect(r.status).toBe(204);
    expect((r.json as any).opt).toBe(true);
  });

  test("JS-form export function OPTIONS dispatches too", async () => {
    const f = join(dir, "opt2.twm");
    writeFileSync(f, 'export function OPTIONS(request) { return { status: 204, json: { jsform: true } } }\n');
    const r = await executeRouteHandler(f, "OPTIONS", new Request(url, { method: "OPTIONS" }));
    expect(r.status).toBe(204);
  });

  test("bare string return -> 200 text/plain (was bare 500)", async () => {
    const f = join(dir, "str.twm");
    writeFileSync(f, 'fn get(request) { return "plain string return" }\n');
    const r = await executeRouteHandler(f, "GET", new Request(url));
    expect(r.status).toBe(200);
    expect(r.text).toBe("plain string return");
  });

  test("bad return shape -> clear 500 error naming the shapes", async () => {
    const f = join(dir, "num.twm");
    writeFileSync(f, 'fn get(request) { return 42 }\n');
    const r = await executeRouteHandler(f, "GET", new Request(url));
    expect(r.status).toBe(500);
    expect((r.json as any).error).toContain("Unsupported handler return shape: number");
  });

  test("documented shapes unchanged", async () => {
    const f = join(dir, "good.twm");
    writeFileSync(f, 'fn get(request) { return { status: 201, json: { ok: 1 } } }\n');
    const r = await executeRouteHandler(f, "GET", new Request(url));
    expect(r.status).toBe(201);
    expect((r.json as any).ok).toBe(1);
  });

  test("cleanup", () => { rmSync(dir, { recursive: true, force: true }); });
});

describe("single-quoted page config (lock)", () => {
  test("single-quote title/description compile and render", () => {
    const r = ps("page { title 'Single Q' description 'Desc single' render ssr }\ndiv { p \"ok sq\" }");
    expect(r.html).toContain("<title>Single Q</title>");
    expect(r.html).toContain("ok sq");
  });
});
