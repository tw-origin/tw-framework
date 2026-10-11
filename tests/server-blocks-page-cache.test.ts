/**
 * page cache + vary + the cached-page context trap.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractVary, varyQuery, canonicalVaryQuery, checkServerBlocks, parseWithDetails,
  executeServerBlocks, collectServerBlocks, createServerFetch, fetchCacheSize, clearFetchCache,
} from "@tw/compiler";

const { RenderPipeline } = await import("../packages/server/tw/routing/render-pipeline.ts") as any;
const SB = { filePath: "<t>", cache: false, experimental: { serverBlocks: true } } as any;
beforeEach(() => clearFetchCache());

function app(pageSrc: string): any {
  const dir = mkdtempSync(join(tmpdir(), "tw-sb-pcache-"));
  mkdirSync(join(dir, "home"), { recursive: true });
  writeFileSync(join(dir, "tw.config.ts"), "export default {}");
  writeFileSync(join(dir, "home", "page.tw"), pageSrc);
  return new RenderPipeline({ rootDir: dir, homeDir: join(dir, "home"), enableCache: true, serverBlocks: true });
}
const req = (q = "", headers: Record<string, string> = {}) => new Request("http://localhost/" + q, { headers });

describe("vary helpers", () => {
  test("extractVary: lowercased, sorted, unique", () => {
    expect(extractVary('page { cache { revalidate: 1, vary: ["sort", "Page", "page"] } }')).toEqual(["page", "sort"]);
    expect(extractVary('page { cache { revalidate: 1 } }')).toEqual([]);
  });
  test("varyQuery: only vary keys visible, trimmed + capped", () => {
    const q = varyQuery({ page: " 1 ", junk: "x", sort: "y".repeat(300) }, ["page", "sort"]);
    expect(q.page).toBe("1");
    expect((q as any).junk).toBeUndefined();
    expect(q.sort.length).toBe(200);
  });
  test("canonicalVaryQuery: sorted, empty dropped", () => {
    expect(canonicalVaryQuery({ b: "2", a: "1", c: "" })).toBe("a=1&b=2");
  });
});

describe("cached page", () => {
  const PAGE = 'page { title "P" cache { revalidate: 300, vary: ["page"] } }\nserver {\n  const p = query.page ?? "none"\n}\np "p={p}"\n';

  test("two requests with different cookies -> same HTML (block saw no cookie)", async () => {
    const p = app(PAGE);
    process.env.TW_DEBUG_CACHE = "1";
    const a = await p.renderWithServerBlocks("/", req("?page=1", { cookie: "u=1" }));
    const b = await p.renderWithServerBlocks("/", req("?page=1", { cookie: "u=2" }));
    expect(a.html).toContain("p=1");
    expect(b.html).toBe(a.html);
    expect(b.headers?.["x-tw-cache"]).toBe("HIT");
    delete process.env.TW_DEBUG_CACHE;
  });

  test("vary: ?page=1 and ?page=2 are different entries", async () => {
    const p = app(PAGE);
    const a = await p.renderWithServerBlocks("/", req("?page=1"));
    const b = await p.renderWithServerBlocks("/", req("?page=2"));
    expect(a.html).toContain("p=1");
    expect(b.html).toContain("p=2");
  });

  test("vary: extra query keys never create entries; non-vary reads undefined", async () => {
    const p = app(PAGE);
    const a = await p.renderWithServerBlocks("/", req("?page=1&utm_source=a"));
    const b = await p.renderWithServerBlocks("/", req("?page=1&utm_source=b&x=" + "9".repeat(500)));
    expect(b.html).toBe(a.html);
  });

  test("no vary declared -> query empty", async () => {
    const p = app('page { title "P" cache { revalidate: 300 } }\nserver {\n  const p = query.page ?? "none"\n}\np "p={p}"\n');
    const r = await p.renderWithServerBlocks("/", req("?page=1"));
    expect(r.html).toContain("p=none");
  });

  test("the context trap: an alias read of cookies -> 500, not cached", async () => {
    const p = app('page { title "P" cache { revalidate: 300 } }\nserver {\n  const c = cookies\n  const u = c.u ?? "none"\n}\np "u={u}"\n');
    const r = await p.renderWithServerBlocks("/", req("", { cookie: "u=1" }));
    expect(r.status).toBe(500);
    expect(r.headers?.["Cache-Control"]).toBe("private, no-store");
  });

  test("notFound() in a cached page -> 404 MAY be cached", async () => {
    const p = app('page { title "P" cache { revalidate: 300 } }\nserver {\n  notFound()\n}\np "x"\n');
    process.env.TW_DEBUG_CACHE = "1";
    const a = await p.renderWithServerBlocks("/", req());
    const b = await p.renderWithServerBlocks("/", req());
    expect(a.status).toBe(404);
    expect(b.headers?.["x-tw-cache"]).toBe("HIT");
    delete process.env.TW_DEBUG_CACHE;
  });

  test("redirect() in a cached page is never cached", async () => {
    const p = app('page { title "P" cache { revalidate: 300 } }\nserver {\n  redirect("/x")\n}\np "y"\n');
    const r = await p.renderWithServerBlocks("/", req());
    expect(r.status).toBe(302);
    expect(r.headers?.["Cache-Control"]).toBe("private, no-store");
  });

  test("a block page WITHOUT cache{} stays private, no-store", async () => {
    const p = app('server {\n  const x = "1"\n}\np "x={x}"\n');
    const r = await p.renderWithServerBlocks("/", req());
    expect(r.headers?.["Cache-Control"]).toBe("private, no-store");
  });

  test("the cached-page lint (TW111) fires for direct reads", () => {
    const prog = parseWithDetails('page { cache { revalidate: 1 } }\nserver {\n  const u = cookies.u\n  const s = getSession()\n}\np "x"\n', SB).program;
    const probs = checkServerBlocks(prog, { cachedPage: true });
    expect(probs.filter((x: any) => x.code === "TW111").length).toBe(2);
  });

  test("vary on a static page -> TW112", () => {
    const prog = parseWithDetails('server {\n  const a = 1\n}\np "x"\n', SB).program;
    expect(checkServerBlocks(prog, { mode: "static", hasVary: true }).some((x: any) => x.code === "TW112")).toBe(true);
  });
});

describe("config threading fixes", () => {
  test("fetchTimeoutMs from config changes behaviour", async () => {
    let aborted = false;
    const m = (_u: string, init: any) => new Promise<Response>((_, rej) => { init?.signal?.addEventListener("abort", () => { aborted = true; const e: any = new Error("a"); e.name = "AbortError"; rej(e); }); });
    const sf = createServerFetch({ buildId: "b1", timeoutMs: 40, platformFetch: m as any });
    await expect(sf("http://x/y", {})).rejects.toThrow(/timed out/);
    expect(aborted).toBe(true);
  }, 20000);

  test("a Set-Cookie response is never cached (real server, subprocess)", () => {
    // A real local server + the native fetch, in a separate process (no shim).
    const { spawnSync } = require("node:child_process");
    const sfPath = join(import.meta.dir, "..", "packages", "compiler", "tw", "server-blocks", "server-fetch.ts");
    const script = join(mkdtempSync(join(tmpdir(), "tw-sc-")), "sc.mjs");
    writeFileSync(script, `
const { createServerFetch, fetchCacheSize } = await import(${JSON.stringify(sfPath)});
let hits = 0;
const s = Bun.serve({ port: 0, fetch: () => { hits++; return new Response("{}", { headers: { "set-cookie": "a=b", "content-type": "application/json" } }); } });
const sf = createServerFetch({ buildId: "b1" });
const url = "http://127.0.0.1:" + s.port + "/x";
await sf(url, { cache: { revalidate: 60 } });
await sf(url, { cache: { revalidate: 60 } });
console.log("RESULT:" + JSON.stringify({ hits, size: fetchCacheSize() }));
s.stop(true);
`);
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    const m = /RESULT:(\{.*\})/.exec(r.stdout || "");
    expect(m).toBeTruthy();
    const out = JSON.parse(m![1]);
    expect(out.size).toBe(0);
    expect(out.hits).toBe(2);
  }, 30000);
});
