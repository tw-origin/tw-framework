# TW Framework — Route and Page Testing

This document covers one thing completely: `testRoute` and `testPage` from `@tw/server` — invoking routes and pages directly, without starting a server. For the full testing setup, see doc 39.

---

## testRoute

Executes an API route handler in-process against your real app files:

```twm
import { testRoute } from "@tw/server/testing"

const res = await testRoute(
  process.cwd(),          // rootDir — where home/api lives
  "POST",                 // method
  "/api/users",           // pathname (matches your route file layout)
  {
    body: { name: "Asha" },
    headers: { "content-type": "application/json" },
    query: { invite: "true" },
  },
)

res.status     // 201
res.json       // parsed response body
res.headers    // response headers, when present
```

Behavior:

- The route file is resolved the same way the server resolves it — dynamic segments (`/api/users/:id`), catch-all routes, and route groups all work.
- `init.query` becomes the query string; `init.headers` are the request headers.
- Unknown paths resolve to `{ status: 404, json: { ok: false, error: "route not found: ..." } }` instead of throwing — assert on `status` directly.

## testPage

Renders a page to its HTML without a server:

```twm
import { testPage } from "@tw/server/testing"

const page = await testPage(
  process.cwd(),          // rootDir
  "/dashboard",           // pathname to render
)

page.status    // 200 (404 when no page matches)
page.html      // the rendered HTML string
```

`testPage` walks the same directory layout the build uses (including layout chains), so the returned `html` is what a client would receive.

## Writing Assertions

```twm
import { describe, test, expect } from "bun:test"
import { testRoute } from "@tw/server/testing"

describe("orders API", () => {
  test("creates an order", async () => {
    const res = await testRoute(process.cwd(), "POST", "/api/orders", {
      body: { sku: "TW-MUG", qty: 2 },
      headers: { "content-type": "application/json" },
    })
    expect(res.status).toBe(201)
    expect(res.json.ok).toBe(true)
    expect(res.json.order.sku).toBe("TW-MUG")
  })

  test("rejects a missing sku", async () => {
    const res = await testRoute(process.cwd(), "POST", "/api/orders", {
      body: { qty: 2 },
      headers: { "content-type": "application/json" },
    })
    expect(res.status).toBe(400)
  })
})
```

## Page Assertions

```twm
test("dashboard renders the heading", async () => {
  const { status, html } = await testPage(process.cwd(), "/dashboard")
  expect(status).toBe(200)
  expect(html).toContain("<h1")
})
```

## Why Not HTTP

`testRoute`/`testPage` skip sockets entirely — no port binding, no server startup, no flaky restarts — while still running your actual handler code and file layout. They are the fastest layer of the testing pyramid; use the browser E2E suite (doc 162) for the full round trip.
