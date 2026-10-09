/**
 * Effective config resolution.
 *
 * The flat config groups (`dev`, `server`, `build`, `compiler`, `css`,
 * `router`, `i18n`) are the fine-grained surface. This module is the ONE
 * place that reads them: each field is resolved against the framework
 * default, so a project that sets nothing behaves exactly as before, and a
 * project that sets a field gets that field's behaviour.
 *
 * Where a `strategies.*` knob overlaps a flat field, the strategy wins -- it
 * is the modern surface and the flat field is its fine-grained alias (e.g.
 * `strategies.css.engine` beats `css.engine`; `strategies.runtime.server`
 * informs `build.target`).
 *
 * Every resolver takes a possibly-partial config and returns a fully
 * defaulted options object. Call sites read the resolved object, never the
 * raw config, so the defaults live in exactly one place.
 */

import type {
  BuildConfig,
  CompilerConfig,
  CORSConfig,
  CSSConfig,
  DevConfig,
  I18nConfig,
  RouterConfig,
  SSLConfig,
  ServerConfig,
} from "./schema";

type Any = any;

// ---------------------------------------------------------------------------
// dev
// ---------------------------------------------------------------------------

export interface EffectiveDevOptions extends DevConfig {}

export function resolveDevOptions(cfg: Any): EffectiveDevOptions {
  const d: Any = cfg?.dev ?? {};
  return {
    port: num(d.port, num(cfg?.port, 3000)),
    host: str(d.host, "localhost"),
    hmr: bool(d.hmr, true),
    hmrPort: num(d.hmrPort, 3001),
    hmrHost: str(d.hmrHost, "localhost"),
    openBrowser: bool(d.openBrowser, false),
    https: bool(d.https, false),
    httpsCert: d.httpsCert,
    httpsKey: d.httpsKey,
    watchPaths: arr(d.watchPaths, ["home/**", "components/**", "layouts/**", "assets/**"]),
    watchIgnore: arr(d.watchIgnore, ["node_modules", ".tw", "dist", ".git"]),
    overlay: bool(d.overlay, true),
    fastRefresh: bool(d.fastRefresh, true),
  };
}

// ---------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------

export interface EffectiveServerOptions extends ServerConfig {}

export function resolveServerOptions(cfg: Any): EffectiveServerOptions {
  const s: Any = cfg?.server ?? {};
  const compression = pick(
    s.compression ?? cfg?.compression,
    ["gzip", "brotli", "none", "auto"],
    "auto",
  );
  return {
    port: num(s.port, num(cfg?.port, 3000)),
    host: str(s.host, "0.0.0.0"),
    workers: clampInt(s.workers, 1, 1, 64),
    maxConnections: clampInt(s.maxConnections, 10000, 1, 1_000_000),
    keepAlive: bool(s.keepAlive, true),
    keepAliveTimeout: clampInt(s.keepAliveTimeout, 5000, 0, 600_000),
    staticServing: bool(s.staticServing, true),
    compression,
    cors: resolveCorsOptions(s.cors),
    trustProxy: bool(s.trustProxy, true),
    bodyLimit: clampInt(s.bodyLimit, 10 * 1024 * 1024, 0, Number.MAX_SAFE_INTEGER),
    timeout: clampInt(s.timeout, 30000, 0, 600_000),
    ssl: resolveSslOptions(s.ssl),
    cluster: bool(s.cluster, false),
    gracefulShutdown: bool(s.gracefulShutdown, true),
  };
}

// ---------------------------------------------------------------------------
// cors (nested under server)
// ---------------------------------------------------------------------------

export interface EffectiveCorsOptions extends CORSConfig {}

export function resolveCorsOptions(cors: Any): EffectiveCorsOptions {
  const c: Any = cors ?? {};
  return {
    enabled: bool(c.enabled, false),
    origin: c.origin ?? "*",
    methods: arr(c.methods, ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
    allowedHeaders: arr(c.allowedHeaders, ["Content-Type", "Authorization"]),
    exposedHeaders: arr(c.exposedHeaders, []),
    credentials: bool(c.credentials, false),
    maxAge: clampInt(c.maxAge, 86400, 0, 31_536_000),
  };
}

// ---------------------------------------------------------------------------
// ssl (nested under server; also the top-level `ssl` group)
// ---------------------------------------------------------------------------

export function resolveSslOptions(ssl: Any): SSLConfig | null {
  const s: Any = ssl;
  if (!s || typeof s !== "object") return null;
  if (!s.cert || !s.key) return null;
  return { cert: String(s.cert), key: String(s.key), ...(s.ca ? { ca: String(s.ca) } : {}) };
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

export interface EffectiveBuildOptions extends BuildConfig {}

export function resolveBuildOptions(cfg: Any): EffectiveBuildOptions {
  const b: Any = cfg?.build ?? {};
  // strategies.runtime.server informs the build target when it is not the
  // default "browser" (edge build -> edge target).
  const runtime = cfg?.strategies?.runtime?.server;
  const target = pick(
    b.target,
    ["browser", "node", "bun", "edge"],
    runtime === "edge" ? "edge" : runtime === "node" ? "node" : runtime === "bun" ? "bun" : "browser",
  );
  return {
    target,
    format: pick(b.format, ["esm", "cjs", "iife"], "iife"),
    minify: bool(b.minify, true),
    sourcemap: sourcemapVal(b.sourcemap),
    treeshake: bool(b.treeshake, true),
    codeSplitting: bool(b.codeSplitting, false),
    bundleAnalysis: bool(b.bundleAnalysis, false),
    outputDir: str(b.outputDir, ".tw"),
    assetsDir: str(b.assetsDir, "assets"),
    publicPath: str(b.publicPath, "/"),
    define: obj(b.define, {}),
    externals: arr(b.externals, []),
    inject: arr(b.inject, []),
    splitting: bool(b.splitting, false),
    chunkNames: str(b.chunkNames, "chunks/[name]-[hash]"),
    assetNames: str(b.assetNames, "assets/[name]-[hash]"),
    entryPoints: arr(b.entryPoints, []),
    loaders: obj(b.loaders, {}),
    metafile: bool(b.metafile, true),
    incremental: bool(b.incremental, false),
  };
}

// ---------------------------------------------------------------------------
// compiler
// ---------------------------------------------------------------------------

export interface EffectiveCompilerOptions extends CompilerConfig {}

export function resolveCompilerOptions(cfg: Any): EffectiveCompilerOptions {
  const c: Any = cfg?.compiler ?? {};
  const optimization = pick(c.optimization, ["none", "basic", "aggressive"], "basic");
  // `optimization` is a coarse preset: "none" turns the fold/dead-code
  // passes off, "aggressive" turns them on. An explicit field always wins.
  const optOff = optimization === "none";
  const optOn = optimization === "aggressive";
  return {
    strict: bool(c.strict, true),
    optimization,
    hoistDirectives: bool(c.hoistDirectives, true),
    inlineComponents: bool(c.inlineComponents, false),
    scopedStyles: bool(c.scopedStyles, true),
    ssrAttributes: bool(c.ssrAttributes, true),
    preserveComments: bool(c.preserveComments, false),
    removeEmptyBlocks: bool(c.removeEmptyBlocks, true),
    foldConstants: bool(c.foldConstants, optOn ? true : optOff ? false : true),
    deadCode: bool(c.deadCode, optOn ? true : optOff ? false : true),
    treeShaking: bool(c.treeShaking, optOn ? true : optOff ? false : true),
    // HTML/CSS minification is opt-in: it is off today, and TW's HTML
    // comments are semantic markers (slot boundaries, unresolved components)
    // that minification must not disturb. JS minify follows the preset.
    minifyHTML: bool(c.minifyHTML, false),
    minifyCSS: bool(c.minifyCSS, false),
    minifyJS: bool(c.minifyJS, optOn ? true : false),
    sourceMaps: bool(c.sourceMaps, false),
    incremental: bool(c.incremental, true),
    cacheSize: clampInt(c.cacheSize, 256, 0, 100_000),
  };
}

// ---------------------------------------------------------------------------
// css
// ---------------------------------------------------------------------------

export interface EffectiveCssOptions extends Omit<CSSConfig, "engine"> {
  engine: CSSConfig["engine"] | "tailwind";
}

export function resolveCssOptions(cfg: Any): EffectiveCssOptions {
  const c: Any = cfg?.css ?? {};
  // strategies.css.engine is the modern surface and wins over the flat field.
  // "tailwind" is a valid strategy value (it is not in the flat CSSConfig
  // union), so it must be allowed here too.
  const strategyEngine = cfg?.strategies?.css?.engine;
  const engine = pick(
    strategyEngine ?? c.engine,
    ["tss", "tailwind", "css", "scss"],
    "tss",
  ) as EffectiveCssOptions["engine"];
  return {
    engine,
    modules: bool(c.modules, true),
    prefix: str(c.prefix, "tw-"),
    variables: obj(c.variables, {}),
    extract: bool(c.extract, true),
    minify: bool(c.minify, true),
    autoprefixer: bool(c.autoprefixer, true),
    targets: arr(c.targets, ["> 0.5%", "last 2 versions", "not dead"]),
    importPaths: arr(c.importPaths, []),
  };
}

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------

export interface EffectiveRouterOptions extends RouterConfig {}

export function resolveRouterOptions(cfg: Any): EffectiveRouterOptions {
  const r: Any = cfg?.router ?? {};
  return {
    trailingSlash: bool(r.trailingSlash, false),
    caseSensitive: bool(r.caseSensitive, false),
    locales: arr(r.locales, []),
    defaultLocale: str(r.defaultLocale, "en"),
    localePrefix: pick(r.localePrefix, ["always", "never", "foreign"], "always"),
    routes: list(r.routes, []),
    apiDir: str(r.apiDir, "api"),
  };
}

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

export interface EffectiveI18nOptions extends I18nConfig {}

export function resolveI18nOptions(cfg: Any): EffectiveI18nOptions {
  const i: Any = cfg?.i18n ?? {};
  const router = resolveRouterOptions(cfg);
  // Router locales/defaultLocale are the routing view of the same data; i18n
  // falls back to them so the two cannot disagree silently.
  const locales = i.locales ?? (router.locales.length ? router.locales : ["en"]);
  return {
    enabled: bool(i.enabled, false),
    defaultLocale: str(i.defaultLocale, router.defaultLocale || "en"),
    locales: arr(locales, ["en"]),
    fallback: str(i.fallback, str(i.defaultLocale, router.defaultLocale || "en")),
    strategy: pick(i.strategy, ["prefix", "cookie", "header", "domain"], "prefix"),
    translationDir: str(i.translationDir, "locales"),
    namespaces: arr(i.namespaces, ["common"]),
    loading: pick(i.loading, ["lazy", "eager"], "lazy"),
    detection: arr(i.detection, ["header", "cookie"]),
  };
}

// ---------------------------------------------------------------------------
// small coercion helpers -- every one returns the fallback for a bad value
// ---------------------------------------------------------------------------

function num(v: Any, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function clampInt(v: Any, fallback: number, lo: number, hi: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, Math.trunc(v)));
}
function str(v: Any, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}
function bool(v: Any, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function arr(v: Any, fallback: string[]): string[] {
  return Array.isArray(v) ? v : fallback;
}
function list<T>(v: Any, fallback: T[]): T[] {
  return Array.isArray(v) ? v : fallback;
}
function obj(v: Any, fallback: Record<string, any>): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
}
function pick<T extends string>(v: Any, allowed: readonly T[], fallback: T): T {
  return (typeof v === "string" && (allowed as readonly string[]).includes(v)) ? (v as T) : fallback;
}
function sourcemapVal(v: Any): boolean | "external" | "inline" {
  if (v === "external" || v === "inline" || typeof v === "boolean") return v;
  return true;
}
