import { describe, test, expect, beforeEach } from "bun:test";
import { formAttributesFor, renderField, renderForm } from "@tw/Form";
import { canRenderPng, imageResponse, ogTemplate, setPngRenderer, toPng, toSvg, wrapText } from "@tw/og";
import {
  cache, cached, draftMode, getCache, resetCache, setDraftSecret, verifyDraftCookie,
  CookieJar, TWRequest, TWResponse, twRequest,
} from "@tw/sdk";

// Bun's test environment strips the `cookie` header from a Request *init*
// (it is a forbidden header name in the fetch spec). Setting it after
// construction works, and matches how a real server receives it.
function reqWithCookie(url: string, cookie: string, extra: Record<string, string> = {}): Request {
  const r = new Request(url, { headers: extra });
  r.headers.set("cookie", cookie);
  return r;
}

describe("@tw/Form: progressive enhancement first", () => {
  test("emits a real form that works without JS", () => {
    const html = renderForm({ action: "/subscribe", method: "post" }, "<input name=email>");
    expect(html).toStartWith("<form ");
    expect(html).toContain('action="/subscribe"');
    expect(html).toContain('method="POST"');
    expect(html).toContain("data-tw-form");
    expect(html).toContain("<input name=email>");
  });

  test("native opts out of the JS upgrade", () => {
    expect(formAttributesFor({ native: true })["data-tw-form"]).toBeUndefined();
  });

  test("defaults to GET", () => {
    expect(formAttributesFor({}).method).toBe("GET");
  });

  test("enctype, target and autocomplete pass through", () => {
    const a = formAttributesFor({ enctype: "multipart/form-data", target: "_blank", autoComplete: "off" });
    expect(a.enctype).toBe("multipart/form-data");
    expect(a.target).toBe("_blank");
    expect(a.autocomplete).toBe("off");
  });

  test("a field renders label + input + an aria-live error", () => {
    const html = renderField({ name: "email", label: "Email", required: true, error: "Required" });
    expect(html).toContain("<label for=");
    expect(html).toContain('name="email"');
    expect(html).toContain("required");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="polite"');
  });

  test("values are escaped", () => {
    expect(renderForm({ action: '/x"><script>' })).not.toContain('"><script>');
  });
});

describe("@tw/og: social cards without a dependency", () => {
  test("toSvg produces a real SVG at the requested size", () => {
    const svg = toSvg({ title: "Hello", width: 1200, height: 630 });
    expect(svg).toStartWith("<svg");
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain("Hello");
  });

  test("a gradient background emits a defs block", () => {
    expect(toSvg({ title: "x", background: ["#000", "#fff"] })).toContain("linearGradient");
  });

  test("long titles wrap and are truncated with an ellipsis", () => {
    const lines = wrapText("a b c d e f g h i j k l m n o p q r s t u", 5, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[lines.length - 1].endsWith("…")).toBe(true);
  });

  test("badge and eyebrow render", () => {
    const svg = toSvg({ title: "T", eyebrow: "tw framework", badge: "v2.1" });
    expect(svg).toContain("TW FRAMEWORK");
    expect(svg).toContain("v2.1");
  });

  test("title text is escaped", () => {
    expect(toSvg({ title: "<script>x</script>" })).not.toContain("<script>x");
  });

  test("imageResponse is an SVG Response with cache headers", () => {
    const r = imageResponse({ title: "T" });
    expect(r.headers.get("content-type")).toContain("image/svg+xml");
    expect(r.headers.get("cache-control")).toContain("max-age=86400");
  });

  test("toPng explains itself when no renderer is registered", async () => {
    if (!canRenderPng()) {
      await expect(toPng({ title: "x" })).rejects.toThrow(/rasteriser/);
    }
  });

  test("toPng uses a registered renderer", async () => {
    setPngRenderer(async () => new Uint8Array([1, 2, 3]));
    expect(canRenderPng()).toBe(true);
    expect(Array.from(await toPng({ title: "x" }))).toEqual([1, 2, 3]);
  });

  test("ogTemplate pre-fills the common card", () => {
    expect(ogTemplate("Hi", { badge: "v1" })).toEqual({ title: "Hi", badge: "v1" });
  });
});

describe("cache(name): scoped first", () => {
  beforeEach(() => resetCache());

  test("set/get/delete/has round-trip", async () => {
    const c = cache("products");
    expect(await c.get("a")).toBeUndefined();
    await c.set("a", { n: 1 });
    expect(await c.get("a")).toEqual({ n: 1 });
    expect(await c.has("a")).toBe(true);
    expect(await c.delete("a")).toBe(true);
    expect(await c.has("a")).toBe(false);
  });

  test("namespaces do not leak into each other", async () => {
    await cache("a").set("k", 1);
    await cache("b").set("k", 2);
    expect(await cache("a").get("k")).toBe(1);
    expect(await cache("b").get("k")).toBe(2);
    expect(await getCache().get("k")).toBeUndefined();
  });

  test("revalidate expires an entry", async () => {
    const c = cache("ttl");
    await c.set("k", "v", { revalidate: "20ms" });
    expect(await c.get("k")).toBe("v");
    await new Promise((r) => setTimeout(r, 40));
    expect(await c.get("k")).toBeUndefined();
  });

  test("invalidateTag drops everything carrying it", async () => {
    const c = cache("t");
    await c.set("a", 1, { tags: ["group"] });
    await c.set("b", 2, { tags: ["group"] });
    await c.set("c", 3);
    expect(await c.invalidateTag("group")).toBe(2);
    expect(await c.get("a")).toBeUndefined();
    expect(await c.get("c")).toBe(3);
  });

  test("invalidateImage targets the image tag", async () => {
    const c = cache("img");
    await c.set("k", 1, { tags: ["image:/a.png"] });
    expect(await c.invalidateImage("/a.png")).toBe(1);
  });

  test("keys and stats", async () => {
    const c = cache("s");
    await c.set("x", 1); await c.set("y", 2);
    await c.get("x"); await c.get("missing");
    expect((await c.keys()).sort()).toEqual(["x", "y"]);
    const s = c.stats();
    expect(s.entries).toBe(2);
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
  });
});

describe("cached(): stable name, SWR, hit/miss", () => {
  beforeEach(() => resetCache());

  test("computes once, then serves from cache", async () => {
    let calls = 0;
    const f = cached(async (n: number) => { calls++; return n * 2; });
    expect(await f(2)).toBe(4);
    expect(await f(2)).toBe(4);
    expect(calls).toBe(1);
  });

  test("different args get different entries", async () => {
    let calls = 0;
    const f = cached(async (n: number) => { calls++; return n; });
    await f(1); await f(2);
    expect(calls).toBe(2);
  });

  test("onHit and onMiss fire", async () => {
    const events: string[] = [];
    const f = cached(async () => 1, { onHit: () => events.push("hit"), onMiss: () => events.push("miss") });
    await f(); await f();
    expect(events).toEqual(["miss", "hit"]);
  });

  test("invalidate() drops the entries", async () => {
    let calls = 0;
    const f = cached(async () => { calls++; return calls; });
    await f(); await f();
    await f.invalidate();
    await f();
    expect(calls).toBe(2);
  });

  test("concurrent misses are de-duplicated", async () => {
    let calls = 0;
    const f = cached(async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return "v"; });
    await Promise.all([f(), f(), f()]);
    expect(calls).toBe(1);
  });

  test("staleWhileRevalidate serves stale then refreshes", async () => {
    let n = 0;
    const f = cached(async () => ++n, { staleWhileRevalidate: true, revalidate: "20ms" });
    expect(await f()).toBe(1);
    await new Promise((r) => setTimeout(r, 40));
    expect(await f()).toBe(1);            // stale served
    await new Promise((r) => setTimeout(r, 40));
    expect(await f()).toBe(2);            // refreshed
  });

  test("exposes its tag for outside invalidation", async () => {
    const f = cached(async () => 1, { tags: ["things"] });
    expect(f.tag).toBe("things");
  });
});

describe("draftMode: preview mode, signed", () => {
  test("off by default", () => {
    expect(draftMode().isEnabled).toBe(false);
  });

  test("reads an enabled cookie from the request", () => {
    const req = reqWithCookie("https://x/", "__tw_draft=1");
    expect(draftMode(req).isEnabled).toBe(true);
  });

  test("enable() returns a Set-Cookie value; disable() clears it", async () => {
    const dm = draftMode();
    expect(await dm.enable()).toContain("__tw_draft=1");
    expect(dm.disable()).toContain("Max-Age=0");
  });

  test("with a secret, the cookie is signed and verifiable", async () => {
    setDraftSecret("s3cret");
    const header = await draftMode().enable();
    const value = /__tw_draft=([^;]+)/.exec(header)?.[1] as string;
    expect(value.startsWith("1.")).toBe(true);
    expect(await verifyDraftCookie(value, "s3cret")).toBe(true);
    expect(await verifyDraftCookie(value, "wrong")).toBe(false);
  });
});

describe("TWRequest / TWResponse wrappers", () => {
  test("TWRequest exposes pathname, params and coercion", () => {
    const req = twRequest("https://x.test/blog/1?page=2&debug=true");
    expect(req.pathname).toBe("/blog/1");
    expect(req.param("page", "int")).toBe(2);
    expect(req.param("debug", "bool")).toBe(true);
    expect(req.param("nope")).toBeUndefined();
  });

  test("searchParams is readable and writable", () => {
    const req = twRequest("https://x.test/?a=1");
    const sp = req.searchParams();
    sp.set("a", "2");
    expect(sp.get("a")).toBe("2");
  });

  test("ip(), geo() and ua() compose with the request module", () => {
    const req = twRequest(new Request("https://x.test/", {
      headers: { "cf-connecting-ip": "203.0.113.7", "cf-ipcountry": "IN",
                 "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
    }));
    expect(req.ip().ip).toBe("203.0.113.7");
    expect(req.geo().country).toBe("IN");
    expect(req.ua().isMobile).toBe(true);
  });

  test("the cookie jar stages changes and flushes them", () => {
    const req = twRequest(reqWithCookie("https://x/", "a=1"));
    expect(req.cookies.get("a")).toBe("1");
    req.cookies.set("b", "2", { secure: true });
    req.cookies.delete("a");
    const headers = req.cookies.setCookieHeaders();
    expect(headers.some((h) => h.startsWith("b=2"))).toBe(true);
    expect(headers.some((h) => h.startsWith("a=;"))).toBe(true);
  });

  test("TWResponse builds json/html/text/redirect", async () => {
    const j = TWResponse.json({ ok: true }, 201);
    expect(j.status).toBe(201);
    expect(await j.raw.json()).toEqual({ ok: true });
    expect(TWResponse.html("<p>x</p>").headers.get("content-type")).toContain("text/html");
    expect(TWResponse.text("x").headers.get("content-type")).toContain("text/plain");
    expect(TWResponse.redirect("/a").status).toBe(307);
    expect(TWResponse.noContent().status).toBe(204);
  });

  test("withCookies flushes the jar onto the response", () => {
    const jar = new CookieJar({});
    jar.set("sid", "abc");
    const res = TWResponse.json({}).withCookies(jar);
    expect(res.headers.get("set-cookie")).toContain("sid=abc");
  });
});
