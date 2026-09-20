/**
 * TW Framework -- Next.js parity round (v42):
 *   - Rewrites config (exact / :param / glob)
 *   - Server actions (POST ?_action=, named actions, fail-closed same-origin)
 *   - request.cookies helper in .twm handlers
 *   - Route-level ISR (module `revalidate` const + x-tw-route-cache HIT)
 *   - Page ISR (frontmatter `revalidate N`, x-tw-cache MISS/HIT/STALE)
 *   - Metadata API (frontmatter description/keywords/og_* -> <meta> tags)
 *   - Redirect envelope (status + Location header)
 *   - Catch-all [...slug] route matching (parity with the scanner)
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeRouteHandler, revalidateRoute } from "../packages/server/tw/routing/twm-loader";
import { applyRewrites } from "../packages/server/tw/index";
import { matchRoute, scanRouteTree } from "../packages/server/tw/routing/scanner";
import { RenderPipeline } from "../packages/server/tw/routing/render-pipeline";

const tmp = mkdtempSync(join(tmpdir(), "tw-parity-"));
const file = (name: string, code: string): string => {
  const p = join(tmp, name);
  writeFileSync(p, code);
  return p;
};
const plainRequest = (url: string, method = "GET", headers: Record<string, string> = {}) => ({
  url,
  method,
  headers,
  json: async () => ({}),
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rewrites config", () => {
  test("exact match rewrites the path", () => {
    const out = applyRewrites([{ from: "/games", to: "/category/games" }], "/games");
    expect(out).toBe("/category/games");
  });

  test(":param capture substitutes into the target", () => {
    const out = applyRewrites([{ from: "/app/:slug", to: "/game/:slug" }], "/app/chess");
    expect(out).toBe("/game/chess");
  });

  test("glob rewrites keep the suffix", () => {
    const out = applyRewrites([{ from: "/legacy/**", to: "/new" }], "/legacy/docs/intro");
    expect(out).toBe("/new/docs/intro");
  });

  test("non-matching path returns null", () => {
    expect(applyRewrites([{ from: "/app/:slug", to: "/game/:slug" }], "/app/a/b")).toBeNull();
    expect(applyRewrites([{ from: "/games", to: "/x" }], "/about")).toBeNull();
  });
});

describe("server actions", () => {
  test("default fn action dispatches via POST ?_action=", async () => {
    const p = file(
      "act-default.twm",
      `fn action(request) {
  return { status: 200, json: { ok: true, name: request.body.name } }
}
`,
    );
    const out = await executeRouteHandler(
      p,
      "POST",
      plainRequest("http://localhost:3000/api/x?_action=", "POST", { origin: "http://localhost:3000" }),
    );
    expect(out.status).toBe(200);
    expect(out.json.ok).toBe(true);
  });

  test("named action actionCreate dispatches via ?_action=create", async () => {
    const p = file(
      "act-named.twm",
      `fn actionCreate(request) {
  return { status: 201, json: { created: true } }
}
`,
    );
    const out = await executeRouteHandler(
      p,
      "POST",
      plainRequest("http://localhost:3000/api/x?_action=create", "POST", { origin: "http://localhost:3000" }),
    );
    expect(out.status).toBe(201);
    expect(out.json.created).toBe(true);
  });

  test("action-only route (no fn post) does not 405", async () => {
    const p = file(
      "act-only.twm",
      `fn actionPublish(request) {
  return { status: 200, json: { published: true } }
}
`,
    );
    const out = await executeRouteHandler(
      p,
      "POST",
      plainRequest("http://localhost:3000/api/x?action=publish", "POST", { origin: "http://localhost:3000" }),
    );
    expect(out.status).toBe(200);
    expect(out.json.published).toBe(true);
  });

  test("missing Origin/Referer is rejected (fail-closed)", async () => {
    const p = file(
      "act-guard.twm",
      `fn action(request) {
  return { status: 200, json: { ok: true } }
}
`,
    );
    const out = await executeRouteHandler(p, "POST", plainRequest("http://localhost:3000/api/x?_action=", "POST"));
    expect(out.status).toBe(403);
  });

  test("cross-origin POST is rejected", async () => {
    const p = file(
      "act-cross.twm",
      `fn action(request) {
  return { status: 200, json: { ok: true } }
}
`,
    );
    const out = await executeRouteHandler(
      p,
      "POST",
      plainRequest("http://localhost:3000/api/x?_action=", "POST", { origin: "http://evil.example" }),
    );
    expect(out.status).toBe(403);
  });

  test("unknown action name answers 404", async () => {
    const p = file(
      "act-unknown.twm",
      `fn action(request) {
  return { status: 200, json: { ok: true } }
}
`,
    );
    const out = await executeRouteHandler(
      p,
      "POST",
      plainRequest("http://localhost:3000/api/x?_action=nope", "POST", { origin: "http://localhost:3000" }),
    );
    expect(out.status).toBe(404);
  });
});

describe("request.cookies helper", () => {
  test("fn get sees request.cookies.get()", async () => {
    const p = file(
      "cookies.twm",
      `fn get(request) {
  return { status: 200, json: { session: request.cookies.get("session"), theme: request.cookies.theme, count: Object.keys(request.cookies.getAll()).length } }
}
`,
    );
    const out = await executeRouteHandler(
      p,
      "GET",
      plainRequest("http://x/api", "GET", { cookie: "session=abc123; theme=dark" }),
    );
    expect(out.json.session).toBe("abc123");
    expect(out.json.theme).toBe("dark");
    expect(out.json.count).toBe(2);
  });
});

describe("route-level ISR (revalidate const)", () => {
  test("GET responses cache and answer x-tw-route-cache: HIT", async () => {
    const p = file(
      "route-isr.twm",
      `const revalidate = 60

fn get(request) {
  return { status: 200, json: { at: Date.now() } }
}
`,
    );
    const first = await executeRouteHandler(p, "GET", plainRequest("http://x/api"));
    expect(first.status).toBe(200);
    const second = await executeRouteHandler(p, "GET", plainRequest("http://x/api"));
    expect(second.headers?.["x-tw-route-cache"]).toBe("HIT");
    expect(second.json.at).toBe(first.json.at);
  });

  test("routes without revalidate do not cache", async () => {
    const p = file(
      "route-nocache.twm",
      `fn get(request) {
  return { status: 200, json: { at: Date.now() } }
}
`,
    );
    const first = await executeRouteHandler(p, "GET", plainRequest("http://x/api"));
    await new Promise((r) => setTimeout(r, 5));
    const second = await executeRouteHandler(p, "GET", plainRequest("http://x/api"));
    expect(second.json.at).not.toBe(first.json.at);
    expect(second.headers?.["x-tw-route-cache"]).toBeUndefined();
  });
});

describe("page ISR + metadata (RenderPipeline)", () => {
  test("frontmatter metadata becomes meta tags; cache goes MISS -> HIT -> STALE", async () => {
    const root = join(tmp, "isr-app");
    mkdirSync(join(root, "home"), { recursive: true });
    writeFileSync(
      join(root, "home", "page.tw"),
      `page {
  title "ISR Test"
  description "A test page for ISR and metadata"
  keywords "tw, framework, test"
  og_title "OG ISR Test"
  og_description "OG description here"
  og_image "/img/og.png"
  revalidate 1
  render static
}

div.wrap {
  h1 "Hello ISR"
}
`,
    );

    const pipeline = new RenderPipeline({ rootDir: root, homeDir: join(root, "home"), enableCache: true, cacheTTL: 60000 } as any);

    const first = pipeline.render("/");
    expect(first.status).toBe(200);
    expect(first.headers["x-tw-cache"]).toBe("MISS");
    expect(first.html).toContain('<meta name="description" content="A test page for ISR and metadata">');
    expect(first.html).toContain('<meta name="keywords" content="tw, framework, test">');
    expect(first.html).toContain('<meta property="og:title" content="OG ISR Test">');
    expect(first.html).toContain('<meta property="og:image" content="/img/og.png">');
    expect(first.html).toContain('<meta name="twitter:card" content="summary_large_image">');

    const hit = pipeline.render("/");
    expect(hit.fromCache).toBe(true);
    expect(hit.headers["x-tw-cache"]).toBe("HIT");

    // Wait past the 1s revalidate window: the entry is served STALE while a
    // background render refreshes it.
    await new Promise((r) => setTimeout(r, 1100));
    const stale = pipeline.render("/");
    expect(stale.fromCache).toBe(true);
    expect(stale.stale).toBe(true);
    expect(stale.headers["x-tw-cache"]).toBe("STALE");

    // Background refresh has run by now (microtask after the stale serve).
    await new Promise((r) => setTimeout(r, 50));
    const fresh = pipeline.render("/");
    expect(fresh.headers["x-tw-cache"]).toBe("HIT");
  });
});

describe("redirect envelope", () => {
  test("status 301 + Location header passes through", async () => {
    const p = file(
      "redirect.twm",
      `fn get(request) {
  return { status: 301, json: {}, headers: { "Location": "/new-home" } }
}
`,
    );
    const out = await executeRouteHandler(p, "GET", plainRequest("http://x/old"));
    expect(out.status).toBe(301);
    expect(out.headers?.Location).toBe("/new-home");
  });
});

describe("catch-all route matching", () => {
  test("[...slug] matches multi-segment paths and captures params", () => {
    const root = join(tmp, "catchall-app");
    mkdirSync(join(root, "home", "docs", "[...rest]"), { recursive: true });
    writeFileSync(join(root, "home", "docs", "[...rest]", "page.tw"), 'page { title "Docs" render static }\n\ndiv { p "doc" }\n');

    const tree = scanRouteTree({ homeDir: join(root, "home"), rootDir: root });
    expect(tree).not.toBeNull();
    const m = matchRoute(tree!, "/docs/a/b/c");
    expect(m).not.toBeNull();
    expect((m as any).params.rest).toBe("a/b/c");
    // [...rest] needs at least one segment -- the optional [[...rest]] form
    // is what matches /docs itself.
    expect(matchRoute(tree!, "/docs")).toBeNull();
  });
});

describe("on-demand ISR invalidation", () => {
  test("pipeline.revalidatePath drops entries so the next render is a MISS", async () => {
    const root = join(tmp, "rv-app");
    mkdirSync(join(root, "home"), { recursive: true });
    writeFileSync(
      join(root, "home", "page.tw"),
      'page { title "RV" render ssr revalidate 600 }\n\ndiv { h1 "RV page" }\n',
    );
    const pipeline = new RenderPipeline({ rootDir: root, homeDir: join(root, "home"), enableCache: true } as any);
    const first = pipeline.render("/");
    expect(first.headers["x-tw-cache"]).toBe("MISS");
    expect(pipeline.render("/").headers["x-tw-cache"]).toBe("HIT");
    expect(pipeline.revalidatePath("/")).toBe(1);
    expect(pipeline.render("/").headers["x-tw-cache"]).toBe("MISS");
    expect(pipeline.revalidatePath("/nowhere")).toBe(0);
  });

  test("revalidateRoute drops cached route responses", async () => {
    const p = file(
      "rv-route.twm",
      `const revalidate = 60

fn get(request) {
  return { status: 200, json: { at: Date.now() } }
}
`,
    );
    const first = await executeRouteHandler(p, "GET", plainRequest("http://x/api/rv"));
    const hit = await executeRouteHandler(p, "GET", plainRequest("http://x/api/rv"));
    expect(hit.headers?.["x-tw-route-cache"]).toBe("HIT");
    expect(revalidateRoute("/api/rv")).toBe(1);
    await new Promise((r) => setTimeout(r, 5));
    const fresh = await executeRouteHandler(p, "GET", plainRequest("http://x/api/rv"));
    expect(fresh.headers?.["x-tw-route-cache"]).toBeUndefined();
    expect(fresh.json.at).not.toBe(first.json.at);
  });

  test("import { revalidatePath } from \"tw\" is injected into handlers", async () => {
    const root = join(tmp, "rv-tw-import");
    mkdirSync(join(root, "home", "api", "refresh"), { recursive: true });
    const p = join(root, "home", "api", "refresh", "route.twm");
    writeFileSync(
      p,
      'import { revalidatePath } from "tw"\n\nfn actionRefresh(request) {\n  return { status: 200, json: { dropped: revalidatePath("/products") } }\n}\n',
    );
    const out = await executeRouteHandler(
      p,
      "POST",
      plainRequest("http://localhost:3000/api/refresh?_action=refresh", "POST", { origin: "http://localhost:3000" }),
    );
    expect(out.status).toBe(200);
    // No pipeline registered -> 0 dropped, but the call must not throw.
    expect(out.json.dropped).toBe(0);
  });
});

describe("utility class parsing (Tailwind-style)", () => {
  test("numbers and fractions survive class names", async () => {
    const { compileSync } = await import("../packages/compiler/tw/index.ts");
    const src = [
      "page {",
      '  title "T"',
      "  render static",
      "}",
      "",
      "div.flex.items-center.gap-4.bg-blue-500 {",
      '  span.w-1/2.p-2 { "x" }',
      "}",
      "",
    ].join("\n");
    const out = (compileSync as any)(src, { filePath: "/tmp/x/home/page.tw" });
    expect(out.html).toContain('class="flex items-center gap-4 bg-blue-500"');
    expect(out.html).toContain('class="w-1/2 p-2"');
  });
});
