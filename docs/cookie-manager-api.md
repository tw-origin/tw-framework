# TW Framework — Secure Cookie Manager

This document covers one thing completely: `SecureCookieManager` from `@tw/security` — HMAC-signed cookies: signing, verification, parsing, and building Set-Cookie strings. For reading request cookies, see doc 74.

---

## Creating the Manager

```twm
import { createCookieManager } from "@tw/security"

const cookies = createCookieManager({
  secret: process.env.COOKIE_SECRET,     // required — HMAC key
  defaultPath: "/",
  defaultDomain: undefined,
  defaultSecure: true,
  defaultHttpOnly: true,
  defaultSameSite: "Lax",
  signByDefault: true,          // sign() AND verify-on-get unless told otherwise
})
```

## sign

```twm
const setCookieValue = await cookies.sign("session", "uid-42")

// "session=uid-42.<hmac>" plus attributes:
// Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=...
```

`sign(name, value, options?)` returns a COMPLETE Set-Cookie string. The signature is an HMAC over the value, appended after a dot. Per-call options override the manager defaults (`maxAge`, `path`, `domain`, `secure`, `httpOnly`, `sameSite`).

## verify

```twm
const value = await cookies.verify("uid-42.9f8a...")   // "uid-42"
const bad = await cookies.verify("tampered.sig")       // null
const unsigned = await cookies.verify("no-signature")   // null
```

Verification recomputes the HMAC in constant time; any mismatch (or a value without a `.`) yields `null` — never a partially trusted value.

## get

```twm
const value = await cookies.get(request, "session")
```

`get(req, name, verify = true)` reads the cookie header and — by default — returns the VERIFIED value only. The `verify` argument alone decides: an explicit `true` always verifies regardless of the manager's `signByDefault` setting, `false` returns the raw stored value (signed string included).

## parse / build

```twm
const jar = cookies.parse("a=1; b=2; c=3=x")   // { a: "1", b: "2", c: "3=x" }
const setCookie = cookies.build({ name: "theme", value: "dark", path: "/", maxAge: 3600 })
```

`parse` handles quoted values and `=` inside values. `build(options)` produces an attribute-complete Set-Cookie string without signing.

## Verification Rules

| Rule | Why |
|------|-----|
| The HMAC covers the value only | Names are not secret; values are what attackers forge |
| Unsigned values return `null` from `verify` | No signature, no trust |
| `get` with default `verify: true` | Reading a signed cookie without checking would be a security hole |

## Pattern: Signed Preference Cookies

```twm
// write
const cookie = await cookies.sign("prefs", JSON.stringify({ theme: "dark" }), { httpOnly: false })
return new Response(page, { headers: { "Set-Cookie": cookie } })

// read
const raw = await cookies.get(request, "prefs")     // verified JSON string
const prefs = raw ? JSON.parse(raw) : { theme: "light" }
```

The secret must be long, random, and stable across restarts — rotating it invalidates every issued cookie at once.
