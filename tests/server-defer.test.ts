/**
 * `server:defer { }` -- a server block that runs after the first byte.
 *
 * The parse layer has always recorded the `:defer` modifier; these cover what it
 * now does: a deferred block cannot drive control flow (TW118), its values are
 * not available to the markup (TW119), and at runtime its values come back from
 * a thunk the server runs once the shell is on the wire.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { checkServerBlocks, parseWithDetails, collectReferencedNames } from "@tw/compiler";

const repoRoot = join(import.meta.dir, "..");

const { RenderPipeline } = await import("../packages/server/tw/routing/render-pipeline.ts") as any;
const SB = { filePath: "<t>", cache: false, experimental: { serverBlocks: true } } as any;

function app(pageSrc: string): any {
  const dir = mkdtempSync(join(tmpdir(), "tw-sb-defer-"));
  mkdirSync(join(dir, "home"), { recursive: true });
  writeFileSync(join(dir, "tw.config.ts"), "export default {}");
  writeFileSync(join(dir, "home", "page.tw"), pageSrc);
  return new RenderPipeline({ rootDir: dir, homeDir: join(dir, "home"), enableCache: true, serverBlocks: true });
}
const req = () => new Request("http://localhost/");

describe("server:defer -- compile-time", () => {
  test("redirect() in a deferred block -> TW118", () => {
    const src = 'server { const a = "1" }\nserver:defer {\n  redirect("/x")\n}\np "a={a}"\n';
    const prog = parseWithDetails(src, SB).program;
    const probs = checkServerBlocks(prog, { referenced: collectReferencedNames(src) });
    expect(probs.some((p: any) => p.code === "TW118")).toBe(true);
  });

  test("notFound() in a deferred block -> TW118", () => {
    const src = 'server:defer {\n  notFound()\n}\np "x"\n';
    const prog = parseWithDetails(src, SB).program;
    const probs = checkServerBlocks(prog, { referenced: collectReferencedNames(src) });
    expect(probs.some((p: any) => p.code === "TW118")).toBe(true);
  });

  test("a clean deferred block passes", () => {
    const src = 'server { const a = "1" }\nserver:defer {\n  const log = "ok"\n}\np "a={a}"\n';
    const prog = parseWithDetails(src, SB).program;
    const probs = checkServerBlocks(prog, { referenced: collectReferencedNames(src) });
    expect(probs.some((p: any) => p.code === "TW118")).toBe(false);
  });

  test("a deferred block on a cached page -> TW119", () => {
    const src = 'page { cache { revalidate: 1 } }\nserver:defer {\n  const b = "2"\n}\np "b={b}"\n';
    const prog = parseWithDetails(src, SB).program;
    const probs = checkServerBlocks(prog, { cachedPage: true, referenced: collectReferencedNames(src) });
    expect(probs.some((p: any) => p.code === "TW119")).toBe(true);
  });

  test("a cached page with a deferred block never runs it inline", async () => {
    const p = app('page { title "P" cache { revalidate: 300 } }\nserver {\n  const a = "1"\n}\nserver:defer {\n  const b = "2"\n}\np "a={a} b={b}"\n');
    const r = await p.renderWithServerBlocks("/", req());
    expect(r.html).toContain("a=1");
    expect(r.html).not.toContain("b=2");
    expect(r.deferred).toBeUndefined();
  });
});

describe("server:defer -- runtime", () => {
  test("a deferred name renders a marker; the thunk resolves the value", async () => {
    const p = app('page { title "P" render ssr }\nserver {\n  const a = "1"\n}\nserver:defer {\n  const b = a + "2"\n}\np "a={a} b={b}"\n');
    const r = await p.renderWithServerBlocks("/", req());
    // The inline value is in the shell; the deferred one is a marker the client
    // fills once the seed arrives.
    expect(r.html).toContain("a=1");
    expect(r.html).toContain('<tw-defer data-tw-defer="b"></tw-defer>');
    expect(r.html).not.toContain("b=12");
    expect(typeof r.deferred).toBe("function");
    // The deferred block sees the inline block's value `a`.
    const values = await r.deferred();
    expect(values.b).toBe("12");
  });

  test("a page without a deferred block has no thunk", async () => {
    const p = app('page { title "P" render ssr }\nserver {\n  const a = "1"\n}\np "a={a}"\n');
    const r = await p.renderWithServerBlocks("/", req());
    expect(r.deferred).toBeUndefined();
  });
});

// --- Real server: shell, then the streamed seed + patcher -------------------

const PORT = 9200 + Math.floor(Math.random() * 80);
let proc: any;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "tw-defer-srv-"));
  mkdirSync(join(dir, "home"), { recursive: true });
  writeFileSync(join(dir, "tw.config.ts"), "export default {}");
  writeFileSync(join(dir, "home", "page.tw"), 'page { title "P" render ssr }\nserver {\n  const a = "1"\n}\nserver:defer {\n  const b = "2"\n}\np "a={a} b={b}"\n');
  const script = join(dir, "server.mjs");
  writeFileSync(script, `
import { TWServer } from ${JSON.stringify(join(repoRoot, "packages/server/tw/index.ts"))};
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:${PORT}";
const server = new TWServer({ rootDir: ${JSON.stringify(dir)}, port: ${PORT}, host: "127.0.0.1", config: {}, securityHeaders: false, cors: false, compression: false });
try { server.loadRoutes(); } catch {}
try { server.loadMiddleware(); } catch {}
Bun.serve({ port: ${PORT}, fetch: (r) => server.handleRequest(r) });
console.log("READY");
`);
  proc = Bun.spawn([process.execPath, script], { cwd: dir, stdout: "pipe", stderr: "pipe" });
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

function get(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = httpRequest({ host: "127.0.0.1", port: PORT, path, method: "GET" }, (x) => {
      let d = "";
      x.on("data", (c) => (d += c));
      x.on("end", () => resolve(d));
    });
    r.on("error", reject);
    r.end();
  });
}

describe("server:defer -- streamed over a real server", () => {
  test("the shell carries the marker, then the seed and the patcher stream in", async () => {
    const body = await get("/");
    expect(body).toContain("a=1");
    expect(body).toContain('<tw-defer data-tw-defer="b"></tw-defer>');
    expect(body).toContain('id="__tw_defer"');
    expect(body).toContain('"b":"2"');
    expect(body).toContain("tw-defer[data-tw-defer]"); // the patcher is present
  });
});
