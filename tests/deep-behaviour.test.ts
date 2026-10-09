import { describe, test, expect } from "bun:test";
import { compileSync } from "@tw/compiler";
import { createImageHandler } from "@tw/optImage";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOM = String.fromCharCode(0xfeff);

describe("compiler BOM handling (v26 fix)", () => {
  test("UTF-8 BOM is stripped, page compiles clean", () => {
    const r = compileSync(BOM + 'div { h1 "bom works" }');
    const errors = (r.diagnostics as any[]).filter((d) => d.severity === "error");
    expect(errors.length).toBe(0);
    expect(r.html).toContain("bom works");
  });

  test("emoji class names give a clear error (unsupported identifier)", () => {
    const r = compileSync('div.class { "x" }' + String.fromCodePoint(0x1f680));
    const errors = (r.diagnostics as any[]).filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("image engine fallback safety (v26 fix)", () => {
  test("passthrough never caches original bytes under a format name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-img-"));
    mkdirSync(join(dir, "public"));
    // A tiny valid JPEG (SOI + EOI) — sharp will process or fail; either way
    // the handler must never write fallback bytes into the cache as .webp.
    writeFileSync(join(dir, "public", "tiny.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const handler = createImageHandler({ rootDir: dir });

    const res = await handler.handle(new Request("http://x/_tw/img/tiny.jpg?w=50&f=webp&q=60"));
    expect(res.status).toBe(200);
    expect(["optimized", "passthrough"]).toContain(res.headers.get("x-tw-image"));

    if (res.headers.get("x-tw-image") === "passthrough") {
      // sharp unavailable/failed in this environment: the ORIGINAL bytes are
      // served with the ORIGINAL content type, and nothing is cached.
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      const cacheDir = (handler as any).cacheDir ?? join(dir, ".tw", "img", "cache");
      const files = existsSync(cacheDir) ? readdirSync(cacheDir) : [];
      expect(files.length).toBe(0);
    }
  });
});

describe("malformed input never corrupts output silently (fuzz regression)", () => {
  test("script tags in text are always escaped", () => {
    const r = compileSync('div { "<script>alert(1)</script>" }');
    expect(r.html).toContain("lt;script"); // &-escaped form
    expect(r.html).toContain("lt;script"); // &-escaped form
  });

  test("unclosed element keeps its content via error recovery", () => {
    const r = compileSync('div { h1 "IMPORTANT TEXT"');
    expect(r.html).toContain("IMPORTANT TEXT");
  });

  test("empty source compiles to a valid empty document", () => {
    const r = compileSync("");
    expect(r.html).toContain("<!DOCTYPE html>");
  });
});

describe("tw.config.ts shape normalization (v27 fix: docs object form)", () => {
  test("object-form redirects/headers normalize to array form in TWServer", async () => {
    const { TWServer } = await import("@tw/server");
    const s: any = new TWServer({
      rootDir: "/tmp",
      config: {
        redirects: { "/a": "/b", "/c": { to: "/d", status: 302 } },
        headers: { "/": { "X-H": "1" } },
      } as any,
    });
    const cfg = (s.options as any).config;
    expect(Array.isArray(cfg.redirects)).toBe(true);
    expect(cfg.redirects.find((r: any) => r.from === "/a").to).toBe("/b");
    expect(cfg.redirects.find((r: any) => r.from === "/c").status).toBe(302);
    expect(Array.isArray(cfg.headers)).toBe(true);
    expect(cfg.headers[0].source).toBe("/");
    expect(cfg.headers[0].headers["X-H"]).toBe("1");
  });

  test("array-form config passes through unchanged", async () => {
    const { TWServer } = await import("@tw/server");
    const redirects = [{ from: "/x", to: "/y", status: 302 }];
    const headers = [{ source: "/", headers: { "X-A": "b" } }];
    const s: any = new TWServer({ rootDir: "/tmp", config: { redirects, headers } as any });
    expect((s.options as any).config.redirects).toBe(redirects);
    expect((s.options as any).config.headers).toBe(headers);
  });
});
