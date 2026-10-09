/**
 * TW Framework — public type declarations.
 *
 * `tw-framework` ships bundled JavaScript (`dist/tw.mjs`). Without this file a
 * project's `tw.config.ts` cannot resolve `import type { TwConfig } from
 * "tw-framework"` and every new project opens with a red squiggle on line 1.
 *
 * Generated to mirror `packages/shared/tw/config/schema.ts` — keep the two in
 * step when the schema changes.
 */

declare module "tw-framework" {
  // --- Configuration ---------------------------------------------------------

  export interface TwConfig {
    name: string;
    version: string;
    rootDir: string;
    srcDir: string;
    outDir: string;
    cacheDir: string;
    publicDir: string;
    pagesDir: string;
    /** Home directory for file-based routing (alias for pagesDir, defaults to 'home/'). */
    homeDir: string;
    componentsDir: string;
    layoutsDir: string;
    assetsDir: string;
    pluginsDir: string;

    dev: DevConfig;
    build: BuildConfig;
    server: ServerConfig;
    compiler: CompilerConfig;
    css: CSSConfig;
    router: RouterConfig;
    i18n: I18nConfig;
    security: SecurityConfig;
    cache: CacheConfig;
    env: Record<string, string>;

    plugins: PluginConfigEntry[];
    images?: Partial<ImagesConfig>;
    /** Strategy layer. Every field is optional; omitted fields use the default. */
    strategies?: Partial<StrategiesConfig>;
    redirects: RedirectRule[];
    rewrites: RewriteRule[];
    headers: HeaderRule[];
    middleware: string[];
    hooks: Record<string, string[]>;
  }

  export interface ImagesConfig {
    quality: number;
    formats: string[];
    sizes: number[];
    remoteAllowHosts: string[];
    loader: string;
  }

  export interface DevConfig {
    port: number;
    host: string;
    hmr: boolean;
    hmrPort: number;
    hmrHost: string;
    openBrowser: boolean;
    https: boolean;
    httpsCert?: string;
    httpsKey?: string;
    watchPaths: string[];
    watchIgnore: string[];
    overlay: boolean;
    fastRefresh: boolean;
  }

  export interface BuildConfig {
    target: "browser" | "node" | "bun" | "edge";
    format: "esm" | "cjs" | "iife";
    minify: boolean;
    sourcemap: boolean | "external" | "inline";
    treeshake: boolean;
    codeSplitting: boolean;
    bundleAnalysis: boolean;
    outputDir: string;
    assetsDir: string;
    publicPath: string;
    define: Record<string, string>;
    externals: string[];
    inject: string[];
    splitting: boolean;
    chunkNames: string;
    assetNames: string;
    entryPoints: string[];
    loaders: Record<string, string>;
    metafile: boolean;
    incremental: boolean;
  }

  export interface ServerConfig {
    port: number;
    host: string;
    workers: number;
    maxConnections: number;
    keepAlive: boolean;
    keepAliveTimeout: number;
    staticServing: boolean;
    compression: "gzip" | "brotli" | "none" | "auto";
    cors: CORSConfig;
    trustProxy: boolean;
    bodyLimit: number;
    timeout: number;
    ssl: SSLConfig | null;
    cluster: boolean;
    gracefulShutdown: boolean;
  }

  export interface CORSConfig {
    enabled: boolean;
    origin: string | string[] | "*";
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
  }

  export interface SSLConfig {
    cert: string;
    key: string;
    ca?: string;
  }

  export interface CompilerConfig {
    strict: boolean;
    optimization: "none" | "basic" | "aggressive";
    hoistDirectives: boolean;
    inlineComponents: boolean;
    scopedStyles: boolean;
    ssrAttributes: boolean;
    preserveComments: boolean;
    removeEmptyBlocks: boolean;
    foldConstants: boolean;
    deadCode: boolean;
    treeShaking: boolean;
    minifyHTML: boolean;
    minifyCSS: boolean;
    minifyJS: boolean;
    sourceMaps: boolean;
    incremental: boolean;
    cacheSize: number;
  }

  export interface CSSConfig {
    engine: "tss" | "css" | "scss";
    modules: boolean;
    prefix: string;
    variables: Record<string, string>;
    extract: boolean;
    minify: boolean;
    autoprefixer: boolean;
    targets: string[];
    importPaths: string[];
  }

  export interface RouterConfig {
    mode: "filesystem" | "code" | "hybrid";
    baseDir: string;
    trailingSlash: boolean;
    caseSensitive: boolean;
    locales: string[];
    defaultLocale: string;
    localePrefix: "always" | "never" | "foreign";
    routes: RouteEntry[];
    apiDir: string;
    pageExtensions: string[];
    /** Supported render modes for pages. See `RenderMode`. */
    renderModes: RenderMode[];
  }

  export interface RouteEntry {
    path: string;
    file: string;
    method?: string;
    middleware?: string[];
    render?: RenderMode;
    revalidate?: number | string;
  }

  export interface I18nConfig {
    enabled: boolean;
    defaultLocale: string;
    locales: string[];
    fallback: string;
    strategy: "prefix" | "cookie" | "header" | "domain";
    translationDir: string;
    namespaces: string[];
    loading: "lazy" | "eager";
    detection: string[];
  }

  export interface SecurityConfig {
    csp: Record<string, string[]>;
    frameOptions: "DENY" | "SAMEORIGIN" | "ALLOW-FROM" | null;
    hsts: { maxAge: number; includeSubDomains: boolean; preload: boolean };
    xContentTypeOptions: boolean;
    xFrameOptions: string;
    referrerPolicy: string;
    permissionsPolicy: string;
    xssProtection: boolean;
    nonce: boolean;
  }

  export interface CacheConfig {
    type: "memory" | "filesystem" | "redis" | "none";
    profiles?: Record<string, { stale?: number; revalidate?: number; expire?: number }>;
    ttl: number;
    maxSize: number;
    strategy: "LRU" | "LFU" | "FIFO" | "TTL";
    revalidate: boolean;
    revalidateTags: string[];
    staleWhileRevalidate: number;
    immutableAssets: boolean;
    swr: boolean;
  }

  export interface PluginConfigEntry {
    name: string;
    options?: Record<string, unknown>;
    enabled?: boolean;
    priority?: number;
  }

  export interface RedirectRule { from: string; to: string; status?: number; permanent?: boolean }
  export interface RewriteRule { from: string; to: string }
  export interface HeaderRule { source: string; headers: Record<string, string> }

  /** The strategy layer: pick which option each subsystem uses. */
  export interface StrategiesConfig {
    signals: { transport: "sse" | "ws" | "long-poll" };
    css: { engine: "tss" | "css" | "scss" | "tailwind" };
    render: { engine: "tw-vdom" | "react" | "preact" | "vue" | "svelte" };
    runtime: { server: "bun" | "node" | "deno" | "workerd" };
    api: { runtime: "node" | "edge" | "worker" };
    state: { model: "signals" | "hooks" | "store" };
    auth: { model: "none" | "session" | "jwt" | "oauth" };
    data: { layer: "rest" | "graphql" | "trpc" };
    cache: { mode: "memory" | "filesystem" | "redis" | "swr" | "none" };
    db: { adapter: string };
    hydration: { mode: "auto" | "full" | "islands" | "none" };
    packages: { manager: "bun" | "npm" | "pnpm" | "yarn" };
  }

  /**
   * What you actually write in `tw.config.ts`: any subset. The framework merges
   * it over the defaults, so every field is optional. Use this for the config
   * object -- `TwConfig` is the fully-resolved shape the framework works with.
   */
  export type TwConfigInput = DeepPartial<TwConfig>;

  export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends readonly (infer _U)[] ? T[K]
      : T[K] extends object ? DeepPartial<T[K]>
      : T[K];
  };

  // --- Rendering -------------------------------------------------------------

  /** Every render mode a page may declare. */
  export type RenderMode =
    | "static" | "ssr" | "island" | "edge"
    | "csr" | "stream" | "ppr" | "signalStream";

  export const VALID_RENDER_MODES: Set<RenderMode>;

  // --- Version ---------------------------------------------------------------

  export const VERSION: string;
}
