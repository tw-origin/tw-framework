/**
 * End-to-end suite in the Next.js style (contributing/core/testing.md):
 * a complete isolated app is built (`tw build`) and served (`tw serve`)
 * on a random port; every assertion runs against real HTTP responses.
 * Pages, API routes, server actions, cache windows, middleware,
 * redirects, security headers, unicode routes and 404s.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";

// The test preload registers happy-dom globally, whose fetch enforces
// browser CORS -- raw node:http talks to the local server directly.
function nodeFetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; redirect?: string }): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpRequest({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: init?.method ?? "GET", headers: init?.headers,
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
        resolve({ status: res.statusCode ?? 0, headers, text: data });
      });
    });
    req.on("error", reject);
    if (init?.body) req.write(init.body);
    req.end();
  });
}

const ROOT = mkdtempSync(join(tmpdir(), "tw2k-e2e-"));
const PORT = 8300 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const BIN = join(import.meta.dir, "..", "apps", "cli", "tw", "bin.ts");

let server: any = null;
let ready = false;

beforeAll(async () => {
  // --- isolated fixture app (nextTestSetup equivalent) ---
  const dirs = ["home/shop", "home/legacy", "home/hi/हिन्दी", "home/api/items",
    "home/api/publish", "home/api/echo", "home/secret", "home/gone", "lib", "style"];
  for (const d of dirs) mkdirSync(join(ROOT, d), { recursive: true });

  writeFileSync(join(ROOT, "tw.config.ts"), `export default {
  cache: { profiles: { fast: { stale: 1, revalidate: 1, expire: 4 } } },
  redirects: [{ from: "/gone", to: "/shop", permanent: false }],
  security: { headers: true },
}
`);
  writeFileSync(join(ROOT, "style", "global.tss"), "body { margin: 0 }\n");
  writeFileSync(join(ROOT, "lib", "counter.ts"), "let n = 0\nexport function next() { n += 1; return n }\n");

  writeFileSync(join(ROOT, "home", "shop", "page.tw"), `import "./../../style/global.tss"

page {
  title "Shop"
  render ssr
  cache { life "fast", tag "shop" }
}

div.shop {
  h1 "Shop Page"
  p "cached content"
}
`);
  writeFileSync(join(ROOT, "home", "legacy", "page.tw"), `page { title "Legacy" render ssr revalidate 1 }

div { p "legacy isr" }
`);
  writeFileSync(join(ROOT, "home", "hi", "हिन्दी", "page.tw"), `page { title "हिन्दी" render ssr }

div { h1 "नमस्ते दुनिया" }
`);
  writeFileSync(join(ROOT, "home", "secret", "page.tw"), `page { title "Secret" render ssr }

div { p "top secret" }
`);
  writeFileSync(join(ROOT, "home", "api", "items", "route.twm"), `import { next } from "counter"

fn cached get(request) {
  cache { revalidate 1, expire 3, tag "shop" }
  return { status: 200, json: { n: next() } }
}
`);
  writeFileSync(join(ROOT, "home", "api", "publish", "route.twm"), `fn actionPublish(request) {
  return { status: 200, json: { ok: true }, revalidateTag: "shop" }
}
`);
  writeFileSync(join(ROOT, "home", "api", "echo", "route.twm"), `fn post(request) {
  return { status: 201, json: { got: request.body, query: request.query } }
}
`);
  writeFileSync(join(ROOT, "middleware.twm"), `rule "block secret" {
    match "/secret/**"
    user_agent {
        block ["tw-e2e-blocked"]
    }
    response {
        status 403
        html "<h1>403 Forbidden</h1>"
    }
}
`);

  // --- build ---
  const build = Bun.spawnSync(["bun", BIN, "build"], { cwd: ROOT, stdout: "ignore", stderr: "pipe" });
  if (build.exitCode !== 0) throw new Error("build failed: " + build.stderr.toString().slice(0, 500));

  // --- serve on a random port ---
  server = Bun.spawn(["bun", BIN, "serve", "--port", String(PORT)], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  for (let i = 0; i < 40 && !ready; i++) {
    try { const r = await nodeFetch(`${BASE}/shop`); if (r.status) ready = true; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  if (!ready) {
    let err = "";
    try {
      const t = await new Response(server.stderr).text();
      err = t.slice(0, 800);
    } catch { /* ignore */ }
    throw new Error("server did not start\n" + err);
  }
}, 60000);

afterAll(() => {
  try { server?.kill(); } catch {}
  try { rmSync(ROOT, { recursive: true, force: true }); } catch {}
});

const H = async (path: string, init?: any) => nodeFetch(BASE + path, init);

describe("e2e: pages & routing", () => {
  test("/shop renders with cache headers", async () => {
    const r = await H("/shop");
    expect(r.status).toBe(200);
    expect(r.text).toContain("Shop Page");
    expect(r.headers["x-tw-cache"]).toBeTruthy();
    expect(r.headers["cache-control"]).toContain("max-age=1");
  });
  test("/shop second hit is a cache HIT", async () => {
    const a = await H("/shop");
    const b = await H("/shop");
    expect(["MISS", "STALE", "HIT"]).toContain(a.headers["x-tw-cache"]);
    expect(b.headers["x-tw-cache"]).toBe("HIT");
  });
  test("unknown page is a 404", async () => {
    const r = await H("/nope-not-here");
    expect(r.status).toBe(404);
  });
  test("unicode route renders", async () => {
    const r = await H(encodeURI("/hi/हिन्दी"));
    expect(r.status).toBe(200);
    expect(r.text).toContain("नमस्ते");
  });
});

describe("e2e: api & actions", () => {
  test("cached handler: MISS then HIT with stable payload", async () => {
    const a = await H("/api/items");
    const b = await H("/api/items");
    expect(a.status).toBe(200);
    expect(b.headers["x-tw-cache"]).toBe("HIT");
    expect(JSON.parse(b.text).n).toBe(JSON.parse(a.text).n);
  });
  test("POST handler echoes body and query", async () => {
    const r = await H("/api/echo?x=1", { method: "POST", body: JSON.stringify({ hello: "world" }), headers: { "content-type": "application/json" } });
    expect(r.status).toBe(201);
    const j = JSON.parse(r.text);
    expect(j.got.hello).toBe("world");
    expect(j.query.x).toBe("1");
  });
  test("action with revalidateTag answers x-tw-revalidated", async () => {
    const r = await H("/api/publish?_action=publish", {
      method: "POST", body: "{}",
      headers: { "content-type": "application/json", "origin": BASE },
    });
    expect(r.status).toBe(200);
    expect(r.headers["x-tw-revalidated"]).toBe("shop");
    // the family actually expired: /shop re-renders
    const s = await H("/shop");
    expect(s.headers["x-tw-cache"]).toBe("MISS");
  });
});

describe("e2e: middleware & redirects", () => {
  test("middleware rule blocks a listed user agent on /secret/*", async () => {
    const r = await H("/secret", { headers: { "user-agent": "tw-e2e-blocked/1.0" } });
    expect(r.status).toBe(403);
  });
  test("middleware lets other agents through", async () => {
    const r = await H("/secret", { headers: { "user-agent": "tw-e2e-friend/1.0" } });
    expect(r.status).toBe(200);
    expect(r.text).toContain("top secret");
  });
  test("tw.config redirect /gone -> /shop", async () => {
    const res = await nodeFetch(BASE + "/gone");
    expect([301, 302, 307, 308]).toContain(res.status);
  });
});

describe("e2e: security headers", () => {
  test("security headers are applied", async () => {
    const r = await H("/shop");
    expect(r.headers["x-frame-options"] ?? r.headers["x-content-type-options"] ?? "none").not.toBe("none");
  });
});
