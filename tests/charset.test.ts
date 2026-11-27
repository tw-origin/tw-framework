import { describe, test, expect } from "bun:test";
import { withCharset, MIME_TYPES } from "../packages/shared/tw/constants/index.ts";

// `tw dev` sent `text/css;charset=utf-8` while the production static handler
// sent `text/css` for the same file. Both now call `withCharset`, so the rule
// lives in one place: text types declare their charset, binary types must not.

describe("withCharset", () => {
  test("text types get charset=utf-8", () => {
    for (const mime of ["text/css", "text/html", "text/plain", "text/javascript"]) {
      expect(withCharset(mime)).toBe(mime + "; charset=utf-8");
    }
  });

  test("application types that are text get charset=utf-8", () => {
    for (const mime of ["application/json", "application/javascript", "application/xml", "application/ld+json"]) {
      expect(withCharset(mime)).toBe(mime + "; charset=utf-8");
    }
  });

  test("binary types do not get charset", () => {
    for (const mime of ["image/svg+xml", "image/png", "image/jpeg", "image/webp", "font/woff2", "application/pdf", "application/octet-stream"]) {
      expect(withCharset(mime)).toBe(mime);
    }
  });

  test("an existing charset is not duplicated", () => {
    expect(withCharset("text/css; charset=utf-8")).toBe("text/css; charset=utf-8");
    expect(withCharset("text/html;charset=latin1")).toBe("text/html; charset=utf-8");
  });

  test("an empty or missing type falls back to octet-stream", () => {
    expect(withCharset("")).toBe("application/octet-stream");
  });

  test("the extension table still resolves the types it always did", () => {
    expect(withCharset(MIME_TYPES[".css"] ?? "")).toBe("text/css; charset=utf-8");
    expect(withCharset(MIME_TYPES[".json"] ?? "")).toBe("application/json; charset=utf-8");
    expect(withCharset(MIME_TYPES[".svg"] ?? "")).toBe("image/svg+xml");
    expect(withCharset(MIME_TYPES[".png"] ?? "")).toBe("image/png");
  });
});
