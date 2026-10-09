/**
 * TW Framework -- bug-hunt round regressions (v30):
 *   - async route handlers return their result (were silently {})
 *   - patch handlers load (module wrapper dropped them)
 *   - uppercase verb exports (GET/POST/...) work like lowercase
 *   - a throwing handler answers 500 without leaking internals
 *   - CORS allow-side: allowed origins get Access-Control headers,
 *     OPTIONS preflights are answered 204 instead of route 405
 *   - bodies over 10 MB are rejected 413 before parsing
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadTWMModule,
  executeRouteHandler,
  executeMiddleware,
} from "../packages/server/tw/routing/twm-loader";
import { parseRules, corsHeadersFor } from "../packages/server/tw/routing/twm-rules";

const tmp = mkdtempSync(join(tmpdir(), "tw-hunt-"));
const file = (name: string, code: string): string => {
  const p = join(tmp, name);
  writeFileSync(p, code);
  return p;
};
const plainRequest = (url: string, method = "GET", headers: Record<string, string> = {}) => ({
  url,
  method,
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  json: async () => ({}),
});

describe("bug-hunt round: route handlers", () => {
  test("async route handler result is used (was silently {})", async () => {
    const p = file("async-route.twm", `export async function get(request) {
  return { status: 200, json: { form: "async" } };
}
`);
    const r = await executeRouteHandler(p, "GET", plainRequest("http://x/api/async"));
    expect(r.status).toBe(200);
    expect((r.json as any).form).toBe("async");
  });

  test("patch handlers load (module wrapper dropped them before)", async () => {
    const p = file("patch-route.twm", `export function patch(request) {
  return { status: 200, json: { form: "patch" } };
}
`);
    const r = await executeRouteHandler(p, "PATCH", plainRequest("http://x/api/patch"));
    expect(r.status).toBe(200);
    expect((r.json as any).form).toBe("patch");
  });

  test("DSL fn patch works", async () => {
    const p = file("patch-dsl.twm", `fn patch(request) {
  return { status: 200, json: { form: "patch-dsl" } }
}
`);
    const r = await executeRouteHandler(p, "PATCH", plainRequest("http://x/api/patchd"));
    expect(r.status).toBe(200);
    expect((r.json as any).form).toBe("patch-dsl");
  });

  test("uppercase verb exports (GET) are accepted", async () => {
    const p = file("upper-route.twm", `export function GET(request) {
  return { status: 200, json: { form: "upper" } };
}
`);
    const r = await executeRouteHandler(p, "GET", plainRequest("http://x/api/upper"));
    expect(r.status).toBe(200);
    expect((r.json as any).form).toBe("upper");
  });

  test("a throwing handler answers 500 and does not leak internals", async () => {
    const p = file("crash-route.twm", `export async function get() {
  throw new Error("SECRET_INTERNAL_TOKEN_XYZ");
}
`);
    const r = await executeRouteHandler(p, "GET", plainRequest("http://x/api/crash"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.json)).not.toContain("SECRET_INTERNAL_TOKEN_XYZ");
  });

  test("handler returning nothing answers 500, not a silent 200 {}", async () => {
    const p = file("void-route.twm", `export function get(request) {
  if (request) { return undefined; }
}
`);
    const r = await executeRouteHandler(p, "GET", plainRequest("http://x/api/void"));
    expect(r.status).toBe(500);
  });

  test("bodies over 10 MB are rejected 413 before parsing", async () => {
    const p = file("big-route.twm", `export function post(request) {
  return { status: 200, json: { ok: true } };
}
`);
    const r = await executeRouteHandler(p, "POST", {
      ...plainRequest("http://x/api/big", "POST"),
      headers: { get: (k: string) => (k.toLowerCase() === "content-length" ? String(11 * 1024 * 1024) : null) },
    });
    expect(r.status).toBe(413);
  });
});

describe("bug-hunt round: CORS allow-side", () => {
  const CORS_MW = `rule "api-cors" {
  match "/api/**"
  methods ["GET", "POST", "OPTIONS"]
  origin {
    allow ["https://myapp.com", "http://localhost:3000"]
    require true
    allow_referer true
  }
  response { status 403, json { error "Access Denied" } }
}
`;

  test("allowed origin gets Access-Control-Allow-Origin", async () => {
    const rules = parseRules(CORS_MW);
    const h = corsHeadersFor(rules, plainRequest("http://x/api/data", "GET", { origin: "https://myapp.com" }) as any);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://myapp.com");
    expect(h["Vary"]).toBe("Origin");
  });

  test("OPTIONS preflight is answered 204 with allow methods", async () => {
    const p = file("mw-cors.twm", CORS_MW);
    const res = await executeMiddleware(p, plainRequest("http://x/api/data", "OPTIONS", {
      origin: "https://myapp.com",
      "access-control-request-method": "POST",
    }));
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("https://myapp.com");
    expect(r.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(r.headers.get("access-control-max-age")).toBe("600");
  });

  test("disallowed origin is still blocked by the rule response (403)", async () => {
    const p = file("mw-cors2.twm", CORS_MW);
    const res = await executeMiddleware(p, plainRequest("http://x/api/data", "GET", { origin: "https://evil.com" }));
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  test("no origin header -> no CORS headers leaked", async () => {
    const rules = parseRules(CORS_MW);
    const h = corsHeadersFor(rules, plainRequest("http://x/api/data") as any);
    expect(Object.keys(h).length).toBe(0);
  });
});

// Cleanup temp dir after the suite
afterAll(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("deep-check round: render modes + conditional requests", () => {
  test("render island compiles (syntax-page-config, render-modes and guide-blog document it as core)", async () => {
    const { compile } = await import("@tw/compiler");
    const r = await compile('page { title "T" render island }\n\ndiv.x { p "hi" }\n');
    const diags = (r as any).diagnostics ?? [];
    const invalid = diags.find((d: any) => String(d.message ?? "").includes("Invalid render mode"));
    expect(invalid).toBeUndefined();
  });

  test("If-Modified-Since at second granularity returns 304 (ms mtime bug)", async () => {
    const { StaticHandler } = await import("../packages/server/tw/static/index");
    const sh: any = new StaticHandler({ root: "/tmp" });
    // mtime with milliseconds AFTER the truncated HTTP date must still 304
    const httpDate = new Date("2026-09-19T19:00:20.000Z");
    const fileMtime = new Date("2026-09-19T19:00:20.456Z");
    const req = { headers: { get: (k: string) => (k === "if-modified-since" ? httpDate.toUTCString() : null) } };
    expect(sh.handleConditionalRequest(req as any, '"etag"', fileMtime as any)).toBe(true);
  });

  test("If-Modified-Since older than file does NOT 304", async () => {
    const { StaticHandler } = await import("../packages/server/tw/static/index");
    const sh: any = new StaticHandler({ root: "/tmp" });
    const httpDate = new Date("2026-09-19T18:00:00.000Z");
    const fileMtime = new Date("2026-09-19T19:00:20.456Z");
    const req = { headers: { get: (k: string) => (k === "if-modified-since" ? httpDate.toUTCString() : null) } };
    expect(sh.handleConditionalRequest(req as any, '"etag"', fileMtime as any)).toBe(false);
  });
});
