import { describe, test, expect } from "bun:test";
import { createImageLoader, buildImageUrl, buildSrcSet, isAllowedSource } from "../packages/server/tw/image-loader.ts";

// tw.config.ts images.loader: real transform-URL builders per CDN.

describe("image loader: url builders", () => {
  test("default uses the built-in optimizer path", () => {
    const u = buildImageUrl({ src: "/hero.jpg", width: 800 });
    expect(u.startsWith("/tw/img?")).toBe(true);
    expect(u).toContain("w=800");
  });

  test("imgix sets w/q and auto=format", () => {
    const u = buildImageUrl({ src: "/hero.jpg", width: 640 }, { loader: "imgix", domain: "acme.imgix.net" });
    expect(u.startsWith("https://acme.imgix.net/hero.jpg?")).toBe(true);
    expect(u).toContain("w=640");
    expect(u).toContain("auto=format");
  });

  test("imgix uses an explicit format when asked", () => {
    const u = buildImageUrl({ src: "/h.jpg", width: 100, format: "avif" }, { loader: "imgix", domain: "a.imgix.net" });
    expect(u).toContain("fm=avif");
  });

  test("cloudinary builds the upload transform path", () => {
    const u = buildImageUrl({ src: "/hero.jpg", width: 500, quality: 60 }, { loader: "cloudinary", cloud: "acme" });
    expect(u).toBe("https://res.cloudinary.com/acme/image/upload/w_500,q_60,f_auto/hero.jpg");
  });

  test("vercel builds /_next/image", () => {
    const u = buildImageUrl({ src: "/hero.jpg", width: 384, quality: 70 }, { loader: "vercel" });
    expect(u.startsWith("/_next/image?")).toBe(true);
    expect(u).toContain("w=384");
    expect(u).toContain("q=70");
  });

  test("cloudflare builds the cdn-cgi path", () => {
    const u = buildImageUrl({ src: "/hero.jpg", width: 750, format: "webp" }, { loader: "cloudflare" });
    expect(u).toBe("/cdn-cgi/image/width=750,quality=75,format=webp,fit=scale-down/hero.jpg");
  });

  test("custom fills the template", () => {
    const u = buildImageUrl({ src: "/hero.jpg", width: 300, quality: 50, format: "png" },
      { loader: "custom", template: "{src}?width={width}&quality={quality}&format={format}" });
    expect(u).toBe("/hero.jpg?width=300&quality=50&format=png");
  });
});

describe("image loader: allowlist", () => {
  test("local paths are always allowed", () => {
    expect(isAllowedSource("/hero.jpg")).toBe(true);
  });
  test("an exact remote host must be listed", () => {
    expect(isAllowedSource("https://cdn.acme.com/a.jpg", ["cdn.acme.com"])).toBe(true);
    expect(isAllowedSource("https://evil.com/a.jpg", ["cdn.acme.com"])).toBe(false);
  });
  test("a leading-dot suffix allows a domain and its subdomains", () => {
    expect(isAllowedSource("https://a.acme.com/x.jpg", [".acme.com"])).toBe(true);
    expect(isAllowedSource("https://acme.com/x.jpg", [".acme.com"])).toBe(true);
    expect(isAllowedSource("https://notacme.com/x.jpg", [".acme.com"])).toBe(false);
  });
  test("a disallowed remote host throws", () => {
    expect(() => buildImageUrl({ src: "https://evil.com/x.jpg", width: 100 }, { remoteAllowHosts: ["cdn.acme.com"] }))
      .toThrow(/remoteAllowHosts/);
  });
});

describe("image loader: srcset and preload", () => {
  test("srcset carries every width with a descriptor", () => {
    const s = buildSrcSet("/hero.jpg", [640, 960, 1280], { loader: "cloudflare" });
    expect(s).toContain("width=640");
    expect(s).toContain("640w");
    expect(s).toContain("1280w");
    expect(s.split(", ").length).toBe(3);
  });
  test("the loader object exposes all helpers", () => {
    const loader = createImageLoader({ loader: "imgix", domain: "a.imgix.net", remoteAllowHosts: ["a.imgix.net"] });
    expect(loader.name).toBe("imgix");
    expect(loader.allows("https://a.imgix.net/x.jpg")).toBe(true);
    expect(loader.allows("https://b.com/x.jpg")).toBe(false);
    expect(loader.url({ src: "/x.jpg", width: 10 })).toContain("w=10");
    expect(loader.preload("/x.jpg")).toContain('rel="preload"');
    expect(loader.srcset("/x.jpg", [320, 640])).toContain("320w");
  });
  test("an unknown loader name falls back to default", () => {
    expect(createImageLoader({ loader: "nope" as any }).name).toBe("default");
  });
});
