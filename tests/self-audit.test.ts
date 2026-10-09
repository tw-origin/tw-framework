/**
 * TW Framework -- self-directed bug-hunt round (no external report):
 *   - CSRF token store grew past its 10000 cap when every stored token was
 *     still fresh (evictExpired frees nothing) -> oldest-entry eviction now
 *     enforces a hard cap
 *   - CSRF isSameOrigin() treated "no Origin AND no Referer" as same-origin,
 *     so any headerless client (curl, attack scripts) bypassed the whole
 *     CSRF check by default -> fail-closed
 *   - /_tw/img/<malformed %-encoding> crashed with an unhandled URIError
 *     from decodeURIComponent (a 500) -> now a 404
 *   - CSRF constantTimeEqual no longer early-returns on length mismatch
 */
import { describe, test, expect } from "bun:test";
import { CSRFMiddleware } from "../packages/security/tw/csrf/middleware";
import { createCSRFManager } from "../packages/security/tw/csrf/token-manager";
import { createImageHandler } from "../packages/image/tw/index";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hdr = (h: Record<string, string>) => ({ get: (k: string) => h[k] ?? null });

describe("self-hunt: CSRF token store cap", () => {
  test("store never exceeds maxTokens even when every token is fresh", async () => {
    const m = createCSRFManager({ secret: "s", ttl: 3_600_000, maxTokens: 50 });
    for (let i = 0; i < 80; i++) await m.generate();
    expect(m.getStats().totalTokens).toBeLessThanOrEqual(50);
  });
});

describe("self-hunt: CSRF same-origin check", () => {
  test("headerless POST (no Origin/Referer, no token) is rejected", async () => {
    const mw = new CSRFMiddleware({ manager: createCSRFManager({ secret: "s" }) });
    const req = { method: "POST", url: "http://x/api/transfer", headers: hdr({ host: "x" }) } as any;
    const res = await mw.process(req);
    expect(res?.status).toBe(403);
  });

  test("same-origin POST (Origin matches Host) still skips, as before", async () => {
    const mw = new CSRFMiddleware({ manager: createCSRFManager({ secret: "s" }) });
    const req = { method: "POST", url: "http://x/api/transfer", headers: hdr({ host: "x", origin: "http://x" }) } as any;
    const res = await mw.process(req);
    expect(res).toBeNull();
  });

  test("cross-origin POST without a token is rejected", async () => {
    const mw = new CSRFMiddleware({ manager: createCSRFManager({ secret: "s" }) });
    const req = { method: "POST", url: "http://x/api/transfer", headers: hdr({ host: "x", origin: "http://evil.example" }) } as any;
    const res = await mw.process(req);
    expect(res?.status).toBe(403);
  });

  test("full double-submit round trip still validates", async () => {
    const m = createCSRFManager({ secret: "s", rotateAfterUse: false });
    const t = await m.generate();
    const ok = await m.validate(t.signedToken, t.cookieValue);
    expect(ok.valid).toBe(true);
    const bad = await m.validate(t.signedToken, t.token + ".wrong");
    expect(bad.valid).toBe(false);
  });
});

describe("self-hunt: image handler", () => {
  test("malformed percent-encoding answers 404, not a URIError crash", async () => {
    const root = mkdtempSync(join(tmpdir(), "twself-"));
    mkdirSync(join(root, "public"), { recursive: true });
    const h = createImageHandler({ rootDir: root });
    const r = await h.handle(new Request("http://x/_tw/img/%zzw"));
    expect(r?.status).toBe(404);
    const r2 = await h.handle(new Request("http://x/_tw/img/%"));
    expect(r2?.status).toBe(404);
  });
});
