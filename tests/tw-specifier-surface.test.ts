import { describe, test, expect } from "bun:test";
import * as server from "@tw/server";

// A user project has ONLY `tw-framework` installed, so `@tw/sdk/*` is not a
// path anyone can import. The documented path is `"tw"`, which the .twm loader
// resolves by injecting names from `@tw/server`'s index. So anything a doc
// tells a user to import from "tw" MUST be exported here -- otherwise the build
// passes and the route dies at runtime with "X is not defined".
describe('the "tw" specifier surface', () => {
  const documented = [
    // request context
    "clientIp", "ipAddress", "geolocation", "userAgent", "env", "getEnv",
    "deadline", "getDeadline", "waitUntil", "after", "defer", "background",
    "metric", "counter", "gauge", "histogram", "timer", "connection", "dynamic",
    "staticRoute", "normalizeIp", "isPrivateIp", "inCidr", "trustProxy", "parseDuration",
    // response helpers
    "redirect", "permanentRedirect", "forbidden", "unauthorized", "badRequest", "jsonResponse",
    // cache
    "cache", "cached", "draftMode", "getCache",
    // wrappers
    "TWRequest", "TWResponse", "CookieJar", "twRequest",
    // pre-existing
    "revalidatePath", "revalidateTag",
  ];

  test("every documented \"tw\" import resolves", () => {
    const missing = documented.filter((n) => (server as any)[n] === undefined);
    expect(missing).toEqual([]);
  });

  test("the request helpers work on a .twm context, not just a Request", () => {
    const ctx = { method: "GET", headers: { "cf-connecting-ip": "1.2.3.4", "cf-ipcountry": "IN" } };
    expect((server as any).clientIp(ctx).ip).toBe("1.2.3.4");
    expect((server as any).geolocation(ctx).country).toBe("IN");
  });

  test("a redirect returns a real Response", () => {
    const r = (server as any).redirect("/a");
    expect(r).toBeInstanceOf(Response);
    expect(r.status).toBe(307);
  });

  test("cache() is scoped", async () => {
    const a = (server as any).cache("ns-a");
    const b = (server as any).cache("ns-b");
    await a.set("k", 1);
    await b.set("k", 2);
    expect(await a.get("k")).toBe(1);
    expect(await b.get("k")).toBe(2);
  });
});
