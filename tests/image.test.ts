import { describe, test, expect, afterAll } from "bun:test";
import {
  imageAttributesFor,
  optimizedImageUrl,
  createImageHandler,
  DEFAULT_IMAGE_CONFIG,
} from "@tw/optImage";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dirs: string[] = [];
function mkApp(): string {
  const d = mkdtempSync(join(tmpdir(), "tw-img-"));
  dirs.push(d);
  return d;
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// A minimal 1x1 JPEG (SOI + EOI) — enough to exercise the passthrough path.
const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

describe("image URL math", () => {
  test("optimizedImageUrl builds the query string", () => {
    const url = optimizedImageUrl("/a.jpg", { width: 320, quality: 75 });
    expect(url).toBe("/_tw/img/a.jpg?w=320&q=75&f=auto");
  });

  test("attributes: lazy by default, eager with priority", () => {
    const lazy = imageAttributesFor({ src: "/a.jpg" });
    expect(lazy.loading).toBe("lazy");
    const eager = imageAttributesFor({ src: "/a.jpg", priority: true });
    expect(eager.loading).toBe("eager");
  });

  test("attributes: srcset only includes breakpoints up to 2x width", () => {
    const a = imageAttributesFor({ src: "/a.jpg", width: 320 });
    const widths = [...a.srcset.matchAll(/ (\d+)w/g)].map((m) => m[1]);
    for (const w of widths) expect(Number(w)).toBeLessThanOrEqual(640);
    expect(widths).toContain("320");
    expect(widths).not.toContain("1024");
  });

  test("attributes: sizes reflects the declared width", () => {
    const a = imageAttributesFor({ src: "/a.jpg", width: 480 });
    expect(a.sizes).toBe("(max-width: 480px) 100vw, 480px");
  });

  test("remote src goes through the proxy endpoint", () => {
    const a = imageAttributesFor({ src: "https://cdn.example.com/pic.jpg", width: 320 });
    expect(a.src.startsWith("/_tw/img/_remote?src=")).toBe(true);
    expect(a.src).toContain(encodeURIComponent("https://cdn.example.com/pic.jpg"));
  });
});

describe("optImage compile-time behavior", () => {
  test("number props (width 800) work like strings", () => {
    const { compileSync } = require("@tw/compiler");
    const r: any = compileSync(
      'import optImage from "@tw/optImage"\npage { title "T" render static }\ndiv { optImage { src "/a.jpg" width 800 height 600 quality 60 alt "A" } }',
      { filePath: "home/page.tw" }
    );
    const img: string = ((r.html ?? "") as string).match(/<img[^>]*>/)?.[0] ?? "";
    expect(img).toContain('src="/_tw/img/a.jpg?w=800&h=600&q=60&f=auto"');
    expect(img).toContain('width="800"');
    expect(img).toContain('height="600"');
  });

  test("priority adds eager loading and fetchpriority=high", () => {
    const { generateImageTag } = require("@tw/compiler");
    const img = generateImageTag({ src: "/a.jpg", width: "800", priority: "true", alt: "" });
    expect(img).toContain('loading="eager"');
    expect(img).toContain('fetchpriority="high"');
    const plain = generateImageTag({ src: "/a.jpg", width: "800", alt: "" });
    expect(plain).not.toContain("fetchpriority");
    expect(plain).toContain('loading="lazy"');
  });

  test("placeholder solid and blur alias both emit the placeholder markers", () => {
    const { generateImageTag } = require("@tw/compiler");
    for (const v of ["solid", "blur"]) {
      const img = generateImageTag({ src: "/a.jpg", placeholder: v, alt: "" });
      expect(img).toContain('data-tw-placeholder="' + v + '"');
      expect(img).toContain("background-color:#e5e7eb");
    }
  });
});

describe("image handler security", () => {
  test("path traversal is rejected", async () => {
    const app = mkApp();
    mkdirSync(join(app, "public"));
    writeFileSync(join(app, "tw.config.ts"), "export default {};"); // target outside public/
    const h = createImageHandler({ rootDir: app });
    const res = await h.handle(new Request("http://x/_tw/img/..%2Ftw.config.ts"));
    expect(res!.status).toBe(404);
  });

  test("remote source is blocked without an allowlist", async () => {
    const app = mkApp();
    const h = createImageHandler({ rootDir: app });
    const res = await h.handle(new Request("http://x/_tw/img/_remote?src=https%3A%2F%2Fevil.com%2Fa.jpg"));
    expect(res!.status).toBe(404);
  });

  test("missing file is 404", async () => {
    const app = mkApp();
    mkdirSync(join(app, "public"));
    const h = createImageHandler({ rootDir: app });
    const res = await h.handle(new Request("http://x/_tw/img/nope.jpg"));
    expect(res!.status).toBe(404);
  });

  test("non-image route returns null (caller continues)", async () => {
    const app = mkApp();
    const h = createImageHandler({ rootDir: app });
    const res = await h.handle(new Request("http://x/about"));
    expect(res).toBeNull();
  });

  test("no params: original bytes with correct content type", async () => {
    const app = mkApp();
    mkdirSync(join(app, "public"));
    writeFileSync(join(app, "public", "pic.jpg"), TINY_JPEG);
    const h = createImageHandler({ rootDir: app });
    const res = await h.handle(new Request("http://x/_tw/img/pic.jpg"));
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("image/jpeg");
    expect(res!.headers.get("x-tw-image")).toBe("original");
  });

  test("svg passes through untouched", async () => {
    const app = mkApp();
    mkdirSync(join(app, "public"));
    writeFileSync(join(app, "public", "i.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    const h = createImageHandler({ rootDir: app });
    const res = await h.handle(new Request("http://x/_tw/img/i.svg?w=100"));
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("image/svg+xml");
    expect(res!.headers.get("x-tw-image")).toBe("svg-passthrough");
  });

  test("remote allowed when host is in the allowlist (SSRF guard respects config)", async () => {
    const app = mkApp();
    const h = createImageHandler({ rootDir: app, config: { remoteAllowHosts: ["127.0.0.1"] } });
    // unreachable host -> fetch fails -> 404 (allowlist itself must pass)
    const res = await h.handle(new Request("http://x/_tw/img/_remote?src=https%3A%2F%2F127.0.0.1%3A1%2Fa.jpg&w=10"));
    expect(res!.status).toBe(404);
    // non-allowlisted still blocked
    const res2 = await h.handle(new Request("http://x/_tw/img/_remote?src=https%3A%2F%2Fno.example.com%2Fa.jpg"));
    expect(res2!.status).toBe(404);
  });

  test("defaults are sane", () => {
    expect(DEFAULT_IMAGE_CONFIG.quality).toBe(75);
    expect(DEFAULT_IMAGE_CONFIG.formats).toContain("webp");
    expect(DEFAULT_IMAGE_CONFIG.remoteAllowHosts).toEqual([]);
  });
});
