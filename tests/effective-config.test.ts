import { describe, test, expect } from "bun:test";
import {
  resolveDevOptions,
  resolveServerOptions,
  resolveCorsOptions,
  resolveSslOptions,
  resolveBuildOptions,
  resolveCompilerOptions,
  resolveCssOptions,
  resolveRouterOptions,
  resolveI18nOptions,
} from "../packages/shared/tw/config/effective.ts";

describe("effective config: dev", () => {
  test("empty config yields the framework defaults", () => {
    const d = resolveDevOptions({});
    expect(d.port).toBe(3000);
    expect(d.host).toBe("localhost");
    expect(d.hmr).toBe(true);
    expect(d.hmrPort).toBe(3001);
    expect(d.openBrowser).toBe(false);
    expect(d.overlay).toBe(true);
    expect(d.fastRefresh).toBe(true);
    expect(d.watchPaths.length).toBe(4);
    expect(d.watchIgnore).toContain("node_modules");
  });

  test("a set field is used; top-level port is the fallback", () => {
    expect(resolveDevOptions({ dev: { hmr: false, openBrowser: true } }).hmr).toBe(false);
    expect(resolveDevOptions({ dev: { hmr: false, openBrowser: true } }).openBrowser).toBe(true);
    expect(resolveDevOptions({ dev: { port: 4100 } }).port).toBe(4100);
    expect(resolveDevOptions({ port: 4200 }).port).toBe(4200);
    expect(resolveDevOptions({ port: 4200, dev: { port: 4100 } }).port).toBe(4100);
  });

  test("wrong-typed values fall back to defaults, never crash", () => {
    const d = resolveDevOptions({ dev: { hmr: "yes", port: "x", watchPaths: "nope" } as any });
    expect(d.hmr).toBe(true);
    expect(d.port).toBe(3000);
    expect(Array.isArray(d.watchPaths)).toBe(true);
  });
});

describe("effective config: server", () => {
  test("empty config yields the framework defaults", () => {
    const s = resolveServerOptions({});
    expect(s.port).toBe(3000);
    expect(s.host).toBe("0.0.0.0");
    expect(s.workers).toBe(1);
    expect(s.keepAlive).toBe(true);
    expect(s.keepAliveTimeout).toBe(5000);
    expect(s.staticServing).toBe(true);
    expect(s.compression).toBe("auto");
    expect(s.trustProxy).toBe(true);
    expect(s.bodyLimit).toBe(10 * 1024 * 1024);
    expect(s.timeout).toBe(30000);
    expect(s.ssl).toBeNull();
    expect(s.cluster).toBe(false);
    expect(s.gracefulShutdown).toBe(true);
  });

  test("bodyLimit / timeout / keepAlive are read and clamped", () => {
    const s = resolveServerOptions({ server: { bodyLimit: 2048, timeout: 5000, keepAlive: false, keepAliveTimeout: 1200 } });
    expect(s.bodyLimit).toBe(2048);
    expect(s.timeout).toBe(5000);
    expect(s.keepAlive).toBe(false);
    expect(s.keepAliveTimeout).toBe(1200);
    // negative -> clamped to 0, not passed through
    expect(resolveServerOptions({ server: { timeout: -5 } }).timeout).toBe(0);
  });

  test("compression accepts the group field and the legacy top-level field", () => {
    expect(resolveServerOptions({ server: { compression: "brotli" } }).compression).toBe("brotli");
    expect(resolveServerOptions({ compression: "gzip" }).compression).toBe("gzip");
    expect(resolveServerOptions({ server: { compression: "zip" } as any }).compression).toBe("auto");
  });

  test("workers and cluster are read", () => {
    expect(resolveServerOptions({ server: { workers: 4 } }).workers).toBe(4);
    expect(resolveServerOptions({ server: { cluster: true } }).cluster).toBe(true);
    // workers above the cap is clamped, not rejected
    expect(resolveServerOptions({ server: { workers: 9999 } }).workers).toBe(64);
  });
});

describe("effective config: cors", () => {
  test("disabled by default, with sensible header lists", () => {
    const c = resolveCorsOptions(undefined);
    expect(c.enabled).toBe(false);
    expect(c.origin).toBe("*");
    expect(c.methods).toContain("GET");
    expect(c.allowedHeaders).toContain("Content-Type");
    expect(c.exposedHeaders).toEqual([]);
    expect(c.credentials).toBe(false);
    expect(c.maxAge).toBe(86400);
  });

  test("a configured block is honoured", () => {
    const c = resolveCorsOptions({ enabled: true, origin: ["https://a.com"], credentials: true, maxAge: 60 });
    expect(c.enabled).toBe(true);
    expect(c.origin).toEqual(["https://a.com"]);
    expect(c.credentials).toBe(true);
    expect(c.maxAge).toBe(60);
  });
});

describe("effective config: ssl", () => {
  test("null unless both cert and key are present", () => {
    expect(resolveSslOptions(null)).toBeNull();
    expect(resolveSslOptions({})).toBeNull();
    expect(resolveSslOptions({ cert: "c" })).toBeNull();
    expect(resolveSslOptions({ key: "k" })).toBeNull();
    expect(resolveSslOptions({ cert: "c", key: "k" })).toEqual({ cert: "c", key: "k" });
    expect(resolveSslOptions({ cert: "c", key: "k", ca: "a" })).toEqual({ cert: "c", key: "k", ca: "a" });
  });
});

describe("effective config: build", () => {
  test("empty config yields the framework defaults", () => {
    const b = resolveBuildOptions({});
    expect(b.target).toBe("browser");
    expect(b.format).toBe("iife");
    expect(b.minify).toBe(true);
    expect(b.sourcemap).toBe(true);
    expect(b.treeshake).toBe(true);
    expect(b.codeSplitting).toBe(false);
    expect(b.outputDir).toBe(".tw");
    expect(b.publicPath).toBe("/");
    expect(b.metafile).toBe(true);
  });

  test("minify / sourcemap / publicPath are read", () => {
    const b = resolveBuildOptions({ build: { minify: false, sourcemap: "inline", publicPath: "/app/" } });
    expect(b.minify).toBe(false);
    expect(b.sourcemap).toBe("inline");
    expect(b.publicPath).toBe("/app/");
  });

  test("strategies.runtime.server informs the build target", () => {
    expect(resolveBuildOptions({ strategies: { runtime: { server: "edge" } } }).target).toBe("edge");
    expect(resolveBuildOptions({ strategies: { runtime: { server: "node" } } }).target).toBe("node");
    expect(resolveBuildOptions({ build: { target: "bun" }, strategies: { runtime: { server: "edge" } } }).target).toBe("bun");
  });
});

describe("effective config: compiler", () => {
  test("empty config yields the framework defaults", () => {
    const c = resolveCompilerOptions({});
    expect(c.strict).toBe(true);
    expect(c.optimization).toBe("basic");
    expect(c.scopedStyles).toBe(true);
    expect(c.ssrAttributes).toBe(true);
    expect(c.preserveComments).toBe(false);
    expect(c.removeEmptyBlocks).toBe(true);
    expect(c.foldConstants).toBe(true);
    expect(c.deadCode).toBe(true);
    expect(c.treeShaking).toBe(true);
    expect(c.minifyHTML).toBe(false);
    expect(c.minifyCSS).toBe(false);
    expect(c.minifyJS).toBe(false);
    expect(c.sourceMaps).toBe(false);
    expect(c.cacheSize).toBe(256);
  });

  test("optimization=none turns the fold/dead-code passes off", () => {
    const c = resolveCompilerOptions({ compiler: { optimization: "none" } });
    expect(c.foldConstants).toBe(false);
    expect(c.deadCode).toBe(false);
    expect(c.treeShaking).toBe(false);
  });

  test("optimization=aggressive turns minifyJS on", () => {
    const c = resolveCompilerOptions({ compiler: { optimization: "aggressive" } });
    expect(c.minifyJS).toBe(true);
  });

  test("an explicit field beats the optimization preset", () => {
    const c = resolveCompilerOptions({ compiler: { optimization: "none", foldConstants: true } });
    expect(c.foldConstants).toBe(true);
    expect(c.deadCode).toBe(false);
  });

  test("individual fields are read", () => {
    const c = resolveCompilerOptions({ compiler: { preserveComments: true, minifyJS: true, cacheSize: 64 } });
    expect(c.preserveComments).toBe(true);
    expect(c.minifyJS).toBe(true);
    expect(c.cacheSize).toBe(64);
  });
});

describe("effective config: css", () => {
  test("empty config yields the framework defaults", () => {
    const c = resolveCssOptions({});
    expect(c.engine).toBe("tss");
    expect(c.modules).toBe(true);
    expect(c.prefix).toBe("tw-");
    expect(c.extract).toBe(true);
    expect(c.minify).toBe(true);
    expect(c.autoprefixer).toBe(true);
    expect(c.targets.length).toBe(3);
  });

  test("strategies.css.engine beats the flat css.engine", () => {
    expect(resolveCssOptions({ css: { engine: "scss" } }).engine).toBe("scss");
    expect(resolveCssOptions({ css: { engine: "scss" }, strategies: { css: { engine: "css" } } }).engine).toBe("css");
  });

  test("modules / prefix / variables / minify are read", () => {
    const c = resolveCssOptions({ css: { modules: false, prefix: "app-", variables: { "--x": "1" }, minify: false } });
    expect(c.modules).toBe(false);
    expect(c.prefix).toBe("app-");
    expect(c.variables).toEqual({ "--x": "1" });
    expect(c.minify).toBe(false);
  });
});

describe("effective config: router + i18n", () => {
  test("router defaults", () => {
    const r = resolveRouterOptions({});
    expect(r.trailingSlash).toBe(false);
    expect(r.caseSensitive).toBe(false);
    expect(r.defaultLocale).toBe("en");
    expect(r.localePrefix).toBe("always");
    expect(r.apiDir).toBe("api");
    expect(r.routes).toEqual([]);
  });

  test("i18n defaults", () => {
    const i = resolveI18nOptions({});
    expect(i.enabled).toBe(false);
    expect(i.defaultLocale).toBe("en");
    expect(i.locales).toEqual(["en"]);
    expect(i.fallback).toBe("en");
    expect(i.strategy).toBe("prefix");
    expect(i.translationDir).toBe("locales");
    expect(i.loading).toBe("lazy");
  });

  test("i18n falls back to router locales when its own are unset", () => {
    const i = resolveI18nOptions({ router: { locales: ["en", "hi"], defaultLocale: "hi" } });
    expect(i.locales).toEqual(["en", "hi"]);
    expect(i.defaultLocale).toBe("hi");
  });

  test("i18n's own fields win over router", () => {
    const i = resolveI18nOptions({ router: { locales: ["en", "hi"], defaultLocale: "hi" }, i18n: { locales: ["fr"], defaultLocale: "fr" } });
    expect(i.locales).toEqual(["fr"]);
    expect(i.defaultLocale).toBe("fr");
  });

  test("i18n enabled / strategy / loading are read", () => {
    const i = resolveI18nOptions({ i18n: { enabled: true, strategy: "cookie", loading: "eager" } });
    expect(i.enabled).toBe(true);
    expect(i.strategy).toBe("cookie");
    expect(i.loading).toBe("eager");
  });
});

describe("effective config: css engine allows tailwind (strategy value)", () => {
  test("strategies.css.engine=tailwind is not rejected", () => {
    expect(resolveCssOptions({ strategies: { css: { engine: "tailwind" } } }).engine).toBe("tailwind");
  });
});

describe("effective config: compiler removeEmptyBlocks default", () => {
  test("defaults to on", () => {
    expect(resolveCompilerOptions({}).removeEmptyBlocks).toBe(true);
    expect(resolveCompilerOptions({ compiler: { removeEmptyBlocks: false } }).removeEmptyBlocks).toBe(false);
  });
});
