# TW Framework — API Routes

This document covers one thing completely: `.twm` route modules — writing server-side API endpoints, reading requests, returning responses, and calling server libraries.

---

## Where Routes Live

`.twm` files in `home/api/` map to URLs:

```text
home/api/route.twm              → /api
home/api/users/route.twm        → /api/users
home/api/users/[id]/route.twm   → /api/users/:id
```

The filename is always `route.twm` (or `index.twm`); the directory decides the path.

---

## The Handler Form

A route exports one `fn` per HTTP method it handles:

```twm
// home/api/users/route.twm

fn get(request) {
  const users = [
    { id: 1, name: "Aarav" },
    { id: 2, name: "Sara" }
  ]
  return { status: 200, json: { data: users } }
}

fn post(request) {
  const body = request.body || {}
  if (!body.name) {
    return { status: 400, json: { error: "Name required" } }
  }
  return { status: 201, json: { ok: true, data: { id: 99, ...body } } }
}
```

Only the methods you define are served — a `GET` to a route with only `fn post` returns `405 Method not allowed`. Supported handlers: `fn get`, `fn post`, `fn put`, `fn patch`, `fn delete` (a `HEAD` request falls back to `fn get`).

---

## The Request Object

| Field | Type | Contents |
|-------|------|----------|
| `request.method` | string | `"GET"`, `"POST"`, ... |
| `request.url` | string | full URL of the request |
| `request.params` | object | route parameters — `{ id: "7" }` for `/api/users/7` |
| `request.query` | object | parsed query string — `/api/users?page=2` → `{ page: "2" }` |
| `request.body` | any | parsed JSON body (POST/PUT/PATCH) |
| `request.headers` | object | request headers |

```twm
// home/api/users/[id]/route.twm

fn get(request) {
  const id = request.params.id          // from the URL
  const fields = request.query?.fields  // from ?fields=...
  return { status: 200, json: { id, fields } }
}
```

```twm
// home/api/search/route.twm

fn get(request) {
  const q = request.query?.q
  if (!q) {
    return { status: 400, json: { error: "Missing ?q=" } }
  }
  return { status: 200, json: { results: search(q) } }
}
```

---

## The Response Object

Every handler returns a plain object:

| Field | Purpose |
|-------|---------|
| `status` | HTTP status code (default 200) |
| `json` | body serialized as JSON |
| `headers` | optional extra headers |

```twm
fn get(request) {
  return {
    status: 200,
    json: { ok: true, data: [1, 2, 3] },
    headers: { "Cache-Control": "no-store" }
  }
}
```

---

## Helper Functions

Anything else in the file is ordinary server code — define helpers and call them from handlers:

```twm
fn validateEmail(email) {
  return email.includes("@") && email.includes(".")
}

fn get(request) {
  const email = request.query?.email
  if (!email || !validateEmail(email)) {
    return { status: 400, json: { error: "Invalid email" } }
  }
  return { status: 200, json: { ok: true, email } }
}
```

---

## Using Node Modules and the Filesystem

Server routes run on the server — full access to Node/Bun modules:

```twm
fn post(request) {
  const fs = require("fs")
  const path = require("path")

  const dataPath = path.join(process.cwd(), "data", "users.json")
  const users = JSON.parse(fs.readFileSync(dataPath, "utf8"))

  return { status: 200, json: { data: users } }
}
```

npm packages installed for the server (database clients, validators, mailers) are imported the same way. Server-only code belongs here and in `lib/` — never in `.tw` pages (TW1007).

---

## Environment Variables

Read secrets from the environment, never hardcode them:

```twm
fn post(request) {
  const token = process.env.PAYMENT_API_KEY
  if (!token) {
    return { status: 500, json: { error: "Server misconfigured" } }
  }
  // ... use token
}
```

`tw dev` and `tw serve` load `.env` from the project root at startup.

---

## Patterns

### Create + return the new record

```twm
// home/api/todos/route.twm

fn post(request) {
  const body = request.body || {}
  if (!body.text) {
    return { status: 400, json: { error: "text required" } }
  }
  const todo = { id: Date.now(), text: body.text, done: false }
  return { status: 201, json: { data: todo } }
}
```

### Simulated latency for loading states

```twm
fn get(request) {
  const wait = (ms) => { const t = Date.now(); while (Date.now() - t < ms) {} }
  wait(300)
  return { status: 200, json: { data: [] } }
}
```

### Full CRUD resource

```text
home/api/products/
├── route.twm            → GET (list), POST (create)
└── [id]/
    └── route.twm        → GET (one), PUT (update), DELETE
```

```twm
// home/api/products/[id]/route.twm

fn get(request) {
  return { status: 200, json: { data: find(request.params.id) } }
}

fn put(request) {
  const updated = update(request.params.id, request.body)
  if (!updated) {
    return { status: 404, json: { error: "Not found" } }
  }
  return { status: 200, json: { data: updated } }
}

fn delete(request) {
  const ok = remove(request.params.id)
  return ok
    ? { status: 200, json: { ok: true } }
    : { status: 404, json: { error: "Not found" } }
}
```

---

## Guarding Routes

`middleware.twm` runs before every request — auth, rate limits and CORS belong there, not repeated in each handler. See [Middleware](./middleware.md):

```twm
// middleware.twm
rule "admin-api" {
  match "/api/admin/**"
  auth {
    cookie "admin_token"
    jwt_secret_env "JWT_SECRET"
  }
  response { status 401 json { error "Unauthorized" } }
}
```

---

## Calling APIs From Pages

Client-side handlers fetch API routes like any other URL:

```tw
state { items = [] loading = true }

div {
  button on:click "fetch('/api/todos').then(r => r.json()).then(d => { items = d.data; loading = false })" {
    "Load todos"
  }
  if loading { p "Loading..." } else {
    for t in {items} { li "{t.text}" }
  }
}
```

---

## Testing API Routes

In-process, no server needed:

```ts
import { test, expect } from "bun:test";
import { testRoute } from "@tw/server/tw/testing";

test("GET /api/users returns 200", async () => {
  const res = await testRoute(process.cwd(), "GET", "/api/users");
  expect(res.status).toBe(200);
});
```

See [Testing](./testing.md).

---

## Quick Reference

```twm
// home/api/<path>/route.twm
fn get(request)     { return { status: 200, json: {...} } }
fn post(request)    { return { status: 201, json: {...} } }
fn put(request)     { return { status: 200, json: {...} } }
fn delete(request)   { return { status: 200, json: { ok: true } } }

request.params / .query / .body / .headers / .method
```

## Related

- [Middleware](./middleware.md)
- [Server Features](./server-features.md)
- [Client Modules](./client-modules.md) — the server boundary
- [Testing](./testing.md)
