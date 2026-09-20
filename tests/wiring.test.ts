import { describe, test, expect } from "bun:test";
import { compileSync } from "@tw/compiler";
import { findServerOnlyViolations, isClientImportSpecifier } from "../apps/cli/tw/commands/client-bundle";
import { createSecurityHeaders, strictSecurityHeaders, devSecurityHeaders } from "@tw/security";

describe("TW044: inline class syntax gets a clear error", () => {
  test('div class "demo" is rejected with the dot-syntax hint', () => {
    const r = compileSync('div class "demo" { h1 "hello" }');
    const tw044 = (r.diagnostics as any[]).filter((d) => d.code === "TW044");
    expect(tw044.length).toBe(1);
    expect(tw044[0].severity).toBe("error");
    expect(tw044[0].message).toContain("dot syntax");
    expect(tw044[0].message).toContain("div.my-class");
  });

  test("valid dot syntax still compiles clean", () => {
    const r = compileSync('div.demo { h1 "hello" }');
    const errors = (r.diagnostics as any[]).filter((d) => d.severity === "error");
    expect(errors.length).toBe(0);
    expect(r.html).toContain("demo");
  });
});

describe("@tw/runtime client imports", () => {
  test("allowed by the TW1007 server-only check", () => {
    const src = 'import { toast } from "@tw/runtime"\n\ndiv { "x" }';
    expect(findServerOnlyViolations(src)).toEqual([]);
  });

  test("collected as a client import specifier", () => {
    expect(isClientImportSpecifier("@tw/runtime")).toBe(true);
    expect(isClientImportSpecifier("@tw/optImage")).toBe(false); // compiler-handled, not bundled
    expect(isClientImportSpecifier("@tw/anything-else")).toBe(false);
  });
});

describe("@tw/security presets", () => {
  test("createSecurityHeaders applies headers to a Response", () => {
    const sh = createSecurityHeaders();
    const res = sh.apply(new Response("<html></html>", { status: 200 }));
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toContain("max-age");
    expect(res.status).toBe(200);
  });

  test("strict / dev presets differ in shape", () => {
    const strict = strictSecurityHeaders().apply(new Response(null));
    const dev = devSecurityHeaders().apply(new Response(null));
    expect(strict.headers.get("x-frame-options")).toBe("DENY");
    expect(dev.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(dev.headers.get("strict-transport-security")).toBeNull(); // no HSTS in dev
  });
});
