# TW Framework — Guide: Authentication

This guide covers one thing completely: protecting pages and APIs with authentication — login/logout flows, JWT sessions and middleware rules.

---

## The Pieces

| Piece | Where | Document |
|-------|-------|----------|
| The gate | `middleware.twm` auth rule | [Middleware](./middleware.md) |
| Token issue/verify | `@tw/security` JWTManager | [Security](./security.md) |
| Password hashing | PasswordManager | [Security](./security.md) |
| The login form | a `.tw` page | this guide |
| Login/logout endpoints | `.twm` routes | [API Routes](./api-routes.md) |

---

## Step 1 — Protect the Private Area

```twm
// middleware.twm
rule "admin-auth" {
  match "/admin/**"
  auth {
    cookie "session"
    jwt_secret_env "JWT_SECRET"
  }
  response { status 401 text "Unauthorized" }
}
```

Every `/admin/...` request now requires a valid JWT in the `session` cookie. The secret comes from the environment — set `JWT_SECRET` in `.env` (and on the platform), never in code.

## Step 1b — Store Password Hashes Correctly

`passwords.hash()` returns an object — `{ salt, hash, iterations }` — not a string. Store the whole object; `verify()` needs all three fields and fails closed without them:

```twm
// home/api/auth/register/route.twm

fn post(request) {
  const body = request.body || {}

  const passwords = createPasswordManager()
  const hashed = await passwords.hash(body.password || "")   // { salt, hash, iterations }

  users.push({ id: nextId(), email: body.email, hash: hashed })
  return { status: 201, json: { ok: true } }
}
```

Storing just `hashed.hash` (a string) is the classic mistake — `verify()` then always answers false.

## Step 2 — The Login API

```twm
// home/api/auth/login/route.twm

fn post(request) {
  const body = request.body || {}
  const user = findUser(body.email || "")            // your user store

  const passwords = createPasswordManager()
  const ok = user ? await passwords.verify(body.password || "", user.hash) : false

  if (!ok) {
    return { status: 401, json: { error: "Invalid credentials" } }
  }
  const jwt = createJWTManager({ secret: process.env.JWT_SECRET })
  const token = await jwt.sign({ sub: user.id, role: user.role }, { expiresIn: 3600 })

  return {
    status: 200,
    json: { ok: true },
    headers: {
      "Set-Cookie": "session=" + token + "; HttpOnly; Path=/; SameSite=Strict; Max-Age=3600"
    }
  }
}
```

`PasswordManager.verify` fails closed — an unknown user and a wrong password return the same `401`, with no timing difference worth exploiting.

## Step 3 — The Login Page

```tw
page { title "Login" render ssr }

state { email = "" password = "" error = "" sending = false }

div.login {
  form on:submit.prevent "sending = true; fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(r => { if (r.ok) { location.href = '/admin' } else { return r.json().then(d => { error = d.error; sending = false }) } })" {
    input :value "email" { type "email" placeholder "Email" required }
    input :value "password" { type "password" placeholder "Password" required }
    button "Log in" { type "submit" }
  }
  if error { p.error "{error}" }
  if sending { p "Checking..." }
}
```

## Step 4 — Logout

```twm
// home/api/auth/logout/route.twm
fn post(request) {
  return {
    status: 200,
    json: { ok: true },
    headers: { "Set-Cookie": "session=; HttpOnly; Path=/; Max-Age=0" }
  }
}
```

## Verifying a Token Elsewhere

Inside any `.twm` route:

```twm
const result = await createJWTManager({ secret: process.env.JWT_SECRET }).verify(token)
if (result.valid) {
  const userId = result.payload.sub
}
```

## Checklist

```
□ JWT_SECRET set in the environment — long and random
□ Cookie flags: HttpOnly, SameSite=Strict, Secure (HTTPS)
□ Passwords stored only as PasswordManager hashes
□ Login rate-limited in middleware.twm
□ Logout clears the cookie
□ Same 401 for unknown user and wrong password
□ Private pages AND their APIs both gated
```

## Testing

```ts
test("login rejects a wrong password", async () => {
  const res = await testRoute(process.cwd(), "POST", "/api/auth/login", {
    body: { email: "admin@site.com", password: "wrong" }
  });
  expect(res.status).toBe(401);
});

test("admin page requires auth", async () => {
  const res = await testPage(process.cwd(), "/admin");
  expect([401, 403]).toContain(res.status);
});
```

## Related

- [Middleware](./middleware.md) · [Security](./security.md)
- [Forms](./guide-forms.md) — the full form workflow
- [API Routes](./api-routes.md)
