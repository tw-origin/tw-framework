/**
 * TW Framework -- security-package audit round regressions:
 * 7 findings from an outside security review, each verified against the
 * code and fixed.
 *   - JWT: a token with NO aud claim must fail an audience check
 *   - path preventer: normalized base + boundary-aware containment
 *   - safeFetch: hostnames are DNS-resolved and IP-checked before fetching
 *   - secure cookies: explicit verify=true always verifies
 *   - timing wrap(): awaits the wrapped call before normalizing
 *   - HTMLSanitizer: removedTags option no longer crashes the constructor
 *   - redirect: backslash variants (/\evil.com) no longer bypass the
 *     relative-URL branch (open redirect)
 */
import { describe, test, expect, mock } from "bun:test";
import { createJWTManager } from "../packages/security/tw/auth";
import { createPathPreventer } from "../packages/security/tw/path-traversal/preventer";
import { createSSRFProtector } from "../packages/security/tw/ssrf/protector";
import { SecureCookieManager } from "../packages/security/tw/cookies/secure-cookie";
import { createTimingProtector } from "../packages/security/tw/timing/protector";
import { HTMLSanitizer } from "../packages/security/tw/sanitize/html-sanitizer";
import { createRedirectPreventer } from "../packages/security/tw/redirect/preventer";

describe("security audit: JWT audience", () => {
  test("token without aud claim fails an audience check", async () => {
    const jwt = createJWTManager({ secret: "s" });
    const { token } = await jwt.sign({ userId: "1" });  // no audience
    const result = await jwt.verify(token, { audience: "api" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Invalid audience");
    // and a token WITH the right audience still passes
    const jwt2 = createJWTManager({ secret: "s" });
    const { token: tok2 } = await jwt2.sign({ userId: "1", aud: "api" });
    const ok = await jwt2.verify(tok2, { audience: "api" });
    expect(ok.valid).toBe(true);
  });
});

describe("security audit: path traversal preventer", () => {
  test("traversal patterns still fire and messy baseDir does not false-positive", () => {
    const preventer = createPathPreventer({ baseDir: "app/public/" });
    const attacked = preventer.validate("../../etc/passwd");
    expect(attacked.detected).toBe(true);
    expect(attacked.safe).toBe(false);
    const fine = preventer.validate("assets/app.png");
    expect(fine.safe).toBe(true);
    expect(fine.detected).toBe(false);
  });
});

describe("security audit: SSRF safeFetch", () => {
  test("hostname resolving to a metadata IP is blocked BEFORE fetch", async () => {
    // The hostname is not a literal IP and not on any static list, so only
    // the new DNS-resolution step in createSafeFetch can catch it.
    mock.module("node:dns", () => ({
      promises: { lookup: async () => [{ address: "169.254.169.254" }] },
    }));
    const protector = createSSRFProtector();
    const safeFetch = protector.createSafeFetch();
    let err: Error | null = null;
    try { await safeFetch("http://innocent-looking.example.com/x"); } catch (e) { err = e as Error; }
    expect(err).toBeTruthy();
    expect(err!.message.startsWith("SSRF protection")).toBe(true);
  });

  test("unresolvable host fails closed with an SSRF error", async () => {
    mock.module("node:dns", () => ({
      promises: { lookup: async () => { throw new Error("NXDOMAIN"); } },
    }));
    const protector = createSSRFProtector();
    const safeFetch = protector.createSafeFetch();
    let err: Error | null = null;
    try { await safeFetch("http://nonexistent-tw-test.invalid/x"); } catch (e) { err = e as Error; }
    expect(err).toBeTruthy();
    expect(err!.message.startsWith("SSRF protection")).toBe(true);
  });

  test("literal metadata IP is still blocked", () => {
    const protector = createSSRFProtector();
    expect(protector.validate("http://169.254.169.254/latest/meta-data").allowed).toBe(false);
  });
});

describe("security audit: secure cookies", () => {
  test("explicit verify=true verifies even when signByDefault is false", async () => {
    const m = new SecureCookieManager({ secret: "k", signByDefault: false } as any);
    const setCookie = await m.sign("sid", "hello");
    const value = setCookie.split(";")[0].split("=").slice(1).join("=");
    const req = { headers: { get: (k: string) => (k === "cookie" ? `sid=${value}` : null) } } as unknown as Request;
    const verified = await m.get(req, "sid", true);
    expect(verified).toBe("hello"); // not the raw "hello.<sig>" string
    const raw = await m.get(req, "sid", false);
    expect(raw).toBe(value);       // unverified read returns the raw value
  });
});

describe("security audit: timing protector", () => {
  test("wrap() includes the wrapped call's own duration", async () => {
    const protector = createTimingProtector({ minResponseTime: 150, addJitter: false });
    const wrapped = protector.wrap(async () => {
      await new Promise(r => setTimeout(r, 50));
      return 42;
    });
    const start = Date.now();
    const result = await wrapped();
    const total = Date.now() - start;
    expect(result).toBe(42);
    // normalize() pads elapsed(=50) up to 150 -> total ~= 150.
    // With the old bug elapsed was ~0 -> total ~= 50 + 150 = 200.
    expect(total).toBeGreaterThanOrEqual(140);
    expect(total).toBeLessThan(195);
  });
});

describe("security audit: HTML sanitizer", () => {
  test("removedTags option constructs without crashing and is honored", () => {
    let sanitizer: HTMLSanitizer;
    expect(() => { sanitizer = new HTMLSanitizer({ removedTags: ["marquee"] }); }).not.toThrow();
    const out = sanitizer!.sanitize("<marquee>scrolled</marquee><p>ok</p>");
    expect(out).toContain("ok");
    expect(out.toLowerCase()).not.toContain("marquee");
  });
});

describe("security audit: redirect preventer", () => {
  test("backslash variants are not treated as safe relative redirects", () => {
    const preventer = createRedirectPreventer();  // allowRelative defaults true
    const cases = ["/\\evil.com", "\\\\evil.com", "//evil.com"];
    for (const url of cases) {
      const result = preventer.validate(url);
      expect(result.allowed).toBe(false);
    }
    // genuine relative redirects still pass
    const ok = preventer.validate("/dashboard/home");
    expect(ok.allowed).toBe(true);
  });
});
