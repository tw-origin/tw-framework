import { describe, test, expect } from "bun:test";
import {
  after, background, clientIp, collectedMetrics, counter, clearMetrics, deadline, defer,
  env, gauge, geolocation, getDeadline, getEnv, histogram, inCidr, ipAddress, isPrivateIp,
  metric, normalizeIp, parseDuration, pendingTasks, timer, trustProxy, userAgent, waitUntil,
} from "@tw/sdk/request";

const req = (headers: Record<string, string>) => new Request("https://x.test/", { headers });

describe("clientIp: the address, with provenance", () => {
  test("reads each proxy header family", () => {
    for (const h of ["cf-connecting-ip", "true-client-ip", "fly-client-ip", "x-real-ip"]) {
      const c = clientIp(req({ [h]: "203.0.113.7" }));
      expect(c.ip).toBe("203.0.113.7");
      expect(c.source).toBe(h);
      expect(c.trusted).toBe(true);
    }
  });

  test("x-forwarded-for takes the client, not the proxy chain", () => {
    const c = clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }));
    expect(c.ip).toBe("203.0.113.7");
  });

  test("RFC 7239 Forwarded wins over the legacy headers", () => {
    const c = clientIp(req({ forwarded: 'for="203.0.113.9";proto=https', "x-forwarded-for": "10.0.0.1" }));
    expect(c.ip).toBe("203.0.113.9");
    expect(c.source).toBe("forwarded");
  });

  test("reports version, private and loopback", () => {
    expect(clientIp(req({ "x-real-ip": "::1" })).isLoopback).toBe(true);
    expect(clientIp(req({ "x-real-ip": "2001:db8::1" })).version).toBe(6);
    expect(clientIp(req({ "x-real-ip": "10.1.2.3" })).isPrivate).toBe(true);
    expect(clientIp(req({ "x-real-ip": "8.8.8.8" })).isPrivate).toBe(false);
  });

  test("with no proxy header, the source is the socket and nothing is trusted", () => {
    const c = clientIp(req({}));
    expect(c.trusted).toBe(false);
    expect(c.source).toBe("socket");
    expect(c.ip).toBe("");
  });

  test("ipAddress() is the plain-string shorthand", () => {
    expect(ipAddress(req({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(ipAddress(req({}))).toBeUndefined();
  });
});

describe("IP utilities", () => {
  test("normalizeIp strips ports and IPv4-mapped prefixes", () => {
    expect(normalizeIp("[::1]:443")).toBe("::1");
    expect(normalizeIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
    expect(normalizeIp("1.2.3.4:5678")).toBe("1.2.3.4");
  });

  test("isPrivateIp covers the private ranges", () => {
    for (const ip of ["10.0.0.1", "172.16.0.1", "192.168.1.1", "127.0.0.1", "169.254.1.1", "100.64.0.1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1"]) expect(isPrivateIp(ip)).toBe(false);
  });

  test("inCidr matches IPv4 and IPv6 ranges", () => {
    expect(inCidr("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(inCidr("11.1.2.3", "10.0.0.0/8")).toBe(false);
    expect(inCidr("2001:db8::5", "2001:db8::/32")).toBe(true);
    expect(inCidr("2001:db9::5", "2001:db8::/32")).toBe(false);
    expect(inCidr("1.2.3.4", "0.0.0.0/0")).toBe(true);
  });

  test("trustProxy counts hops from the right", () => {
    const r = req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
    expect(trustProxy(r, 0)).toBe("10.0.0.2");
    expect(trustProxy(r, 2)).toBe("203.0.113.7");
  });
});

describe("geolocation: provider fallback chain + extras", () => {
  test("reads the Vercel family", () => {
    const g = geolocation(req({
      "x-vercel-ip-city": "Mumbai", "x-vercel-ip-country": "IN",
      "x-vercel-ip-country-region": "MH", "x-vercel-ip-latitude": "19.07",
      "x-vercel-ip-longitude": "72.87", "x-vercel-ip-timezone": "Asia/Kolkata",
    }));
    expect(g.city).toBe("Mumbai");
    expect(g.country).toBe("IN");
    expect(g.source).toBe("vercel");
    expect(g.flag).toBe("🇮🇳");
    expect(g.isEU).toBe(false);
  });

  test("falls back to Cloudflare, then CloudFront", () => {
    expect(geolocation(req({ "cf-ipcity": "Berlin", "cf-ipcountry": "DE" })).source).toBe("cloudflare");
    expect(geolocation(req({ "cloudfront-viewer-city": "Osaka", "cloudfront-viewer-country": "JP" })).source).toBe("cloudfront");
  });

  test("isEU knows the members", () => {
    expect(geolocation(req({ "cf-ipcountry": "DE" })).isEU).toBe(true);
    expect(geolocation(req({ "cf-ipcountry": "US" })).isEU).toBe(false);
  });

  test("distanceTo returns km, or null without coordinates", () => {
    const g = geolocation(req({ "x-vercel-ip-latitude": "19.07", "x-vercel-ip-longitude": "72.87" }));
    const d = g.distanceTo(28.61, 77.20); // Mumbai -> Delhi
    expect(d).not.toBeNull();
    expect(d as number).toBeGreaterThan(1100);
    expect(d as number).toBeLessThan(1300);
    expect(geolocation(req({})).distanceTo(0, 0)).toBeNull();
  });

  test("with no provider headers the source is unknown and confidence 0", () => {
    const g = geolocation(req({}));
    expect(g.source).toBe("unknown");
    expect(g.confidence).toBe(0);
  });
});

describe("deferred work", () => {
  test("waitUntil runs and reports done", async () => {
    let ran = false;
    const t = waitUntil(Promise.resolve().then(() => { ran = true; return 42; }));
    expect(await t.done).toBe(42);
    expect(t.status).toBe("done");
    expect(ran).toBe(true);
  });

  test("after() and defer() run the callback", async () => {
    expect(await after(() => "a").done).toBe("a");
    expect(await defer(() => "d").done).toBe("d");
  });

  test("a failing task is marked failed, never rejects", async () => {
    const t = after(() => { throw new Error("boom"); });
    expect(await t.done).toBeUndefined();
    expect(t.status).toBe("failed");
    expect((t.error as Error).message).toBe("boom");
  });

  test("background retries before giving up", async () => {
    let attempts = 0;
    const t = background(() => { attempts++; if (attempts < 3) throw new Error("nope"); return "ok"; }, { retries: 3 });
    expect(await t.done).toBe("ok");
    expect(attempts).toBe(3);
  });

  test("pendingTasks tracks in-flight work", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const t = waitUntil(gate);
    expect(pendingTasks()).toBeGreaterThan(0);
    release();
    await t.done;
    expect(pendingTasks()).toBe(0);
  });
});

describe("env: typed and validated", () => {
  test("coerces int, float, bool, list", () => {
    const e = getEnv({ PORT: "3000", RATIO: "0.5", DEBUG: "yes", HOSTS: "a, b ,c" });
    expect(e.int("PORT")).toBe(3000);
    expect(e.float("RATIO")).toBe(0.5);
    expect(e.bool("DEBUG")).toBe(true);
    expect(e.list("HOSTS")).toEqual(["a", "b", "c"]);
  });

  test("require throws a named error when missing", () => {
    expect(() => getEnv({}).require("SECRET")).toThrow("Missing required environment variable: SECRET");
  });

  test("a bad coercion names the variable", () => {
    expect(() => getEnv({ PORT: "abc" }).int("PORT")).toThrow(/PORT/);
    expect(() => getEnv({ FLAG: "maybe" }).bool("FLAG")).toThrow(/FLAG/);
  });

  test("url and json parse, with clear failures", () => {
    expect(getEnv({ U: "https://a.test/x" }).url("U").hostname).toBe("a.test");
    expect(getEnv({ J: '{"a":1}' }).json<{ a: number }>("J").a).toBe(1);
    expect(() => getEnv({ J: "{" }).json("J")).toThrow(/JSON/);
  });

  test("defaults are honoured", () => {
    expect(getEnv({}).int("NOPE", 5)).toBe(5);
    expect(getEnv({}).bool("NOPE", false)).toBe(false);
  });

  test("the live env reader is exported", () => {
    expect(typeof env.get).toBe("function");
  });
});

describe("deadline: budget with an abort signal", () => {
  test("reports remaining and expiry", () => {
    const d = deadline(1000, Date.now());
    expect(d.ms).toBe(1000);
    expect(d.remaining).toBeGreaterThan(0);
    expect(d.isExpired).toBe(false);
    expect(d.abortSignal.aborted).toBe(false);
  });

  test("an already-spent budget is expired and aborts", () => {
    const d = deadline(10, Date.now() - 5000);
    expect(d.isExpired).toBe(true);
    expect(d.remaining).toBe(0);
    expect(() => d.throwIfExpired()).toThrow(/deadline/i);
  });

  test("onExpiring fires for a spent budget", () => {
    let fired = false;
    deadline(10, Date.now() - 5000).onExpiring(() => { fired = true; });
    expect(fired).toBe(true);
  });

  test("getDeadline is the bare number", () => {
    expect(getDeadline(1000, Date.now())).toBeGreaterThan(0);
    expect(getDeadline(10, Date.now() - 5000)).toBe(0);
  });
});

describe("metrics: four instruments", () => {
  test("metric, counter, gauge, histogram, timer all emit", () => {
    clearMetrics();
    metric("hits", 1, { route: "/" });
    const c = counter("requests"); c.add(); c.add(2);
    expect(c.value).toBe(3);
    gauge("load").set(0.7);
    histogram("latency").observe(12);
    const t = timer("render");
    expect(t.stop()).toBeGreaterThanOrEqual(0);
    const names = collectedMetrics().map((m) => m.name);
    expect(names).toContain("hits");
    expect(names).toContain("requests");
    expect(names).toContain("load");
    expect(names).toContain("latency");
    expect(names).toContain("render");
    expect(collectedMetrics().find((m) => m.name === "hits")?.tags.route).toBe("/");
  });
});

describe("userAgent: parsed, not raw", () => {
  test("parses a Chrome on Windows desktop", () => {
    const ua = userAgent(req({ "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }));
    expect(ua.browser).toBe("Chrome");
    expect(ua.browserVersion).toBe("120.0.0.0");
    expect(ua.os).toBe("Windows");
    expect(ua.isDesktop).toBe(true);
    expect(ua.isBot).toBe(false);
  });

  test("detects mobile, tablet and bots", () => {
    expect(userAgent(req({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })).isMobile).toBe(true);
    expect(userAgent(req({ "user-agent": "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" })).isTablet).toBe(true);
    const bot = userAgent(req({ "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" }));
    expect(bot.isBot).toBe(true);
    expect(bot.botName).toBe("google");
  });

  test("an empty UA is handled", () => {
    const ua = userAgent(req({}));
    expect(ua.raw).toBe("");
    expect(ua.browser).toBeUndefined();
    expect(ua.isBot).toBe(false);
  });
});

describe("parseDuration: strings and numbers", () => {
  test("parses s / ms / m / h", () => {
    expect(parseDuration("10s")).toBe(10000);
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("2m")).toBe(120000);
    expect(parseDuration("1h")).toBe(3600000);
    expect(parseDuration("250")).toBe(250);
    expect(parseDuration(1500)).toBe(1500);
  });

  test("rejects nonsense with a clear error", () => {
    expect(() => parseDuration("soon")).toThrow(/Invalid duration/);
  });
});

describe("DeferredTask is thenable", () => {
  test("await task yields the result and sets status", async () => {
    const task = background(() => "value");
    const v = await task;
    expect(v).toBe("value");
    expect(task.status).toBe("done");
    expect(task.result).toBe("value");
  });

  test("background accepts a duration string for timeout", async () => {
    const t = background(() => "ok", { timeout: "5s" });
    expect(await t).toBe("ok");
  });

  test("a timed-out task fails, never rejects the await", async () => {
    const t = background(() => new Promise(() => {}), { retries: 0, timeout: "20ms" });
    expect(await t).toBeUndefined();
    expect(t.status).toBe("failed");
    expect((t.error as Error).message).toMatch(/timed out/);
  });
});

describe("env.schema: validate everything at once", () => {
  test("coerces each declared type", () => {
    const r = getEnv({ PORT: "8080", DEBUG: "true", RATIO: "0.25", HOSTS: "a,b" })
      .schema({ PORT: "int", DEBUG: "bool", RATIO: "float", HOSTS: "list" });
    expect(r.ok).toBe(true);
    expect(r.values.PORT).toBe(8080);
    expect(r.values.DEBUG).toBe(true);
    expect(r.values.RATIO).toBe(0.25);
    expect(r.values.HOSTS).toEqual(["a", "b"]);
    expect(r.errors).toEqual([]);
  });

  test("reports every problem together, not one at a time", () => {
    const r = getEnv({ PORT: "abc" }).schema({ PORT: "int", SECRET: "string", DB: "url" });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(3);
    expect(r.errors.join(" ")).toMatch(/PORT/);
    expect(r.errors.join(" ")).toMatch(/SECRET/);
    expect(r.errors.join(" ")).toMatch(/DB/);
  });

  test("url and json types come back parsed", () => {
    const r = getEnv({ U: "https://a.test/x", J: '{"n":1}' }).schema({ U: "url", J: "json" });
    expect(r.ok).toBe(true);
    expect((r.values.U as URL).hostname).toBe("a.test");
    expect((r.values.J as { n: number }).n).toBe(1);
  });
});

describe(".twm handler context (not a Request)", () => {
  // A .twm route receives a plain context object, NOT a Request. The helpers
  // must read headers from it, or every request looks like it came from
  // nowhere -- which is exactly what happened before this was fixed.
  const ctx = {
    method: "GET",
    url: "https://x.test/api/who",
    headers: { "cf-connecting-ip": "9.9.9.9", "cf-ipcity": "Delhi", "cf-ipcountry": "IN",
               "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
  };

  test("clientIp reads the nested headers", () => {
    const c = clientIp(ctx as any);
    expect(c.ip).toBe("9.9.9.9");
    expect(c.source).toBe("cf-connecting-ip");
    expect(c.trusted).toBe(true);
    expect(c.version).toBe(4);
  });

  test("geolocation reads the nested headers", () => {
    const g = geolocation(ctx as any);
    expect(g.city).toBe("Delhi");
    expect(g.country).toBe("IN");
    expect(g.isEU).toBe(false);
  });

  test("userAgent reads the nested headers", () => {
    const ua = userAgent(ctx as any);
    expect(ua.browser).toBe("Safari");
    expect(ua.isMobile).toBe(true);
  });

  test("a Headers instance nested in the context also works", () => {
    const h = new Headers();
    h.set("x-real-ip", "7.7.7.7");
    expect(clientIp({ headers: h } as any).ip).toBe("7.7.7.7");
  });

  test("a context with no headers degrades to the socket, not a crash", () => {
    const c = clientIp({ method: "GET" } as any);
    expect(c.ip).toBe("");
    expect(c.source).toBe("socket");
  });
});
