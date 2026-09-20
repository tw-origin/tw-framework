/** TW Framework -- Plugins & Server Tests */

import { describe, test, expect } from "bun:test";
import { PluginManager, type TWPlugin } from "@tw/plugins";

describe("Plugin Manager", () => {
  test("should register a plugin", () => {
    const manager = new PluginManager();
    const plugin: TWPlugin = {
      name: "test-plugin",
      version: "1.0.0",
    };
    manager.register(plugin);
    expect(manager.size()).toBe(1);
    expect(manager.getPlugin("test-plugin")).toBeDefined();
  });

  test("should unregister a plugin", () => {
    const manager = new PluginManager();
    const plugin: TWPlugin = {
      name: "test-plugin",
      version: "1.0.0",
    };
    manager.register(plugin);
    manager.unregister("test-plugin");
    expect(manager.size()).toBe(0);
  });

  test("should register hooks via plugin.hooks", () => {
    const manager = new PluginManager();
    let called = false;
    const plugin: TWPlugin = {
      name: "hook-plugin",
      version: "1.0.0",
      hooks: {
        beforeCompile: () => {
          called = true;
        },
      },
    };
    manager.register(plugin);
    manager.runHook("beforeCompile", {});
    expect(called).toBe(true);
  });

  test("should register hooks via setup", () => {
    const manager = new PluginManager();
    let called = false;
    const plugin: TWPlugin = {
      name: "setup-plugin",
      version: "1.0.0",
      setup(api) {
        api.on("afterCompile", () => {
          called = true;
        });
      },
    };
    manager.register(plugin);
    manager.runHook("afterCompile", {});
    expect(called).toBe(true);
  });

  test("should collect routes from plugins", () => {
    const manager = new PluginManager();
    const plugin: TWPlugin = {
      name: "route-plugin",
      version: "1.0.0",
      routes: [
        { method: "GET", path: "/api/test", handler: () => "ok" },
        { method: "POST", path: "/api/submit", handler: () => "created" },
      ],
    };
    manager.register(plugin);
    const routes = manager.getAllRoutes();
    expect(routes.length).toBe(2);
    expect(routes[0].path).toBe("/api/test");
  });

  test("should collect middleware from plugins", () => {
    const manager = new PluginManager();
    const mw = async (_ctx: any, next: () => Promise<void>) => { await next(); };
    const plugin: TWPlugin = {
      name: "mw-plugin",
      version: "1.0.0",
      middleware: [mw],
    };
    manager.register(plugin);
    const middlewares = manager.getAllMiddleware();
    expect(middlewares.length).toBe(1);
  });

  test("should collect components from plugins", () => {
    const manager = new PluginManager();
    const plugin: TWPlugin = {
      name: "comp-plugin",
      version: "1.0.0",
      components: { Button: { tag: "button" }, Card: { tag: "div" } },
    };
    manager.register(plugin);
    const components = manager.getAllComponents();
    expect(components.Button).toBeDefined();
    expect(components.Card).toBeDefined();
  });

  test("should run hooks in priority order", async () => {
    const manager = new PluginManager();
    const order: number[] = [];

    const plugin: TWPlugin = {
      name: "priority-plugin",
      version: "1.0.0",
      setup(api) {
        api.on("beforeCompile", () => order.push(2), 20);
        api.on("beforeCompile", () => order.push(1), 10);
        api.on("beforeCompile", () => order.push(3), 30);
      },
    };
    manager.register(plugin);
    await manager.runHook("beforeCompile", {});
    expect(order).toEqual([1, 2, 3]);
  });
});

describe("Route Registry", () => {
  test("should match static routes", async () => {
    const { RouteRegistry } = await import("@tw/server");
    const registry = new RouteRegistry();
    registry.get("/users", () => "users");
    const match = registry.match("GET", "/users");
    expect(match).not.toBeNull();
  });

  test("should match parameterized routes", async () => {
    const { RouteRegistry } = await import("@tw/server");
    const registry = new RouteRegistry();
    registry.get("/users/:id", () => "user");
    const match = registry.match("GET", "/users/123");
    expect(match).not.toBeNull();
    expect(match!.params.id).toBe("123");
  });

  test("should match [slug] routes", async () => {
    const { RouteRegistry } = await import("@tw/server");
    const registry = new RouteRegistry();
    registry.get("/blog/[slug]", () => "post");
    const match = registry.match("GET", "/blog/hello-world");
    expect(match).not.toBeNull();
    expect(match!.params.slug).toBe("hello-world");
  });

  test("should not match wrong method", async () => {
    const { RouteRegistry } = await import("@tw/server");
    const registry = new RouteRegistry();
    registry.get("/users", () => "users");
    const match = registry.match("POST", "/users");
    expect(match).toBeNull();
  });
});

describe("SDK", () => {
  test("should define component", async () => {
    const { defineComponent } = await import("@tw/sdk");
    const Button = defineComponent({
      name: "Button",
      props: {
        label: { type: "string", default: "Click" },
      },
      state: { clicks: 0 },
      render() {
        return `<button>${this.props.label}: ${this.state.clicks}</button>`;
      },
    });
    expect(Button.__isTWComponent).toBe(true);

    const instance = Button.create({ label: "Submit" });
    expect(instance.props.label).toBe("Submit");
    expect(instance.state.clicks).toBe(0);
    expect(instance.render()).toContain("Submit");
  });

  test("should create app", async () => {
    const { createApp } = await import("@tw/sdk");
    const app = createApp({ port: 3001 });
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
    expect(typeof app.close).toBe("function");
  });

  test("should export VERSION", async () => {
    const { VERSION } = await import("@tw/sdk");
    expect(VERSION).toBe("0.0.1");
  });
});
