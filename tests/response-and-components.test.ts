import { describe, test, expect } from "bun:test";
import {
  badRequest, forbidden, jsonResponse, notFound, permanentRedirect, redirect, unauthorized,
} from "@tw/sdk";
import { headTagsFor, jsonLd, og, renderHead, twitter } from "@tw/Head";
import { isScriptStrategy, renderScript, scriptAttributesFor, SCRIPT_STRATEGIES } from "@tw/Script";

describe("redirect: one call, all shapes", () => {
  test("defaults to a temporary 307", () => {
    const r = redirect("/login");
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("/login");
  });

  test("permanent gives 308, and permanentRedirect() is the sugar", () => {
    expect(redirect("/a", { permanent: true }).status).toBe(308);
    expect(permanentRedirect("/a").status).toBe(308);
  });

  test("an explicit status wins", () => {
    expect(redirect("/a", { permanent: true, status: 301 }).status).toBe(301);
  });

  test("preserveQuery carries the incoming query onto the target", () => {
    const req = new Request("https://x.test/old?page=2&q=hi");
    expect(redirect("/new", { preserveQuery: req }).headers.get("location")).toBe("/new?page=2&q=hi");
  });

  test("preserveQuery merges with an existing query", () => {
    const r = redirect("/new?x=1", { preserveQuery: "https://x.test/o?a=2" });
    expect(r.headers.get("location")).toBe("/new?x=1&a=2");
  });

  test("hash is appended", () => {
    expect(redirect("/docs", { hash: "setup" }).headers.get("location")).toBe("/docs#setup");
  });
});

describe("forbidden: 403 that does not leak the reason", () => {
  test("says Forbidden, keeps the reason private", () => {
    const r = forbidden("user is not an admin");
    expect(r.status).toBe(403);
    return r.text().then((body) => {
      expect(body).toContain("Forbidden");
      expect(body).not.toContain("not an admin");
    });
  });

  test("expose: true sends the reason", () => {
    return forbidden("trial expired", { expose: true }).text().then((b) => expect(b).toContain("trial expired"));
  });
});

describe("unauthorized: 401 with a correct challenge", () => {
  test("defaults to a Bearer challenge", () => {
    const r = unauthorized();
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toBe("Bearer");
  });

  test("Basic carries realm and charset", () => {
    const r = unauthorized({ scheme: "Basic", realm: "admin", charset: "UTF-8" });
    expect(r.headers.get("www-authenticate")).toBe('Basic realm="admin", charset="UTF-8"');
  });

  test("extra params land in the challenge", () => {
    const r = unauthorized({ params: { error: "invalid_token" } });
    expect(r.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
  });
});

describe("notFound / badRequest / jsonResponse", () => {
  test("notFound is 404", () => {
    expect(notFound().status).toBe(404);
  });
  test("badRequest is 400 json", async () => {
    const r = badRequest("nope");
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "nope", status: 400 });
  });
  test("jsonResponse sets the content type", async () => {
    const r = jsonResponse({ ok: true }, 201);
    expect(r.status).toBe(201);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(await r.json()).toEqual({ ok: true });
  });
});

describe("@tw/Head: typed meta, not string soup", () => {
  test("title, description and canonical", () => {
    const html = renderHead({ title: "TW", description: "fast", canonical: "https://tw.test/" });
    expect(html).toContain("<title>TW</title>");
    expect(html).toContain('name="description" content="fast"');
    expect(html).toContain('rel="canonical" href="https://tw.test/"');
  });

  test("OpenGraph falls back to the page title and description", () => {
    const html = renderHead({ title: "TW", description: "fast", ogImage: "/og.png" });
    expect(html).toContain('property="og:title" content="TW"');
    expect(html).toContain('property="og:description" content="fast"');
    expect(html).toContain('property="og:image" content="/og.png"');
  });

  test("twitter card is emitted", () => {
    const html = renderHead({ title: "T", twitterCard: "summary_large_image", twitterSite: "@tw" });
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:site" content="@tw"');
  });

  test("jsonLd emits a script and escapes a closing tag", () => {
    const html = renderHead({ title: "T", jsonLd: { "@type": "WebSite", name: "a</script>b" } });
    expect(html).toContain('type="application/ld+json"');
    expect(html).not.toContain("</script>b");
  });

  test("values are escaped", () => {
    const html = renderHead({ title: '<script>x</script>' });
    expect(html).not.toContain("<script>x");
  });

  test("the builders return meta maps", () => {
    expect(og({ title: "a", image: "/i.png" })).toEqual({ "og:title": "a", "og:image": "/i.png" });
    expect(twitter({ card: "summary" })).toEqual({ "twitter:card": "summary" });
    expect(jsonLd({ a: 1 })).toBe('{"a":1}');
  });

  test("headTagsFor classifies each tag", () => {
    const tags = headTagsFor({ title: "T", canonical: "https://x/" });
    expect(tags.find((t) => t.kind === "title")).toBeDefined();
    expect(tags.find((t) => t.kind === "link")).toBeDefined();
  });
});

describe("@tw/Script: five strategies + SRI + nonce", () => {
  test("knows five strategies, not three", () => {
    expect(SCRIPT_STRATEGIES.length).toBe(5);
    expect(isScriptStrategy("worker")).toBe(true);
    expect(isScriptStrategy("idle")).toBe(true);
    expect(isScriptStrategy("bogus")).toBe(false);
  });

  test("defaults to afterInteractive and defers", () => {
    const a = scriptAttributesFor({ src: "/a.js" });
    expect(a["data-tw-strategy"]).toBe("afterInteractive");
    expect("defer" in a).toBe(true);
  });

  test("beforeInteractive does not defer", () => {
    const a = scriptAttributesFor({ src: "/a.js", strategy: "beforeInteractive" });
    expect("defer" in a).toBe(false);
  });

  test("SRI implies a cross-origin policy", () => {
    const a = scriptAttributesFor({ src: "/a.js", sri: "sha384-abc" });
    expect(a.integrity).toBe("sha384-abc");
    expect(a.crossorigin).toBe("anonymous");
  });

  test("nonce is passed through for CSP", () => {
    expect(scriptAttributesFor({ src: "/a.js", nonce: "n1" }).nonce).toBe("n1");
  });

  test("renders a real tag, and inline bodies", () => {
    const html = renderScript({ src: "/a.js", strategy: "lazyOnload", sri: "sha384-x" });
    expect(html).toStartWith("<script ");
    expect(html).toContain('src="/a.js"');
    expect(html).toContain('data-tw-strategy="lazyOnload"');
    expect(html).toContain('integrity="sha384-x"');
    expect(renderScript({ inline: "console.log(1)" })).toContain("console.log(1)");
  });

  test("inline bodies are escaped", () => {
    expect(renderScript({ inline: "</script><b>" })).not.toContain("</script><b>");
  });
});
