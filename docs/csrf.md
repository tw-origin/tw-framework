# TW Framework — CSRF

This document covers one thing completely: the CSRF token manager — generating per-session tokens and rejecting state-changing requests without one.

---

## The Manager

```twm
import { CSRFTokenManager } from "@tw/security"

const csrf = new CSRFTokenManager({
  secret: process.env.CSRF_SECRET,
  tokenLength: 32,
  ttl: 60 * 60 * 1000,       // one hour
  cookieName: "csrf",
  headerName: "x-csrf-token",
  fieldName: "csrf",
  secure: true,               // cookie over HTTPS only
  httpOnly: true,
  sameSite: "Strict",
  rotateAfterUse: true
})
```

## Issuing a Token

```twm
const token = await csrf.generate(sessionId)
```

A token binds to the session and expires with its TTL. The manager can also set it as a cookie (`cookieName`) and accept it back from a header (`headerName`) or a form field (`fieldName`).

## Validating

```twm
const ok = await csrf.validate(token, sessionId)
if (!ok) {
  return { status: 403, json: { ok: false, error: "Invalid CSRF token" } }
}
```

With `rotateAfterUse: true`, a token consumed by one request is not accepted again — each form gets a fresh token.

## Where to Check

| Request | Check |
|---------|-------|
| `POST` / `PUT` / `PATCH` / `DELETE` to the app | token must validate |
| `GET`, `HEAD` | no token needed — no state change |

## How It Stops the Attack

A cross-site page can make the browser send a request with cookies, but it cannot read your page's token (it sits on your origin) and so cannot echo it back. A missing or stale token means the request is not from your page — reject it.

## Related

- [Cookies](./cookies.md)
- [Security](./security.md)
