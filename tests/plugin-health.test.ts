import { describe, test, expect } from "bun:test";
import plugin, { runCheck, buildReport } from "../packages/plugin-health/src/index.ts";

// @tw/plugin-health — /health (liveness) and /readyz (readiness with checks).

function mount(options: any) {
  let handler: any;
  const warnings: string[] = [];
  const api = {
    on: (hook: string, fn: any) => { if (hook === "onRequest") handler = fn; },
    getConfig: () => ({ plugins: [{ name: "@tw/plugin-health", options }] }),
    getLogger: () => ({ warn: (m: string) => warnings.push(m) }),
  };
  plugin.setup(api);
  return { handler, warnings };
}

const get = (handler: any, path: string) =>
  handler({ url: new URL("https://x.com" + path) });

describe("health plugin: the plugin itself", () => {
  test("it is a plugin with the expected shape", () => {
    expect(plugin.name).toBe("health");
    expect(plugin.version).toBe("2.0.0");
    expect(typeof plugin.setup).toBe("function");
  });
});

describe("health plugin: runCheck", () => {
  test("a passing check reports ok with a duration", async () => {
    const r = await runCheck({ name: "a", run: () => {} });
    expect(r.ok).toBe(true);
    expect(r.name).toBe("a");
    expect(typeof r.ms).toBe("number");
  });
  test("an async check works", async () => {
    const r = await runCheck({ name: "a", run: async () => { await new Promise((x) => setTimeout(x, 5)); } });
    expect(r.ok).toBe(true);
  });
  test("a throwing check reports the message", async () => {
    const r = await runCheck({ name: "db", run: () => { throw new Error("db down"); } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("db down");
  });
  test("a rejected promise reports the message", async () => {
    const r = await runCheck({ name: "db", run: async () => { throw new Error("nope"); } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("nope");
  });
  test("a hung check times out instead of hanging", async () => {
    const r = await runCheck({ name: "slow", run: () => new Promise(() => {}), timeoutMs: 20 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("timed out");
  });
});

describe("health plugin: report", () => {
  test("no failing checks means ok", async () => {
    const r = await buildReport({ checks: [{ name: "a", run: () => {} }] }, Date.now(), true);
    expect(r.status).toBe("ok");
    expect(r.checks.length).toBe(1);
  });
  test("one failing check means error", async () => {
    const r = await buildReport(
      { checks: [{ name: "a", run: () => {} }, { name: "b", run: () => { throw new Error("x"); } }] },
      Date.now(), true);
    expect(r.status).toBe("error");
  });
  test("details can be turned off", async () => {
    const r = await buildReport({ details: false }, Date.now(), false);
    expect(r.details).toBeUndefined();
  });
  test("details are included by default", async () => {
    const r = await buildReport({}, Date.now(), false);
    expect(r.details).toBeDefined();
    expect(typeof r.details!.pid).toBe("number");
    expect(typeof r.details!.memory).toBe("number");
  });
  test("version is echoed when set", async () => {
    const r = await buildReport({ version: "9.9.9" }, Date.now(), false);
    expect(r.version).toBe("9.9.9");
  });
});

describe("health plugin: endpoints", () => {
  test("/health returns 200 and is cheap (no checks run)", async () => {
    let ran = false;
    const { handler } = mount({ checks: [{ name: "db", run: () => { ran = true; } }] });
    const res = await get(handler, "/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual([]);
    expect(ran).toBe(false);
  });

  test("/readyz returns 200 when every check passes", async () => {
    const { handler } = mount({ checks: [{ name: "db", run: () => {} }] });
    const res = await get(handler, "/readyz");
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  test("/readyz returns 503 when a check fails", async () => {
    const { handler } = mount({ checks: [{ name: "db", run: () => { throw new Error("down"); } }] });
    const res = await get(handler, "/readyz");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.checks[0].error).toBe("down");
  });

  test("paths and aliases are configurable", async () => {
    const { handler } = mount({ path: "/live", readyPath: "/ready", aliases: ["/healthz"] });
    expect((await get(handler, "/live")).status).toBe(200);
    expect((await get(handler, "/healthz")).status).toBe(200);
    expect((await get(handler, "/ready")).status).toBe(200);
    expect(await get(handler, "/health")).toBeUndefined();
  });

  test("any other path passes through", async () => {
    const { handler } = mount({});
    expect(await get(handler, "/about")).toBeUndefined();
  });

  test("the content type is json", async () => {
    const { handler } = mount({});
    expect((await get(handler, "/health")).headers.get("content-type")).toContain("application/json");
  });
});
