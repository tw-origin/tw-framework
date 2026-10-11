/**
 * Server blocks -- Phase C part 2: SSR runtime wiring (renderWithServerBlocks)
 * + the review fixes (flag threading, compile-cache bypass, static trap).
 */

import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const { RenderPipeline } = await import("../packages/server/tw/routing/render-pipeline.ts") as any;
const {
  parseWithDetails, collectServerBlocks, executeServerBlocks, encodeServerValues,
  checkServerBlocks, compileSync, parseTokens,
} = await import("@tw/compiler") as any;
const { tokenize } = await import("../packages/compiler/tw/lexer/index.ts") as any;
const SB = { filePath: "<t>", cache: false, experimental: { serverBlocks: true } } as any;

function makeApp(pageSrc: string, serverBlocks = true): any {
  const dir = mkdtempSync(join(tmpdir(), "tw-sb-ssr-"));
  mkdirSync(join(dir, "home"), { recursive: true });
  writeFileSync(join(dir, "tw.config.ts"), "export default {}");
  writeFileSync(join(dir, "home", "page.tw"), pageSrc);
  return new RenderPipeline({ rootDir: dir, homeDir: join(dir, "home"), enableCache: true, cacheTTL: 500, serverBlocks });
}

const req = (headers: Record<string, string> = {}, q = "") =>
  new Request("http://localhost/" + q, { headers });

describe("Phase C part 2: SSR server blocks", () => {
  test("different request context -> different HTML", async () => {
    const p = makeApp('server {\n  const u = headers["x-u"] ?? "none"\n}\np "u={u}"\n');
    const a = await p.renderWithServerBlocks("/", req({ "x-u": "1" }));
    const b = await p.renderWithServerBlocks("/", req({ "x-u": "2" }));
    expect(a.html).toContain("u=1");
    expect(b.html).toContain("u=2");
    expect(a.html).not.toBe(b.html);
  });

  test("query reaches the block", async () => {
    const p = makeApp('server {\n  const q = query.q ?? "none"\n}\np "q={q}"\n');
    const r = await p.renderWithServerBlocks("/", req({}, "?q=hello"));
    expect(r.html).toContain("q=hello");
  });

  test("block source never leaks into the HTML", async () => {
    const p = makeApp('server {\n  const u = "zzz"\n}\np "u={u}"\n');
    const r = await p.renderWithServerBlocks("/", req());
    expect(r.html).toContain("u=zzz");
    expect(r.html).not.toContain("const u");
  });

  test("no caching: private headers, no x-tw-cache-age, block re-runs", async () => {
    const p = makeApp('server {\n  const n = Math.random().toString()\n}\np "n={n}"\n');
    const a = await p.renderWithServerBlocks("/", req({ "x-u": "1" }));
    const b = await p.renderWithServerBlocks("/", req({ "x-u": "1" }));
    expect(a.headers?.["Cache-Control"]).toBe("private, no-store");
    expect(a.headers?.["x-tw-cache-age"]).toBeUndefined();
    expect(a.html).not.toBe(b.html);
  });

  test("120 requests with distinct data do not grow the compile cache", async () => {
    const p = makeApp('server {\n  const u = headers["x-u"] ?? ""\n}\np "u={u}"\n');
    for (let i = 0; i < 120; i++) await p.renderWithServerBlocks("/", req({ "x-u": String(i) }));
    expect(p.compiledCache.size).toBeLessThan(5);
  }, 30000);

  test("a throw becomes a generic 500 with no detail", async () => {
    const p = makeApp('server {\n  throw new Error("SECRET_TOKEN_abc123")\n}\np "x"\n');
    const r = await p.renderWithServerBlocks("/", req());
    expect(r.status).toBe(500);
    expect(r.html).not.toContain("SECRET_TOKEN_abc123");
    expect(r.headers?.["Cache-Control"]).toBe("private, no-store");
  });

  test("a page WITHOUT a server block falls through to render()", async () => {
    const p = makeApp('p "plain"\n');
    const r = await p.renderWithServerBlocks("/", req());
    expect(r.html).toBe(p.render("/").html);
  });

  test("FLAG OFF: a server-block page is treated as plain content", async () => {
    const p = makeApp('server {\n  const u = "zzz"\n}\np "hi"\n', false);
    const r = await p.renderWithServerBlocks("/", req());
    // No block handling -- falls through to the original render.
    expect(r.html).toBe(p.render("/").html);
    expect(r.headers?.["Cache-Control"]).not.toBe("private, no-store");
  });

  test("timeout: a block that never resolves -> 500", async () => {
    const p = makeApp('server {\n  await new Promise(() => {})\n  const a = 1\n}\np "x"\n');
    const r = await p.renderWithServerBlocks("/", req());
    expect(r.status).toBe(500);
  }, 20000);
});

describe("Phase C part 2: static trap + static path", () => {
  test("static trap: aliased cookies access throws TW106 with file + name", async () => {
    const sb = collectServerBlocks(parseWithDetails('server {\n  const c = cookies\n  const u = c.u\n}\np "x"\n', SB).program);
    await expect(
      executeServerBlocks(sb, { context: { params: {} }, omit: ["headers", "cookies", "query"], label: "page.tw" }),
    ).rejects.toThrow(/TW106.*cookies.*page\.tw/);
  });

  test("static trap: destructuring throws too", async () => {
    const sb = collectServerBlocks(parseWithDetails('server {\n  const { u } = headers\n  const x = u\n}\np "x"\n', SB).program);
    await expect(
      executeServerBlocks(sb, { context: { params: {} }, omit: ["headers", "cookies", "query"] }),
    ).rejects.toThrow(/TW106/);
  });

  async function staticRender(src: string, paramSet: Record<string, string> = {}, enumerated = false) {
    const prog = parseWithDetails(src, SB).program;
    const sb = collectServerBlocks(prog);
    const omit = ["headers", "cookies", "query"];
    if (!enumerated) omit.push("params");
    const vals = await executeServerBlocks(sb, { context: { params: paramSet, env: {} }, omit, label: "<t>" });
    const vars = { ...paramSet, params: paramSet, ...encodeServerValues(vals) };
    return compileSync(src, { filePath: "<t>", stateVars: vars, experimental: { serverBlocks: true } });
  }

  test("static: block data is baked into HTML", async () => {
    const r = await staticRender('server {\n  const posts = ["a", "b"]\n}\np "first={posts[0]}"\n');
    expect(r.html).toContain("first=a");
    expect(r.html).not.toContain("const posts");
  });

  test("static: params readable with enumerated params", async () => {
    const r = await staticRender('server {\n  const slug = params.slug\n}\np "slug={slug}"\n', { slug: "hello" }, true);
    expect(r.html).toContain("slug=hello");
  });

  test("static + cookies/headers/query = TW103", () => {
    const prog = parseWithDetails('server {\n  const c = cookies.x\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(prog, { mode: "static", hasEnumeratedParams: false }).some((p: any) => p.code === "TW103")).toBe(true);
  });

  test("layout + server block = TW105", () => {
    const prog = parseWithDetails('server {\n  const a = 1\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(prog, { isLayout: true }).some((p: any) => p.code === "TW105")).toBe(true);
  });

  test("parseTokens + server block = clear error", () => {
    const toks = tokenize('server {\n  const a = 1\n}\np "x"', { filePath: "<t>" }).tokens;
    const prog = parseTokens(toks, { filePath: "<t>", experimental: { serverBlocks: true } });
    expect((prog.errors ?? []).some((e: any) => /server blocks require source text/.test(e.message))).toBe(true);
  });
});

describe("Phase C part 2: cookie header + real build", () => {
  test("a real Cookie header reaches the block", async () => {
    const p = makeApp('server {\n  const u = cookies.u ?? "none"\n}\np "u={u}"\n');
    const h = new Headers();
    h.set("cookie", "u=42"); // a real `cookie` header (not a test-only name)
    const r = await p.renderWithServerBlocks("/", { url: "http://localhost/", headers: h } as any);
    expect(r.html).toContain("u=42");
  });

  test("real `tw build` bakes static block data (incl. params.twm)", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-sb-build-"));
    mkdirSync(join(dir, "home", "blog", "[slug]"), { recursive: true });
    writeFileSync(join(dir, "tw.config.ts"), "export default { experimental: { serverBlocks: true } };");
    writeFileSync(join(dir, "home", "page.tw"), 'page { title "H" render static }\nserver {\n  const posts = ["a", "b"]\n  const n = posts.length\n}\nh1 "n={n}"\np "first={posts[0]}"\n');
    writeFileSync(join(dir, "home", "blog", "[slug]", "page.tw"), 'page { title "P" render static }\nserver {\n  const s = params.slug\n  const up = s.toUpperCase()\n}\nh1 "slug={up}"\n');
    writeFileSync(join(dir, "home", "blog", "[slug]", "params.twm"), 'export function generate() { return [{ slug: "one" }, { slug: "two" }] }\n');

    const cli = join(import.meta.dir, "..", "apps", "cli", "tw", "bin.ts");
    const r = spawnSync(process.execPath, [cli, "build"], { cwd: dir, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(readFileSync(join(dir, ".tw", "index.html"), "utf8")).toContain("n=2");
    expect(readFileSync(join(dir, ".tw", "blog", "one", "index.html"), "utf8")).toContain("slug=ONE");
    expect(readFileSync(join(dir, ".tw", "blog", "two", "index.html"), "utf8")).toContain("slug=TWO");
  }, 60000);
});
