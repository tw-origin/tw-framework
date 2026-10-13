import type { TwConfig } from "tw-framework";

export default {
  name: "server-data-negative",
  version: "0.1.0",
  router: { mode: "filesystem", baseDir: "home", pageExtensions: [".tw", ".twm"], renderModes: ["static", "ssr"] },
} as unknown as TwConfig;
