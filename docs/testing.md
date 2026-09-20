# TW Framework — Testing

This document covers one thing completely: `tw test` — writing and running route and page tests for a TW project.

---

## Running Tests

```bash
tw test
```

Collects `tests/**/*.test.ts` (plus root-level `*.test.ts`), runs them with the Bun test runner, and prints a pass/fail summary. The same command runs on Node — the CLI transpiles and executes the suite with a compatible runner, so `tw test` works in CI environments with or without Bun installed.

Test setup mirrors production: `.env` is loaded before the run.

---

## Writing a Test File

```ts
// tests/api.test.ts
import { test, expect } from "bun:test";
import { testRoute, testPage } from "@tw/server/tw/testing";

test("GET /api/health returns ok", async () => {
  const res = await testRoute(process.cwd(), "GET", "/api/health");
  expect(res.status).toBe(200);
});

test("POST /api/users creates a user", async () => {
  const res = await testRoute(process.cwd(), "POST", "/api/users", {
    body: { name: "Aarav" },
  });
  expect(res.status).toBe(201);
  expect(res.json.ok).toBe(true);
});
```

The import `@tw/server/tw/testing` works out of the box in the project; `tw test` ensures the testing helpers resolve.

---

## testRoute — In-Process API Testing

```ts
const res = await testRoute(rootDir, method, pathname, init?);
```

| Parameter | Meaning |
|-----------|---------|
| `rootDir` | the project root (use `process.cwd()`) |
| `method` | `"GET"`, `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"` |
| `pathname` | the route path, e.g. `"/api/users/7"` |
| `init.body` | request body — objects are JSON-serialized |
| `init.headers` | request headers |
| `init.query` | query parameters, e.g. `{ page: "2" }` |

Returns `{ status, json, headers }`:

```ts
test("GET /api/products returns paginated list", async () => {
  const res = await testRoute(process.cwd(), "GET", "/api/products", {
    query: { page: "1", limit: "20" },
  });
  expect(res.status).toBe(200);
  expect(res.json.items.length).toBe(20);
});
```

No server process is started — handlers execute in-process, with route params resolved exactly as the real router resolves them (`[id]` segments, catch-alls).

---

## testPage — In-Process Page Rendering

```ts
const res = await testPage(rootDir, pathname);
```

Renders a page **with its layout chain**, in-process:

```ts
test("/ renders the home page", async () => {
  const res = await testPage(process.cwd(), "/");
  expect(res.status).toBe(200);
  expect(res.html).toContain("<h1");
});

test("/about renders inside the root layout", async () => {
  const res = await testPage(process.cwd(), "/about");
  expect(res.html).toContain("site-header");   // from home/layout.tw
});
```

Returns `{ status, html }` — the complete compiled document, ready for assertions on markup, meta tags and layout wrapping.

Dynamic routes resolve the same way:

```ts
test("/blog/[slug] renders the post page", async () => {
  const res = await testPage(process.cwd(), "/blog/hello-world");
  expect(res.status).toBe(200);
});
```

---

## Organizing a Suite

```text
my-app/
├── home/
│   ├── page.tw
│   ├── about/page.tw
│   └── api/
│       ├── health/route.twm
│       └── users/[id]/route.twm
└── tests/
    ├── api.test.ts          ← .twm route tests
    ├── pages.test.ts        ← page rendering tests
    └── helpers.ts           ← shared fixtures (not *.test.ts, not collected)
```

Every `*.test.ts` file under `tests/` is collected recursively; helper files without the `.test.ts` suffix are not.

---

## Testing Patterns

### Guard an authenticated route

```ts
test("GET /api/admin/users requires auth", async () => {
  const res = await testRoute(process.cwd(), "GET", "/api/admin/users");
  expect([401, 403]).toContain(res.status);
});
```

### Validate input handling

```ts
test("POST /api/users rejects a missing name", async () => {
  const res = await testRoute(process.cwd(), "POST", "/api/users", { body: {} });
  expect(res.status).toBe(400);
  expect(res.json.error).toBeDefined();
});

test("POST /api/users accepts a valid name", async () => {
  const res = await testRoute(process.cwd(), "POST", "/api/users", {
    body: { name: "Sara" },
  });
  expect(res.status).toBe(201);
});
```

### Send headers

```ts
test("API honours the client token header", async () => {
  const res = await testRoute(process.cwd(), "GET", "/api/me", {
    headers: { authorization: "Bearer test-token" },
  });
  expect(res.status).toBe(200);
});
```

### Assert on rendered markup

```ts
test("the pricing page lists all plans", async () => {
  const res = await testPage(process.cwd(), "/pricing");
  expect(res.html).toContain("starter");
  expect(res.html).toContain("pro");
  expect(res.html).toContain("enterprise");
});
```

---

## CI

```yaml
# .github/workflows/test.yml
- run: bun install
- run: tw test
```

On Node-only runners the same `tw test` command runs the suite through the Node runner.

---

## What the Helpers Cover

| Helper | Exercises |
|--------|-----------|
| `testRoute` | `.twm` handlers — params, query, body, headers, status, JSON |
| `testPage` | the render pipeline — page + layout chain + full HTML |

Middleware rules are a server-startup concern — verify them against a running server (`tw serve` + an HTTP check) or keep their logic in `.twm` routes you can drive with `testRoute`.

---

## Quick Reference

```bash
tw test                       # run the suite
```

```ts
import { test, expect } from "bun:test";
import { testRoute, testPage } from "@tw/server/tw/testing";

const res = await testRoute(process.cwd(), "GET", "/api/x", { query: { a: "1" } });
const page = await testPage(process.cwd(), "/about");
```

## Related

- [API Routes](./api-routes.md)
- [Commands Reference](./commands-reference.md)
- [Setup Guide](./setup-guide.md)
