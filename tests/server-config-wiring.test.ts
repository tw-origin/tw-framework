import { describe, test, expect } from "bun:test";
import { corsMiddleware, requestTimeoutMiddleware } from "../packages/server/tw/middleware.ts";
import { TWServer } from "../packages/server/tw/index.ts";
import { resolveServerOptions } from "../packages/shared/tw/config/effective.ts";

function ctx(init: any = {}): any {
  return { method: "GET", headers: {}, ...init };
}

describe("server.cors wired into the pipeline", () => {
  test("origin / methods / headers / credentials / maxAge are emitted", async () => {
    const mw = corsMiddleware({
      origin: ["https://a.com"],
      methods: ["GET", "POST"],
      headers: ["X-Token"],
      credentials: true,
      maxAge: 60,
    });
    const c = ctx({ headers: { origin: "https://a.com" } });
    await mw(c, async () => {});
    expect(c.headers["access-control-allow-origin"]).toBe("https://a.com");
    expect(c.headers["access-control-allow-methods"]).toBe("GET, POST");
    expect(c.headers["access-control-allow-headers"]).toBe("X-Token");
    expect(c.headers["access-control-allow-credentials"]).toBe("true");
    expect(c.headers["access-control-max-age"]).toBe("60");
  });

  test("exposedHeaders is emitted only when set", async () => {
    const withExposed = ctx({ headers: { origin: "https://a.com" } });
    await corsMiddleware({ origin: "*", exposedHeaders: ["X-RateLimit"] })(withExposed, async () => {});
    expect(withExposed.headers["access-control-expose-headers"]).toBe("X-RateLimit");

    const without = ctx({ headers: { origin: "https://a.com" } });
    await corsMiddleware({ origin: "*" })(without, async () => {});
    expect(without.headers["access-control-expose-headers"]).toBeUndefined();
  });

  test("a disallowed origin falls back to *", async () => {
    const c = ctx({ headers: { origin: "https://evil.com" } });
    await corsMiddleware({ origin: ["https://a.com"] })(c, async () => {});
    expect(c.headers["access-control-allow-origin"]).toBe("*");
  });

  test("an OPTIONS preflight stops the chain", async () => {
    let reached = false;
    const c = ctx({ method: "OPTIONS", headers: { origin: "*" } });
    await corsMiddleware({ origin: "*" })(c, async () => { reached = true; });
    expect(reached).toBe(false);
  });
});

describe("server.timeout wired into the pipeline", () => {
  test("a slow handler is answered with 408", async () => {
    const c = ctx();
    const slow = requestTimeoutMiddleware(20);
    await slow(c, () => new Promise((r) => setTimeout(r, 200)));
    expect(c.response).toBeDefined();
    expect(c.response.status).toBe(408);
    const body = await c.response.json();
    expect(body.error).toBe("Request timeout");
  });

  test("a fast handler passes through untouched", async () => {
    const c = ctx();
    await requestTimeoutMiddleware(50)(c, async () => { c.response = new Response("ok"); });
    expect(c.response).toBeDefined();
    expect(c.response.status).toBe(200);
  });

  test("ms <= 0 disables the timeout entirely", async () => {
    const c = ctx();
    let ran = false;
    await requestTimeoutMiddleware(0)(c, async () => { ran = true; });
    expect(ran).toBe(true);
    expect(c.response).toBeUndefined();
  });
});

describe("TWServer accepts the resolved server options", () => {
  test("constructing with every server.* field does not throw", () => {
    const srv = resolveServerOptions({
      server: {
        port: 4321, host: "127.0.0.1", workers: 2, cluster: true,
        bodyLimit: 2048, timeout: 1500, keepAlive: false, keepAliveTimeout: 0,
        maxConnections: 500, trustProxy: true, staticServing: false,
        gracefulShutdown: false,
        compression: "gzip",
        ssl: { cert: "CERT", key: "KEY", ca: "CA" },
        cors: { enabled: true, origin: ["https://a.com"], exposedHeaders: ["X-A"] },
      },
    });
    expect(srv.port).toBe(4321);
    expect(srv.host).toBe("127.0.0.1");
    expect(srv.workers).toBe(2);
    expect(srv.cluster).toBe(true);
    expect(srv.bodyLimit).toBe(2048);
    expect(srv.timeout).toBe(1500);
    expect(srv.keepAlive).toBe(false);
    expect(srv.trustProxy).toBe(true);
    expect(srv.staticServing).toBe(false);
    expect(srv.gracefulShutdown).toBe(false);
    expect(srv.compression).toBe("gzip");
    expect(srv.ssl).toEqual({ cert: "CERT", key: "KEY", ca: "CA" });
    expect(srv.cors.enabled).toBe(true);
    expect(srv.cors.exposedHeaders).toEqual(["X-A"]);

    expect(() => new TWServer({
      rootDir: "/tmp/tw-srv-test",
      port: srv.port, host: srv.host, config: {},
      cors: srv.cors, ssl: srv.ssl, timeout: srv.timeout,
      bodyLimit: srv.bodyLimit, keepAlive: srv.keepAlive,
      keepAliveTimeout: srv.keepAliveTimeout, workers: srv.workers,
      cluster: srv.cluster, trustProxy: srv.trustProxy,
    } as any)).not.toThrow();
  });
});

describe("i18n group wired into the runtime", () => {
  test("configureI18n maps the group's strategy names to the runtime's", async () => {
    const { configureI18n, getI18nConfig, normalizeI18nStrategy } = await import("../packages/server/tw/i18n.ts");
    expect(normalizeI18nStrategy("prefix")).toBe("subpath");
    expect(normalizeI18nStrategy("cookie")).toBe("cookie");
    expect(normalizeI18nStrategy("nonsense")).toBe("subpath");

    const cfg = configureI18n({ locales: ["en", "hi"], defaultLocale: "hi", strategy: "prefix", fallback: "en", loading: "eager" });
    expect(cfg.strategy).toBe("subpath");
    expect(cfg.locales).toEqual(["en", "hi"]);
    expect(cfg.defaultLocale).toBe("hi");
    expect(cfg.fallback).toBe("en");
    expect(cfg.loading).toBe("eager");
    expect(getI18nConfig().defaultLocale).toBe("hi");
  });

  test("TWServer with an i18n config applies it", async () => {
    const { TWServer } = await import("../packages/server/tw/index.ts");
    const { getI18nConfig } = await import("../packages/server/tw/i18n.ts");
    new TWServer({ rootDir: "/tmp/tw-i18n-test", port: 0, host: "127.0.0.1", config: { i18n: { enabled: true, locales: ["en", "fr"], defaultLocale: "fr", strategy: "cookie" } } } as any);
    const c = getI18nConfig();
    expect(c.locales).toEqual(["en", "fr"]);
    expect(c.defaultLocale).toBe("fr");
    expect(c.strategy).toBe("cookie");
  });
});

describe("server.cors reaches the RESPONSE (regression)", () => {
  test("a full cors block is applied to a real response, not just ctx.headers", async () => {
    const { TWServer } = await import("../packages/server/tw/index.ts");
    const srv = new TWServer({
      rootDir: "/tmp/tw-cors-test", port: 0, host: "127.0.0.1", config: {},
      cors: { enabled: true, origin: ["https://example.com"], allowedHeaders: ["X-Token"], exposedHeaders: ["X-RateLimit"], credentials: true, maxAge: 120 },
    } as any);
    const req = new Request("http://localhost/");
    req.headers.set("origin", "https://example.com");
    const res = await srv.handleRequest(req);
    expect(res.headers.get("access-control-allow-headers")).toBe("X-Token");
    expect(res.headers.get("access-control-expose-headers")).toBe("X-RateLimit");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-max-age")).toBe("120");
  });

  test("no cors block means no CORS headers (today's default preserved)", async () => {
    const { TWServer } = await import("../packages/server/tw/index.ts");
    const srv = new TWServer({ rootDir: "/tmp/tw-cors-test2", port: 0, host: "127.0.0.1", config: {} } as any);
    const req = new Request("http://localhost/");
    req.headers.set("origin", "https://example.com");
    const res = await srv.handleRequest(req);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("an OPTIONS preflight for an unmatched path answers 204", async () => {
    const { TWServer } = await import("../packages/server/tw/index.ts");
    const srv = new TWServer({
      rootDir: "/tmp/tw-cors-test3", port: 0, host: "127.0.0.1", config: {},
      cors: { enabled: true, origin: "*" },
    } as any);
    const preq = new Request("http://localhost/nope", { method: "OPTIONS" });
    preq.headers.set("origin", "https://a.com");
    const res = await srv.handleRequest(preq);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("server.trustProxy + server.maxConnections", () => {
  test("trustProxy defaults on and can be turned off", async () => {
    const { resolveServerOptions } = await import("../packages/shared/tw/config/effective.ts");
    expect(resolveServerOptions({}).trustProxy).toBe(true);
    expect(resolveServerOptions({ server: { trustProxy: false } }).trustProxy).toBe(false);
  });

  test("with trustProxy off, forwarded headers are ignored by clientIp", async () => {
    const ip = await import("../packages/shared/tw/net/ip.ts");
    const bag = { headers: { "x-forwarded-for": "203.0.113.9" } } as any;
    ip.setTrustProxy(true);
    expect(ip.clientIp(bag).ip).toBe("203.0.113.9");
    ip.setTrustProxy(false);
    expect(ip.clientIp(bag).ip).toBe("");
    ip.setTrustProxy(true); // restore
  });

  test("a TWServer with trustProxy:false still serves", async () => {
    const { TWServer } = await import("../packages/server/tw/index.ts");
    const srv = new TWServer({ rootDir: "/tmp/tw-tp", port: 0, host: "127.0.0.1", config: {}, trustProxy: false } as any);
    const res = await srv.handleRequest(new Request("http://localhost/"));
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  test("the concurrency middleware caps in-flight requests and releases", async () => {
    const { requestConcurrencyMiddleware } = await import("../packages/server/tw/middleware.ts");
    const mw = requestConcurrencyMiddleware(2);
    let peak = 0, live = 0;
    const run = async () => {
      const c: any = { headers: {} };
      await mw(c, async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 10)); live--; });
    };
    await Promise.all([run(), run(), run(), run()]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  test("maxConnections: 0 disables the cap", async () => {
    const { requestConcurrencyMiddleware } = await import("../packages/server/tw/middleware.ts");
    const mw = requestConcurrencyMiddleware(0);
    let ran = false;
    await mw({ headers: {} } as any, async () => { ran = true; });
    expect(ran).toBe(true);
  });
});
