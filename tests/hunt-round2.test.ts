/**
 * TW Framework -- second external audit round regressions:
 *   - #8  static: full containment check (bare `..` survives the strip regex)
 *   - #9  body parser: chunked / no-Content-Length bodies are no longer skipped
 *   - #10 body parser: declared-oversize rejected before buffering; stream
 *         aborted at the limit; BodyParser.parse() now enforces limits too
 *   - #11 template filter pipes (`{name | uppercase}`) were dead code
 *   - #12 http client cache keys on path + query params
 */
import { describe, test, expect, afterAll } from "bun:test";
import { bodyParse, BodyParser } from "../packages/server/tw/middleware/body-parser";
import { StaticHandler } from "../packages/server/tw/static/index.ts";
import { evaluate } from "../packages/compiler/tw/eval/evaluate";
import { HttpClient } from "../packages/runtime/tw/http/http-client";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("audit2: static containment", () => {
  const parent = mkdtempSync(join(tmpdir(), "twa2-"));
  const root = join(parent, "public");
  mkdirSync(root);
  mkdirSync(join(parent, "secret-sibling"));
  writeFileSync(join(root, "index.html"), "<h1>ROOT</h1>");
  writeFileSync(join(parent, "secret-sibling", "index.html"), "<h1>SIBLING</h1>");
  const h = new StaticHandler({ root });

  test("bare `..` and dot-segments never escape the root", async () => {
    for (const p of ["..", "foo/../..", "./hidden", "sub/../../x"]) {
      const r = await h.serve(p);
      expect(r.status).toBe(404);
    }
  });

  test("a sibling directory is not reachable", async () => {
    const r = await h.serve("../secret-sibling/index.html");
    expect(r.status).toBe(404);
  });

  test("normal files still serve", async () => {
    const r = await h.serve("/index.html");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("ROOT");
  });
});

describe("audit2: body parser", () => {
  test("chunked body (no content-length) is still parsed", async () => {
    // A real Request whose body is a stream and carries no Content-Length.
    const body = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode('{"a":1}')); c.close(); },
    });
    const req = new Request("http://x/api", { method: "POST", body, headers: { "content-type": "application/json", "transfer-encoding": "chunked" } });
    let parsed: unknown;
    const mw = bodyParse();
    await mw(req as any, {} as any, () => { parsed = (req as any).body; });
    expect(parsed).toEqual({ a: 1 });
  });

  test("declared oversize content-length is rejected before reading", async () => {
    // Plain-object shim: the Request constructor overrides our
    // content-length header with the real body length (or drops it).
    const req = {
      headers: { get: (k: string) => (k === "content-length" ? "999999" : k === "content-type" ? "application/json" : null) },
      body: null,
      text: async () => '{"a":1}',
    } as any;
    const res: any = { headers: new Map() as any, status: 0 };
    res.headers.set = res.headers.set.bind(res.headers);
    const mw = bodyParse({ json: { limit: 10 } });
    await mw(req as any, res, () => {});
    expect(res.status).toBe(400);
  });

  test("streamed body crossing the limit is aborted", async () => {
    // 5KB body, 100-byte limit, no content-length (chunked-style).
    const body = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode("x".repeat(5000))); c.close(); },
    });
    const req = new Request("http://x/api", { method: "POST", body, headers: { "content-type": "text/plain" } });
    const res: any = { headers: new Map() as any, status: 0 };
    res.headers.set = res.headers.set.bind(res.headers);
    const mw = bodyParse({ text: { limit: 100 } });
    await mw(req as any, res, () => {});
    expect(res.status).toBe(400);
    expect(res.body).toContain("exceeds limit");
  });

  test("BodyParser.parse() enforces configured limits", async () => {
    const bp = new BodyParser({ json: { limit: 10 } });
    const big = JSON.stringify({ data: "x".repeat(500) });
    const req = new Request("http://x/api", { method: "POST", body: big, headers: { "content-type": "application/json", "content-length": String(big.length) } });
    let err: unknown = null;
    try { await bp.parse(req); } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect((err as Error).message).toContain("exceeds limit");
    // and within limits it parses fine
    const okReq = new Request("http://x/api", { method: "POST", body: '{"a":1}', headers: { "content-type": "application/json", "content-length": "7" } });
    expect((await bp.parse(okReq)).json).toEqual({ a: 1 });
  });
});

describe("audit2: template filters", () => {
  test("pipe filters now evaluate (were permanently dead code)", () => {
    const vars: Record<string, string> = { name: "kanishk", price: "42.5" };
    expect(evaluate("name | uppercase", vars)).toBe("KANISHK");
    expect(evaluate("name | upper", vars)).toBe("KANISHK");
    expect(evaluate("name | capitalize", vars)).toBe("Kanishk");
    expect(evaluate("price | round", vars)).toBe("43");
    // unknown filters pass the value through instead of blanking it
    expect(evaluate("name | nosuchfilter", vars)).toBe("kanishk");
  });
});

describe("audit2: http client cache", () => {
  // Stub globalThis.fetch (the happy-dom preload's fetch cannot drive a real
  // socket): record which URLs hit the network, answer by query param.
  const domFetch = (globalThis as any).fetch;
  const calls: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    calls.push(String(url));
    const q = new URL(String(url)).searchParams.get("q") ?? "";
    return new Response(JSON.stringify({ q }), { headers: { "content-type": "application/json" } });
  };
  afterAll(() => { (globalThis as any).fetch = domFetch; });

  test("different query params do not share a cached response", async () => {
    const client = new HttpClient({ baseURL: "http://stub.local", cache: true, cacheTtl: 60000 });
    const a = await client.get<{ q: string }>("/search", { params: { q: "cats" } });
    expect(a.data.q).toBe("cats");
    expect(calls.length).toBe(1);
    // A different query must MISS the cache and hit the network with the
    // correct answer -- with the old bare-path key it was served "cats".
    const b = await client.get<{ q: string }>("/search", { params: { q: "dogs" } });
    expect(b.data.q).toBe("dogs");
    expect(calls.length).toBe(2);
    // The repeat of the first query is served from cache.
    const c = await client.get<{ q: string }>("/search", { params: { q: "cats" } });
    expect(c.data.q).toBe("cats");
    expect(calls.length).toBe(2);
  });
});

afterAll(() => { /* servers stopped inline */ });
