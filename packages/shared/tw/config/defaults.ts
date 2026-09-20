/** Default configuration values and config finder. */

import { type TwConfig } from "./schema";
import { existsSync } from "../fs";
import { join } from "node:path";

export function createDefaultConfig(rootDir: string = process.cwd()): TwConfig {
  return {
    env: {},
    name: "tw-app",
    version: "0.0.1",
    rootDir,
    srcDir: join(rootDir, "src"),
    outDir: join(rootDir, ".tw", "dist"),
    cacheDir: join(rootDir, ".tw", "cache"),
    publicDir: join(rootDir, "public"),
    pagesDir: join(rootDir, "home"),
    homeDir: join(rootDir, "home"),
    componentsDir: join(rootDir, "components"),
    layoutsDir: join(rootDir, "layouts"),
    assetsDir: join(rootDir, "assets"),
    pluginsDir: join(rootDir, "plugins"),

    dev: {
      port: 3000,
      host: "localhost",
      hmr: true,
      hmrPort: 3001,
      hmrHost: "localhost",
      openBrowser: false,
      https: false,
      watchPaths: ["home/**", "components/**", "layouts/**", "assets/**"],
      watchIgnore: ["node_modules", ".tw", "dist", ".git"],
      overlay: true,
      fastRefresh: true,
    },

    build: {
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: true,
      treeshake: true,
      codeSplitting: true,
      bundleAnalysis: false,
      outputDir: ".tw/dist",
      assetsDir: "assets",
      publicPath: "/",
      define: {},
      externals: [],
      inject: [],
      splitting: true,
      chunkNames: "chunks/[name]-[hash]",
      assetNames: "assets/[name]-[hash]",
      entryPoints: [],
      loaders: {},
      metafile: true,
      incremental: true,
    },

    server: {
      port: 3000,
      host: "0.0.0.0",
      workers: 1,
      maxConnections: 10000,
      keepAlive: true,
      keepAliveTimeout: 5000,
      staticServing: true,
      compression: "auto",
      cors: {
        enabled: false,
        origin: "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        exposedHeaders: [],
        credentials: false,
        maxAge: 86400,
      },
      trustProxy: false,
      bodyLimit: 1024 * 1024 * 10,
      timeout: 30000,
      ssl: null,
      cluster: false,
      gracefulShutdown: true,
    },

    compiler: {
      strict: true,
      optimization: "basic",
      hoistDirectives: true,
      inlineComponents: false,
      scopedStyles: true,
      ssrAttributes: true,
      preserveComments: false,
      removeEmptyBlocks: true,
      foldConstants: true,
      deadCode: true,
      treeShaking: true,
      minifyHTML: true,
      minifyCSS: true,
      minifyJS: false,
      sourceMaps: true,
      incremental: true,
      cacheSize: 256,
    },

    css: {
      engine: "tss",
      modules: true,
      prefix: "tw-",
      variables: {},
      extract: true,
      minify: true,
      autoprefixer: true,
      targets: ["> 0.5%", "last 2 versions", "not dead"],
      importPaths: [],
    },

    router: {
      mode: "filesystem",
      baseDir: "home",
      trailingSlash: false,
      caseSensitive: false,
      locales: [],
      defaultLocale: "en",
      localePrefix: "always",
      routes: [],
      apiDir: "api",
      pageExtensions: [".tw", ".twm"],
      renderModes: ["static", "ssr", "island", "edge"],
    },

    i18n: {
      enabled: false,
      defaultLocale: "en",
      locales: ["en"],
      fallback: "en",
      strategy: "prefix",
      translationDir: "locales",
      namespaces: ["common"],
      loading: "lazy",
      detection: ["header", "cookie"],
    },

    security: {
      csp: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
      },
      frameOptions: "DENY",
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
      xContentTypeOptions: true,
      xFrameOptions: "DENY",
      referrerPolicy: "strict-origin-when-cross-origin",
      permissionsPolicy: "camera=(), microphone=(), geolocation=()",
      xssProtection: true,
      nonce: false,
    },

    cache: {
      type: "memory",
      ttl: 3600,
      maxSize: 100,
      strategy: "LRU",
      revalidate: true,
      revalidateTags: [],
      staleWhileRevalidate: 0,
      immutableAssets: true,
      swr: false,
    },

  plugins: [],
  images: {
    quality: 75,
    formats: ["avif", "webp"],
    breakpoints: [320, 640, 768, 1024, 1280, 1920],
    remoteAllowHosts: [],
    cacheMaxAge: 86400,
  },
    redirects: [],
    rewrites: [],
    headers: [],
    middleware: [],
    hooks: {},
  };
}

// --- Config File Discovery --------------------------------------------------

const CONFIG_FILES = [
  "tw.config.ts",
  "tw.config.js",
  "tw.config.mjs",
  "tw.config.cjs",
  "tw.config.json",
  "tw.config.yaml",
  "tw.config.yml",
  "tw.config.toml",
];

export function findConfig(rootDir: string = process.cwd()): string | null {
  for (const file of CONFIG_FILES) {
    const path = join(rootDir, file);
    if (existsSync(path)) return path;
  }
  return null;
}
