/**
 * Regression suite for the string-aware .twm comment stripper.
 *
 * The bug (found by the url-shortener example, 2026-09-22): the naive
 * `//` regex ate `https://...` INSIDE string literals -> the module's
 * generated code had an unclosed string -> loadTWMModule caught the
 * SyntaxError, logged it, and returned NO handlers -> every method 405'd
 * at serve time while the build stayed silent.
 *
 * These tests lock the stripper directly (deterministic, no fs).
 */
import { describe, expect, test } from "bun:test";
import { stripCommentsSafe } from "../packages/server/tw/routing/twm-loader.ts";

describe("stripCommentsSafe (the https:// regression)", () => {
  test("https URL in a double-quoted string survives", () => {
    const out = stripCommentsSafe(`let u = "https://example.com"`);
    expect(out).toContain(`"https://example.com"`);
  });

  test("https URL in a single-quoted string survives", () => {
    const out = stripCommentsSafe(`let u = 'https://example.com'`);
    expect(out).toContain(`'https://example.com'`);
  });

  test("https URL in a template literal survives", () => {
    const out = stripCommentsSafe("let u = `https://example.com/${x}`");
    expect(out).toContain("https://example.com/");
  });

  test("URL in a Map constructor (the exact repro)", () => {
    const src = `let links = new Map([["tw", "https://github.com/mlkraj159"]])`;
    const out = stripCommentsSafe(src);
    expect(out).toBe(src);
  });

  test("a real line comment after code is still stripped", () => {
    const out = stripCommentsSafe(`let a = 1 // trailing note\nlet b = 2`);
    expect(out).toBe("let a = 1 \nlet b = 2");
  });

  test("a full-line comment is stripped", () => {
    const out = stripCommentsSafe(`// whole line\nlet a = 1`);
    expect(out).toBe("\nlet a = 1");
  });

  test("block comments are stripped, strings preserved inside them", () => {
    const out = stripCommentsSafe(`/* note: http://x */ let a = "keep"`);
    expect(out).toBe("  let a = \"keep\"");
  });

  test("escaped quotes inside strings do not end the string", () => {
    const out = stripCommentsSafe(`let s = "a \\" // b"`);
    expect(out).toBe(`let s = "a \\" // b"`);
  });

  test("an http:// URL inside a handler body survives", () => {
    const src = `async function get(request) {\n  return { status: 302, headers: { location: "https://chai.shop" } }\n}`;
    expect(stripCommentsSafe(src)).toBe(src);
  });

  test("comment-looking text inside a string is NOT stripped", () => {
    const out = stripCommentsSafe(`let s = "// not a comment"`);
    expect(out).toBe(`let s = "// not a comment"`);
  });
});
