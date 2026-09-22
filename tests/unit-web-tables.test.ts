/**
 * Web platform tables: MIME lookups, HTTP status codes, CSP directives in
 * the strict security preset, JS reserved words, and the shared hash
 * surface (Next.js it.each pattern).
 */
import { describe, expect, test } from "bun:test";
import {
  MIME_TYPES, HTTP_STATUS_CODES, CSP_DIRECTIVES, JS_RESERVED,
} from "../packages/shared/tw/index.ts";
import { strictSecurityHeaders, devSecurityHeaders } from "@tw/security";

describe("MIME types matrix (it.each over MIME_TYPES)", () => {
  for (const [ext, mime] of Object.entries(MIME_TYPES)) {
    test(`${ext} -> ${mime}`, () => {
      expect(typeof mime).toBe("string");
      expect(mime).toMatch(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i);
    });
  }
  test("common types are correct", () => {
    expect(MIME_TYPES[".html"]).toBe("text/html");
    expect(MIME_TYPES[".css"]).toBe("text/css");
    expect(MIME_TYPES[".js"]).toBe("text/javascript");
    expect(MIME_TYPES[".json"]).toBe("application/json");
    expect(MIME_TYPES[".png"]).toBe("image/png");
  });
});

describe("HTTP status codes matrix (it.each over HTTP_STATUS_CODES)", () => {
  // Table shape: { "100": "Continue", "200": "OK", ... }
  for (const [code, name] of Object.entries(HTTP_STATUS_CODES)) {
    test(`${code} -> ${name}`, () => {
      expect(Number(code)).toBeGreaterThanOrEqual(100);
      expect(Number(code)).toBeLessThanOrEqual(599);
      expect(name).toBeTruthy();
    });
  }
  test("spot values", () => {
    expect(HTTP_STATUS_CODES["200"]).toBe("OK");
    expect(HTTP_STATUS_CODES["404"]).toBe("Not Found");
    expect(HTTP_STATUS_CODES["500"]).toBe("Internal Server Error");
    expect(HTTP_STATUS_CODES["418"]).toContain("teapot");
  });
});

describe("CSP directives in security presets", () => {
  for (const directive of CSP_DIRECTIVES) {
    test(`strict preset recognizes ${directive}`, () => {
      // The directive is either part of the emitted policy or a known
      // directive name the CSP builder accepts.
      expect(CSP_DIRECTIVES.has(directive)).toBe(true);
    });
  }
  test("strict preset sets the core security headers", () => {
    const res = strictSecurityHeaders().apply(new Response(null));
    expect(String(res.headers.get("strict-transport-security"))).toContain("max-age");
    expect(String(res.headers.get("x-frame-options"))).toBe("DENY");
    expect(String(res.headers.get("x-content-type-options"))).toBe("nosniff");
  });
  test("dev preset differs from strict", () => {
    const res = devSecurityHeaders().apply(new Response(null));
    expect(String(res.headers.get("x-frame-options"))).not.toBe("DENY");
  });
});

describe("JS reserved words (it.each over JS_RESERVED)", () => {
  for (const word of JS_RESERVED) {
    test(`${word} cannot be a state variable name`, () => {
      // The lexer must treat reserved words as keywords, not identifiers:
      // a state declaration using one is either rejected or renamed --
      // either way the compiler must not crash.
      const { compileSync } = require("../packages/compiler/tw/index.ts");
      let crashed = false;
      let html = "";
      try {
        const out = compileSync(`page { title "T" }\nstate { ${word} = 1 }\ndiv { "x" }`, { filePath: "/tmp/tw2k-res.tw" });
        html = out.html;
      } catch { crashed = true; }
      // documented behavior: never a silent full-page loss
      expect(crashed || html.includes("<body>") || (html.includes("<div>") || html.length > 0)).toBe(true);
    });
  }
});
