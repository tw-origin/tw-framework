import { describe, test, expect } from "bun:test";
import { createEdgeAdapter, EDGE_BLOCKED_GLOBALS } from "../packages/server/tw/edge-runtime.ts";

// strategies.api.runtime = "edge": the handler runs under the edge contract --
// Web Request in, Web Response out, no Node-only globals, with limits.

describe("edge adapter: request/response bridge", () => {
  test("a handler returning a Web Response is normalised", async () => {
    const edge = createEdgeAdapter(async (req) => {
      return new Response(JSON.stringify({ path: new URL(req.url).pathname }), {
        status: 201, headers: { "Content-Type": "application/json" },
      });
    });
    const r = await edge({ url: "http://x/hello", method: "GET" });
    expect(r.status).toBe(201);
    expect(JSON.parse(r.body)).toEqual({ path: "/hello" });
  });

  test("a handler returning the framework shape is normalised", async () => {
    const edge = createEdgeAdapter(async () => ({ status: 200, json: { ok: true } }));
    const r = await edge({ url: "http://x/", method: "GET" });
    expect(r.status).toBe(200);
    expect(r.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(r.body)).toEqual({ ok: true });
  });

  test("a plain object is treated as a 200 JSON body", async () => {
    const edge = createEdgeAdapter(async () => ({ hello: "world" }));
    const r = await edge({ url: "http://x/", method: "GET" });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ hello: "world" });
  });

  test("the handler receives a Web-standard Request", async () => {
    let wasRequest = false;
    const edge = createEdgeAdapter(async (req) => {
      wasRequest = req instanceof Request && typeof req.headers.get === "function";
      return { status: 200, json: {} };
    });
    await edge({ url: "http://x/p?q=1", method: "POST", headers: { "x-a": "b" } });
    expect(wasRequest).toBe(true);
  });
});

describe("edge adapter: the edge surface", () => {
  test("touching a Node-only global fails loudly", async () => {
    const edge = createEdgeAdapter(async () => {
      // eslint-disable-next-line no-eval
      return { status: 200, json: { pid: (globalThis as any).process } };
    });
    await expect(edge({ url: "http://x/", method: "GET" })).rejects.toThrow(/not available on the edge/);
  });

  test("every blocked global is listed", () => {
    expect(EDGE_BLOCKED_GLOBALS).toContain("process");
    expect(EDGE_BLOCKED_GLOBALS).toContain("require");
    expect(EDGE_BLOCKED_GLOBALS).toContain("Buffer");
  });

  test("globals are restored after the call", async () => {
    const edge = createEdgeAdapter(async () => ({ status: 200, json: {} }));
    await edge({ url: "http://x/", method: "GET" });
    // Back to normal for the host process.
    expect(typeof process.pid).toBe("number");
    expect(typeof Buffer.from).toBe("function");
  });

  test("globals are restored even when the handler throws", async () => {
    const edge = createEdgeAdapter(async () => { throw new Error("boom"); });
    await expect(edge({ url: "http://x/", method: "GET" })).rejects.toThrow(/boom/);
    expect(typeof process.pid).toBe("number");
  });

  test("fetch is available to an edge handler", async () => {
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => new Response(JSON.stringify({ via: "fetch" }));
    const edge = createEdgeAdapter(async () => {
      const res = await fetch("http://upstream/");
      return { status: 200, json: await res.json() };
    });
    try {
      const r = await edge({ url: "http://x/", method: "GET" });
      expect(JSON.parse(r.body)).toEqual({ via: "fetch" });
    } finally { (globalThis as any).fetch = realFetch; }
  });
});

describe("edge adapter: limits", () => {
  test("a slow handler hits the timeout", async () => {
    const edge = createEdgeAdapter(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { status: 200, json: {} };
    }, { timeoutMs: 10 });
    await expect(edge({ url: "http://x/", method: "GET" })).rejects.toThrow(/exceeded/);
  });

  test("an oversized response is rejected", async () => {
    const edge = createEdgeAdapter(async () => ({ status: 200, body: "x".repeat(5000) }), { maxResponseBytes: 100 });
    await expect(edge({ url: "http://x/", method: "GET" })).rejects.toThrow(/exceeds/);
  });
});

describe("edge adapter: concurrency", () => {
  test("two concurrent calls do not clobber each other's globals", async () => {
    const edge = createEdgeAdapter(async (req) => {
      await new Promise((r) => setTimeout(r, 5));
      return { status: 200, json: { ok: true, url: req.url } };
    });
    const [a, b] = await Promise.all([
      edge({ url: "http://x/a", method: "GET" }),
      edge({ url: "http://x/b", method: "GET" }),
    ]);
    expect(JSON.parse(a.body).url).toBe("http://x/a");
    expect(JSON.parse(b.body).url).toBe("http://x/b");
    expect(typeof process.pid).toBe("number");
  });
});
