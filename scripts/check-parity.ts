/**
 * Dev vs Serve parity check.
 *
 * `tw dev` and `tw serve` are two separate implementations of the same URL
 * surface: dev runs its own HTTP server on top of compileSync +
 * executeServerBlocks, serve delegates to TWServer/RenderPipeline. Every
 * divergence found so far (server blocks not running in dev, missing
 * Content-Type, unseeded layout state) was one of them drifting from the other.
 *
 * This script starts both against the same fixture project, sends the same
 * request to each, and reports where they differ. It changes nothing.
 *
 *   bun scripts/check-parity.ts [--verbose]
 *
 * Exit code is 1 when an unexpected difference is found.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";

const CLI = join(import.meta.dir, "..", "apps", "cli", "tw", "bin.ts");
const VERBOSE = process.argv.includes("--verbose");

type Result = {
  label: string;
  dev: string;
  serve: string;
  verdict: "PASS" | "FAIL" | "EXPECTED DIFFERENCE";
  note: string;
};

const results: Result[] = [];

/**
 * Development-only output, kept in one place so every entry is a deliberate
 * decision rather than a loose regex that could hide a real difference.
 *
 * 1. `__tw_hmr` / live-reload scripts — dev only, by design.
 * 2. `data-tw-hmr` attributes — dev only.
 * 3. The base stylesheet dev injects into `</head>`. It carries no marker, so it
 *    is matched by its exact leading text (`DEV_CSS_PREFIX`, the start of
 *    DEFAULT_CSS in dev.ts). A user <style> would have to begin with that exact
 *    string to be touched, which is why this is an exact match and not a
 *    "contains -apple-system" pattern.
 * 4. The error overlay script — dev only.
 */
const DEV_CSS_PREFIX = "* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: -apple-system";

function stripDevCss(html: string): string {
  // only a <style> whose body *starts* with the known dev fallback
  return html.replace(/<style>([\s\S]*?)<\/style>/g, (whole, body: string) =>
    body.trimStart().startsWith(DEV_CSS_PREFIX) ? "" : whole,
  );
}

function normalise(html: string): string {
  return stripDevCss(html)
    .replace(/<script[^>]*__tw_hmr[\s\S]*?<\/script>/g, "")
    .replace(/<script[^>]*src="\/__tw[^"]*"[\s\S]*?<\/script>/g, "")
    .replace(/<script>\s*\(function\(\)\s*\{\s*try\s*\{\s*var es[\s\S]*?<\/script>/g, "")
    .replace(/\s+data-tw-hmr="[^"]*"/g, "")
    .replace(/<script id="__tw_error_overlay">[\s\S]*?<\/script>/g, "")
    .replace(/>\s+</g, "><")
    .trim();
}

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "tw-parity-"));
  mkdirSync(join(root, "home", "p", "[id]"), { recursive: true });
  mkdirSync(join(root, "home", "boom"), { recursive: true });
  mkdirSync(join(root, "home", "nf"), { recursive: true });
  mkdirSync(join(root, "lib"), { recursive: true });
  mkdirSync(join(root, "public"), { recursive: true });

  writeFileSync(join(root, "tw.config.ts"), `export default {
  name: "parity",
  redirects: [{ from: "/old", to: "/", status: 301 }],
  headers: [{ source: "/**", headers: { "x-parity": "on" } }],
};
`);

  // static page: server block + a page-level import used by the block
  writeFileSync(join(root, "lib", "data.js"), `export function items() { return ["a", "b"] }\n`);
  writeFileSync(join(root, "home", "page.tw"), `import { items } from "../lib/data"
page { title "Home" render static }
server {
  const rows = items()
}
div { p "n={rows.length}" }
`);

  // dynamic route, enumerated
  writeFileSync(join(root, "home", "p", "[id]", "params.twm"), `fn generate() {
  return ["42"]
}
`);
  writeFileSync(join(root, "home", "p", "[id]", "page.tw"), `page { title "P" render static }
server { const v = params.id }
div { p "id={v}" }
`);

  // a page that throws inside its server block
  writeFileSync(join(root, "home", "boom", "page.tw"), `page { title "Boom" render static }
server { const x = notAFunction() }
div { p "never" }
`);

  // notFound() in a static page: the build skips it, so the host 404s it
  mkdirSync(join(root, "home", "nf-static"), { recursive: true });
  writeFileSync(join(root, "home", "nf-static", "page.tw"), `page { title "NF" render static }
server { notFound() }
div { p "never" }
`);

  // notFound() in an ssr page: decided per request
  mkdirSync(join(root, "home", "nf-dyn"), { recursive: true });
  writeFileSync(join(root, "home", "nf-dyn", "page.tw"), `page { title "NF2" render ssr }
server { notFound() }
div { p "never" }
`);

  // public assets
  writeFileSync(join(root, "public", "app.css"), `.a{color:red}\n`);
  writeFileSync(join(root, "public", "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg"></svg>\n`);
  writeFileSync(join(root, "public", "data.json"), `{"ok":true}\n`);
  return root;
}

async function waitFor(port: number, ms = 40000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://localhost:${port}/`, { redirect: "manual" });
      if (r.status) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function get(port: number, path: string) {
  const r = await fetch(`http://localhost:${port}${path}`, { redirect: "manual" });
  const body = await r.text();
  const sec: Record<string, string> = {};
  for (const h of ["content-security-policy", "x-frame-options", "referrer-policy", "x-content-type-options"]) {
    sec[h] = r.headers.get(h) ?? "";
  }
  return { status: r.status, type: r.headers.get("content-type") ?? "", location: r.headers.get("location") ?? "", xparity: r.headers.get("x-parity") ?? "", body, sec };
}

function record(label: string, dev: string, serve: string, same: boolean, note: string) {
  results.push({ label, dev, serve, verdict: same ? "PASS" : "FAIL", note });
}

/**
 * A difference that is deliberate: it must be present in dev and absent in
 * serve. If the two ever agree, that is a failure -- either dev stopped
 * injecting what it should, or serve started leaking a dev-only artifact.
 */
function expectDifference(label: string, devHas: boolean, serveHas: boolean, note: string) {
  const ok = devHas && !serveHas;
  results.push({
    label,
    dev: devHas ? "present" : "absent",
    serve: serveHas ? "present" : "absent",
    verdict: ok ? "EXPECTED DIFFERENCE" : "FAIL",
    note: ok ? note : "expected dev-only, but the two now agree",
  });
}

async function main() {
  const root = project();
  const devPort = 3600 + Math.floor(Math.random() * 150);
  const servePort = devPort + 200;
  const kids: ChildProcess[] = [];

  const cleanup = () => {
    for (const k of kids) { try { k.kill("SIGKILL"); } catch { /* gone */ } }
    try { rmSync(root, { recursive: true, force: true }); } catch { /* gone */ }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(130); });

  try {
    // serve needs a build; dev does not, but both should see the same project
    const build = spawn(process.execPath, [CLI, "build"], { cwd: root, stdio: "ignore" });
    await new Promise((r) => build.on("exit", r));

    const dev = spawn(process.execPath, [CLI, "dev", "--port", String(devPort)], { cwd: root, stdio: "ignore" });
    const serve = spawn(process.execPath, [CLI, "serve", "--port", String(servePort)], { cwd: root, stdio: "ignore" });
    kids.push(dev, serve);

    const [devUp, serveUp] = [await waitFor(devPort), await waitFor(servePort)];
    if (!devUp || !serveUp) {
      console.log("\n  dev ready: " + devUp + " | serve ready: " + serveUp);
      console.log("  a server never answered -- parity cannot be measured");
      process.exitCode = 1;
      return;
    }

    // ---- HTML pages ----
    for (const path of ["/", "/p/42", "/p/unknown"]) {
      const [d, s] = [await get(devPort, path), await get(servePort, path)];
      record(`${path} status`, String(d.status), String(s.status), d.status === s.status, "same HTTP status");
      if (d.status === 200 && s.status === 200) {
        const same = normalise(d.body) === normalise(s.body);
        record(`${path} body`, normalise(d.body).slice(0, 60), normalise(s.body).slice(0, 60), same, same ? "identical after stripping dev-only scripts" : "HTML differs");
      }
    }

    // ---- dev-only artifacts: each must be present in dev and absent in serve ----
    // The body comparison strips these; asserting them separately means a real
    // difference cannot hide behind the normaliser, and a dev-only artifact
    // leaking into serve fails loudly.
    {
      const [d, s] = [await get(devPort, "/"), await get(servePort, "/")];
      expectDifference(
        "HMR script",
        /__tw_hmr|EventSource/.test(d.body),
        /__tw_hmr|EventSource/.test(s.body),
        "dev injects the live-reload client; serve must not",
      );
      const hasDevCss = (html: string) =>
        [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].some((m) => m[1].trimStart().startsWith(DEV_CSS_PREFIX));
      expectDifference(
        "dev base <style>",
        hasDevCss(d.body),
        hasDevCss(s.body),
        "dev injects its base stylesheet into </head>; serve never does",
      );

      // security headers: relaxed in dev, enforced in serve
      const csp = (sec: Record<string, string>) => sec["content-security-policy"] ?? "";
      const devCsp = csp(d.sec), serveCsp = csp(s.sec);
      results.push({
        label: "security headers (CSP)",
        dev: devCsp ? devCsp.slice(0, 40) : "(none)",
        serve: serveCsp ? serveCsp.slice(0, 40) : "(none)",
        verdict: devCsp !== serveCsp ? "EXPECTED DIFFERENCE" : "PASS",
        note: devCsp !== serveCsp
          ? "dev uses the relaxed 'dev' security preset; serve enforces the production one"
          : "both send the same CSP",
      });
    }

    // ---- redirects: never follow ----
    {
      const [d, s] = [await get(devPort, "/old"), await get(servePort, "/old")];
      record("/old status", String(d.status), String(s.status), d.status === s.status, "redirect status");
      // Both send an absolute URL with their own port. The port is a property of
      // the test harness, not of the framework, so compare the path only.
      const pathOf = (u: string) => { try { return new URL(u).pathname + new URL(u).search; } catch { return u; } };
      record("/old location", pathOf(d.location) || "(none)", pathOf(s.location) || "(none)", pathOf(d.location) === pathOf(s.location), "Location path (port is a harness artifact)");
    }

    // ---- configured headers ----
    {
      const [d, s] = [await get(devPort, "/"), await get(servePort, "/")];
      record("x-parity header", d.xparity || "(none)", s.xparity || "(none)", d.xparity === s.xparity, "tw.config.ts headers");
    }

    // ---- assets: content-type matters ----
    for (const [path, want] of [["/app.css", "css"], ["/icon.svg", "svg"], ["/data.json", "json"]] as [string, string][]) {
      const [d, s] = [await get(devPort, path), await get(servePort, path)];
      record(`${path} status`, String(d.status), String(s.status), d.status === s.status, "asset status");
      record(`${path} content-type`, d.type, s.type, d.type === s.type, `both should be ${want}`);
    }

    // ---- TW1007 is a build-time diagnostic, not an HTTP response ----
    // Both modes must reject the same project for the same reason, so this is
    // checked by running the build, not by comparing two responses.
    {
      const dir = mkdtempSync(join(tmpdir(), "tw-parity-1007-"));
      mkdirSync(join(dir, "home"), { recursive: true });
      mkdirSync(join(dir, "lib"), { recursive: true });
      writeFileSync(join(dir, "tw.config.ts"), `export default { name: "p1007" };\n`);
      writeFileSync(join(dir, "lib", "db.js"), `export function dbQuery() { return 1 }\n`);
      writeFileSync(join(dir, "home", "page.tw"), `import { dbQuery } from "../lib/db"
page { title "X" render static }
div { p { "{dbQuery()}" } }
`);
      const out = await new Promise<string>((resolve) => {
        const c = spawn(process.execPath, [CLI, "build"], { cwd: dir });
        let buf = "";
        c.stdout?.on("data", (d) => { buf += d; });
        c.stderr?.on("data", (d) => { buf += d; });
        c.on("exit", () => resolve(buf));
      });
      rmSync(dir, { recursive: true, force: true });
      const hit = /TW1007/.test(out);
      results.push({
        label: "TW1007 (build)", dev: hit ? "reported" : "not reported", serve: "n/a (build-time)",
        verdict: hit ? "PASS" : "FAIL",
        note: "server-only import used in markup must fail the build, not an HTTP request",
      });
    }

    // ---- notFound(): static (build skips the page) vs dynamic (request time) ----
    for (const [path, why] of [
      ["/nf-static", "static page: the build skips it, the host serves 404"],
      ["/nf-dyn", "ssr page: notFound() decided per request"],
    ] as [string, string][]) {
      const [d, srv] = [await get(devPort, path), await get(servePort, path)];
      record(`${path} status`, String(d.status), String(srv.status), d.status === srv.status, why);
    }

    // ---- a page whose server block throws ----
    {
      const [d, s] = [await get(devPort, "/boom"), await get(servePort, "/boom")];
      // dev shows an overlay with the stack; serve returns a plain error page
      record("/boom status", String(d.status), String(s.status), d.status === s.status, "both 500");
      expectDifference(
        "/boom error page",
        /tw-err/.test(d.body),
        /tw-err/.test(s.body),
        "dev renders its stack-trace error page; serve returns its own error page",
      );
    }
  } finally {
    cleanup();
  }

  const width = Math.max(...results.map((r) => r.label.length));
  console.log("\n  dev vs serve parity\n");
  for (const r of results) {
    const mark = r.verdict === "PASS" ? "\x1b[32m✓\x1b[0m" : r.verdict === "FAIL" ? "\x1b[31m✗\x1b[0m" : "\x1b[33m~\x1b[0m";
    console.log(`  ${mark} ${r.label.padEnd(width)}  dev=${r.dev}  serve=${r.serve}`);
    if (r.verdict !== "PASS" || VERBOSE) console.log(`     ${r.note}`);
  }
  const failed = results.filter((r) => r.verdict === "FAIL").length;
  console.log(`\n  ${results.length - failed} pass, ${failed} unexpected difference(s)\n`);
  process.exitCode = failed ? 1 : 0;
}

await main();
