# TW Framework — Cookies

This document covers one thing completely: reading and setting cookies from route handlers, and declaring cookie requirements in middleware rules.

---

## Reading Cookies

Cookies arrive in the `Cookie` request header. Parse them in the handler:

```twm
fn get(request) {
  const raw = request.headers["cookie"] ?? ""
  const jar = {}
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=")
    if (idx === -1) continue
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    jar[name] = decodeURIComponent(value)
  }

  const session = jar["session"] ?? null
  return { status: 200, json: { session: session } }
}
```

## Setting Cookies

Return a `Set-Cookie` header in the response headers:

```twm
fn post(request) {
  const token = "s" + Date.now()

  return {
    status: 200,
    json: { ok: true },
    headers: {
      "Set-Cookie": "session=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800"
    }
  }
}
```

Cookie attributes worth setting by default:

| Attribute | Purpose |
|-----------|---------|
| `HttpOnly` | keeps the cookie out of `document.cookie` in the browser |
| `SameSite=Lax` | the cookie is not sent on cross-site POSTs |
| `Secure` | the cookie is only sent over HTTPS |
| `Path=/` | the cookie applies to the whole site |
| `Max-Age` | lifetime in seconds |

## Clearing a Cookie

Set the same name with an empty value and `Max-Age=0`:

```twm
fn post(request) {
  return {
    status: 200,
    json: { ok: true },
    headers: { "Set-Cookie": "session=; Path=/; HttpOnly; Max-Age=0" }
  }
}
```

## Requiring a Cookie in Middleware

The `auth` condition of `middleware.twm` verifies a JWT cookie before the route runs:

```twm
rule "admin" {
  match "/admin/**"
  auth { cookie "session", jwt_secret_env "JWT_SECRET" }
  response { status 401, json { error "Login required" } }
}
```

| Field | Meaning |
|-------|---------|
| `cookie` | the cookie holding the JWT (default `token`) |
| `jwt_secret_env` | environment variable holding the HS256 signing secret |

The token is verified with HS256 against that secret. A request without the cookie, or with a token that fails verification, gets the rule's response. Sign tokens with the same secret — see the [Auth Guide](./guide-auth.md). Note: without `jwt_secret_env` there is no secret to verify against, so every request is blocked.

## Related

- [Middleware](./middleware.md)
- [Rate Limiting](./rate-limiting.md)
