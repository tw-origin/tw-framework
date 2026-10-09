import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import plugin, {
  collectStaticRoutes, collectApiRoutes, matchesPattern, applyExclude,
  buildSitemapXml, robotsTxt, absoluteUrl,
} from "../packages/plugin-sitemap/src/index.ts";

// @tw/plugin-sitemap — the first official plugin. Serves /sitemap.xml and
// /robots.txt from the pages the app already has.

function site() {
  const dir = mkdtempSync(join(tmpdir(), "tw-sitemap-"));
  const mk = (rel: string) => {
    const full = join(dir, "home", rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "page { title \"x\" render static }\n");
  };
  mk("page.tw");
  mk("about/page.tw");
  mk("blog/[slug]/page.tw");        // dynamic -> skipped
  mk("(marketing)/pricing/page.tw"); // group -> not in the URL
  mk("_drafts/page.tw");            // private -> skipped
  mk(".hidden/page.tw");            // dot dir -> skipped
  return dir;
}

describe("sitemap plugin: route collection", () => {
  test("walks home/ into route paths", () => {
    const dir = site();
    const routes = collectStaticRoutes(dir);
    expect(routes).toContain("/");
    expect(routes).toContain("/about");
    rmSync(dir, { recursive: true, force: true });
  });
  test("a route group is not part of the URL", () => {
    const dir = site();
    expect(collectStaticRoutes(dir)).toContain("/pricing");
    rmSync(dir, { recursive: true, force: true });
  });
  test("dynamic segments are skipped", () => {
    const dir = site();
    expect(collectStaticRoutes(dir).some((r) => r.includes("["))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
  test("private and dotted directories are skipped", () => {
    const dir = site();
    const routes = collectStaticRoutes(dir);
    expect(routes.some((r) => r.includes("_drafts"))).toBe(false);
    expect(routes.some((r) => r.includes(".hidden"))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
  test("api routes are found only when asked for", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-sitemap-api-"));
    mkdirSync(join(dir, "home", "api", "hello"), { recursive: true });
    writeFileSync(join(dir, "home", "api", "hello", "route.twm"), "fn get() { return { json: {} } }\n");
    expect(collectApiRoutes(dir)).toEqual(["/api/hello"]);
    rmSync(dir, { recursive: true, force: true });
  });
  test("a missing home/ is an empty list, not a throw", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-sitemap-empty-"));
    expect(collectStaticRoutes(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("sitemap plugin: exclusion", () => {
  test("* matches within one segment", () => {
    expect(matchesPattern("/draft/*", "/draft/a")).toBe(true);
    expect(matchesPattern("/draft/*", "/draft/a/b")).toBe(false);
  });
  test("** matches across segments and the bare prefix", () => {
    expect(matchesPattern("/admin/**", "/admin/a/b/c")).toBe(true);
    // the case a user almost always means: the prefix itself is excluded too
    expect(matchesPattern("/admin/**", "/admin")).toBe(true);
  });
  test("** in the middle matches zero or more segments", () => {
    expect(matchesPattern("/a/**/b", "/a/b")).toBe(true);
    expect(matchesPattern("/a/**/b", "/a/x/y/b")).toBe(true);
  });
  test("an exact path matches itself", () => {
    expect(matchesPattern("/thanks", "/thanks")).toBe(true);
    expect(matchesPattern("/thanks", "/thanks/")).toBe(false);
  });
  test("applyExclude drops every match, including the prefix", () => {
    const kept = applyExclude(["/", "/about", "/admin", "/admin/a", "/draft/x"], ["/admin/**", "/draft/*"]);
    expect(kept).toEqual(["/", "/about"]);
  });
  test("no patterns keeps everything", () => {
    expect(applyExclude(["/a", "/b"])).toEqual(["/a", "/b"]);
  });
});

describe("sitemap plugin: output", () => {
  test("absoluteUrl joins without a double slash", () => {
    expect(absoluteUrl("https://x.com/", "/about")).toBe("https://x.com/about");
    expect(absoluteUrl("https://x.com", "about")).toBe("https://x.com/about");
  });
  test("the xml has the urlset and one <url> per path", () => {
    const xml = buildSitemapXml(["/", "/about"], { siteUrl: "https://x.com" });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml.match(/<url>/g)?.length).toBe(2);
    expect(xml).toContain("<loc>https://x.com/about</loc>");
  });
  test("changefreq and priority are configurable", () => {
    const xml = buildSitemapXml(["/"], { siteUrl: "https://x.com", changefreq: "daily", priority: 0.9 });
    expect(xml).toContain("<changefreq>daily</changefreq>");
    expect(xml).toContain("<priority>0.9</priority>");
  });
  test("robots.txt points at the sitemap", () => {
    expect(robotsTxt("https://x.com")).toContain("Sitemap: https://x.com/sitemap.xml");
  });
});

describe("sitemap plugin: the plugin itself", () => {
  function mount(dir: string, options: any) {
    let handler: any;
    const api = {
      on: (hook: string, fn: any) => { if (hook === "onRequest") handler = fn; },
      // rootDir defaults to process.cwd() in a real server; point it at the
      // fixture here so the scan sees the fake site.
      getConfig: () => ({ plugins: [{ name: "@tw/plugin-sitemap", options: { rootDir: dir, ...options } }] }),
      getLogger: () => ({ warn: () => {} }),
    };
    plugin.setup(api);
    return handler;
  }

  test("it is a plugin with the expected shape", () => {
    expect(plugin.name).toBe("sitemap");
    expect(typeof plugin.setup).toBe("function");
  });

  test("/sitemap.xml returns xml built from the app", async () => {
    const dir = site();
    const handler = mount(dir, { siteUrl: "https://x.com" });
    const res = await handler({ url: new URL("https://x.com/sitemap.xml") });
    expect(res.headers.get("content-type")).toContain("application/xml");
    const body = await res.text();
    expect(body).toContain("https://x.com/about");
    expect(body).toContain("https://x.com/pricing");
    rmSync(dir, { recursive: true, force: true });
  });

  test("exclude and extra routes are honoured", async () => {
    const dir = site();
    const handler = mount(dir, {
      siteUrl: "https://x.com", exclude: ["/about"], routes: ["/blog/hello"],
    });
    const body = await (await handler({ url: new URL("https://x.com/sitemap.xml") })).text();
    expect(body).not.toContain("https://x.com/about");
    expect(body).toContain("https://x.com/blog/hello");
    rmSync(dir, { recursive: true, force: true });
  });

  test("/robots.txt is served", async () => {
    const dir = site();
    const handler = mount(dir, { siteUrl: "https://x.com" });
    const res = await handler({ url: new URL("https://x.com/robots.txt") });
    expect(await res.text()).toContain("Sitemap: https://x.com/sitemap.xml");
    rmSync(dir, { recursive: true, force: true });
  });

  test("robots:false leaves /robots.txt alone", async () => {
    const dir = site();
    const handler = mount(dir, { siteUrl: "https://x.com", robots: false });
    expect(await handler({ url: new URL("https://x.com/robots.txt") })).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  test("another path passes through", async () => {
    const dir = site();
    const handler = mount(dir, { siteUrl: "https://x.com" });
    expect(await handler({ url: new URL("https://x.com/about") })).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  test("no siteUrl means a clear 500, not a broken sitemap", async () => {
    const dir = site();
    const handler = mount(dir, {});
    const res = await handler({ url: new URL("https://x.com/sitemap.xml") });
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("siteUrl");
    rmSync(dir, { recursive: true, force: true });
  });
});
