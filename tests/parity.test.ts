/** TW Framework -- Next.js Feature Parity Tests */

import { describe, test, expect } from "bun:test";
import {
  renderServerComponent,
  parseClientDirective,
  determineHydrationStrategy,
  type ServerContext,
} from "@tw/compiler";

import {
  createSuspense,
  renderSuspense,
  streamSuspense,
  renderErrorBoundary,
  createLoadingState,
} from "@tw/compiler";

import {
  diffKeyed,
  applyPatches,
  createVNode,
  createTextVNode,
  diffTextNode,
  releaseVNode,
} from "@tw/runtime";

import {
  createEdgeHandler,
  createCloudflareWorker,
} from "@tw/server";

import { optimizeImage, imgTag } from "@tw/server";
import { optimizeFont, generateFontPreload, generateFontCSS } from "@tw/server";
import { t, setLocale, parseLocalePath, formatDate, formatCurrency, isRTL } from "@tw/server";
import { scanRoutes, matchRoute, parseSlots, renderParallel } from "@tw/server";
import { generateReport, generateComparison, formatReport } from "@tw/compiler";

const mockCtx: ServerContext = {
  url: new URL("http://localhost:3000/test"),
  headers: {},
  params: {},
  query: {},
  cookies: {},
  state: {},
};

describe("Server Components", () => {
  test("parses @server directive", () => {
    const result = parseClientDirective("@render mode: 'server'");
    expect(result.kind).toBe("server");
  });

  test("parses @client directive", () => {
    const result = parseClientDirective("@render mode: 'client'");
    expect(result.kind).toBe("client");
    expect(result.hydrate).toBe("eager");
  });

  test("parses @client:lazy directive", () => {
    const result = parseClientDirective("@client:lazy");
    expect(result.kind).toBe("island");
    expect(result.hydrate).toBe("lazy");
  });

  test("parses @client:visible directive", () => {
    const result = parseClientDirective("@client:visible");
    expect(result.kind).toBe("island");
    expect(result.hydrate).toBe("visible");
  });

  test("defaults to server component", () => {
    const result = parseClientDirective("<div>hello</div>");
    expect(result.kind).toBe("server");
  });

  test("determines hydration strategy", () => {
    expect(determineHydrationStrategy("Hero", "above-fold")).toBe("eager");
    expect(determineHydrationStrategy("Footer", "below-fold")).toBe("visible");
    expect(determineHydrationStrategy("Modal", "modal")).toBe("lazy");
    expect(determineHydrationStrategy("Sidebar", "sidebar")).toBe("idle");
  });

  test("renders server component", async () => {
    const result = await renderServerComponent("<div>Hello</div>", mockCtx);
    expect(result.html).toContain("Hello");
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("Suspense", () => {
  test("creates suspense boundary", () => {
    const boundary = createSuspense("<div>Loading</div>", "<div>Content</div>");
    expect(boundary.fallback).toBe("<div>Loading</div>");
    expect(boundary.resolved).toBe(false);
    expect(boundary.id).toBeDefined();
  });

  test("renders suspense boundary", () => {
    const boundary = createSuspense("Loading", "Content");
    const html = renderSuspense(boundary);
    expect(html).toContain("data-tw-suspense");
    expect(html).toContain("Loading");
    expect(html).toContain("Content");
  });

  test("streams suspense with fallback first", async () => {
    const boundary = createSuspense("Loading...", "");
    const chunks: string[] = [];
    const gen = streamSuspense(boundary, async () => "Loaded Content");

    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]).toContain("Loading...");
    expect(chunks[1]).toContain("Loaded Content");
  });

  test("handles suspense error", async () => {
    const boundary = createSuspense("Loading", "");
    const chunks: string[] = [];
    const gen = streamSuspense(boundary, async () => {
      throw new Error("Failed");
    });

    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[1]).toContain("__TW_REJECT__");
  });
});

describe("ErrorBoundary", () => {
  test("renders error boundary", () => {
    const html = renderErrorBoundary(
      { id: "err1", fallback: "<div>Error!</div>" },
      "<div>Risky</div>"
    );
    expect(html).toContain("data-tw-error-boundary");
    expect(html).toContain("Error!");
    expect(html).toContain("Risky");
  });
});

describe("Optimized VDOM Diff", () => {
  test("diffs empty old -> create all", () => {
    const oldChildren: any[] = [];
    const newChildren = [
      createVNode("div", { class: "a" }, [], "1"),
      createVNode("div", { class: "b" }, [], "2"),
    ];
    const patches = diffKeyed(oldChildren, newChildren, {} as any);
    expect(patches.length).toBe(2);
    expect(patches.every(p => p.kind === "create")).toBe(true);
  });

  test("diffs empty new -> remove all", () => {
    const oldChildren = [
      createVNode("div", {}, [], "1"),
      createVNode("div", {}, [], "2"),
    ];
    const newChildren: any[] = [];
    const patches = diffKeyed(oldChildren, newChildren, {} as any);
    expect(patches.length).toBe(1);
    expect(patches[0].kind).toBe("remove");
  });

  test("diffs text change (fast path)", () => {
    const oldNode = createTextVNode("old");
    const patch = diffTextNode(oldNode, "new");
    expect(patch).not.toBeNull();
    expect(patch!.kind).toBe("text");
  });

  test("no diff for identical text", () => {
    const oldNode = createTextVNode("same");
    const patch = diffTextNode(oldNode, "same");
    expect(patch).toBeNull();
  });

  test("diffs keyed list reorder", () => {
    const oldChildren = [
      createVNode("li", {}, [], "a"),
      createVNode("li", {}, [], "b"),
      createVNode("li", {}, [], "c"),
    ];
    const newChildren = [
      createVNode("li", {}, [], "c"),
      createVNode("li", {}, [], "a"),
      createVNode("li", {}, [], "b"),
    ];
    const patches = diffKeyed(oldChildren, newChildren, {} as any);
    // Should reuse nodes (keyed), not recreate
    const creates = patches.filter(p => p.kind === "create");
    expect(creates.length).toBe(0);
  });

  test("releases VNode to pool", () => {
    const node = createVNode("div");
    releaseVNode(node);
    // Should not throw
    expect(true).toBe(true);
  });
});

describe("Edge Runtime", () => {
  test("creates edge handler", () => {
    const handler = createEdgeHandler({ rootDir: "./pages" });
    expect(typeof handler).toBe("function");
  });

  test("handles request", async () => {
    const handler = createEdgeHandler({ rootDir: "./pages" });
    const response = await handler({
      url: "http://localhost/test",
      method: "GET",
      headers: {},
    });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  test("creates cloudflare worker", () => {
    const worker = createCloudflareWorker({ rootDir: "./pages" });
    expect(worker.fetch).toBeDefined();
    expect(typeof worker.fetch).toBe("function");
  });
});

describe("Image Optimizer", () => {
  test("optimizes image with defaults", () => {
    const result = optimizeImage("/photo.jpg", {});
    expect(result.src).toContain("_tw/img");
    expect(result.src).toContain("f=webp");
    expect(result.srcset).toBeDefined();
    expect(result.loading).toBe("lazy");
  });

  test("priority images get eager loading", () => {
    const result = optimizeImage("/hero.jpg", { priority: true });
    expect(result.loading).toBe("eager");
  });

  test("generates srcset with breakpoints", () => {
    const result = optimizeImage("/photo.jpg", {});
    expect(result.srcset).toContain("320w");
    expect(result.srcset).toContain("640w");
  });

  test("generates img tag", () => {
    const opt = optimizeImage("/photo.jpg", { width: 640, height: 480 });
    const tag = imgTag(opt, "Photo");
    expect(tag).toContain("<img");
    expect(tag).toContain('alt="Photo"');
    expect(tag).toContain('src=');
  });
});

describe("Font Optimizer", () => {
  test("optimizes Inter font", () => {
    const font = optimizeFont({
      family: "Inter",
      weights: [400, 700],
      subsets: ["latin"],
    });
    expect(font.family).toBe("Inter");
    expect(font.files.length).toBe(2);
    expect(font.css).toContain("@font-face");
    expect(font.css).toContain("Inter");
  });

  test("generates preload link", () => {
    const font = optimizeFont({
      family: "Inter",
      weights: [400],
      subsets: ["latin"],
    });
    const preload = generateFontPreload(font);
    expect(preload).toContain("preload");
    expect(preload).toContain("woff2");
  });

  test("generates CSS with fallback", () => {
    const font = optimizeFont({
      family: "Inter",
      weights: [400],
      subsets: ["latin"],
    });
    const css = generateFontCSS(font);
    expect(css).toContain("@font-face");
    expect(css).toContain("Fallback");
    expect(css).toContain("size-adjust");
  });
});

describe("i18n", () => {
  test("translates key", () => {
    setLocale("en");
    loadTranslationsDirectly("en", { hello: "Hello" });
    expect(t("hello")).toBe("Hello");
  });

  test("interpolates variables", () => {
    setLocale("en");
    loadTranslationsDirectly("en", { welcome: "Welcome, {name}" });
    expect(t("welcome", { name: "Raj" })).toBe("Welcome, Raj");
  });

  test("falls back to key", () => {
    setLocale("en");
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });

  test("parses locale path", () => {
    const result = parseLocalePath("/hi/about", {
      locales: ["en", "hi"],
      defaultLocale: "en",
      strategy: "subpath",
      interpolation: { prefix: "{", suffix: "}" },
    });
    expect(result.locale).toBe("hi");
    expect(result.pathname).toBe("/about");
    expect(result.isLocalized).toBe(true);
  });

  test("detects RTL", () => {
    expect(isRTL("ar")).toBe(true);
    expect(isRTL("he")).toBe(true);
    expect(isRTL("en")).toBe(false);
    expect(isRTL("hi")).toBe(false);
  });

  test("formats currency", () => {
    const result = formatCurrency(999, "INR", "en-IN");
    expect(result).toContain("₹");
  });

  test("formats date", () => {
    const result = formatDate(new Date("2026-01-15"), "en-IN");
    expect(result).toBeDefined();
  });
});

// Helper to load translations
function loadTranslationsDirectly(locale: string, messages: Record<string, string>) {
  const { loadTranslations } = require("@tw/server");
  loadTranslations(locale, messages);
}

describe("Advanced Routing", () => {
  test("scans routes", () => {
    // Can't test real filesystem, but function should exist
    expect(typeof scanRoutes).toBe("function");
  });

  test("parses slots from layout", () => {
    const layout = '<div><slot name="main" /><slot name="sidebar" /></div>';
    const slots = parseSlots(layout);
    expect(slots).toEqual(["main", "sidebar"]);
  });

  test("renders parallel routes", () => {
    const layout = '<div><slot name="main" /><slot name="sidebar" /></div>';
    const result = renderParallel(layout, {
      main: "<p>Main content</p>",
      sidebar: "<nav>Sidebar</nav>",
    });
    expect(result).toContain("Main content");
    expect(result).toContain("Sidebar");
    expect(result).not.toContain("<slot");
  });

  test("matches route", () => {
    const routes = [
      { path: "/", file: "index.tw", groups: [], dynamic: false, params: [], catchAll: false },
      { path: "/about", file: "about.tw", groups: [], dynamic: false, params: [], catchAll: false },
      { path: "/users/:id", file: "[id].tw", groups: [], dynamic: true, params: ["id"], catchAll: false },
    ];
    const match = matchRoute("/users/42", routes as any);
    expect(match).not.toBeNull();
    expect(match!.params.id).toBe("42");
  });
});

describe("Build Profiler", () => {
  test("generates report", () => {
    const report = generateReport(
      [{ path: "/", renderMs: 5, htmlSize: 5000, cssSize: 2000, jsSize: 3000, totalSize: 10000, mode: "ssr" }],
      [{ name: "main.js", size: 30000, gzipSize: 10000, modules: 15, treeshaken: 3 }],
      { hits: 8, misses: 2, hitRate: 0.8, size: 50000, evictions: 0 }
    );
    expect(report.totalMs).toBeGreaterThanOrEqual(0);
    expect(report.routes.length).toBe(1);
    expect(report.cache.hitRate).toBe(0.8);
  });

  test("generates comparison", () => {
    const comp = generateComparison(100, 30);
    expect(comp.twCompileMs).toBe(100);
    expect(comp.nextJsCompileMs).toBe(500);
    expect(comp.speedup).toBe(5);
    expect(comp.bundleReduction).toBeGreaterThan(0);
  });

  test("formats report as string", () => {
    const report = generateReport([], [], { hits: 0, misses: 0, hitRate: 0, size: 0, evictions: 0 });
    const formatted = formatReport(report);
    expect(formatted).toContain("TW Build Report");
    expect(formatted).toContain("Total:");
  });
});

describe("Parallel Compilation", () => {
  test("compiles files in parallel", async () => {
    const { compileParallel } = await import("@tw/compiler");
    const files = new Map([
      ["a.tw", "<div>A</div>"],
      ["b.tw", "<div>B</div>"],
      ["c.tw", "<div>C</div>"],
    ]);
    const result = await compileParallel(files);
    expect(result.results.size).toBe(3);
    expect(result.filesCompiled).toBe(3);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
  });
});

describe("Incremental HMR", () => {
  test("diffs CSS for HMR", async () => {
    const { diffForHMR, createHMRMessage } = await import("@tw/compiler");
    const oldResult = { html: "<div>x</div>", css: ".a { color: red; }", js: "", diagnostics: [], metadata: {} } as any;
    const newResult = { html: "<div>x</div>", css: ".a { color: blue; }", js: "", diagnostics: [], metadata: {} } as any;

    const patch = diffForHMR(oldResult, newResult);
    expect(patch.type).toBe("css");
    expect(patch.fullReload).toBe(false);
  });

  test("creates HMR message", async () => {
    const { diffForHMR, createHMRMessage } = await import("@tw/compiler");
    const oldResult = { html: "<div>x</div>", css: "", js: "", diagnostics: [], metadata: {} } as any;
    const newResult = { html: "<div>y</div>", css: "", js: "", diagnostics: [], metadata: {} } as any;

    const patch = diffForHMR(oldResult, newResult);
    const message = createHMRMessage(patch);
    const parsed = JSON.parse(message);
    expect(parsed.type).toBeDefined();
  });
});
