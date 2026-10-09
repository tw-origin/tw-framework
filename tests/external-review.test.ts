/**
 * TW Framework -- external bug-hunt round regressions (v35):
 * bugs reported by an outside review, verified against the code and fixed.
 *   - computed() unsubscribes from signals it no longer reads
 *   - scheduler reports deduped jobs as jobsSkipped
 *   - rateLimitMiddleware answers 429 (was: silent empty response)
 *   - bodyParserMiddleware answers 413 (was: silent request death)
 *   - compressionMiddleware no longer sets content-encoding without compressing
 *   - the JS `delete` operator works in DSL route handler bodies
 *   - large JWT payloads sign without a spread-overflow
 *   - clockTolerance applies to exp, opt-in (default 0)
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signal, computed, watchEffect } from "../packages/runtime/tw/reactivity";
import { schedule, flushSync, getStats } from "../packages/runtime/tw/scheduler";
import { createJWTManager } from "../packages/security/tw/auth";
import {
  rateLimitMiddleware,
  bodyParserMiddleware,
  compressionMiddleware,
} from "../packages/server/tw/middleware";
import { executeRouteHandler } from "../packages/server/tw/routing/twm-loader";

const tmp = mkdtempSync(join(tmpdir(), "tw-ext-"));
const file = (name: string, code: string): string => {
  const p = join(tmp, name);
  writeFileSync(p, code);
  return p;
};
const plainRequest = (url: string, method = "GET") => ({
  url,
  method,
  headers: { get: () => null },
  json: async () => ({}),
});

describe("external hunt: reactivity", () => {
  test("computed unsubscribes from signals it stops reading", () => {
    const flag = signal(true);
    const a = signal(1);
    const b = signal(2);
    const c = computed(() => (flag() ? a() : b()));
    let runs = 0;
    watchEffect(() => { c(); runs++; });

    expect(runs).toBe(1);           // initial
    expect(c.peek()).toBe(1);
    const before = runs;
    flag.set(false);               // recompute: now reads b, drops a
    expect(runs).toBeGreaterThan(before);   // it did re-run
    expect(c.peek()).toBe(2);
    const settled = runs;
    a.set(999);                     // old dependency: must NOT notify anymore
    expect(runs).toBe(settled);     // unchanged
    expect(c.peek()).toBe(2);       // value still comes from b
    b.set(5);                       // current dependency: still notifies
    expect(c.peek()).toBe(5);
  });
});

describe("external hunt: scheduler stats", () => {
  test("id-deduped jobs are reported as jobsSkipped", () => {
    schedule(() => {}, "normal", "dup-id");
    schedule(() => {}, "normal", "dup-id");   // replaces + counts as skipped
    flushSync();
    const stats = getStats();
    expect(stats.jobsSkipped).toBe(1);
    expect(stats.jobsRun).toBe(1);
  });
});

describe("external hunt: server middlewares", () => {
  test("rateLimitMiddleware answers 429 when the limit is crossed", async () => {
    const mw = rateLimitMiddleware({ max: 1, windowMs: 60_000 });
    const okCtx: any = { headers: { "x-forwarded-for": "9.9.9.9" } };
    await mw(okCtx, async () => {});
    expect(okCtx.response).toBeUndefined();
    const overCtx: any = { headers: { "x-forwarded-for": "9.9.9.9" } };
    await mw(overCtx, async () => {});
    expect(overCtx.response?.status).toBe(429);
    expect(overCtx.response?.headers?.get("retry-after")).toBeTruthy();
  });

  test("bodyParserMiddleware answers 413 over the limit", async () => {
    const mw = bodyParserMiddleware({ limit: 10 });
    const ctx: any = { headers: { "content-length": "100", "content-type": "application/json" } };
    await mw(ctx, async () => {});
    expect(ctx.response?.status).toBe(413);
  });

  test("compressionMiddleware never lies about content-encoding", async () => {
    const mw = compressionMiddleware();
    const ctx: any = { headers: { "accept-encoding": "gzip" } };
    await mw(ctx, async () => {});
    expect(ctx.headers["content-encoding"]).toBeUndefined();
  });
});

describe("external hunt: twm DSL", () => {
  test("JS delete operator works inside a handler body", async () => {
    const p = file("delete-op.twm", `fn post(request) {
  const obj = { a: 1, b: 2 }
  delete obj.a
  return { status: 200, json: { gone: !("a" in obj), kept: obj.b } }
}
`);
    const out = await executeRouteHandler(p, "POST", plainRequest("http://x/api", "POST"));
    expect(out.status).toBe(200);
    expect(out.json.gone).toBe(true);
    expect(out.json.kept).toBe(2);
  });
});

describe("external hunt: JWT", () => {
  test("large payloads sign and verify (no spread overflow)", async () => {
    const jwt = createJWTManager({ secret: "s" });
    const big = "x".repeat(100_000);
    const { token } = await jwt.sign({ big });
    const result = await jwt.verify(token);
    expect(result.valid).toBe(true);
  });

  test("clockTolerance is opt-in and applies to exp", async () => {
    const jwt = createJWTManager({ secret: "s", expiresIn: -5 });
    const { token } = await jwt.sign({ userId: "1" });
    const strict = await jwt.verify(token);
    expect(strict.valid).toBe(false);                       // expired
    const lenient = await jwt.verify(token, { clockTolerance: 60 });
    expect(lenient.valid).toBe(true);                       // within tolerance
  });
});
