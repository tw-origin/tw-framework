# TW Framework — Guide: Testing and CI

This guide covers one thing completely: an automated quality gate — a test suite in `tests/`, run on every push with GitHub Actions.

---

## The Suite

`tw test` collects `tests/**/*.test.ts` and runs them (Bun natively, or the Node runner when Bun is absent). Write tests against the two in-process helpers:

```ts
// tests/api.test.ts
import { test, expect } from "bun:test";
import { testRoute, testPage } from "@tw/server/tw/testing";

test("GET /api/products returns the list", async () => {
  const res = await testRoute(process.cwd(), "GET", "/api/products");
  expect(res.status).toBe(200);
  expect(Array.isArray(res.json.items)).toBe(true);
});

test("POST /api/products validates input", async () => {
  const res = await testRoute(process.cwd(), "POST", "/api/products", { body: {} });
  expect(res.status).toBe(400);
});

test("/ renders inside the root layout", async () => {
  const res = await testPage(process.cwd(), "/");
  expect(res.html).toContain("site-header");
});
```

Full helper reference: [Testing](./testing.md).

## What to Cover

| Layer | Test |
|-------|------|
| API correctness | `testRoute` — happy path + validation failures |
| Auth | `testPage`/`testRoute` — private areas return 401/403 |
| Rendering | `testPage` — key markup per route, layout wrapping |
| Build | `tw build` itself is the test — it fails loudly |

## The Workflow

`.github/workflows/test.yml`:

```yaml
name: test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install

      - run: bunx tw check     # type check

      - run: bunx tw test      # the suite

      - run: bunx tw build     # the build must pass
```

Three gates: types, tests, build. A PR that breaks any of them stays red until fixed.

## Environment for Tests

`tw test` loads `.env` — give it test values:

```bash
# .env
JWT_SECRET=test-secret-not-for-production
```

Production secrets live on the platform, never in the repo.

## Local Before Push

```bash
tw check && tw test && tw build
```

The same three commands CI runs — a green local run means a green CI run.

## After CI Green — Deploy

Extend the workflow for the platform of choice, e.g. GitHub Pages:

```yaml
      - run: bunx tw build
      - uses: actions/upload-pages-artifact@v3
        with: { path: .tw }
```

Or let the platform's own git integration deploy on the same push — CI stays purely a gate.

## Related

- [Testing](./testing.md) · [Commands Reference](./commands-reference.md)
- [Deployment Adapters](./deployment-adapters.md)
