import { describe, test, expect } from "bun:test";
import { createPluginHost } from "../packages/server/tw/plugin-host.ts";

// Dev plugin host: lifecycle + hook dispatch with isolation.

describe("plugin host: registry", () => {
  test("register adds plugins and reports them in order", () => {
    const h = createPluginHost();
    h.register({ name: "a" }).register({ name: "b" });
    expect(h.size()).toBe(2);
    expect(h.names()).toEqual(["a", "b"]);
    expect(h.has("a")).toBe(true);
    expect(h.has("z")).toBe(false);
  });
  test("a plugin needs a name", () => {
    const h = createPluginHost();
    expect(() => h.register({} as any)).toThrow(/name/);
  });
  test("a duplicate name is rejected", () => {
    const h = createPluginHost().register({ name: "a" });
    expect(() => h.register({ name: "a" })).toThrow(/already registered/);
  });
  test("a dev-only plugin is skipped outside dev", () => {
    const h = createPluginHost({ dev: false });
    h.register({ name: "analytics", dev: true });
    expect(h.has("analytics")).toBe(false);
  });
  test("a dev-only plugin is kept in dev", () => {
    const h = createPluginHost({ dev: true });
    h.register({ name: "analytics", dev: true });
    expect(h.has("analytics")).toBe(true);
  });
});

describe("plugin host: lifecycle", () => {
  test("init runs every setup once, in order", async () => {
    const order: string[] = [];
    const h = createPluginHost();
    h.register({ name: "a", setup: () => { order.push("a"); } });
    h.register({ name: "b", setup: async () => { order.push("b"); } });
    await h.init();
    expect(order).toEqual(["a", "b"]);
  });
  test("a throwing setup does not stop the others", async () => {
    const ran: string[] = [];
    const logs: string[] = [];
    const h = createPluginHost({ log: (m) => logs.push(m) });
    h.register({ name: "bad", setup: () => { throw new Error("nope"); } });
    h.register({ name: "good", setup: () => { ran.push("good"); } });
    await h.init();
    expect(ran).toEqual(["good"]);
    expect(logs.join(" ")).toContain("bad setup failed");
  });
  test("dispose runs teardown and clears the registry", async () => {
    const torn: string[] = [];
    const h = createPluginHost();
    h.register({ name: "a", teardown: () => { torn.push("a"); } });
    await h.dispose();
    expect(torn).toEqual(["a"]);
    expect(h.size()).toBe(0);
  });
});

describe("plugin host: hooks", () => {
  test("runHook dispatches to every plugin in order", async () => {
    const seen: string[] = [];
    const h = createPluginHost();
    h.register({ name: "a", hooks: { onRequest: () => { seen.push("a"); } } });
    h.register({ name: "b", hooks: { onRequest: () => { seen.push("b"); } } });
    await h.runHook("onRequest", {});
    expect(seen).toEqual(["a", "b"]);
  });
  test("a hook that returns a value is passed on to the next", async () => {
    const h = createPluginHost();
    h.register({ name: "a", hooks: { onResponse: () => ({ status: 201 }) } });
    let sawStatus = 0;
    h.register({ name: "b", hooks: { onResponse: (res: any) => { sawStatus = res.status; } } });
    const out = await h.runHook("onResponse", { status: 200 });
    expect(sawStatus).toBe(201);
    expect(out).toEqual({ status: 201 });
  });
  test("a throwing hook is isolated and logged", async () => {
    const logs: string[] = [];
    const h = createPluginHost({ log: (m) => logs.push(m) });
    h.register({ name: "bad", hooks: { onError: () => { throw new Error("boom"); } } });
    let reached = false;
    h.register({ name: "good", hooks: { onError: () => { reached = true; } } });
    await h.runHook("onError", {});
    expect(reached).toBe(true);
    expect(logs.join(" ")).toContain("bad onError threw");
  });
  test("a plugin without the hook is simply skipped", async () => {
    const h = createPluginHost();
    h.register({ name: "a", hooks: { onBuild: () => "built" } });
    expect(await h.runHook("onRequest", {})).toBeUndefined();
    expect(await h.runHook("onBuild", {})).toBe("built");
  });
  test("the context exposes dev, log and the host", async () => {
    const logs: string[] = [];
    const h = createPluginHost({ dev: true, log: (m) => logs.push(m) });
    let sawDev = false, sawHost = false;
    h.register({
      name: "a",
      setup: (ctx) => { sawDev = ctx.dev; sawHost = ctx.host === h; ctx.log("hi"); },
    });
    await h.init();
    expect(sawDev).toBe(true);
    expect(sawHost).toBe(true);
    expect(logs.join(" ")).toContain("[plugin] hi");
  });
});
