/**
 * Cache tags round (docs/cache-tags.md): `cache { }` directive, cacheLife
 * profiles, tag invalidation, canonical query keys, and `fn cached`
 * handler purity — the v1.0.6 explicit cache layer.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "tw-cache-"));

const shared = async () => await import("../packages/shared/tw/index.ts") as any;

// --- Directive parsing / resolution ------------------------------------------

describe("cache directive parsing (shared)", () => {
  test("page { cache { } } extracts life/tag/revalidate/stale/expire", async () => {
    const { extractCacheDirective, parseCacheBody } = await shared();
    const src = 'page {\n  title "Shop"\n  cache { life "product", tag "products" }\n}\ndiv { "x" }\n';
    expect(extractCacheDirective(src)).toEqual({ life: "product", tag: "products" });
    const inline = parseCacheBody('revalidate 3600, stale 300, expire 86400, tag "p"');
    expect(inline).toEqual({ revalidate: 3600, stale: 300, expire: 86400, tag: "p" });
    // query order and empties
    expect(extractCacheDirective('page { title "T" }')).toBe(null);
  });

  test("resolveCache: builtin profiles + defaults + TW092", async () => {
    const { resolveCache } = await shared();
    // builtin life
    expect(resolveCache({ life: "minutes" })).toEqual({ revalidate: 300, stale: 60, expire: 3600, tag: undefined });
    // explicit keys override the profile
    expect(resolveCache({ life: "minutes", revalidate: 30 }).revalidate).toBe(30);
    // explicit block defaults expire to revalidate (no SWR window)
    expect(resolveCache({ revalidate: 60 })).toEqual({ revalidate: 60, stale: 0, expire: 60, tag: undefined });
    // user profiles win over builtins
    expect(resolveCache({ life: "product" }, { product: { stale: 2, revalidate: 3, expire: 8 } }))
      .toEqual({ revalidate: 3, stale: 2, expire: 8, tag: undefined });
    // unknown profile throws TW092
    expect(() => resolveCache({ life: "nope" })).toThrow(/TW092/);
    // unusable meta resolves to null (TW090 candidate)
    expect(resolveCache({ tag: "x" })).toBe(null);
  });

  test("canonicalizeQuery: order-independent, empty values dropped", async () => {
    const { canonicalizeQuery } = await shared();
    expect(canonicalizeQuery("?a=1&b=2")).toBe(canonicalizeQuery("?b=2&a=1"));
    expect(canonicalizeQuery("?a=1&b=")).toBe(canonicalizeQuery("?a=1"));
    expect(canonicalizeQuery("?x=%E0%A4%95")).toBe(canonicalizeQuery("?x=" + encodeURIComponent("क")));
    expect(canonicalizeQuery("")).toBe("");
  });

  test("readCacheProfilesSync parses tw.config.ts profiles", async () => {
    const { readCacheProfilesSync, parseCacheProfilesSource } = await shared();
    const dir = join(tmp, "cfg1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "tw.config.ts"),
      'export default {\n  cache: { profiles: { product: { stale: 2, revalidate: 3, expire: 8 } } },\n}\n');
    expect(readCacheProfilesSync(dir)).toEqual({ product: { stale: 2, revalidate: 3, expire: 8 } });
    // no config -> {}
    const empty = join(tmp, "cfg2");
    mkdirSync(empty, { recursive: true });
    expect(readCacheProfilesSync(empty)).toEqual({});
    // direct source parse
    expect(parseCacheProfilesSource('cache: { profiles: { a: { revalidate: 5 } } }'))
      .toEqual({ a: { revalidate: 5 } });
  });
});

// --- Compiler: page { cache { } } parses into options -------------------------

describe("page directive cache block (compiler)", () => {
  test("cache { } becomes options.cache with parsed values", async () => {
    const { parseWithDetails } = await import("../packages/compiler/tw/parser/index.ts") as any;
    const src = 'page { title "S" cache { life "product", revalidate 60, tag "products" } }\ndiv { "x" }\n';
    const out = parseWithDetails(src, { filePath: join(tmp, "c1.tw") });
    const page = (out.program.directives ?? out.program.body ?? []).find((n: any) => n.type === "PageDirective");
    expect(page).toBeTruthy();
    expect(page.options.cache).toEqual({ life: "product", revalidate: 60, tag: "products" });
  });

  test("cache { } without a lifetime is a TW090 diagnostic", async () => {
    const { parseWithDetails } = await import("../packages/compiler/tw/parser/index.ts") as any;
    const src = 'page { title "S" cache { tag "x" } }\ndiv { "x" }\n';
    const out = parseWithDetails(src, { filePath: join(tmp, "c2.tw") });
    const errors = [...(out.errors ?? []), ...(out.warnings ?? [])].filter((e: any) => e.code === "TW090");
    expect(errors.length).toBe(1);
  });
});

// --- Render pipeline windows + revalidateTag ---------------------------------

describe("render cache windows (server)", () => {
  test("HIT/STALE/MISS windows and revalidateTag()", async () => {
    const { RenderPipeline } = await import("../packages/server/tw/routing/render-pipeline.ts") as any;
    const dir = join(tmp, "site1");
    mkdirSync(join(dir, "home"), { recursive: true });
    writeFileSync(join(dir, "tw.config.ts"),
      'export default { cache: { profiles: { fast: { stale: 1, revalidate: 1, expire: 4 } } } }');
    writeFileSync(join(dir, "home", "page.tw"),
      'page { title "H" render ssr cache { life "fast", tag "home" } }\ndiv { "x" }\n');
    const p = new RenderPipeline({ rootDir: dir, homeDir: join(dir, "home"), enableCache: true, cacheTTL: 500 });
    const miss = p.render("/");
    expect(miss.headers["x-tw-cache"]).toBe("MISS");
    const hit = p.render("/");
    expect(hit.headers["x-tw-cache"]).toBe("HIT");
    expect(hit.headers["x-tw-cache-age"]).toBe("0");
    // fresh entry carries the client hint
    expect(miss.headers["Cache-Control"]).toBe("public, max-age=1, stale-while-revalidate=3");
    // tag invalidation drops the family
    expect(p.revalidateTag("home")).toBe(1);
    const after = p.render("/");
    expect(after.headers["x-tw-cache"]).toBe("MISS");
    // unrelated tag drops nothing
    expect(p.revalidateTag("nope")).toBe(0);
  });
});

// --- fn cached handler ---------------------------------------------------------

describe("fn cached handlers (twm-loader)", () => {
  test("cached GET: HIT + canonical key + revalidateTag drop", async () => {
    const { executeRouteHandler, clearTWMCache, clearRouteCache } =
      await import("../packages/server/tw/routing/twm-loader.ts") as any;
    const { revalidateTag } = await import("../packages/server/tw/routing/revalidate.ts") as any;
    const dir = join(tmp, "site2");
    mkdirSync(join(dir, "home", "api", "items"), { recursive: true });
    mkdirSync(join(dir, "lib"), { recursive: true });
    writeFileSync(join(dir, "tw.config.ts"), 'export default {}');
    writeFileSync(join(dir, "lib", "counter.ts"),
      'let n = 0\nexport function next() { n += 1; return n }\n');
    const route = join(dir, "home", "api", "items", "route.twm");
    writeFileSync(route, [
      'import { next } from "counter"',
      "",
      "fn cached get(request) {",
      '  cache { revalidate 60, tag "items" }',
      "  return { status: 200, json: { n: next() } }",
      "}",
      "",
    ].join("\n"));

    clearTWMCache(); clearRouteCache();
    const req = (u: string) => ({ method: "GET", url: "http://x" + u, headers: new Map(), json: async () => ({}), formData: async () => ({}), params: {} });
    const a = await executeRouteHandler(route, "GET", req("/api/items?a=1&b=2"), dir);
    expect(a.json.n).toBe(1);
    expect(a.headers["x-tw-cache"]).toBe("MISS");
    // swapped query order -> same entry (no re-execution)
    const b = await executeRouteHandler(route, "GET", req("/api/items?b=2&a=1"), dir);
    expect(b.json.n).toBe(1);
    expect(b.headers["x-tw-cache"]).toBe("HIT");
    // tag drop -> fresh execution
    expect(revalidateTag("items")).toBeGreaterThanOrEqual(1);
    const c = await executeRouteHandler(route, "GET", req("/api/items?a=1&b=2"), dir);
    expect(c.json.n).toBe(2);
    expect(c.headers["x-tw-cache"]).toBe("MISS");
  });

  test("TW091: impure cached handler is excluded from caching", async () => {
    const { executeRouteHandler, clearTWMCache, clearRouteCache } =
      await import("../packages/server/tw/routing/twm-loader.ts") as any;
    const dir = join(tmp, "site3");
    mkdirSync(join(dir, "home", "api", "imp"), { recursive: true });
    writeFileSync(join(dir, "tw.config.ts"), 'export default {}');
    const route = join(dir, "home", "api", "imp", "route.twm");
    writeFileSync(route, [
      "fn cached get(request) {",
      "  cache { revalidate 60 }",
      '  const who = request.cookies.get("u")',
      "  return { status: 200, json: { who } }",
      "}",
      "",
    ].join("\n"));

    clearTWMCache(); clearRouteCache();
    const req = () => ({
      method: "GET", url: "http://x/api/imp",
      headers: new Map([["cookie", "u=raj"]]),
      cookies: { u: "raj", get: (n: string) => (n === "u" ? "raj" : undefined) },
      json: async () => ({}), formData: async () => ({}), params: {},
    });
    const a = await executeRouteHandler(route, "GET", req(), dir);
    const b = await executeRouteHandler(route, "GET", req(), dir);
    // impure handler never caches: no x-tw-cache header on either response
    expect((a as any).headers?.["x-tw-cache"]).toBeUndefined();
    expect((b as any).headers?.["x-tw-cache"]).toBeUndefined();
    // and the handler still executes every time (fresh cookies each call)
    expect(a.json.who).toBe("raj");
    expect(b.json.who).toBe("raj");
  });
});

// --- routes.json build shape ---------------------------------------------------

describe("routes.json cache manifest (build)", () => {
  test("cache { } resolves to an object; revalidate N stays a number", async () => {
    const { extractCacheDirective, resolveCache } = await shared();
    // simulate the build resolution the CLI performs
    const profiles = { product: { stale: 2, revalidate: 3, expire: 8 } };
    const shop = resolveCache(extractCacheDirective('page { cache { life "product", tag "products" } }')!, profiles);
    expect(shop).toEqual({ revalidate: 3, stale: 2, expire: 8, tag: "products" });
    // legacy desugaring (render-pipeline path): infinite SWR, v1.0.5 exact
    const legacy = resolveCache({ revalidate: 60 }, {}, { legacy: true });
    expect(legacy).toEqual({ revalidate: 60, stale: 0, expire: Infinity, tag: undefined });
    // a plain explicit block instead defaults expire to revalidate
    expect(resolveCache({ revalidate: 60 }, {}).expire).toBe(60);
    // the built manifest stores numbers for legacy, objects for cache blocks
    const manifest = { "/shop": shop, "/legacy": 60 };
    const json = JSON.parse(JSON.stringify(manifest, (_k, v) => v === Infinity ? undefined : v));
    expect(typeof json["/legacy"]).toBe("number");
    expect(json["/shop"]).toEqual({ revalidate: 3, stale: 2, expire: 8, tag: "products" });
  });
});
