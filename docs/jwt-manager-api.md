# TW Framework — JWT Manager

This document covers one thing completely: `createJWTManager` from `@tw/security` — signing and verifying JSON Web Tokens. For the end-to-end auth flow, see doc 55.

---

## Creating the Manager

```twm
import { createJWTManager } from "@tw/security"

const jwt = createJWTManager({
  secret: process.env.JWT_SECRET,     // HMAC key (required)
})
```

## sign

```twm
const { token } = await jwt.sign({
  userId: "42",
  role: "admin",

  audience: "api",          // intended recipient (aud claim)
  subject: "user-42",       // sub claim
  issuer: "my-app",         // iss claim
  expiresIn: 3600,          // seconds until exp
  notBefore: 30,             // seconds until nbf
  keyId: "primary",          // kid header
})
```

The claims payload plus standard claims (`aud`, `sub`, `iss`, `iat`, `exp`, `nbf`, `jti`) are HMAC-signed and returned as a compact JWT string.

## verify

```twm
const result = await jwt.verify(token, {
  audience: "api",           // reject tokens not minted for this audience
  issuer: "my-app",
  subject: "user-42",
  clockTolerance: 0,          // seconds of clock skew allowed (default 0)
  ignoreExpiration: false,    // never enable for real auth
  ignoreNotBefore: false,
})

if (result.valid) {
  console.log(result.payload.userId, result.payload.role)
} else {
  console.log(result.reason)   // "Token expired", "Invalid audience", ...
}
```

`JWTVerifyResult` is `{ valid, payload, reason }` — the payload is `null` on failure and the reason names the check that failed.

## Verification Rules (Enforced)

| Rule | Behavior |
|------|----------|
| Missing `aud` vs required audience | **Rejected** — a token with no audience claim never passes an audience check |
| Signature compare | Constant-time, maximum-length loop — no byte-count leak |
| Encoding | Handles tokens larger than 8 KB correctly (chunked base64) |
| `exp` / `nbf` | Honored together with `clockTolerance`; skew never silently widens |

## Rotation and `kid`

```twm
const jwt = createJWTManager({ secret: newSecret })
```

Sign with a `keyId` so consumers can identify which secret minted a token during rotation. Verification fails closed during the rotation window — old tokens expire naturally rather than being accepted without validation.

## Pattern: Login and Guard

```twm
// login route
fn post(request) {
  const { email, password } = request.body.json
  const user = await authenticate(email, password)
  if (!user) return { status: 401, json: { ok: false, error: "invalid" } }
  const { token } = await jwt.sign({ userId: user.id, role: user.role }, { expiresIn: 900 })
  return { status: 200, json: { token } }
}

// guarded route
fn get(request) {
  const auth = request.headers.get("authorization") ?? ""
  const result = await jwt.verify(auth.replace(/^Bearer /, ""), { audience: "api" })
  if (!result.valid) return { status: 401, json: { ok: false, error: result.reason } }
  return { status: 200, json: { user: result.payload } }
}
```

Short `expiresIn` + refresh beats long-lived tokens; keep the secret out of version control and rotate it on any suspicion of leak.
