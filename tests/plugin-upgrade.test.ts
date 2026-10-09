import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readPluginSpecs, looksLikeSpec, installedVersion, compareVersions,
  planUpgrade, outdated, splitTopLevel, entryName, pluginsArrayRange,
} from "../packages/plugins/tw/upgrade.ts";

// `tw plugin upgrade` — official plugins track the framework, so they are the
// default target. The plan is pure: no network, no package manager.

function project(pluginsField: string) {
  const dir = mkdtempSync(join(tmpdir(), "tw-upg-"));
  writeFileSync(join(dir, "tw.config.ts"),
    `export default {\n  name: "x",\n${pluginsField}\n};\n`);
  return dir;
}

function install(dir: string, name: string, version: string) {
  const p = join(dir, "node_modules", ...name.split("/"));
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, "package.json"), JSON.stringify({ name, version }));
}

describe("plugin upgrade: reading the config", () => {
  test("reads plain string entries", () => {
    expect(readPluginSpecs('plugins: ["a", "b"]')).toEqual(["a", "b"]);
  });
  test("reads names from object entries", () => {
    const src = 'plugins: [{ name: "@tw/plugin-sitemap", options: { siteUrl: "https://x.com" } }]';
    const specs = readPluginSpecs(src);
    expect(specs).toContain("@tw/plugin-sitemap");
  });
  test("reads a mix", () => {
    const src = 'plugins: ["hit-counter", { name: "tw-plugin-x", options: {} }]';
    expect(readPluginSpecs(src)).toEqual(["hit-counter", "tw-plugin-x"]);
  });
  test("no plugins field is an empty list", () => {
    expect(readPluginSpecs('export default { name: "x" }')).toEqual([]);
  });
  test("duplicates collapse", () => {
    expect(readPluginSpecs('plugins: ["a", "a"]')).toEqual(["a"]);
  });
  test("looksLikeSpec rejects option values", () => {
    expect(looksLikeSpec("tw-plugin-x")).toBe(true);
    expect(looksLikeSpec("@tw/plugin-sitemap")).toBe(true);
    expect(looksLikeSpec("./tools/a")).toBe(true);
    expect(looksLikeSpec("https://example.com")).toBe(false);
    expect(looksLikeSpec("two words")).toBe(false);
  });
});

describe("plugin upgrade: versions", () => {
  test("installedVersion reads node_modules", () => {
    const dir = project('  plugins: [],');
    install(dir, "@tw/plugin-sitemap", "2.0.0");
    expect(installedVersion("@tw/plugin-sitemap", dir)).toBe("2.0.0");
    expect(installedVersion("@tw/plugin-nope", dir)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
  test("compareVersions orders semver", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
    expect(compareVersions("2.1.0", "2.0.0")).toBe(1);
    expect(compareVersions("2.0.10", "2.0.9")).toBe(1);
    expect(compareVersions("v2.0.0", "2.0.0")).toBe(0);
  });
});

describe("plugin upgrade: the plan", () => {
  const latest = async (pkg: string) =>
    pkg === "@tw/plugin-sitemap" ? "2.1.0"
    : pkg === "@tw/plugin-health" ? "2.0.0"
    : pkg === "tw-plugin-old" ? "9.0.0"
    : null;

  test("an official plugin behind its latest is flagged", async () => {
    const dir = project('  plugins: ["@tw/plugin-sitemap"],');
    install(dir, "@tw/plugin-sitemap", "2.0.0");
    const plans = await planUpgrade(["@tw/plugin-sitemap"], { latest, rootDir: dir });
    expect(plans[0].tier).toBe("official");
    expect(plans[0].behind).toBe(true);
    expect(plans[0].installed).toBe("2.0.0");
    expect(plans[0].latest).toBe("2.1.0");
    rmSync(dir, { recursive: true, force: true });
  });

  test("an up-to-date plugin is not flagged", async () => {
    const dir = project('  plugins: ["@tw/plugin-health"],');
    install(dir, "@tw/plugin-health", "2.0.0");
    const plans = await planUpgrade(["@tw/plugin-health"], { latest, rootDir: dir });
    expect(plans[0].behind).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("community plugins are skipped without --all", async () => {
    const dir = project('  plugins: ["tw-plugin-old"],');
    install(dir, "tw-plugin-old", "1.0.0");
    const plans = await planUpgrade(["tw-plugin-old"], { latest, rootDir: dir });
    expect(plans[0].tier).toBe("community");
    expect(plans[0].skipped).toContain("--all");
    expect(plans[0].behind).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("--all includes community plugins", async () => {
    const dir = project('  plugins: ["tw-plugin-old"],');
    install(dir, "tw-plugin-old", "1.0.0");
    const plans = await planUpgrade(["tw-plugin-old"], { all: true, latest, rootDir: dir });
    expect(plans[0].behind).toBe(true);
    expect(plans[0].latest).toBe("9.0.0");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a local plugin is never planned for upgrade", async () => {
    const dir = project('  plugins: ["hit-counter"],');
    const plans = await planUpgrade(["hit-counter"], { all: true, latest, rootDir: dir });
    expect(plans[0].tier).toBe("local");
    expect(plans[0].skipped).toContain("local plugin");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a plugin that is not installed is reported, not upgraded", async () => {
    const dir = project('  plugins: ["@tw/plugin-sitemap"],');
    const plans = await planUpgrade(["@tw/plugin-sitemap"], { latest, rootDir: dir });
    expect(plans[0].installed).toBeNull();
    expect(plans[0].skipped).toContain("not installed");
    rmSync(dir, { recursive: true, force: true });
  });

  test("an unreachable registry does not flag an update", async () => {
    const dir = project('  plugins: ["@tw/plugin-sitemap"],');
    install(dir, "@tw/plugin-sitemap", "2.0.0");
    const plans = await planUpgrade(["@tw/plugin-sitemap"], { latest: async () => null, rootDir: dir });
    expect(plans[0].behind).toBe(false);
    expect(plans[0].skipped).toContain("registry");
    rmSync(dir, { recursive: true, force: true });
  });

  test("outdated() returns only the ones behind", async () => {
    const dir = project('  plugins: ["@tw/plugin-sitemap", "@tw/plugin-health"],');
    install(dir, "@tw/plugin-sitemap", "2.0.0");
    install(dir, "@tw/plugin-health", "2.0.0");
    const plans = await planUpgrade(["@tw/plugin-sitemap", "@tw/plugin-health"], { latest, rootDir: dir });
    expect(outdated(plans).map((p) => p.spec)).toEqual(["@tw/plugin-sitemap"]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("plugin upgrade: safe config editing", () => {
  test("splitTopLevel keeps an object entry whole", () => {
    const body = '{ name: "a", options: { x: 1, y: 2 } }, "b"';
    const parts = splitTopLevel(body).map((p) => p.trim());
    expect(parts).toEqual(['{ name: "a", options: { x: 1, y: 2 } }', '"b"']);
  });
  test("splitTopLevel respects nested arrays", () => {
    const parts = splitTopLevel('{ name: "a", list: [1, 2] }, "b"').map((p) => p.trim());
    expect(parts.length).toBe(2);
  });
  test("entryName reads a string entry and an object entry", () => {
    expect(entryName('"tw-plugin-x"')).toBe("tw-plugin-x");
    expect(entryName("{ name: '@tw/plugin-sitemap', options: {} }")).toBe("@tw/plugin-sitemap");
    expect(entryName("   ")).toBeNull();
  });
  test("pluginsArrayRange finds the real end with nested brackets", () => {
    const src = 'export default {\n  plugins: [{ name: "a", list: [1, 2] }],\n};';
    const r = pluginsArrayRange(src)!;
    expect(r).not.toBeNull();
    expect(src.slice(r.start, r.end).trim()).toBe('{ name: "a", list: [1, 2] }');
  });
  test("readPluginSpecs ignores option values that are not specs", () => {
    const src = 'plugins: [{ name: "@tw/plugin-sitemap", options: { siteUrl: "https://x.com", exclude: ["/admin/**"] } }]';
    const specs = readPluginSpecs(src);
    expect(specs).toEqual(["@tw/plugin-sitemap"]);
    expect(specs).not.toContain("https://x.com");
    expect(specs).not.toContain("/admin/**");
  });
});
