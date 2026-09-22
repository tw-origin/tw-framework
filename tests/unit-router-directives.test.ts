/**
 * Route matching + compiler directive matrix: every route-shape pattern
 * matches its URLs and rejects others; every page-frontmatter directive
 * round-trips (Next.js it.each pattern).
 */
import { describe, expect, test } from "bun:test";
import { compileSync } from "../packages/compiler/tw/index.ts";
import { scanRouteTree, matchRoute } from "../packages/server/tw/routing/scanner.ts";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "tw2k-routes-"));
let seq = 0;
const compile = (src: string) => compileSync(src, { filePath: join(tmp, `p${seq++}.tw`) });

function buildTree(routes: string[]) {
  for (const r of routes) {
    const dir = join(tmp, r === "/" ? "" : r);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "page.tw"), `page { title "${r}" }\ndiv { "x" }\n`);
  }
  return scanRouteTree({ homeDir: tmp, rootDir: tmp });
}

describe("route matching matrix", () => {
  const cases: [string, string[], string[]][] = [
    ["/simple", ["/simple"], ["/other", "/simple/sub"]],
    ["/blog/[slug]", ["/blog/hello", "/blog/क", "/blog/a-b_c"], ["/blog", "/blog/a/b", "/blog/"]],
    ["/shop/[...all]", ["/shop/a", "/shop/a/b/c"], ["/shopx"]],
    ["/docs/[[...optional]]", ["/docs", "/docs/x", "/docs/x/y"], []],
    ["(marketing)/about", ["/about"], ["/(marketing)/about"]],
    ["@panel/side", ["/side"], []],
  ];
  for (const [route, should, shouldNot] of cases) {
    test(`route ${route} matches its URLs`, () => {
      const tree = buildTree([route]);
      for (const u of should) expect(matchRoute(tree, u)).toBeTruthy();
    });
    test(`route ${route} rejects non-matching URLs`, () => {
      const tree = buildTree([route]);
      for (const u of shouldNot) expect(matchRoute(tree, u)).toBeNull();
    });
  }
});

describe("page frontmatter directive matrix", () => {
  for (const mode of ["static", "ssr", "island", "edge", "csr", "stream", "ppr"]) {
    test(`render ${mode} compiles`, () => {
      const out = compile(`page { title "T" render ${mode} }\ndiv { "x" }`);
      expect(out.html).toContain("<body>");
    });
  }
  test("render bogus is a TW004-level error", () => {
    const out = compile(`page { title "T" render bogus }\ndiv { "x" }`);
    expect((out.diagnostics ?? []).length).toBeGreaterThan(0);
  });
  for (const meta of ["description", "keywords", "og_title", "og_description", "og_image"]) {
    test(`page ${meta} compiles`, () => {
      const out = compile(`page { title "T" ${meta} "v" }\ndiv { "x" }`);
      expect((out.diagnostics ?? []).filter((d: any) => d.severity === "error").length).toBe(0);
    });
  }
  for (const secs of [1, 60, 3600]) {
    test(`revalidate ${secs} compiles`, () => {
      const out = compile(`page { title "T" revalidate ${secs} }\ndiv { "x" }`);
      expect((out.diagnostics ?? []).filter((d: any) => d.code === "TW012").length).toBe(0);
    });
  }
  test("non-positive revalidate never becomes a cache window", async () => {
    // The resolution layer (shared cache.ts) is the single gate: 0/negative
    // windows are rejected, so such pages serve uncached instead of being
    // cached forever or crashing.
    const { resolveCache } = await import("../packages/shared/tw/index.ts");
    expect(resolveCache({ revalidate: -5 })).toBe(null);
    expect(resolveCache({ revalidate: 0 })).toBe(null);
    expect(resolveCache({ revalidate: NaN })).toBe(null);
    // and the compile itself never crashes on the malformed frontmatter
    const out = compile(`page { title "T" revalidate -5 }\ndiv { "x" }`);
    expect(out.html).toContain("<body>");
  });
  for (const [life, revalidate, stale, expire] of [["hours", 60, 5, 300], ["max", 1, 1, 2], ["minutes", 90, 10, 600]]) {
    test(`cache { life "${life}" } compiles clean`, () => {
      const out = compile(`page { title "T" cache { life "${life}", revalidate ${revalidate}, stale ${stale}, expire ${expire} } }\ndiv { "x" }`);
      expect((out.diagnostics ?? []).filter((d: any) => d.severity === "error").length).toBe(0);
    });
  }
});
