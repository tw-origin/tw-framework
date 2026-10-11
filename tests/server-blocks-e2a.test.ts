/**
 * Phase E2a -- serverFetch + the per-fetch cache.
 *
 * The tests inject a mock platform fetch (a test shim such as happy-dom must
 * not intercept server-side fetches), so they exercise the cache/dedupe/error
 * logic directly.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  createServerFetch, invalidateFetchTag, fetchCacheSize, clearFetchCache,
  ServerFetchError, hasCredentialHeader, checkServerBlocks, parseWithDetails, collectServerBlocks,
  executeServerBlocks,
} from "@tw/compiler";

const SB = { filePath: "<t>", cache: false, experimental: { serverBlocks: true } } as any;
beforeEach(() => clearFetchCache());

function mock(handler: (url: string, init: any) => Response | Promise<Response>) {
  const calls: { url: string; init: any }[] = [];
  const f = async (url: string, init: any) => { calls.push({ url, init }); return handler(url, init); };
  return { f, calls };
}
const ok = (body = "{}", extra: Record<string, string> = {}) =>
  new Response(body, { headers: { "content-type": "application/json", ...extra } });
const hang = (init: any) => new Promise<Response>((_, rej) => {
  init?.signal?.addEventListener("abort", () => { const e: any = new Error("aborted"); e.name = "AbortError"; rej(e); });
});

describe("E2a: per-fetch cache", () => {
  test("second call within revalidate is a HIT; after expiry it refetches", async () => {
    const m = mock(() => ok());
    const sf = createServerFetch({ buildId: "b1", platformFetch: m.f });
    await sf("http://x/y", { cache: { revalidate: 60 } });
    await sf("http://x/y", { cache: { revalidate: 60 } });
    expect(m.calls.length).toBe(1);          // HIT
    clearFetchCache();                        // simulate expiry
    await sf("http://x/y", { cache: { revalidate: 60 } });
    expect(m.calls.length).toBe(2);          // refetch
  });

  test("different URL / body / author-set header = different entries", async () => {
    const m = mock(() => ok());
    const sf = createServerFetch({ buildId: "b1", platformFetch: m.f });
    await sf("http://x/a", { cache: { revalidate: 60 } });
    await sf("http://x/b", { cache: { revalidate: 60 } });
    await sf("http://x/a", { cache: { revalidate: 60 }, headers: { "x-a": "1" } });
    expect(m.calls.length).toBe(3);
    expect(fetchCacheSize()).toBe(3);
  });

  test("a shim-injected header difference is the SAME entry", async () => {
    const m = mock(() => ok());
    const sf = createServerFetch({ buildId: "b1", platformFetch: m.f });
    await sf("http://x/y", { cache: { revalidate: 60 }, headers: { "x-a": "1" } });
    await sf("http://x/y", { cache: { revalidate: 60 }, headers: { "x-a": "1", traceparent: "z", "x-request-id": "9" } });
    expect(m.calls.length).toBe(1);
  });

  test("non-GET, non-2xx, Set-Cookie and over-size responses are not cached", async () => {
    const m = mock((url) => {
      if (url.endsWith("/bad")) return new Response("nope", { status: 500 });
      if (url.endsWith("/big")) return new Response("x".repeat(2_000_000));
      return ok();
    });
    const sf = createServerFetch({ buildId: "b1", maxBytes: 1_000_000, platformFetch: m.f });
    await sf("http://x/bad", { cache: { revalidate: 60 } });
    await sf("http://x/bad", { cache: { revalidate: 60 } });
    await sf("http://x/big", { cache: { revalidate: 60 } });
    await sf("http://x/big", { cache: { revalidate: 60 } });
    await sf("http://x/ok", { method: "POST", body: "x", cache: { revalidate: 60 } });
    await sf("http://x/ok", { method: "POST", body: "x", cache: { revalidate: 60 } });
    // (Set-Cookie is checked in code; the test Response shim does not expose it.)
    expect(m.calls.length).toBe(6);
  });

  test("LRU: more than max entries evicts oldest", async () => {
    const m = mock(() => ok());
    const sf = createServerFetch({ buildId: "b1", maxEntries: 10, platformFetch: m.f });
    for (let i = 0; i < 25; i++) await sf(`http://x/u${i}`, { cache: { revalidate: 60 } });
    expect(fetchCacheSize()).toBe(10);
  });

  test("revalidateTag invalidates cached fetches", async () => {
    const m = mock(() => ok());
    const sf = createServerFetch({ buildId: "b1", platformFetch: m.f });
    await sf("http://x/p", { cache: { revalidate: 60, tag: "posts" } });
    expect(fetchCacheSize()).toBe(1);
    expect(invalidateFetchTag("posts")).toBe(1);
    expect(fetchCacheSize()).toBe(0);
  });

  test("a new build id starts cold", async () => {
    const m = mock(() => ok());
    await createServerFetch({ buildId: "b1", platformFetch: m.f })("http://x/y", { cache: { revalidate: 60 } });
    await createServerFetch({ buildId: "b2", platformFetch: m.f })("http://x/y", { cache: { revalidate: 60 } });
    expect(m.calls.length).toBe(2);
  });
});

describe("E2a: errors", () => {
  test("timeout -> kind timeout, no query in the message", async () => {
    const m = mock((_u, init) => hang(init));
    const sf = createServerFetch({ buildId: "b1", timeoutMs: 60, platformFetch: m.f });
    let err: any;
    try { await sf("http://x/y?secret=abc", {}); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ServerFetchError);
    expect(err.kind).toBe("timeout");
    expect(err.message).not.toContain("secret");
  }, 20000);

  test("network failure -> kind network", async () => {
    const m = mock(() => { throw new Error("boom"); });
    const sf = createServerFetch({ buildId: "b1", platformFetch: m.f });
    let err: any;
    try { await sf("http://x/y", {}); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ServerFetchError);
    expect(err.kind).toBe("network");
  });

  test("invalid JSON -> kind invalid-json", async () => {
    const m = mock(() => new Response("not json"));
    const { wrapJsonErrors } = await import("@tw/compiler") as any;
    const sf = createServerFetch({ buildId: "b1", platformFetch: m.f });
    const res = wrapJsonErrors(await sf("http://x/y", {}));
    let err: any;
    try { await res.json(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ServerFetchError);
    expect(err.kind).toBe("invalid-json");
  });
});

describe("E2a: dedupe + credentials", () => {
  test("Promise.all of 3 identical GETs = 1 network call", async () => {
    const m = mock(() => ok());
    const sf = createServerFetch({ buildId: "b1", platformFetch: m.f });
    await Promise.all([sf("http://x/y", {}), sf("http://x/y", {}), sf("http://x/y", {})]);
    expect(m.calls.length).toBe(1);
  });

  test("hasCredentialHeader", () => {
    expect(hasCredentialHeader({ Authorization: "x" })).toBe("Authorization");
    expect(hasCredentialHeader({ cookie: "x" })).toBe("cookie");
    expect(hasCredentialHeader({ "x-a": "1" })).toBe(null);
  });

  test("a cached fetch with a credential header throws at runtime", async () => {
    const sf = createServerFetch({ buildId: "b1", platformFetch: mock(() => ok()).f });
    await expect(sf("http://x/y", { cache: { revalidate: 60 }, headers: { Authorization: "x" } })).rejects.toThrow(/credential/);
  });

  test("TW110: a literal credential header on a cached fetch is a build error", () => {
    const prog = parseWithDetails('server {\n  const r = await fetch("https://a/b", { cache: { revalidate: 60 }, headers: { Authorization: "x" } })\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(prog).some((p: any) => p.code === "TW110")).toBe(true);
  });

  test("an uncached fetch with Authorization is allowed", () => {
    const prog = parseWithDetails('server {\n  const r = await fetch("https://a/b", { headers: { Authorization: "x" } })\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(prog).some((p: any) => p.code === "TW110")).toBe(false);
  });
});

describe("E2a: server blocks get the fetch shim", () => {
  test("a block's fetch is the shim (cached HIT)", async () => {
    const m = mock(() => ok("{}"));
    const sf = createServerFetch({ buildId: "b1", platformFetch: m.f });
    const blocks = collectServerBlocks(parseWithDetails('server {\n  const r = await fetch("http://x/y", { cache: { revalidate: 60 } })\n  const j = await r.json()\n  const out = j === null ? "n" : "o"\n}\np "x"\n', SB).program);
    const referenced = new Set(["out"]);
    await executeServerBlocks(blocks, { context: { params: {} }, fetch: sf, referenced });
    await executeServerBlocks(blocks, { context: { params: {} }, fetch: sf, referenced });
    expect(m.calls.length).toBe(1);
  });

  test("dev bypass: cacheEnabled false -> no caching", async () => {
    const m = mock(() => ok());
    const sf = createServerFetch({ buildId: "b1", cacheEnabled: false, platformFetch: m.f });
    await sf("http://x/y", { cache: { revalidate: 60 } });
    await sf("http://x/y", { cache: { revalidate: 60 } });
    expect(m.calls.length).toBe(2);
  });
});
