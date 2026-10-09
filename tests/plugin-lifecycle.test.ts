import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The CLI must actually reach the plugin lifecycle hooks -- not just declare
// them. This builds a real project whose plugin writes a file from each hook,
// then asserts the files exist. docs/plugins.md lists exactly these hooks.

const BIN = join(import.meta.dir, "..", "apps", "cli", "tw", "bin.ts");
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function projectWithPlugin(hooks: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "tw-hooks-"));
  dirs.push(dir);
  mkdirSync(join(dir, "home"), { recursive: true });
  mkdirSync(join(dir, "plugins"), { recursive: true });
  writeFileSync(join(dir, "home", "page.tw"), 'page { title "t" render static }\ndiv { p "hi" }\n');
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t", private: true, type: "module" }));
  writeFileSync(join(dir, "tw.config.ts"), 'export default {\n  plugins: ["marker"],\n};\n');
  const body = hooks
    .map((h) => `    api.on("${h}", () => { try { require("node:fs").writeFileSync(require("node:path").join(process.cwd(), "hook-" + "${h.replace(/[^a-z]/gi, "-")}" + ".txt"), "${h}"); } catch {} });`)
    .join("\n");
  writeFileSync(join(dir, "plugins", "marker.ts"),
    `export default {\n  name: "marker",\n  version: "1.0.0",\n  setup(api) {\n${body}\n  },\n};\n`);
  return dir;
}

function marker(dir: string, hook: string): boolean {
  return existsSync(join(dir, "hook-" + hook.replace(/[^a-z]/gi, "-") + ".txt"));
}

describe("plugin lifecycle: the build hooks actually fire", () => {
  test("tw build reaches config:resolve, pages:discover, before:build, after:build", () => {
    const hooks = ["config:resolve", "pages:discover", "before:build", "after:build"];
    const dir = projectWithPlugin(hooks);
    const res = Bun.spawnSync(["bun", BIN, "build"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    expect(res.exitCode).toBe(0);
    for (const h of hooks) {
      expect(marker(dir, h)).toBe(true);
      expect(readFileSync(join(dir, "hook-" + h.replace(/[^a-z]/gi, "-") + ".txt"), "utf-8")).toBe(h);
    }
  });

  test("tw build reaches the content hooks: transform:html/css/js + optimize:asset", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-transform-"));
    dirs.push(dir);
    mkdirSync(join(dir, "home"), { recursive: true });
    mkdirSync(join(dir, "plugins"), { recursive: true });
    mkdirSync(join(dir, "public"), { recursive: true });
    writeFileSync(join(dir, "home", "page.tw"), 'page { title "t" render static }\ndiv { p "hi" }\n');
    writeFileSync(join(dir, "style.css"), "body { color: red; }\n");
    writeFileSync(join(dir, "public", "app.js"), 'console.log("original");\n');
    writeFileSync(join(dir, "public", "logo.txt"), "ORIGINAL-ASSET");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t", private: true, type: "module" }));
    writeFileSync(join(dir, "tw.config.ts"), 'export default {\n  plugins: ["tx"],\n};\n');
    writeFileSync(join(dir, "plugins", "tx.ts"),
      `export default {\n  name: "tx",\n  version: "1.0.0",\n  setup(api) {\n` +
      `    api.on("transform:html", (h) => String(h).replace("</body>", "<!-- tx-html -->\\n</body>"));\n` +
      `    api.on("transform:css", (c) => String(c) + "\\n/* tx-css */\\n");\n` +
      `    api.on("transform:js", (j) => "/* tx-js */\\n" + String(j));\n` +
      `    api.on("optimize:asset", () => Buffer.from("TX-ASSET"));\n` +
      `  },\n};\n`);
    const res = Bun.spawnSync(["bun", BIN, "build"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    expect(res.exitCode).toBe(0);
    // html
    const html = readFileSync(join(dir, ".tw", "index.html"), "utf-8");
    expect(html).toContain("tx-html");
    // css -- the emitted stylesheet carries the transform
    expect(readFileSync(join(dir, ".tw", "style.css"), "utf-8")).toContain("tx-css");
    // js (copied from public/)
    expect(readFileSync(join(dir, ".tw", "app.js"), "utf-8")).toContain("tx-js");
    // asset
    expect(readFileSync(join(dir, ".tw", "logo.txt"), "utf-8")).toBe("TX-ASSET");
  });

  test("the content hooks are skipped entirely when no plugin registers them", () => {
    const dir = projectWithPlugin([]);
    mkdirSync(join(dir, "public"), { recursive: true });
    // A public file survives untouched -- no transform ran.
    writeFileSync(join(dir, "public", "x.txt"), "untouched");
    const res2 = Bun.spawnSync(["bun", BIN, "build"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    expect(res2.exitCode).toBe(0);
    expect(readFileSync(join(dir, ".tw", "x.txt"), "utf-8")).toBe("untouched");
  });

  test("a plugin that throws in a build hook does not fail the build", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-hooks-bad-"));
    dirs.push(dir);
    mkdirSync(join(dir, "home"), { recursive: true });
    mkdirSync(join(dir, "plugins"), { recursive: true });
    writeFileSync(join(dir, "home", "page.tw"), 'page { title "t" render static }\ndiv { p "hi" }\n');
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t", private: true, type: "module" }));
    writeFileSync(join(dir, "tw.config.ts"), 'export default {\n  plugins: ["boom"],\n};\n');
    writeFileSync(join(dir, "plugins", "boom.ts"),
      'export default { name: "boom", version: "1.0.0", setup(api) { api.on("before:build", () => { throw new Error("nope"); }); } };\n');
    const res = Bun.spawnSync(["bun", BIN, "build"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    // The build completes even though the hook threw.
    expect(res.exitCode).toBe(0);
    expect(existsSync(join(dir, ".tw", "index.html"))).toBe(true);
  });
});
