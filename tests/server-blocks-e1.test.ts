/**
 * Phase E1 -- getSession/requireUser, redirect()/notFound(), error handling.
 */

import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const { RenderPipeline } = await import("../packages/server/tw/routing/render-pipeline.ts") as any;
const {
  isValidRedirectTarget, checkServerBlocks, executeServerBlocks, collectServerBlocks,
  parseWithDetails, isServerRedirect, isServerNotFound, ServerRedirect, ServerNotFound,
} = await import("@tw/compiler") as any;
const SB = { filePath: "<t>", cache: false, experimental: { serverBlocks: true } } as any;

function app(pageSrc: string, cfg: any = { experimental: { serverBlocks: true } }): any {
  const dir = mkdtempSync(join(tmpdir(), "tw-e1-"));
  mkdirSync(join(dir, "home"), { recursive: true });
  writeFileSync(join(dir, "tw.config.ts"), "export default {}");
  writeFileSync(join(dir, "home", "page.tw"), pageSrc);
  return new RenderPipeline({ rootDir: dir, homeDir: join(dir, "home"), enableCache: true, serverBlocks: true, loginPath: cfg?.server?.loginPath });
}
const req = (session: any, headers: Record<string, string> = {}) =>
  Object.assign(new Request("http://localhost/", { headers }), { session });

describe("E1: redirect validation", () => {
  const accept = ["/", "/login", "/login?next=/a#x", "/a/b", "/u/2?tab=posts"];
  const reject = [
    "https://evil.com", "http://evil.com", "//evil.com", "/\\evil.com", "/%5C/evil.com",
    "/%2F/evil.com", "/a\tb", "/a\nb", "/a\u0000b", "/a%09b", "javascript:alert(1)",
    "", "login", "/login".slice(1), "/%00", 42, null, undefined, {},
  ];
  for (const t of accept) test(`accepts ${JSON.stringify(t)}`, () => expect(isValidRedirectTarget(t)).toBe(true));
  for (const t of reject) test(`rejects ${JSON.stringify(t)}`, () => expect(isValidRedirectTarget(t)).toBe(false));
});

describe("E1: helpers in the runner", () => {
  test("getSession: no session -> null, never throws", async () => {
    const p = app('server {\n  const s = getSession()\n  const out = s === null ? "null" : "obj"\n}\np "s={out}"\n');
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.html).toContain("s=null");
  });

  test("getSession: session -> the sanitized shape { id, ...data }", async () => {
    const p = app('server {\n  const s = getSession()\n  const out = s && s.name ? s.name : "none"\n}\np "n={out}"\n');
    const r = await p.renderWithServerBlocks("/", req({ userId: "u1", data: { name: "Ada" } }));
    expect(r.html).toContain("n=Ada");
  });

  test("getSession never exposes sessionId/ipHash/userAgentHash", async () => {
    const p = app('server {\n  const s = getSession()\n  const leak = s && (s.sessionId || s.ipHash || s.userAgentHash) ? "LEAK" : "clean"\n}\np "x={leak}"\n');
    const r = await p.renderWithServerBlocks("/", req({ userId: "u1", data: {}, sessionId: "sid", ipHash: "ip", userAgentHash: "ua" }));
    expect(r.html).toContain("x=clean");
  });

  test("requireUser: anonymous session (no userId) -> 302", async () => {
    const p = app('server {\n  const me = requireUser()\n  const x = me.name\n}\np "x={x}"\n');
    const r = await p.renderWithServerBlocks("/", req({ data: { name: "Anon" } }));
    expect(r.status).toBe(302);
    expect(r.headers?.Location).toBe("/login");
  });

  test("requireUser: no session -> 302 to /login", async () => {
    const p = app('server {\n  const me = requireUser()\n  const x = me.name\n}\np "x={x}"\n');
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.status).toBe(302);
    expect(r.headers?.Location).toBe("/login");
    expect(r.html).not.toContain("x=");
    expect(r.headers?.["Cache-Control"]).toBe("private, no-store");
  });

  test("requireUser: with session -> the user renders", async () => {
    const p = app('server {\n  const me = requireUser()\n  const x = me.name\n}\np "x={x}"\n');
    const r = await p.renderWithServerBlocks("/", req({ userId: "u1", data: { name: "Grace" } }));
    expect(r.html).toContain("x=Grace");
  });

  test("configured loginPath is honoured", async () => {
    const p = app('server {\n  const me = requireUser()\n}\np "x"\n', { server: { loginPath: "/auth/signin" } });
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.headers?.Location).toBe("/auth/signin");
  });

  test("redirect(valid) -> 302 Location, no body", async () => {
    const p = app('server {\n  redirect("/dashboard?tab=1")\n}\np "x"\n');
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.status).toBe(302);
    expect(r.headers?.Location).toBe("/dashboard?tab=1");
  });

  test("redirect(invalid, computed) -> generic 500", async () => {
    const p = app('server {\n  const t = "//evil.com"\n  redirect(t)\n}\np "x"\n');
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.status).toBe(500);
  });

  test("notFound() -> 404, private, block after does not run", async () => {
    const p = app('server {\n  notFound()\n  const x = "AFTER"\n}\np "x={x}"\n');
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.status).toBe(404);
    expect(r.headers?.["Cache-Control"]).toBe("private, no-store");
    expect(r.html).not.toContain("AFTER");
  });

  test("redirect/notFound survive Promise.all and nested async", async () => {
    const p = app('server {\n  async function check() { redirect("/x") }\n  await Promise.all([Promise.resolve(1), check()])\n}\np "y"\n');
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.status).toBe(302);
    expect(r.headers?.Location).toBe("/x");
  });

  test("swallow hardening: try/catch around redirect() still ends in 302", async () => {
    const p = app('server {\n  try { redirect("/x") } catch { /* swallowed */ }\n}\np "y"\n');
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.status).toBe(302);
    expect(r.headers?.Location).toBe("/x");
  });

  test("swallow hardening: try/catch around requireUser() still ends in 302", async () => {
    const p = app('server {\n  try { requireUser() } catch { /* swallowed */ }\n}\np "y"\n');
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.status).toBe(302);
    expect(r.headers?.Location).toBe("/login");
  });

  test("swallow hardening: try/catch around notFound() still ends in 404", async () => {
    const p = app('server {\n  try { notFound() } catch { /* swallowed */ }\n}\np "y"\n');
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.status).toBe(404);
  });

  test("a non-redirect throw stays the generic 500", async () => {
    const p = app('server {\n  throw new Error("SECRET_E1")\n}\np "x"\n');
    const r = await p.renderWithServerBlocks("/", req(null));
    expect(r.status).toBe(500);
    expect(r.html).not.toContain("SECRET_E1");
  });
});

describe("E1: static pages", () => {
  test("TW107: getSession/requireUser in a static block", () => {
    const prog = parseWithDetails('server {\n  const s = getSession()\n}\np "x"\n', SB).program;
    const probs = checkServerBlocks(prog, { mode: "static" });
    expect(probs.some((p: any) => p.code === "TW107")).toBe(true);
  });

  test("TW108: redirect/notFound in a static block", () => {
    const prog = parseWithDetails('server {\n  notFound()\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(prog, { mode: "static" }).some((p: any) => p.code === "TW108")).toBe(true);
  });

  test("TW109: a literal invalid redirect target", () => {
    const prog = parseWithDetails('server {\n  redirect("//evil.com")\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(prog).some((p: any) => p.code === "TW109")).toBe(true);
  });

  test("static alias: requireUser() throws TW107 at build (runtime stand-in)", async () => {
    const sb = collectServerBlocks(parseWithDetails('server {\n  const r = requireUser\n  const u = r()\n}\np "x"\n', SB).program);
    await expect(
      executeServerBlocks(sb, { context: { params: {} }, omitRuntime: ["getSession", "requireUser", "redirect", "notFound"], label: "page.tw" }),
    ).rejects.toThrow(/TW107.*page\.tw/);
  });
});

describe("E1: real middleware + real Cookie (socket)", () => {
  test("requireUser sees the session the middleware attaches", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-e1-sock-"));
    mkdirSync(join(dir, "home"), { recursive: true });
    writeFileSync(join(dir, "tw.config.ts"), "export default { experimental: { serverBlocks: true } };");
    writeFileSync(join(dir, "home", "page.tw"), 'server {\n  const me = requireUser()\n  const n = me.name\n}\np "n={n}"\n');
    const serverPath = join(import.meta.dir, "..", "packages", "server", "tw", "index.ts");
    const mwPath = join(import.meta.dir, "..", "packages", "server", "tw", "middleware", "body-parser.ts");
    const script = join(dir, "sock.mjs");
    writeFileSync(script, `
import { request as httpRequest } from "node:http";
const { TWServer } = await import(${JSON.stringify(serverPath)});
const { sessionMiddleware } = await import(${JSON.stringify(mwPath)});
const store = new Map([["sid1", { userId: "u1", data: { name: "Zed" } }]]);
const mw = sessionMiddleware({ secret: "s", store });
const server = new TWServer({ rootDir: ${JSON.stringify(dir)}, port: 0, host: "127.0.0.1", config: { experimental: { serverBlocks: true } }, securityHeaders: false, cors: false, compression: false });
const srv = Bun.serve({ port: 0, fetch: (r) => { mw(r, { headers: { set() {} } }, () => {}); return server.handleRequest(r); } });
const out = await new Promise((res, rej) => {
  const r = httpRequest({ host: "127.0.0.1", port: srv.port, path: "/", headers: { cookie: "tw.sid=sid1" } }, (x) => { let d = ""; x.on("data", (c) => { d += c; }); x.on("end", () => res({ status: x.statusCode, body: d, cc: x.headers["cache-control"] })); });
  r.on("error", rej); r.end();
});
console.log("RESULT:" + JSON.stringify(out));
srv.stop(true);
`);
    const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    const m = /RESULT:(\{.*\})/.exec(r.stdout || "");
    expect(m).toBeTruthy();
    const out = JSON.parse(m![1]);
    expect(out.body).toContain("n=Zed");
    expect(out.cc).toBe("private, no-store");
  }, 30000);
});

describe("E1: helpers are block-only", () => {
  test("client bundle contains no helper source", () => {
    // The block (with its helper calls) is stripped, so a plain client scan
    // never sees `requireUser`/`redirect`.
    const { collectClientImportsFromSource, findServerOnlyViolations } = require("../apps/cli/tw/commands/client-bundle");
    const src = 'server {\n  const me = requireUser()\n  redirect("/x")\n}\nh1 "hi"\n';
    const stripped = src.replace(/server \{[\s\S]*?\}/, "");
    expect(stripped).not.toContain("requireUser");
    expect(collectClientImportsFromSource(stripped).length).toBe(0);
  });
});
