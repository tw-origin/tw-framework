import { describe, test, expect } from "bun:test";
import { linkAttributesFor, isExternalHref } from "@tw/RouterLink";
import { generateRouterLinkTag, resolveBuiltin } from "@tw/compiler";

describe("link URL detection", () => {
  test("internal vs external", () => {
    expect(isExternalHref("/about")).toBe(false);
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("http://x.test/a")).toBe(true);
    expect(isExternalHref("//cdn.example.com/a.js")).toBe(true);
    expect(isExternalHref("mailto:a@b.test")).toBe(true);
    expect(isExternalHref("tel:+123")).toBe(true);
  });

  test("internal links get SPA markers", () => {
    const a = linkAttributesFor({ href: "/about" });
    expect(a.external).toBe(false);
    expect(a.attrs["data-tw-link"]).toBe("");
    expect(a.attrs["target"]).toBeUndefined();
    expect(a.attrs["rel"]).toBeUndefined();
  });

  test("external links get safe defaults", () => {
    const a = linkAttributesFor({ href: "https://example.com" });
    expect(a.external).toBe(true);
    expect(a.attrs["target"]).toBe("_blank");
    expect(a.attrs["rel"]).toBe("noopener noreferrer");
    expect(a.attrs["data-tw-link"]).toBeUndefined();
  });

  test("explicit target/rel win over defaults", () => {
    const a = linkAttributesFor({ href: "https://example.com", target: "_self", rel: "external" });
    expect(a.attrs["target"]).toBe("_self");
    expect(a.attrs["rel"]).toBe("external");
  });

  test("browser-native schemes are external but not forced into a new tab", () => {
    for (const href of ["mailto:a@b.test", "tel:+911234567890", "sms:+911234567890", "ftp://files.example.com/a.jpg"]) {
      const a = linkAttributesFor({ href });
      expect(a.external).toBe(true);
      expect(a.attrs["data-tw-link"]).toBeUndefined(); // no SPA
      expect(a.attrs["target"]).toBeUndefined();       // no forced new tab
      expect(a.attrs["rel"]).toBeUndefined();
    }
    // web URLs keep the safe defaults
    const web = linkAttributesFor({ href: "https://example.com" });
    expect(web.attrs["target"]).toBe("_blank");
    expect(web.attrs["rel"]).toBe("noopener noreferrer");
  });

  test("external flag forces external handling of a relative-looking href", () => {
    const a = linkAttributesFor({ href: "/proxy", external: true });
    expect(a.external).toBe(true);
  });

  test("prefetch strategies map to runtime markers", () => {
    // true -> always
    expect(linkAttributesFor({ href: "/a", prefetch: true }).attrs["data-tw-prefetch"]).toBe("always");
    expect(linkAttributesFor({ href: "/a", prefetch: "true" }).attrs["data-tw-prefetch"]).toBe("always");
    // viewport
    expect(linkAttributesFor({ href: "/b", prefetch: "viewport" }).attrs["data-tw-prefetch"]).toBe("viewport");
    // hover (explicit and default) -> no marker needed beyond the default
    expect(linkAttributesFor({ href: "/c", prefetch: "hover" }).attrs["data-tw-prefetch"]).toBe("hover");
    expect(linkAttributesFor({ href: "/c" }).attrs["data-tw-prefetch"]).toBeUndefined();
    // false -> never
    expect(linkAttributesFor({ href: "/d", prefetch: false }).attrs["data-tw-no-prefetch"]).toBe("");
    expect(linkAttributesFor({ href: "/d", prefetch: "false" }).attrs["data-tw-no-prefetch"]).toBe("");
    // null (Next-style default) = hover
    expect(linkAttributesFor({ href: "/e", prefetch: "null" as any }).attrs["data-tw-no-prefetch"]).toBeUndefined();
    expect(linkAttributesFor({ href: "/e", prefetch: "null" as any }).attrs["data-tw-prefetch"]).toBeUndefined();
    // noPrefetch prop = false
    expect(linkAttributesFor({ href: "/f", noPrefetch: true }).attrs["data-tw-no-prefetch"]).toBe("");
  });

  test("activeClass / native / noPrefetch markers", () => {
    const a = linkAttributesFor({ href: "/x", activeClass: "current", native: true, noPrefetch: true });
    expect(a.attrs["data-tw-active-class"]).toBe("current");
    expect(a.attrs["data-tw-native"]).toBe("");
    expect(a.attrs["data-tw-no-prefetch"]).toBe("");
  });
});

describe("RouterLink tag generation", () => {
  test("renders a complete anchor with text", () => {
    const html = generateRouterLinkTag({ href: "/about", class: "nav" }, "About Us");
    expect(html).toBe('<a href="/about" data-tw-link class="nav">About Us</a>');
  });

  test("external anchor", () => {
    const html = generateRouterLinkTag({ href: "https://example.com" }, "Docs");
    expect(html).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">Docs</a>');
  });

  test("prefetch false through the grammar-normalized path", () => {
    // `prefetch false` parses as [prefetch=true, false=true] — the compiler collapses it
    const html = generateRouterLinkTag({ href: "/n", prefetch: "true", "false": "true" }, "N");
    expect(html).toContain("data-tw-no-prefetch");
    // `prefetch null` -> default (no marker)
    const html2 = generateRouterLinkTag({ href: "/m", prefetch: "true", "null": "true" }, "M");
    expect(html2).not.toContain("data-tw-no-prefetch");
    expect(html2).not.toContain("data-tw-prefetch");
    // `prefetch true` stays always
    const html3 = generateRouterLinkTag({ href: "/p", prefetch: "true", "true": "true" }, "P");
    expect(html3).toContain('data-tw-prefetch="always"');
  });

  test("missing href leaves a comment, never broken markup", () => {
    const html = generateRouterLinkTag({}, "X");
    expect(html).toBe("<!-- @tw/RouterLink: missing href -->");
  });

  test("attribute values are escaped", () => {
    const html = generateRouterLinkTag({ href: "/a?x=1&y=2", class: 'a"b' }, "T");
    expect(html).toContain('href="/a?x=1&y=2"');
    expect(html).toContain("a&quot;b");
  });
});

describe("builtin resolution", () => {
  const optBuiltins = new Map([["optImage", "@tw/optImage"]]);

  test("optImage resolves with @tw/image imported", () => {
    expect(resolveBuiltin("optImage", optBuiltins)).toBe("@tw/optImage");
  });

  test("the Image alias is retired — only optImage", () => {
    expect(resolveBuiltin("Image", optBuiltins)).toBeNull();
    expect(resolveBuiltin("OptImage", optBuiltins)).toBeNull();
  });

  test("RouterLink resolves with @tw/RouterLink imported", () => {
    expect(resolveBuiltin("RouterLink", new Map([["RouterLink", "@tw/RouterLink"]]))).toBe("@tw/RouterLink");
    expect(resolveBuiltin("RouterLink", new Map([["RL", "@tw/RouterLink"]]))).toBe("@tw/RouterLink");
  });

  test("the Link alias is retired — only RouterLink", () => {
    expect(resolveBuiltin("Link", new Map([["RouterLink", "@tw/RouterLink"]]))).toBeNull();
    expect(resolveBuiltin("routerLink", new Map([["RouterLink", "@tw/RouterLink"]]))).toBeNull();
  });

  test("no @tw/image import -> no image builtin", () => {
    expect(resolveBuiltin("optImage", new Map())).toBeNull();
    expect(resolveBuiltin("Image", new Map())).toBeNull();
  });
});
