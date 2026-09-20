/**
 * Security package tests -- tests for all security modules.
 */

import { test, expect, describe } from "bun:test";

describe("CSP Policy Builder", () => {
  test("creates a default policy", () => {
    const { createCSPPolicy } = require("../packages/security/tw/csp");
    const csp = createCSPPolicy();
    const result = csp.build();
    expect(result.header).toContain("default-src");
    expect(result.header).toContain("'self'");
  });

  test("strict CSP has none for default-src", () => {
    const { strictCSP } = require("../packages/security/tw/csp");
    const result = strictCSP().build();
    expect(result.header).toContain("default-src 'none'");
  });

  test("adds source to directive", () => {
    const { createCSPPolicy } = require("../packages/security/tw/csp");
    const csp = createCSPPolicy();
    csp.addSource("script-src", "https://cdn.example.com");
    const result = csp.build();
    expect(result.header).toContain("https://cdn.example.com");
  });
});

describe("Rate Limiting", () => {
  test("token bucket allows first requests", () => {
    const { createTokenBucket } = require("../packages/security/tw/rate-limit");
    const bucket = createTokenBucket({ capacity: 5, refillRate: 1 });
    const result = bucket.check("test-ip");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  test("token bucket blocks when empty", () => {
    const { createTokenBucket } = require("../packages/security/tw/rate-limit");
    const bucket = createTokenBucket({ capacity: 2, refillRate: 0.1 });
    bucket.check("ip1");
    bucket.check("ip1");
    const result = bucket.check("ip1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test("sliding window counts requests", () => {
    const { createSlidingWindow } = require("../packages/security/tw/rate-limit");
    const limiter = createSlidingWindow({ maxRequests: 3, windowMs: 60000 });
    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(false);
  });

  test("fixed window resets at boundary", () => {
    const { createFixedWindow } = require("../packages/security/tw/rate-limit");
    const limiter = createFixedWindow({ maxRequests: 2, windowMs: 1000 });
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(false);
  });
});

describe("CSRF Token Manager", () => {
  test("generates and validates token", async () => {
    const { createCSRFManager } = require("../packages/security/tw/csrf");
    const manager = createCSRFManager({ secret: "test-secret" });
    const token = await manager.generate();
    expect(token.token).toBeDefined();
    expect(token.signedToken).toContain(".");
    const result = await manager.validate(token.signedToken, token.cookieValue);
    expect(result.valid).toBe(true);
  });

  test("rejects mismatched tokens", async () => {
    const { createCSRFManager } = require("../packages/security/tw/csrf");
    const manager = createCSRFManager({ secret: "test-secret" });
    const token1 = await manager.generate();
    const token2 = await manager.generate();
    const result = await manager.validate(token1.signedToken, token2.cookieValue);
    expect(result.valid).toBe(false);
  });
});

describe("HTML Sanitizer", () => {
  test("removes script tags", () => {
    const { createSanitizer } = require("../packages/security/tw/sanitize");
    const sanitizer = createSanitizer();
    const result = sanitizer.sanitize('<p>Hello</p><script>alert("xss")</script>');
    expect(result).toContain("Hello");
    expect(result).not.toContain("script");
  });

  test("removes event handlers", () => {
    const { createSanitizer } = require("../packages/security/tw/sanitize");
    const sanitizer = createSanitizer();
    const result = sanitizer.sanitize('<div onclick="alert(1)">text</div>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("text");
  });

  test("removes javascript: URLs", () => {
    const { createSanitizer } = require("../packages/security/tw/sanitize");
    const sanitizer = createSanitizer();
    const result = sanitizer.sanitize('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });

  test("preserves safe tags", () => {
    const { createSanitizer } = require("../packages/security/tw/sanitize");
    const sanitizer = createSanitizer();
    const result = sanitizer.sanitize('<p>Hello <strong>World</strong></p>');
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
  });
});

describe("URL Sanitizer", () => {
  test("blocks javascript: protocol", () => {
    const { createURLSanitizer } = require("../packages/security/tw/sanitize");
    const san = createURLSanitizer();
    expect(san.sanitize("javascript:alert(1)")).toBe("");
  });

  test("allows https URLs", () => {
    const { createURLSanitizer } = require("../packages/security/tw/sanitize");
    const san = createURLSanitizer();
    expect(san.sanitize("https://example.com")).toBe("https://example.com");
  });
});

describe("JWT Manager", () => {
  test("creates and verifies token", async () => {
    const { createJWTManager } = require("../packages/security/tw/auth");
    const jwt = createJWTManager({ secret: "test-secret", expiresIn: 60 });
    const token = await jwt.sign({ userId: "123" });
    expect(token.token.split(".")).toHaveLength(3);
    const result = await jwt.verify(token.token);
    expect(result.valid).toBe(true);
    expect(result.payload?.userId).toBe("123");
  });

  test("rejects tampered token", async () => {
    const { createJWTManager } = require("../packages/security/tw/auth");
    const jwt = createJWTManager({ secret: "test-secret" });
    const token = await jwt.sign({ userId: "123" });
    const tampered = token.token.slice(0, -5) + "XXXXX";
    const result = await jwt.verify(tampered);
    expect(result.valid).toBe(false);
  });

  test("rejects expired token", async () => {
    const { createJWTManager } = require("../packages/security/tw/auth");
    const jwt = createJWTManager({ secret: "test-secret", expiresIn: -1 });
    const token = await jwt.sign({ userId: "123" });
    const result = await jwt.verify(token.token);
    expect(result.valid).toBe(false);
  });
});

describe("Password Manager", () => {
  test("hashes and verifies password", async () => {
    const { createPasswordManager } = require("../packages/security/tw/auth");
    const pm = createPasswordManager();
    const hashed = await pm.hash("MyPassword123!");
    expect(hashed.hash).toBeDefined();
    expect(hashed.salt).toBeDefined();
    const valid = await pm.verify("MyPassword123!", hashed);
    expect(valid).toBe(true);
    const invalid = await pm.verify("WrongPassword", hashed);
    expect(invalid).toBe(false);
  });

  test("checks password strength", () => {
    const { createPasswordManager } = require("../packages/security/tw/auth");
    const pm = createPasswordManager();
    const weak = pm.checkStrength("abc");
    expect(weak.score).toBeLessThan(2);
    const strong = pm.checkStrength("MyVery$tr0ngP@ssw0rd!");
    expect(strong.score).toBeGreaterThanOrEqual(3);
  });
});

describe("RBAC", () => {
  test("checks permissions with inheritance", () => {
    const { createRBAC, perm } = require("../packages/security/tw/permissions");
    const rbac = createRBAC();
    rbac.addRole({ name: "admin", permissions: [perm("*", "*")] });
    rbac.addRole({
      name: "editor",
      permissions: [perm("posts", "*"), perm("comments", "*")],
      inherits: ["viewer"],
    });
    rbac.addRole({ name: "viewer", permissions: [perm("posts", "read")] });
    rbac.assignRoles("user1", "editor");
    expect(rbac.can("user1", "posts", "read").allowed).toBe(true);
    expect(rbac.can("user1", "posts", "write").allowed).toBe(true);
    expect(rbac.can("user1", "settings", "read").allowed).toBe(false);
    rbac.assignRoles("user2", "admin");
    expect(rbac.can("user2", "anything", "anything").allowed).toBe(true);
  });
});

describe("Schema Validator", () => {
  test("validates required fields", () => {
    const { createValidator } = require("../packages/security/tw/validation");
    const validator = createValidator({
      name: { type: "string", required: true, minLength: 2 },
      email: { type: "email", required: true },
      age: { type: "number", min: 0, max: 150 },
    });
    const result = validator.validate({ name: "John", email: "john@example.com", age: 30 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("catches missing required fields", () => {
    const { createValidator } = require("../packages/security/tw/validation");
    const validator = createValidator({ name: { type: "string", required: true } });
    const result = validator.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("REQUIRED");
  });
});

describe("Bot Detector", () => {
  test("detects Googlebot", () => {
    const { createBotDetector } = require("../packages/security/tw/bot-detection");
    const detector = createBotDetector();
    const result = detector.detect("Mozilla/5.0 (compatible; Googlebot/2.1)");
    expect(result.isBot).toBe(true);
    expect(result.botName).toBe("Googlebot");
  });

  test("detects curl", () => {
    const { createBotDetector } = require("../packages/security/tw/bot-detection");
    const detector = createBotDetector();
    const result = detector.detect("curl/7.68.0");
    expect(result.isBot).toBe(true);
    expect(result.botType).toBe("scraper");
  });

  test("does not flag regular browser", () => {
    const { createBotDetector } = require("../packages/security/tw/bot-detection");
    const detector = createBotDetector();
    const result = detector.detect("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0");
    expect(result.isBot).toBe(false);
  });
});

describe("Encryption", () => {
  test("hashes with SHA-256", async () => {
    const { Hashing } = require("../packages/security/tw/encryption");
    const hash = await Hashing.sha256("test");
    expect(hash).toHaveLength(64);
    const hash2 = await Hashing.sha256("test");
    expect(hash).toBe(hash2);
  });

  test("generates and verifies HMAC", async () => {
    const { Hashing } = require("../packages/security/tw/encryption");
    const hmac = await Hashing.hmac("secret", "message");
    expect(hmac).toBeDefined();
    const valid = await Hashing.verifyHmac("secret", "message", hmac);
    expect(valid).toBe(true);
    const invalid = await Hashing.verifyHmac("wrong", "message", hmac);
    expect(invalid).toBe(false);
  });
});
