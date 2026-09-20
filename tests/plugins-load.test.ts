import { describe, test, expect, afterAll } from "bun:test";
import { PluginManager, loadPlugins, type TWPlugin } from "@tw/plugins";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dirs: string[] = [];
function mkApp(): string {
  const d = mkdtempSync(join(tmpdir(), "tw-plug-"));
  dirs.push(d);
  return d;
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("plugin failure isolation", () => {
  test("a throwing hook disables the plugin, others keep running", async () => {
    const pm = new PluginManager();
    const good: TWPlugin = {
      name: "good",
      version: "1.0.0",
      setup(api) {
        api.on("onRequest", () => { /* healthy */ });
      },
    };
    const bad: TWPlugin = {
      name: "bad",
      version: "1.0.0",
      setup(api) {
        api.on("onRequest", () => { throw new Error("boom"); });
      },
    };
    pm.register(good);
    pm.register(bad);
    expect(pm.size()).toBe(2);

    await pm.runHook("onRequest", {});          // bad throws -> disabled
    await pm.runHook("onRequest", {});           // bad skipped now

    expect(pm.list().map((p) => p.name)).toEqual(["good"]);
  });

  test("list() returns registered plugins", () => {
    const pm = new PluginManager();
    pm.register({ name: "a", version: "1.0.0" });
    pm.register({ name: "b", version: "1.0.0" });
    expect(pm.list().map((p) => p.name).sort()).toEqual(["a", "b"]);
  });
});

describe("loadPlugins", () => {
  test("config plugins array is the authority -- unlisted files do not run", async () => {
    const app = mkApp();
    const pluginsDir = join(app, "plugins");
    mkdirSync(pluginsDir);
    writeFileSync(join(pluginsDir, "alpha.ts"),
      `import type { TWPlugin } from "@tw/plugins";
       const p: TWPlugin = { name: "alpha", version: "1.0.0", setup() {} };
       export default p;`);
    writeFileSync(join(pluginsDir, "beta.ts"),
      `import type { TWPlugin } from "@tw/plugins";
       const p: TWPlugin = { name: "beta", version: "1.0.0", setup() {} };
       export default p;`);

    const pm = await loadPlugins(app, { plugins: ["alpha"] });
    expect(pm.size()).toBe(1);
    expect(pm.list()[0].name).toBe("alpha");
  });

  test("no plugins field + plugins/ dir -> auto-load everything", async () => {
    const app = mkApp();
    const pluginsDir = join(app, "plugins");
    mkdirSync(pluginsDir);
    writeFileSync(join(pluginsDir, "one.ts"),
      `import type { TWPlugin } from "@tw/plugins";
       const p: TWPlugin = { name: "one", version: "1.0.0", setup() {} };
       export default p;`);
    writeFileSync(join(pluginsDir, "two.ts"),
      `import type { TWPlugin } from "@tw/plugins";
       const p: TWPlugin = { name: "two", version: "1.0.0", setup() {} };
       export default p;`);

    const pm = await loadPlugins(app, {});
    expect(pm.size()).toBe(2);
  });

  test("invalid plugin files are skipped with a warning, not thrown", async () => {
    const app = mkApp();
    const pluginsDir = join(app, "plugins");
    mkdirSync(pluginsDir);
    writeFileSync(join(pluginsDir, "broken.ts"), `export const notAPugin = 42;`);

    const pm = await loadPlugins(app, {});
    expect(pm.size()).toBe(0);
  });

  test("missing plugin name is skipped", async () => {
    const app = mkApp();
    const pm = await loadPlugins(app, { plugins: ["ghost"] });
    expect(pm.size()).toBe(0);
  });
});
