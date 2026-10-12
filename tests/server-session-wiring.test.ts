/**
 * User middleware on the page path.
 *
 * `server.use(...)` middleware is the framework's session story: a session
 * middleware populates `request.session` before a server block reads it via
 * `getSession()` / `requireUser()`. This drives a real TWServer whose session
 * middleware is registered with `server.use(asMiddleware(sessionMiddleware(...)))`
 * -- no manual per-request wiring -- and asserts the session reaches a page,
 * that a guard can short-circuit a page, and that a middleware's cookie is
 * delivered to the client.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";

const repoRoot = join(import.meta.dir, "..");
const appDir = join(repoRoot, "examples", "server-data");
const cliBin = join(repoRoot, "apps", "cli", "tw", "bin.ts");

const PORT = 9100 + Math.floor(Math.random() * 80);

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  setCookies: string[];
}

function req(method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const r = httpRequest({ host: "127.0.0.1", port: PORT, path, method, headers }, (x) => {
      let d = "";
      x.on("data", (c) => (d += c));
      x.on("end", () => {
        const sc = x.headers["set-cookie"];
        resolve({
          status: x.statusCode ?? 0,
          headers: x.headers,
          body: d,
          setCookies: Array.isArray(sc) ? sc : sc ? [sc] : [],
        });
      });
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function serverScript(): string {
  return `
import { TWServer, asMiddleware } from ${JSON.stringify(join(repoRoot, "packages/server/tw/index.ts"))};
import { sessionMiddleware } from ${JSON.stringify(join(repoRoot, "packages/server/tw/middleware/body-parser.ts"))};
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:${PORT}";
const store = (globalThis.__serverDataSessions ??= new Map());
const server = new TWServer({
  rootDir: ${JSON.stringify(appDir)}, port: ${PORT}, host: "127.0.0.1",
  config: { experimental: { serverBlocks: true }, server: { loginPath: "/login" } },
  securityHeaders: false, cors: false, compression: false,
});
try { server.loadRoutes(); } catch {}
try { server.loadMiddleware(); } catch {}
// The framework's session middleware, registered the normal way. No manual
// per-request call -- the server runs it on the page path.
server.use(asMiddleware(sessionMiddleware({ secret: "s", store })));
// A cookie the adapter must carry to the client, and a guard that short-circuits.
server.use(asMiddleware((req, res, next) => {
  const p = new URL(req.url).pathname;
  if (p === "/dashboard") res.headers.set("Set-Cookie", "x_probe=1; Path=/");
  if (p === "/blocked") { res.status = 403; res.body = "blocked by middleware"; }
  next();
}));
Bun.serve({ port: ${PORT}, fetch: (r) => server.handleRequest(r) });
console.log("READY");
`;
}

let proc: any;

beforeAll(async () => {
  spawnSync(process.execPath, [cliBin, "build"], { cwd: appDir, encoding: "utf8" });
  const dir = mkdtempSync(join(tmpdir(), "tw-session-wiring-"));
  const script = join(dir, "server.mjs");
  writeFileSync(script, serverScript());
  proc = Bun.spawn([process.execPath, script], { cwd: appDir, stdout: "pipe", stderr: "pipe" });
  const reader = proc.stdout.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    if (buf.includes("READY")) return;
  }
  throw new Error("server did not become ready: " + buf);
}, 60000);

afterAll(() => {
  try { proc?.kill(); } catch { /* gone */ }
});

describe("server-session-wiring: user middleware runs on the page path", () => {
  test("a session registered with server.use() reaches a server block on a page", async () => {
    const login = await req("POST", "/login", { "content-type": "application/json" }, JSON.stringify({ user: "alice", pass: "alice-pw" }));
    expect(login.status).toBe(200);
    const cookie = login.setCookies.map((c) => c.split(";")[0]).join("; ");
    expect(cookie).toContain("tw.sid=");

    const page = await req("GET", "/dashboard", { cookie });
    expect(page.status).toBe(200);
    expect(page.body).toContain("Welcome");
  });

  test("without a session cookie the guarded page still redirects", async () => {
    const res = await req("GET", "/dashboard");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/login");
  });

  test("a user middleware's Set-Cookie reaches the page response", async () => {
    const login = await req("POST", "/login", { "content-type": "application/json" }, JSON.stringify({ user: "alice", pass: "alice-pw" }));
    const cookie = login.setCookies.map((c) => c.split(";")[0]).join("; ");
    const page = await req("GET", "/dashboard", { cookie });
    expect(page.setCookies.some((c) => c.startsWith("x_probe=1"))).toBe(true);
  });

  test("a user middleware can short-circuit a page", async () => {
    const res = await req("GET", "/blocked");
    expect(res.status).toBe(403);
    expect(res.body).toBe("blocked by middleware");
  });
});
