import type { TwConfig } from "tw-framework";

export default {
  name: "server-data",
  version: "0.1.0",

  // Server blocks are on by default; the sample app needs no flag.

  dev: { port: 8801, host: "localhost", hmr: false, openBrowser: false },

  build: { target: "browser", minify: false, sourcemap: false, splitting: false },

  server: {
    port: 8801,
    host: "0.0.0.0",
    compression: "none",
    loginPath: "/login",
  },

  css: { engine: "tss", autoprefixer: false },

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
} as unknown as TwConfig;
