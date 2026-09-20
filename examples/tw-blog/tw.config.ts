import type { TwConfig } from "tw-framework";

export default {
  name: "tw-live-demo",
  version: "0.1.0",

  dev: {
    port: 3000,
    host: "localhost",
    hmr: true,
    openBrowser: false,
  },

  build: {
    target: "browser",
    minify: true,
    sourcemap: true,
    splitting: true,
  },

  server: {
    port: 8000,
    host: "0.0.0.0",
    compression: "brotli",
  },

  css: {
    engine: "tss",
    autoprefixer: true,
  },

  router: {
    mode: "filesystem",
    baseDir: "home",
    pageExtensions: [".tw", ".twm"],
    renderModes: ["static", "ssr", "island", "edge"],
  },

  redirects: [],
  rewrites: [],
  headers: [],
  middleware: [],
  plugins: [],
} satisfies TwConfig;
