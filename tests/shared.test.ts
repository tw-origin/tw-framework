/** TW Framework -- Shared Utilities Tests */

import { describe, test, expect } from "bun:test";
import { sha256, md5, crc32, uuid, computeETag } from "@tw/shared";
import { LogLevel } from "@tw/shared";
import { isVoidTag, escapeHTML, camelCase, kebabCase } from "@tw/compiler";

describe("Hashing", () => {
  test("sha256 should produce consistent hash", () => {
    const hash1 = sha256("hello");
    const hash2 = sha256("hello");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  test("sha256 should produce different hashes for different input", () => {
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  test("md5 should produce 32 char hex", () => {
    const hash = md5("test");
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  test("crc32 should produce number", () => {
    const hash = crc32("test");
    expect(typeof hash).toBe("number");
    expect(hash).toBeGreaterThan(0);
  });

  test("uuid should produce valid format", () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("computeETag should produce quoted hash", () => {
    const etag = computeETag("data");
    expect(etag).toContain('"');
  });

  test("computeETag weak should have W/ prefix", () => {
    const etag = computeETag("data", true);
    expect(etag).toContain("W/");
  });
});

describe("Logger", () => {
  test("LogLevel should have correct values", () => {
    expect(LogLevel.SILENT).toBe(0);
    expect(LogLevel.ERROR).toBe(1);
    expect(LogLevel.WARN).toBe(2);
    expect(LogLevel.INFO).toBe(3);
    expect(LogLevel.DEBUG).toBe(4);
    expect(LogLevel.TRACE).toBe(5);
  });
});

describe("Utils", () => {
  test("escapeHTML should escape special chars", () => {
    expect(escapeHTML("<script>alert('x')</script>")).not.toContain("<script>");
    expect(escapeHTML("<script>alert('x')</script>")).toContain("&lt;script&gt;");
  });

  test("isVoidTag should identify void tags", () => {
    expect(isVoidTag("br")).toBe(true);
    expect(isVoidTag("img")).toBe(true);
    expect(isVoidTag("input")).toBe(true);
    expect(isVoidTag("div")).toBe(false);
  });

  test("camelCase should convert kebab to camel", () => {
    expect(camelCase("my-var")).toBe("myVar");
    expect(camelCase("background-color")).toBe("backgroundColor");
  });

  test("kebabCase should convert camel to kebab", () => {
    expect(kebabCase("myVar")).toBe("my-var");
    expect(kebabCase("backgroundColor")).toBe("background-color");
  });
});
