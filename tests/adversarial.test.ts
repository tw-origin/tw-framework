import { describe, test, expect } from "bun:test";
import { clientIp, geolocation, inCidr, normalizeIp, isPrivateIp, parseDuration, getEnv, userAgent } from "@tw/sdk/request";
import { redirect, forbidden, unauthorized } from "@tw/sdk/response";
import { cache, cached, resetCache, draftMode, verifyDraftCookie } from "@tw/sdk/cache";
import { TWRequest, TWResponse, twRequest } from "@tw/sdk/wrappers";
import { renderHead, renderScript } from "@tw/Head";
import { renderScript as rs } from "@tw/Script";
import { renderForm, renderField } from "@tw/Form";
import { toSvg, wrapText } from "@tw/og";

const h = (o: Record<string, string>) => o;

describe("header injection", () => {
  test("redirect does not let a CRLF into the Location header", () => {
    const r = redirect("/a\r\nSet-Cookie: evil=1");
    const loc = r.headers.get("location") ?? "";
    expect(loc).not.toContain("\r");
    expect(loc).not.toContain("\n");
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  test("a redirect target cannot smuggle a second header via the hash", () => {
    const r = redirect("/a", { hash: "#x\r\nX-Evil: 1" });
    expect((r.headers.get("location") ?? "").includes("\n")).toBe(false);
  });

  test("forbidden/unauthorized do not leak a CRLF into a header", () => {
    const r = unauthorized({ realm: 'a"\r\nX-Evil: 1' });
    expect((r.headers.get("www-authenticate") ?? "").includes("\n")).toBe(false);
  });
});

describe("XSS in the builtin renderers", () => {
  test("Head escapes the title and cannot be broken out of via jsonLd", () => {
    const html = renderHead({ title: "</title><script>alert(1)</script>", jsonLd: { x: "</script><script>alert(1)</script>" } });
    // the title is HTML-escaped
    expect(html).toContain("&lt;script&gt;");
    // the JSON-LD payload escapes every `</`, so no raw closing tag can end
    // the script element early and let the following markup execute
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("<\\/script>");
  });

  test("Script escapes an inline body and an attribute value", () => {
    const html = rs({ inline: "</script><img onerror=alert(1)>" });
    expect(html).not.toContain("</script><img");
    expect(rs({ src: '"><script>x</script>' })).not.toContain('"><script>');
  });

  test("Form escapes action and field values", () => {
    const html = renderForm({ action: '"><script>x</script>' });
    expect(html).not.toContain('"><script>');
    expect(renderField({ name: 'a" onfocus="x', value: '"><b>' })).not.toContain('"><b>');
  });

  test("og escapes card text", () => {
    expect(toSvg({ title: "<script>x</script>", badge: '"><x>' })).not.toContain("<script>x");
  });
});

describe("malformed input never throws unexpectedly", () => {
  test("clientIp with hostile headers", () => {
    for (const v of ["", "   ", ",,,", "not-an-ip", "999.999.999.999", ":::", "a".repeat(5000)]) {
      const c = clientIp(h({ "x-forwarded-for": v }));
      expect(typeof c.ip).toBe("string");
      expect(typeof c.isPrivate).toBe("boolean");
    }
  });

  test("normalizeIp and isPrivateIp on junk", () => {
    expect(normalizeIp("")).toBe("");
    expect(normalizeIp("[[[")).toBe("[[[");
    expect(isPrivateIp("garbage")).toBe(false);
    expect(isPrivateIp("")).toBe(false);
  });

  test("inCidr rejects malformed ranges instead of throwing", () => {
    for (const r of ["", "10.0.0.0/", "/8", "10.0.0.0/abc", "10.0.0.0/99", "abc/8", "1.2.3.4/-1"]) {
      expect(typeof inCidr("10.1.2.3", r)).toBe("boolean");
    }
    expect(inCidr("junk", "10.0.0.0/8")).toBe(false);
  });

  test("geolocation with garbage numbers does not produce NaN", () => {
    const g = geolocation(h({ "x-vercel-ip-latitude": "abc", "x-vercel-ip-longitude": "1e999" }));
    expect(g.latitude === undefined || Number.isFinite(g.latitude)).toBe(true);
    expect(g.distanceTo(0, 0) === null || Number.isFinite(g.distanceTo(0, 0) as number)).toBe(true);
  });

  test("parseDuration rejects nonsense, accepts edge values", () => {
    expect(() => parseDuration("soon")).toThrow();
    expect(() => parseDuration("")).toThrow();
    expect(parseDuration("0s")).toBe(0);
    expect(parseDuration("1.5s")).toBe(1500);
  });

  test("env coercion on empty and hostile values", () => {
    expect(() => getEnv({ P: "" }).int("P")).toThrow();
    expect(() => getEnv({ P: "1e999" }).int("P")).toThrow();
    expect(getEnv({ B: "  TRUE  " }).bool("B")).toBe(true);
    expect(getEnv({ L: ",,a,,b,," }).list("L")).toEqual(["a", "b"]);
  });

  test("userAgent on an empty and a huge UA", () => {
    expect(userAgent(h({})).isBot).toBe(false);
    expect(() => userAgent(h({ "user-agent": "x".repeat(20000) }))).not.toThrow();
  });
});

describe("cache hardening", () => {
  test("a __proto__ key does not pollute Object.prototype", async () => {
    const c = cache("p");
    await c.set("__proto__", { polluted: true });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("very long keys and unicode keys round-trip", async () => {
    const c = cache("k");
    const long = "x".repeat(10000);
    await c.set(long, 1);
    expect(await c.get(long)).toBe(1);
    await c.set("ключ-🔑", 2);
    expect(await c.get("ключ-🔑")).toBe(2);
  });

  test("a throwing cached fn does not poison later calls", async () => {
    let n = 0;
    const f = cached(async () => { n++; if (n === 1) throw new Error("boom"); return "ok"; });
    await expect(f()).rejects.toThrow("boom");
    expect(await f()).toBe("ok");
  });

  test("invalidateTag on an unknown tag is a no-op", async () => {
    expect(await cache("x").invalidateTag("nope")).toBe(0);
  });

  test("draft cookie verification rejects tampering", async () => {
    expect(await verifyDraftCookie("1.deadbeef", "secret")).toBe(false);
    expect(await verifyDraftCookie("0.abc", "secret")).toBe(false);
    expect(await verifyDraftCookie(undefined, "secret")).toBe(false);
    expect(draftMode().isEnabled).toBe(false);
  });
});

describe("wrappers on odd input", () => {
  test("TWRequest survives an empty query and weird params", () => {
    const r = twRequest("https://x.test/p?%20=1&a=%E0%A4%A");
    expect(r.param("nope")).toBeUndefined();
    expect(typeof r.pathname).toBe("string");
  });

  test("cookie parsing tolerates malformed pairs", () => {
    const r = new Request("https://x/");
    r.headers.set("cookie", ";;;=;a=1;=2;b");
    const tr = twRequest(r);
    expect(tr.cookies.get("a")).toBe("1");
    // `b` has no '=', so it is malformed and skipped rather than guessed at
    expect(tr.cookies.get("b")).toBeUndefined();
    expect(tr.cookies.get("")).toBeUndefined();
  });

  test("TWResponse.json on a circular object fails loudly, not silently", () => {
    const o: Record<string, unknown> = {}; o.self = o;
    expect(() => TWResponse.json(o)).toThrow();
  });
});

describe("og boundaries", () => {
  test("wrapText on empty and single-word input", () => {
    expect(wrapText("", 10)).toEqual([]);
    expect(wrapText("hi", 10)).toEqual(["hi"]);
    expect(wrapText("a".repeat(500), 10, 1).length).toBe(1);
  });

  test("toSvg clamps to the requested size", () => {
    const svg = toSvg({ title: "x", width: 1, height: 1 });
    expect(svg).toContain('width="1"');
  });
});
