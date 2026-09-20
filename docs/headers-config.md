# TW Framework — Custom Response Headers

This document covers one thing completely: `headers` in `tw.config.ts` — both accepted forms, path matching, and value hygiene. For security headers (`security.headers`), see docs/security.md and docs/security-headers-api.md.

---

## Both Forms

Object form (path → headers):

```twm
export default {
  headers: {
    "/assets/**": {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    "/downloads/**": {
      "Content-Disposition": "attachment",
    },
  },
}
```

Array form:

```twm
export default {
  headers: [
    { source: "/assets/**", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
    { source: "/downloads/**", headers: { "Content-Disposition": "attachment" } },
  ],
}
```

Both normalize to the same internal list — `{ source, headers }` entries.

## Source Patterns

`source` matches the request pathname:

| Pattern | Matches |
|---------|---------|
| `/exact/path` | That path only |
| `/assets/**` | Everything under `/assets/` |
| `/assets/*` | One path segment under `/assets/` |

Longer (more specific) sources take precedence when several match.

## Where Headers Apply

Headers are stamped on responses for matching paths in both `tw dev` and `tw serve` — including static files from `public/`, API routes, and rendered pages.

## Value Hygiene (Automatic)

Header values pass through a sanitizer that strips any carriage return / newline characters. A value containing `\r` or `\n` cannot smuggle a second header onto the response — the CRLF is removed before the header is applied, on every platform. Values are also coerced to strings, so numeric config values work.

## Typical Uses

```twm
export default {
  headers: {
    // Fingerprinted build output: cache forever
    "/_tw/**": { "Cache-Control": "public, max-age=31536000, immutable" },

    // Never cache API responses by accident
    "/api/**": { "Cache-Control": "no-store" },

    // Downloads
    "/files/**": { "Content-Disposition": "attachment" },

    // Cross-origin isolation for advanced features
    "/**": {
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
}
```

## Interaction with Security Headers

`headers` and `security.headers` compose: security headers set their own keys (`X-Frame-Options`, CSP, and friends), and your `headers` entries apply on top for the matched paths. When both set the SAME key, the more specific `headers` entry wins for that path — useful to loosen one strict security header for a specific embed route without touching global policy.

## Verified Behavior

```bash
$ curl -s -D - -o /dev/null http://localhost:3000/assets/app.js | grep -i cache-control
Cache-Control: public, max-age=31536000, immutable
```
