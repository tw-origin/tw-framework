import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolvePlugin, classifySpec, hasPluginKeyword, isExplicitPath,
  PLUGIN_KEYWORD, COMMUNITY_PREFIX, OFFICIAL_SCOPE,
} from "../packages/plugins/tw/resolve.ts";

// A plugin is either a project file or an npm package. Resolution order:
// path -> local plugins/<name>.ts -> npm package. Existing projects keep working.

function project() {
  const dir = mkdtempSync(join(tmpdir(), "tw-plug-"));
  mkdirSync(join(dir, "plugins"), { recursive: true });
  return dir;
}

function installPackage(dir: string, name: string, opts: { keyword?: boolean } = {}) {
  const pkgDir = join(dir, "node_modules", ...name.split("/"));
  mkdirSync(pkgDir, { recursive: true });
  const keywords = opts.keyword === false ? ["something-else"] : [PLUGIN_KEYWORD, "tw-framework"];
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({
    name, version: "1.0.0", type: "module", main: "./index.js", keywords,
  }));
  writeFileSync(join(pkgDir, "index.js"),
    "export default { name: 'x', version: '1.0.0', setup() {} };");
}

describe("plugin distribution: conventions", () => {
  test("the keyword and prefixes are stable", () => {
    expect(PLUGIN_KEYWORD).toBe("tw-plugin");
    expect(COMMUNITY_PREFIX).toBe("tw-plugin-");
    expect(OFFICIAL_SCOPE).toBe("@tw/");
  });
  test("classifySpec maps a name to a tier", () => {
    expect(classifySpec("tw-plugin-analytics")).toBe("community");
    expect(classifySpec("@tw/plugin-sitemap")).toBe("official");
    expect(classifySpec("@acme/tw-plugin-reports")).toBe("third-party");
    expect(classifySpec("hit-counter")).toBe("local");
  });
  test("isExplicitPath only for ./ and /", () => {
    expect(isExplicitPath("./tools/a")).toBe(true);
    expect(isExplicitPath("/abs/a")).toBe(true);
    expect(isExplicitPath("tw-plugin-x")).toBe(false);
    expect(isExplicitPath("@acme/x")).toBe(false);
  });
  test("hasPluginKeyword checks the keywords array", () => {
    expect(hasPluginKeyword({ keywords: ["tw-plugin"] })).toBe(true);
    expect(hasPluginKeyword({ keywords: ["TW-Plugin"] })).toBe(true);
    expect(hasPluginKeyword({ keywords: ["other"] })).toBe(false);
    expect(hasPluginKeyword({})).toBe(false);
    expect(hasPluginKeyword(null)).toBe(false);
  });
});

describe("plugin distribution: resolution order", () => {
  test("a local file wins over a package of the same name", () => {
    const dir = project();
    writeFileSync(join(dir, "plugins", "analytics.ts"), "export default {}");
    const r = resolvePlugin("analytics", dir);
    expect(r.kind).toBe("local");
    expect(r.file?.endsWith("plugins/analytics.ts")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a name with no local file resolves as a package", () => {
    const dir = project();
    installPackage(dir, "tw-plugin-analytics");
    const r = resolvePlugin("tw-plugin-analytics", dir);
    expect(r.kind).toBe("package");
    expect(r.packageName).toBe("tw-plugin-analytics");
    expect(r.missingKeyword).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a scoped package resolves (the old code treated the / as a path)", () => {
    const dir = project();
    installPackage(dir, "@acme/tw-plugin-reports");
    const r = resolvePlugin("@acme/tw-plugin-reports", dir);
    expect(r.kind).toBe("package");
    expect(r.packageName).toBe("@acme/tw-plugin-reports");
    rmSync(dir, { recursive: true, force: true });
  });

  test("an official package resolves", () => {
    const dir = project();
    installPackage(dir, "@tw/plugin-sitemap");
    const r = resolvePlugin("@tw/plugin-sitemap", dir);
    expect(r.kind).toBe("package");
    expect(r.missingKeyword).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a package without the keyword still resolves, flagged", () => {
    const dir = project();
    installPackage(dir, "tw-plugin-quiet", { keyword: false });
    const r = resolvePlugin("tw-plugin-quiet", dir);
    expect(r.kind).toBe("package");
    expect(r.missingKeyword).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("an explicit path resolves to that file", () => {
    const dir = project();
    mkdirSync(join(dir, "tools"), { recursive: true });
    writeFileSync(join(dir, "tools", "audit.ts"), "export default {}");
    const r = resolvePlugin("./tools/audit", dir);
    expect(r.kind).toBe("path");
    expect(r.file?.endsWith("tools/audit.ts")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("plugin distribution: failures are quiet", () => {
  test("an unknown name reports an error instead of throwing", () => {
    const dir = project();
    const r = resolvePlugin("nope", dir);
    expect(r.error).toBeDefined();
    expect(r.file).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
  test("a missing explicit path reports an error", () => {
    const dir = project();
    const r = resolvePlugin("./missing", dir);
    expect(r.error).toContain("not found");
    rmSync(dir, { recursive: true, force: true });
  });
  test("an empty specifier reports an error", () => {
    const dir = project();
    expect(resolvePlugin("", dir).error).toBeDefined();
    rmSync(dir, { recursive: true, force: true });
  });
});
