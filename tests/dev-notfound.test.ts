import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request } from "node:http";

// `tw dev` treated notFound() as a server-block failure and answered 500, while
// `tw serve` answered 404 for the same page. A page that says "this record does
// not exist" must be a 404 in both, so a developer sees the same thing the
// deploy will.
//
// Requests go through node:http and host "localhost". Two things had to be
// right: bunfig.toml preloads happy-dom, whose GlobalRegistrator replaces global
// fetch (so fetch-based probes behave differently under `bun test`), and `tw
// dev` binds ::1 only -- a request to 127.0.0.1 is refused, which made the
// server look dead. "localhost" resolves to ::1 and works.

const CLI = join(import.meta.dir, "..", "apps", "cli", "tw", "bin.ts");

function project(pages: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tw-dev-404-"));
  writeFileSync(join(dir, "tw.config.ts"), `export default { name: "dev404" };\n`);
  for (const [rel, src] of Object.entries(pages)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, src);
  }
  return dir;
}

function get(port: number, path: string, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "localhost", port, path, method: "GET", timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });
}

async function waitFor(port: number, ms = 40000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { await get(port, "/", 1500); return true; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

describe("notFound() in tw dev", () => {
  test("a server block calling notFound() answers 404, not 500", async () => {
    const root = project({
      "home/nf/page.tw": `page { title "NF" render ssr }\nserver { notFound() }\ndiv { p "never" }\n`,
    });
    const port = 3700 + Math.floor(Math.random() * 150);
    const child = Bun.spawn([process.execPath, CLI, "dev", "--port", String(port)], { cwd: root, stdout: "ignore", stderr: "ignore" });
    try {
      if (!(await waitFor(port))) throw new Error("dev did not start");
      expect(await get(port, "/nf")).toBe(404);
    } finally {
      try { child.kill("SIGKILL"); } catch { /* gone */ }
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);

  test("a custom home/not-found.tw is used for the 404 body", async () => {
    const root = project({
      "home/nf/page.tw": `page { title "NF" render ssr }\nserver { notFound() }\ndiv { p "never" }\n`,
      "home/not-found.tw": `page { title "Gone" }\ndiv { h1 "custom-404-marker" }\n`,
    });
    const port = 3700 + Math.floor(Math.random() * 150);
    const child = Bun.spawn([process.execPath, CLI, "dev", "--port", String(port)], { cwd: root, stdout: "ignore", stderr: "ignore" });
    try {
      if (!(await waitFor(port))) throw new Error("dev did not start");
      const body = await new Promise<string>((resolve, reject) => {
        const req = request({ host: "localhost", port, path: "/nf", method: "GET", timeout: 5000 }, (res) => {
          let b = "";
          res.on("data", (d) => { b += d; });
          res.on("end", () => resolve(b));
        });
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
        req.on("error", reject);
        req.end();
      });
      expect(body).toContain("custom-404-marker");
    } finally {
      try { child.kill("SIGKILL"); } catch { /* gone */ }
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
});
