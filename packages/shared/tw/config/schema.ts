/** TwConfig schema - all configuration type definitions. */

/**
 * tw.config loader -- finds, parses, validates, and merges configuration
 * from tw.config.ts / .js / .json / .yaml / .toml files.
 * Resolves env vars, applies defaults, and supports plugin config.
 */


// --- Types --------------------------------------------------------------------

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
  redirects: RedirectRule[];
  rewrites: RewriteRule[];
  headers: HeaderRule[];
  middleware: string[];
  hooks: Record<string, string[]>;
}

export interface ImagesConfig {
  /** Quality for lossy formats, 1-100 (default 75) */
  quality: number;
  /** Output formats, best-first (default ["avif", "webp"]) */
  formats: ("avif" | "webp" | "jpeg" | "png")[];
  /** Widths generated into srcset */
  breakpoints: number[];
  /** Remote hosts allowed through the image proxy (SSRF guard) */
  remoteAllowHosts: string[];
  /** How long processed images are cacheable, seconds */
  cacheMaxAge: number;
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
  /** Supported render modes for pages. */
  renderModes: string[];
}

export interface RouteEntry {
  path: string;
  file: string;
  method?: string;
  middleware?: string[];
  render?: string;
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
  enabled: boolean;
  options: Record<string, any>;
}

export interface RedirectRule {
  from: string;
  to: string;
  status: 301 | 302 | 307 | 308;
  permanent: boolean;
}

export interface RewriteRule {
  from: string;
  to: string;
  has?: { type: string; key: string; value?: string }[];
}

export interface HeaderRule {
  path: string;
  headers: Record<string, string>;
}

// --- Defaults ------------------------------------------------------------------
