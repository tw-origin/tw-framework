# TW Framework — lib/ Modules

This document covers one thing completely: the `lib/` directory — server-side TypeScript modules shared by route handlers.

---

## What lib/ Is For

Anything a route handler needs that is not a route: database clients, fetch wrappers, pricing logic, parsers. Handlers stay thin; logic lives in named modules.

```text
lib/
├── db.ts          # database access
├── calc.ts        # shared calculation
└── format.ts      # formatting helpers
```

`tw build` copies `lib/` into `.tw/lib/` so the production server serves the same code the dev server runs.

## Importing from a Route Handler

Use the `lib/` prefix — the loader resolves it relative to the project:

```twm
import { priceFor } from "lib/calc"

fn get(request) {
  return { status: 200, json: { price: priceFor(request.query.plan ?? "basic") } }
}
```

## Writing a Module

Plain TypeScript, server-side:

```ts
// lib/calc.ts
export function priceFor(plan: string): number {
  const base = { basic: 100, pro: 400, team: 1200 } as Record<string, number>
  return base[plan] ?? 100
}
```

Modules may import each other with relative paths:

```ts
// lib/invoice.ts
import { priceFor } from "./calc"
```

## The Server-Only Boundary

`lib/` modules run on the server only. Importing one from a page (`import { x } from "lib/db"`, with or without the `.ts` extension) fails the build:

```text
✗ Build failed  server-only module in client module
  TW1007: home/admin/page.tw → lib/db
    Server-only modules (lib/, .twm, @tw/*) cannot be imported from page.tw / layout.tw.
```

Pages that need logic on the client import from npm modules or `@tw/runtime` instead. `tw dev` reports the same TW1007 diagnostic for the page it serves.

| Import | Where it runs | Allowed in pages |
|--------|----------------|-------------------|
| `lib/*` | server | no — TW1007 |
| npm packages | browser chunk | yes |
| `@tw/runtime` | browser chunk | yes |

## Editing Without Restart

In `tw dev`, editing a `lib/` module is picked up on the next request, the same as editing a route.

## Related

- [API Routes](./api-routes.md)
- [Client Modules](./client-modules.md)
