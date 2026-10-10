/**
 * Regression tests for the build and runtime fixes.
 *
 * (urlencoded) is covered by the strict-body parsing tests.
 * (scaffold vercel) is a create/build-tooling change -- verified live.
 * (doubled ETag) is not reproducible.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function ps(src: string, extra: Record<string, any> = {}) {
  const { compileSync } = await import("../packages/compiler/tw/index.ts");
  const dir = mkdtempSync(join(tmpdir(), "tw-r5c-"));
  const file = join(dir, "page.tw");
  writeFileSync(file, src);
  try {
    return compileSync(src, { filePath: file, ...extra });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("suspense attribute hygiene", () => {
  test("suspense div ids are clean -- no raw code fragments leak into attributes", async () => {
    const r = await ps(
      `page { title "D" render ssr }\ndiv.page { h1 "Dashboard" Suspense { fallback div.loading { "Loading stats..." } p "stat" } }`,
    );
    const html = String(r.html);
    const ids = Array.from(html.matchAll(/<div data-tw-suspense(?:-fallback)?="([^"]*)"/g)).map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const id of ids) expect(id).toMatch(/^tw-s-[a-z0-9]+-\d+$/);
    // the boot runtime is SCRIPT source: the fragment must never be an
    // attribute VALUE on a real div
    for (const m of html.matchAll(/<[a-z]+ [^>]*="[^"]*' \+ id \+[^"]*"/g)) {
      throw new Error("raw code fragment in attribute: " + m[0]);
    }
  });
});

describe("query-string arrays", () => {
  test("duplicate keys and arr[] collect into arrays; singles stay strings", async () => {
    const { executeRouteHandler } = await import("../packages/server/tw/routing/twm-loader.ts");
    const dir = mkdtempSync(join(tmpdir(), "tw-r5q-"));
    const f = join(dir, "route.twm");
    writeFileSync(f, `fn get(request) { return { status: 200, json: { q: request.query } } }\n`);
    try {
      const r = await executeRouteHandler(
        f,
        "GET",
        new Request("http://x/api/q?a=1&a=2&arr[]=x&arr[]=y&single=z"),
      );
      expect(r.json.q).toEqual({ a: ["1", "2"], arr: ["x", "y"], single: "z" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("broken .tss fails the build", () => {
  test("unbalanced braces throw TW303", async () => {
    const { compileTSS } = await import("../packages/compiler/tw/codegen/tss.ts");
    let threw = "";
    try {
      compileTSS(".bad-box { color #fff\n  this is not valid css at all {{{\n  }");
    } catch (e: any) {
      threw = e.message;
    }
    expect(threw).toContain("TW303");
    // balanced + valid still compiles
    expect(compileTSS(".a { color #fff }")).toContain("color: #fff");
  });
});

describe("scss warning accuracy", () => {
  test("@mixin/@include compile WITHOUT warning; @function warns", async () => {
    const { compileSCSS } = await import("../packages/compiler/tw/codegen/scss.ts");
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (m: string) => { warns.push(String(m)); };
    let out = "";
    try {
      out = compileSCSS("@mixin pad { padding: 12px }\n.sc-box { @include pad; }");
    } finally {
      console.warn = orig;
    }
    expect(out).toContain("padding: 12px");
    expect(warns.length).toBe(0);
    console.warn = (m: string) => { warns.push(String(m)); };
    let fnOut = "";
    try {
      fnOut = compileSCSS("@function f($x) { @return $x }\n.a { width: f(4px); }");
    } finally {
      console.warn = orig;
    }
    expect(fnOut).toContain("width: 4px");
    expect(warns.some((w) => w.includes("function"))).toBe(false);
  });
});

describe("security headers", () => {
  test("default CSP present, x-xss-protection absent, csp opt-out works", async () => {
    const { createSecurityHeaders } = await import("../packages/security/tw/headers/security-headers.ts");
    const std = createSecurityHeaders();
    const h = std.getHeaders();
    expect(h["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(h["X-XSS-Protection"]).toBeUndefined();
    const off = createSecurityHeaders({ csp: false });
    expect(off.getHeaders()["Content-Security-Policy"]).toBeUndefined();
    const custom = createSecurityHeaders({ csp: "default-src https:" });
    expect(custom.getHeaders()["Content-Security-Policy"]).toBe("default-src https:");
  });

  test("x-tw-cache only in debug/test env", async () => {
    const src = await Bun.file("packages/server/tw/routing/render-pipeline.ts").text();
    expect(src).toContain("TW_DEBUG_CACHE");
    expect(src).toContain('process.env.NODE_ENV === "test"');
  });
});

describe("lock: state rendering", () => {
  test("unary minus and JS literal forms render evaluated", async () => {
    const r = await ps(
      `page { title "N" render static }\nstate { neg = -42; big = 1_000_000; sci = 1e3 }\ndiv { p "{neg}" p "{big}" p "{sci}" }`,
    );
    const html = String(r.html);
    expect(html).toContain("-42");
    expect(html).toContain("1000000");
    expect(html).toContain("1000");
  });
});
