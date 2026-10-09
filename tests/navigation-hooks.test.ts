import { describe, test, expect, beforeEach } from "bun:test";
import {
  createRouter, matchPathPattern, setRouter, useParam, useParamBool, useParamInt, useParamList,
  useParams, usePathname, useRouteSegments, useSearchParams,
} from "@tw/runtime";

// A router we can drive without a DOM.
function fakeRouter(path = "/", query: Record<string, string | string[]> = {}, params: Record<string, string> = {}) {
  let current: any = { path, query, params, hash: "", fullPath: path, name: undefined, matched: [] };
  const listeners: Array<(r: any) => void> = [];
  return {
    get currentRoute() { return current; },
    options: {},
    async push(p: string) { current = { ...current, path: p.split("?")[0], query: Object.fromEntries(new URLSearchParams(p.split("?")[1] ?? "")) }; for (const l of listeners) l(current); },
    async replace(p: string) { await (this as any).push(p); },
    go() {}, back() {}, forward() {},
    beforeResolve: () => () => {}, beforeEach: () => () => {}, afterEach: () => () => {},
    resolve: () => current,
    subscribe: (l: any) => { listeners.push(l); return () => {}; },
    install() {},
  } as any;
}

describe("usePathname", () => {
  test("returns the current path", () => {
    setRouter(fakeRouter("/blog/hello"));
    expect(usePathname()).toBe("/blog/hello");
  });

  test("matches a [param] pattern and binds it", () => {
    setRouter(fakeRouter("/blog/hello"));
    const m = usePathname({ pattern: "/blog/[slug]" }) as any;
    expect(m.matches).toBe(true);
    expect(m.params.slug).toBe("hello");
  });

  test("a non-match reports false, and score rewards literal segments", () => {
    expect(matchPathPattern("/a/b", "/x/[y]").matches).toBe(false);
    expect(matchPathPattern("/blog/hello", "/blog/[slug]").score).toBe(0.5);
    expect(matchPathPattern("/blog/hello", "/blog/hello").score).toBe(1);
  });

  test(":name style works too", () => {
    expect(matchPathPattern("/u/7", "/u/:id").params.id).toBe("7");
  });
});

describe("useParams + coercion", () => {
  beforeEach(() => setRouter(fakeRouter("/p/42", {}, { id: "42", flag: "true", tags: "a,b,c" })));

  test("useParams returns them all", () => {
    expect(useParams().id).toBe("42");
  });

  test("useParam coerces on request", () => {
    expect(useParamInt("id")).toBe(42);
    expect(useParamBool("flag")).toBe(true);
    expect(useParamList("tags")).toEqual(["a", "b", "c"]);
    expect(useParam("missing")).toBeUndefined();
  });
});

describe("useSearchParams: read AND write", () => {
  test("reads the current query", () => {
    setRouter(fakeRouter("/", { page: "2", tag: ["a", "b"] }));
    const sp = useSearchParams();
    expect(sp.get("page")).toBe("2");
    expect(sp.getAll("tag")).toEqual(["a", "b"]);
    expect(sp.has("page")).toBe(true);
  });

  test("set/append/delete/toggle change toString without navigating", () => {
    setRouter(fakeRouter("/", { page: "1" }));
    const sp = useSearchParams();
    sp.set("page", "3");
    sp.append("tag", "x");
    expect(sp.get("page")).toBe("3");
    expect(sp.getAll("tag")).toEqual(["x"]);
    expect(sp.toString()).toContain("page=3");
  });

  test("delete removes, toggle flips", () => {
    setRouter(fakeRouter("/", { a: "1" }));
    const sp = useSearchParams();
    sp.delete("a");
    expect(sp.has("a")).toBe(false);
    sp.toggle("dark", "1");
    expect(sp.getAll("dark")).toEqual(["1"]);
    sp.toggle("dark", "1");
    expect(sp.getAll("dark")).toEqual([]);
  });

  test("update() stages several values at once", async () => {
    const r = fakeRouter("/list", { page: "1", sort: "old" });
    setRouter(r);
    const sp = useSearchParams();
    sp.update({ page: 2, sort: "latest", tag: ["x", "y"], drop: null });
    expect(sp.get("page")).toBe("2");
    expect(sp.get("sort")).toBe("latest");
    expect(sp.getAll("tag")).toEqual(["x", "y"]);
    expect(sp.has("drop")).toBe(false);
    await sp.commit();
    expect(r.currentRoute.query.page).toBe("2");
    expect(r.currentRoute.query.sort).toBe("latest");
  });

  test("commit pushes the new URL to the router", async () => {
    const r = fakeRouter("/list", { page: "1" });
    setRouter(r);
    const sp = useSearchParams();
    sp.set("page", "9");
    await sp.commit();
    expect(r.currentRoute.query.page).toBe("9");
  });
});

describe("useRouteSegments", () => {
  test("types each segment and extracts groups", () => {
    setRouter(fakeRouter("/blog/[slug]"));
    const info = useRouteSegments();
    expect(info.segments.map((s) => s.type)).toEqual(["static", "dynamic"]);
    expect(info.segments[1].param).toBe("slug");
  });

  test("catch-all segments are recognised", () => {
    setRouter(fakeRouter("/docs/[...path]"));
    expect(useRouteSegments().segments[1].type).toBe("catch-all");
  });

  test("isActive covers ancestors and exact mode", () => {
    setRouter(fakeRouter("/blog/hello"));
    const info = useRouteSegments();
    expect(info.isActive("/blog")).toBe(true);
    expect(info.isActive("/blog", { exact: true })).toBe(false);
    expect(info.isActive("/blog/hello", { exact: true })).toBe(true);
    expect(info.isActive("/other")).toBe(false);
  });
});

describe("createRouter still works (no regression)", () => {
  test("a real router exposes currentRoute", () => {
    const r = createRouter({ routes: [{ path: "/", name: "home" }], initial: "/" });
    expect(r.currentRoute.path).toBeDefined();
  });
});
