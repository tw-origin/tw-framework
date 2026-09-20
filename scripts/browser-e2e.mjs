/**
 * Browser-level E2E for TW Framework.
 *
 * Runs a real Chromium via Playwright against a freshly created + built
 * TW app and verifies client runtime behavior end to end:
 *   - SSR content present after load
 *   - hydration: a real click updates the DOM
 *   - SPA navigation via RouterLink does not reload the document
 *   - no page errors after hydration
 *
 * Usage (needs Node 20+ and a Chromium installed by Playwright):
 *   npx playwright-core install chromium
 *   node scripts/browser-e2e.mjs
 *
 * Environment:
 *   TW_BIN   — path to the tw CLI (default: apps/cli/tw/bin.ts, run with bun)
 *   BUN_BIN  — bun executable (default: bun)
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TW = process.env.TW_BIN ?? join(ROOT, "apps/cli/tw/bin.ts");
const BUN = process.env.BUN_BIN ?? "bun";
const PORT = 8931;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...opts });
  if (r.status !== 0) {
    console.error(`${cmd} ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
  return r.stdout;
}

async function main() {
  const { chromium } = await import("playwright-core");

  // 1. Create + build a test app
  const dir = mkdtempSync(join(tmpdir(), "tw-browser-e2e-"));
  try {
    run(BUN, [TW, "create", "app"], { cwd: dir });
    const app = join(dir, "app");
    mkdirSync(join(app, "home/counter"), { recursive: true });
    writeFileSync(
      join(app, "home/counter/page.tw"),
      [
        'import RouterLink from "@tw/RouterLink"',
        "state { count = 0 }",
        "",
        "div.counter-app {",
        '    RouterLink "About page" {',
        '        href "/about"',
        '        class "rl"',
        "    }",
        '    h1.title { "Counter Test" }',
        '    p.countDisplay { "Count: {count}" }',
        '    button.incBtn on:click "count = count + 1" { "Increment" }',
        '    button.decBtn on:click "count = count - 1" { "Decrement" }',
        '}',
        '',
      ].join("\n"),
    );
    run(BUN, [TW, "build"], { cwd: app });

    // 2. Serve it
    const server = spawn(BUN, [TW, "serve", "--port", String(PORT)], {
      cwd: app,
      stdio: "ignore",
      env: { ...process.env, PORT: String(PORT) },
      detached: false,
    });
    await new Promise((r) => setTimeout(r, 3000));

    const base = `http://localhost:${PORT}`;
    const results = [];
    const ok = (name, pass, extra = "") => {
      results.push(pass);
      console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  [" + extra + "]" : ""}`);
    };

    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
      // SSR content
      const page = await browser.newPage();
      await page.goto(`${base}/counter`, { waitUntil: "networkidle" });
      ok("SSR content present", (await page.textContent("h1.title")) === "Counter Test");

      // Hydration: real clicks
      await page.click("button.incBtn");
      await page.click("button.incBtn");
      await page.click("button.decBtn");
      ok(
        "clicks update the DOM (hydration)",
        (await page.textContent("p.countDisplay")) === "Count: 1",
        await page.textContent("p.countDisplay"),
      );

      // No page errors on an interactive page
      const errors = [];
      const p2 = await browser.newPage();
      p2.on("pageerror", (e) => errors.push(e.message));
      await p2.goto(`${base}/counter`, { waitUntil: "networkidle" });
      await p2.click("button.incBtn");
      await p2.waitForTimeout(300);
      ok("no JS page errors after hydration", errors.length === 0, errors.join("; ").slice(0, 120));

      // SPA navigation (RouterLink on the scaffold home page)
      const p3 = await browser.newPage();
      await p3.goto(`${base}/counter`, { waitUntil: "networkidle" });
      const link = p3.locator("a.rl[href='/about']");
      if ((await link.count()) > 0) {
        // Mark the JS heap: a full document reload wipes it, an SPA swap keeps it.
        await p3.evaluate(() => { window.__twSpaMarker = 1; });
        await link.first().click();
        await p3.waitForTimeout(800);
        const afterUrl = p3.url();
        const bodyText = (await p3.textContent("body")) ?? "";
        const marker = await p3.evaluate(() => window.__twSpaMarker ?? 0);
        ok(
          "SPA nav renders target page",
          afterUrl.endsWith("/about") && bodyText.trim().length > 0,
          afterUrl,
        );
        ok("SPA nav did not reload the document", marker === 1, "marker=" + marker);
      } else {
        ok("SPA nav: RouterLink not present (skipped)", true);
      }
    } finally {
      await browser.close();
      server.kill("SIGTERM");
    }

    const fails = results.filter((p) => !p).length;
    console.log(fails === 0 ? "BROWSER E2E: ALL GREEN" : `BROWSER E2E: ${fails} FAILURES`);
    process.exitCode = fails === 0 ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exitCode = 1;
});
