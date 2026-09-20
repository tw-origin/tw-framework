# TW Framework — Security Headers API

This document covers one thing completely: `generateSecurityHeaders`, `securityHeadersMiddleware`, the CSP builders, and nonce generation from `@tw/server`. For nonce-per-response wiring see doc 112.

---

## generateSecurityHeaders

```twm
import { generateSecurityHeaders } from "@tw/server"

const headers = generateSecurityHeaders({
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
    objectSrc: [],
    frameAncestors: ["'self'"],
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameOptions: "DENY",
  contentTypeOptions: true,
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: { camera: [], geolocation: ["self"] },
  coep: "require-corp",
  coop: "same-origin",
  corp: "same-origin",
  dnsPrefetchControl: true,
})

// headers: { "Content-Security-Policy": "...", "Strict-Transport-Security": "...", ... }
```

| Option | Produces |
|--------|----------|
| `csp` | `Content-Security-Policy` |
| `hsts` | `Strict-Transport-Security` |
| `frameOptions` | `X-Frame-Options` (or `false` to omit) |
| `contentTypeOptions` | `X-Content-Type-Options: nosniff` |
| `referrerPolicy` | `Referrer-Policy` |
| `permissionsPolicy` | `Permissions-Policy` |
| `coep` / `coop` / `corp` | Cross-Origin Embedder/Opener/Resource Policy |
| `dnsPrefetchControl` | `X-DNS-Prefetch-Control` |

## securityHeadersMiddleware

```twm
import { securityHeadersMiddleware } from "@tw/server"

const mw = securityHeadersMiddleware({ frameOptions: "DENY", contentTypeOptions: true })
// ctx-style middleware: runs, sets ctx.headers, calls next()
```

One call applies the generated headers to every response passing through.

## CSP Builders

```twm
import { buildCSPHeader, generateNonce, generateNonceForCSP, createDevCSP, createProdCSP } from "@tw/server"

buildCSPHeader({ defaultSrc: ["'self'"], scriptSrc: ["'self'", "'nonce-{PLACEHOLDER}'"] })
// "default-src 'self'; script-src 'self' 'nonce-...'"

generateNonce()                     // 32-char random nonce string
generateNonceForCSP(csp)            // { nonce, csp } — nonce injected into script-src

createDevCSP()                      // relaxed: unsafe-inline for hot reload
createProdCSP()                      // strict baseline
```

## HSTS Builder

```twm
import { buildHSTSHeader } from "@tw/server"

buildHSTSHeader({ maxAge: 31536000, includeSubDomains: true, preload: true })
// "max-age=31536000; includeSubDomains; preload"
```

## Permissions-Policy Builder

```twm
import { buildPermissionsPolicyHeader } from "@tw/server"

buildPermissionsPolicyHeader({ camera: [], geolocation: ["self"] })
// "camera=(), geolocation=(self)"
```

## Directive Value Rules

CSP directive values are joined with spaces — write source expressions exactly as the spec wants them: `'self'`, `'none'` (with quotes), `https:`, scheme-less hostnames. An empty array emits just the directive name (`objectSrc: []` → `object-src`), which CSP reads as deny-none.

## Order of Operations

A production page typically composes three pieces: `generateSecurityHeaders` for static policy, `generateNonceForCSP` when inline scripts exist, and `securityHeadersMiddleware` to stamp both on every response. Nonce-based script CSPs require a FRESH nonce per response — never reuse one across requests.
