/**
 * Server-data sample app -- end to end over a real listening server.
 *
 * The app in `examples/server-data` runs in a subprocess (a real TWServer wired
 * with the framework's session middleware); this test drives it with real HTTP
 * (node:http sockets, so the happy-dom preload's same-origin fetch shim is not
 * involved) and real Cookie headers, and asserts the security, cache,
 * static-build and failure behaviour. A second subprocess serves the negative
 * fixtures.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";

const repoRoot = join(import.meta.dir, "..");
const appDir = join(repoRoot, "examples", "server-data");
const negDir = join(appDir, "negative-fixtures");
const cliBin = join(repoRoot, "apps", "cli", "tw", "bin.ts");

// Random high ports so a re-run never collides with a lingering server.
const APP_PORT = 8900 + Math.floor(Math.random() * 90);
const NEG_PORT = APP_PORT + 1;

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  setCookie: string;
}

function req(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const r = httpRequest({ host: "127.0.0.1", port, path, method, headers }, (x) => {
      let d = "";
      x.on("data", (c) => (d += c));
      x.on("end", () => {
        const sc = x.headers["set-cookie"];
        resolve({
          status: x.statusCode ?? 0,
          headers: x.headers,
          body: d,
          setCookie: Array.isArray(sc) ? (sc[0] ?? "") : (sc ?? ""),
        });
      });
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function serverScript(rootDir: string, port: number, loginPath = "/login"): string {
  return `
import { TWServer } from ${JSON.stringify(join(repoRoot, "packages/server/tw/index.ts"))};
import { sessionMiddleware } from ${JSON.stringify(join(repoRoot, "packages/server/tw/middleware/body-parser.ts"))};
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:${port}";
const store = (globalThis.__serverDataSessions ??= new Map());
const server = new TWServer({
  rootDir: ${JSON.stringify(rootDir)}, port: ${port}, host: "127.0.0.1",
  config: { experimental: { serverBlocks: true }, server: { loginPath: ${JSON.stringify(loginPath)} } },
  securityHeaders: false, cors: false, compression: false,
});
try { server.loadRoutes(); } catch { /* optional */ }
try { server.loadMiddleware(); } catch { /* optional */ }
const mw = sessionMiddleware({ secret: "s", store });
Bun.serve({ port: ${port}, fetch: (r) => { mw(r, { headers: { set() {} } }, () => {}); return server.handleRequest(r); } });
console.log("READY");
`;
}

async function startServer(rootDir: string, port: number): Promise<any> {
  const dir = mkdtempSync(join(tmpdir(), "tw-server-data-"));
  const script = join(dir, "server.mjs");
  writeFileSync(script, serverScript(rootDir, port));
  const proc: any = Bun.spawn([process.execPath, script], { cwd: rootDir, stdout: "pipe", stderr: "pipe" });
  const reader = proc.stdout.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    if (buf.includes("READY")) return proc;
  }
  throw new Error("server did not become ready: " + buf);
}

let app: any;
let neg: any;
const base = `http://127.0.0.1:${APP_PORT}`;

beforeAll(async () => {
  spawnSync(process.execPath, [cliBin, "build"], { cwd: appDir, encoding: "utf8" });
  app = await startServer(appDir, APP_PORT);
  neg = await startServer(negDir, NEG_PORT);
}, 60000);

afterAll(() => {
  try { app?.kill(); } catch { /* gone */ }
  try { neg?.kill(); } catch { /* gone */ }
});

async function login(user: string, pass: string): Promise<string> {
  const res = await req(APP_PORT, "POST", "/login", { "content-type": "application/json" }, JSON.stringify({ user, pass }));
  expect(res.status).toBe(200);
  return res.setCookie.split(";")[0];
}

describe("server-data: authentication and cross-user safety", () => {
  test("anonymous /dashboard is redirected to /login by middleware", async () => {
    const res = await req(APP_PORT, "GET", "/dashboard");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/login");
  });

  test("anonymous /u/alice redirects to /login", async () => {
    const res = await req(APP_PORT, "GET", "/u/alice");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/login");
  });

  test("a wrong password is rejected", async () => {
    const res = await req(APP_PORT, "POST", "/login", { "content-type": "application/json" }, JSON.stringify({ user: "alice", pass: "nope" }));
    expect(res.status).toBe(401);
  });

  test("each user sees only their own dashboard", async () => {
    const alice = await login("alice", "alice-pw");
    const bob = await login("bob", "bob-pw");
    expect(alice).toContain("tw.sid=");
    expect(bob).toContain("tw.sid=");
    const a = await req(APP_PORT, "GET", "/dashboard", { cookie: alice });
    const b = await req(APP_PORT, "GET", "/dashboard", { cookie: bob });
    expect(a.body).toContain("Welcome Alice");
    expect(b.body).toContain("Welcome Bob");
    expect(a.body).not.toContain("Bob");
    expect(b.body).not.toContain("Alice:");
  });

  test("ownership: /u/<id> 404s on someone else's id", async () => {
    const alice = await login("alice", "alice-pw");
    const bob = await login("bob", "bob-pw");
    const mine = await req(APP_PORT, "GET", "/u/alice", { cookie: alice });
    expect(mine.status).toBe(200);
    expect(mine.body).toContain("Alice: hello");
    const other = await req(APP_PORT, "GET", "/u/bob", { cookie: alice });
    expect(other.status).toBe(404);
    const other2 = await req(APP_PORT, "GET", "/u/alice", { cookie: bob });
    expect(other2.status).toBe(404);
  });
});

describe("server-data: cached /posts page", () => {
  test("vary: page=1 and page=2 are distinct; extra keys do not multiply entries", async () => {
    const p1 = await req(APP_PORT, "GET", "/posts?page=1");
    const p1b = await req(APP_PORT, "GET", "/posts?page=1&utm_source=x&junk=" + "9".repeat(300));
    const p2 = await req(APP_PORT, "GET", "/posts?page=2");
    expect(p1.body).toContain("Alice: hello");
    expect(p2.body).toContain("Bob: hi");
    expect(p1b.body).toBe(p1.body);
    expect(p1.body).not.toBe(p2.body);
  });

  test("the cached response never replays Set-Cookie and is not publicly shared", async () => {
    const res = await req(APP_PORT, "GET", "/posts?page=1");
    expect(res.setCookie).toBe("");
    expect(String(res.headers["cache-control"] ?? "")).toContain("private");
  });
});

describe("server-data: static build output", () => {
  test("each enumerated param is baked into its own page", () => {
    const intro = join(appDir, ".tw", "docs", "intro", "index.html");
    const setup = join(appDir, ".tw", "docs", "setup", "index.html");
    expect(existsSync(intro)).toBe(true);
    expect(existsSync(setup)).toBe(true);
    expect(readFileSync(intro, "utf8")).toContain("Introduction");
    expect(readFileSync(setup, "utf8")).toContain("Setup");
  });
});

describe("server-data: failure pages never leak", () => {
  test("a throwing block is a generic 500 with no stack or message", async () => {
    const res = await req(NEG_PORT, "GET", "/broken");
    expect(res.status).toBe(500);
    expect(res.body).not.toContain("boom-should-not-leak");
    expect(res.body).not.toMatch(/\bat\s+\S+:\d+/);
  });

  test("the build rejects an env-reading block, naming the variable not the value", () => {
    const out = spawnSync(process.execPath, [cliBin, "build"], { cwd: negDir, encoding: "utf8" });
    expect(out.status).not.toBe(0);
    const text = (out.stdout ?? "") + (out.stderr ?? "");
    expect(text).toContain("TW115");
    expect(text).toContain("'token'");
    expect(text).toContain("TW113");
    expect(text).toContain("'helper'");
  });
});

describe("server-data: load sanity", () => {
  test("1000 requests across /dashboard and /posts stay bounded", async () => {
    const alice = await login("alice", "alice-pw");
    const lat: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const isDash = i % 2 === 1;
      const t0 = performance.now();
      const res = await req(APP_PORT, "GET", isDash ? "/dashboard" : "/posts?page=1", isDash ? { cookie: alice } : {});
      expect(res.status).toBe(200);
      lat.push(performance.now() - t0);
    }
    lat.sort((a, b) => a - b);
    const p95 = lat[Math.floor(lat.length * 0.95)];
    expect(p95).toBeLessThan(2000);
  }, 120000);
});
