# TW Framework — CSRF Protection

This document covers one thing completely: `CSRFTokenManager` and `CSRFMiddleware` from `@tw/security` — signed double-submit tokens and request-level enforcement. For the config-level overview, see doc 113.

---

## The Token Manager

```twm
import { createCSRFManager } from "@tw/security"

const manager = createCSRFManager({
  secret: process.env.CSRF_SECRET,     // required — HMAC key
  tokenLength: 32,
  ttl: 3_600_000,
  cookieName: "_csrf",
  headerName: "x-csrf-token",
  fieldName: "_csrf",
  secure: true,
  httpOnly: false,       // must be readable by JS for double-submit
  sameSite: "Lax",
  rotateAfterUse: true,
  maxTokens: 10000,       // hard cap on stored tokens (oldest evicted)
})
```

### generate

```twm
const token = await manager.generate(sessionId?)   // bind to a session when you have one

// token.signedToken  -> "value.signature" — put in the page/meta
// token.cookieValue  -> same string — put in the Set-Cookie
// token.expiresAt   -> timestamp
```

### validate

```twm
const result = await manager.validate(headerToken, cookieToken, sessionId?)

// { valid: true }                  — passed
// { valid: true, rotated: token }  — passed; next token to hand out
// { valid: false, reason: "..." }  — rejected
```

Checks, in order: both tokens present and well-formed, double-submit match (header value === cookie value, constant-time), HMAC signature, expiry, single-use when `rotateAfterUse`, session binding. A token with NO `aud`-style weakness: the signature covers the value and the session id, so an attacker-controlled pair never validates.

### Storage Discipline

- `maxTokens` (default 10000) is a HARD cap — when the store is full of fresh tokens, the oldest entry is evicted, so token generation can never grow memory unboundedly.
- Expired tokens are pruned on generate; `revokeBySession` and `clear` exist for logout and tests.

## The Middleware

```twm
import { createCSRFMiddleware } from "@tw/security"

const csrf = createCSRFMiddleware({
  manager,
  exemptPaths: ["/api/webhooks"],       // Set | RegExp | (path) => boolean
  attachTokenHeader: true,
  attachTokenCookie: true,
  skipSameSite: true,          // same-ORIGIN requests may skip the token check
})
```

### process / protect

```twm
// Framework-style: returns an error Response or null
const rejection = await csrf.process(request)
if (rejection) return rejection

// Bun.serve-style: wraps your handler entirely
export default { fetch: csrf.protect(handler) }
```

`protect` validates mutating requests AND attaches fresh tokens to responses (cookie + header), so browser flows never run out.

### Same-Origin Skip Rules

With `skipSameSite: true`, requests whose `Origin`/`Referer` matches the `Host` skip the token requirement — but only when one of those headers is PRESENT. A client sending NEITHER header (curl, attack scripts) is treated as not same-origin and must present a valid token: the check fails closed.

## Client Wiring

```twm
const script = await csrf.getInitScript()   // sets window.__CSRF_TOKEN__/__CSRF_HEADER__
const meta = await csrf.getMetaTag()        // <meta name="csrf-token" content="...">
```

```twm
await fetch("/api/transfer", {
  method: "POST",
  headers: { [window.__CSRF_HEADER__]: window.__CSRF_TOKEN__ },
  body: JSON.stringify(payload),
})
```

## Choosing a Shape

| Need | Use |
|------|-----|
| Managed everything | `csrf.protect(handler)` |
| Custom pipeline | `await csrf.process(request)` |
| Just mint/verify tokens | `createCSRFManager` |
