# TW Framework — Rewrites

This document covers one thing completely: serving one URL's content at another URL — the `rewrites` config in `tw.config.ts`, its three matching forms, and how it differs from redirects.

---

## A Rewrite Is Not a Redirect

A redirect answers the browser with `3xx` and a `Location`; the URL in the address bar changes. A rewrite changes what the server looks up internally; the visitor keeps the original URL. Use a redirect for moved pages, a rewrite for vanity paths and URL shapes you do not want to expose.

## Config Forms

Both documented shapes work, like `redirects` and `headers`:

```typescript
// tw.config.ts
import type { TwConfig } from "tw-framework";

export default {
  name: "my-app",
  version: "0.1.0",

  // object form
  rewrites: {
    "/games": "/category/games",
    "/popular": "/category/popular",
  },
} satisfies TwConfig;
```

```typescript
// array form
export default {
  rewrites: [
    { from: "/games", to: "/category/games" },
    { from: "/app/:slug", to: "/game/:slug" },
    { from: "/legacy/**", to: "/new" },
  ],
} satisfies TwConfig;
```

## Three Matching Forms

| Form | Example `from` | Matches |
|------|----------------|---------|
| Exact | `/games` | only `/games` |
| `:param` segments | `/app/:slug` | `/app/chess` — the captured value substitutes `:slug` in `to` |
| Glob | `/legacy/**` | `/legacy` and everything below it, preserving the suffix |

Param capture:

```
{ from: "/app/:slug", to: "/game/:slug" }
```

| Requested path | Serves content from |
|----------------|---------------------|
| `/app/chess` | `/game/chess` |
| `/app/pool-9` | `/game/pool-9` |
| `/app/a/b` | no match (segment count must be equal) |

Glob capture:

```
{ from: "/legacy/**", to: "/new" }
```

| Requested path | Serves content from |
|----------------|---------------------|
| `/legacy/docs/intro` | `/new/docs/intro` |
| `/legacy` | `/new` |

## Ordering in the Request Lifecycle

Rewrites run early — after URL normalization (`//x` collapse) and before redirects, config headers and site routing:

```
incoming request
  → URL normalization
  → rewrites (this feature)
  → redirects
  → config headers
  → plugins
  → middleware.twm
  → pages / API routes
```

Because the rewrite replaces the request URL, everything downstream — routing, middleware, relative asset resolution — sees the rewritten path.

## Combining With Other Features

- A rewrite can point at a page (`/vanity` → `/`), an API route (`/app/:slug` → `/api/posts`), or a dynamic route.
- Rewritten pages still participate in ISR — the cache key is the rewritten path.
- Middleware matchers evaluate the rewritten path, so a matcher for `/api/*` still applies after `/app/:slug` rewrites into `/api/posts`.

## Testing

```ts
import { applyRewrites } from "@tw/server";

expect(applyRewrites([{ from: "/app/:slug", to: "/game/:slug" }], "/app/chess"))
  .toBe("/game/chess");
```

## Reference

- docs/redirects-config.md — 3xx redirects, the sibling feature
- docs/headers-config.md — response header rules
- docs/middleware.md — code-level request handling
