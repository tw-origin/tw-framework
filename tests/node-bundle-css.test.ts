/**
 * TW Framework -- regression: node-bundle .tss CSS emission.
 *
 *   collectTssImports()/resolveTssPath() used lazy `require("node:fs")`
 *   calls. Inside the ESM node bundle (apps/cli/dist/tw.mjs) `require` is
 *   undefined, the failure was swallowed by the fs-unavailable catch, and
 *   every `tw build` run through the published npm package produced
 *   UNSTYLED html (zero .tss -> CSS). Fixed by static node:fs/node:path
 *   imports in codegen/html.ts + a createRequire banner shim in the bundle.
 *
 * This test builds a fixture project with the actual node bundle and
 * asserts the compiled page carries its styles. It skips when the bundle
 * has not been built yet (fresh clone before build-node.ts).
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = join(import.meta.dir, "..");
const bundle = join(repoRoot, "apps", "cli", "dist", "tw.mjs");

describe("node bundle emits .tss css (GETTING-STARTED regression)", () => {
  test.skipIf(!existsSync(bundle))("tw build via dist/tw.mjs styles the page", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-css-reg-"));
    try {
      mkdirSync(join(dir, "home"), { recursive: true });
      mkdirSync(join(dir, "style"), { recursive: true });

      // Layout imports the stylesheet via the @./ project-root alias.
      writeFileSync(
        join(dir, "home", "layout.tw"),
        [
          'import "@./style/global.tss"',
          "",
          "html {",
          '  head { title "My App" }',
          "  body {",
          "    slot { }",
          "  }",
          "}",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(dir, "home", "page.tw"),
        [
          "page {",
          '  title "Home"',
          "  render static",
          "}",
          "",
          'div.hero {',
          '  h1 "Hello"',
          "}",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(dir, "style", "global.tss"),
        [".hero {", "  padding 48;", "  text-align center;", "}", ""].join("\n"),
      );
      writeFileSync(
        join(dir, "tw.config.ts"),
        [
          'import type { TwConfig } from "tw-framework";',
          "",
          "export default {",
          '  name: "reg",',
          '  version: "0.1.0",',
          '  dev: { port: 3000, host: "localhost", hmr: true },',
          "};",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify(
          { name: "reg", version: "0.1.0", private: true, type: "module", dependencies: { "tw-framework": "^1.0.0" } },
          null,
          2,
        ),
      );

      const build = spawnSync("node", [bundle, "build"], { cwd: dir, encoding: "utf-8" });
      expect(build.status).toBe(0);

      const html = readFileSync(join(dir, ".tw", "index.html"), "utf-8");
      // Either inlined critical css or a linked/asset file must carry the rule.
      const styled = /<style[^>]*>[\s\S]*padding:\s*48/.test(html);
      const assetsDir = join(dir, ".tw", "assets");
      const linked =
        /<link[^>]+stylesheet/.test(html) &&
        existsSync(assetsDir) &&
        readdirSync(assetsDir).some((f) => f.endsWith(".css"));
      expect(styled || linked).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
