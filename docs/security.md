# TW Framework — Security

This document covers one thing completely: the security layer — what the framework protects by default, and the `@tw/security` primitives you use to build authentication, validation and hardening into your app.

---

## Three Layers of Protection

| Layer | What it is | Where |
|-------|-----------|-------|
| **Server guarantees** | always on — source blocklist, traversal rejection, URL normalization | `tw serve` (see [Server Features](./server-features.md)) |
| **Middleware rules** | declarative — auth, rate limit, CORS, bots | `middleware.twm` (see [Middleware](./middleware.md)) |
| **Security package** | programmatic — JWT, passwords, CSRF, sessions, validation | `@tw/security` |

---

## Server Guarantees (Always On)

- Server-side source files (`.twm`, `.ts`, `.tsx`, `.env`) and dotfiles answer `404` — their contents are never served
- Path traversal (`/../`, encoded variants) and null bytes are rejected
- Request URLs are normalized before matching, so `//admin` cannot slip past a middleware pattern
- Error responses are generic — `500` pages never leak stack traces or internal details to the client

These are part of the runtime, not configuration.

---

## Declarative Protection — middleware.twm

Auth, rate limiting, origin checks and bot filtering live in `middleware.twm`:

```twm
rule "admin-auth" {
  match "/admin/**"
  auth { cookie "admin_token" jwt_secret_env "JWT_SECRET" }
  response { status 401 text "Unauthorized" }
}

rule "api-rate" {
  match "/api/**"
  rate_limit { requests 100 window 60 identity "ip" }
  response { status 429 json { error "Slow down" } }
}
```

Full rule reference in [Middleware](./middleware.md).

---

## The Security Package — @tw/security

For authentication flows and input handling in `.twm` routes and `lib/` code:

```ts
import {
  JWTManager, createJWTManager,
  PasswordManager, createPasswordManager,
  SessionManager, createSessionManager,
  CSRFProtection, createCSRFProtection,
  RateLimiter,
  XSSSanitizer, InputValidator,
  SQLInjectionDetector,
  SecureCookieManager,
  SecurityHeaders, CSPBuilder,
  AuditLogger,
} from "@tw/security";
```

---

## JWT — JWTManager

Signed tokens for authentication. HMAC-SHA256 signing with constant-time verification:

```ts
import { createJWTManager } from "@tw/security";

const jwt = createJWTManager({ secret: process.env.JWT_SECRET! });

// issue
const token = await jwt.sign({ sub: "user-42", role: "admin" }, { expiresIn: 3600 });

// verify — checks signature, expiry and subject
const result = await jwt.verify(token);
if (result.valid) {
  console.log(result.payload.sub);   // "user-42"
}
```

Rules that keep tokens safe:

- The secret comes from the environment (`JWT_SECRET`), never from code
- Verification is constant-time — tokens are compared without timing leaks
- Expiry and subject are verified as part of `verify`

Pair with middleware:

```twm
rule "admin" {
  match "/admin/**"
  auth { cookie "admin_token" jwt_secret_env "JWT_SECRET" }
  response { status 401 text "Unauthorized" }
}
```

---

## Passwords — PasswordManager

Hashing and strength checking:

```ts
import { createPasswordManager } from "@tw/security";

const passwords = createPasswordManager({ minLength: 10 });

const hash = await passwords.hash("correct horse battery staple");
const ok = await passwords.verify("correct horse battery staple", hash);   // true
const strength = await passwords.checkStrength("qwerty");                 // weak
```

`verify` fails closed — a malformed hash or missing data rejects the login instead of throwing the door open.

---

## Sessions — SessionManager

```ts
import { createSessionManager } from "@tw/security";

const sessions = createSessionManager({ ttl: 3600 });

await sessions.create("session-id", { userId: 42, role: "admin" });
const data = await sessions.get("session-id");
await sessions.destroy("session-id");
```

An in-memory session store ships with the package; bring your own store for multi-instance deployments.

---

## CSRF — CSRFProtection

Stateless signed tokens for form protection:

```ts
import { createCSRFProtection } from "@tw/security";

const csrf = createCSRFProtection({ secret: process.env.CSRF_SECRET! });

const token = csrf.generate();
if (!csrf.verify(token, request.headers["x-csrf-token"])) {
  return { status: 403, json: { error: "CSRF token mismatch" } };
}
```

Verification uses a real HMAC check — unsigned or tampered tokens are rejected.

---

## Input Validation and Sanitization

```ts
import { InputValidator, XSSSanitizer, SQLInjectionDetector } from "@tw/security";

// validate and normalize input shapes
const email = InputValidator.email(userInput);

// sanitize anything rendered back into HTML
const safe = XSSSanitizer.clean(userComment);

// inspect suspicious SQL-shaped strings before passing them anywhere
const suspicious = SQLInjectionDetector.scan(searchQuery);
```

The SQL detector recognizes tautology patterns (`' OR '1'='1`), quoted injection shapes and comment tricks — use it to reject or log hostile input early.

---

## Headers and CSP

`tw serve` applies a standard set of security headers to every response automatically (HSTS, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`). `tw dev` applies a relaxed development set instead. Control this in `tw.config.ts`:

```ts
export default {
  security: {
    headers: "standard", // "strict" | "dev" | "off"
  },
};
```

For route-specific control, build the headers yourself:

```ts
import { SecurityHeaders, CSPPolicyBuilder } from "@tw/security";

const headers = new SecurityHeaders({
  hstsMaxAge: 31536000,
  hstsIncludeSubdomains: true,
  contentTypeOptions: true,
  frameOptions: "DENY",
});

const csp = new CSPPolicyBuilder()
  .setDirective("default-src", ["'self'"])
  .setDirective("script-src", ["'self'"])
  .setDirective("style-src", ["'self'"]);
const cspHeader = csp.generateHeader();
```

Apply in `.twm` routes via the `headers` field of the response, or at the proxy.

---

## Auditing

```ts
import { createAuditLogger } from "@tw/security";

const audit = createAuditLogger({ destinations: [console] });
audit.log({ event: "login.failed", userId, ip, at: new Date().toISOString() });
```

---

## Checklist — Shipping an App

```
□ JWT_SECRET (and CSRF secret) set in the environment — never in code
□ /admin/** (and every private area) behind an auth rule
□ /api/** rate-limited
□ Login and password-change flows use PasswordManager hashing
□ State-changing endpoints verify CSRF tokens
□ User input validated (InputValidator) and sanitized (XSSSanitizer) before storage/render
□ Secrets not importable from pages — server-only code stays in lib/ and .twm (TW1007)
□ .env in .gitignore
□ Production serves through tw serve or an adapter (source blocklist active)
```

---

## Quick Reference

```ts
createJWTManager({ secret })      // sign / verify tokens
createPasswordManager({ })        // hash / verify / strength
createSessionManager({ ttl })     // sessions
createCSRFProtection({ secret })  // generate / verify
InputValidator / XSSSanitizer / SQLInjectionDetector
SecurityHeaders / CSPBuilder
createAuditLogger({ })
```

## Related

- [Middleware](./middleware.md)
- [Server Features](./server-features.md)
- [API Routes](./api-routes.md)
- [Client Modules](./client-modules.md) — the server boundary
