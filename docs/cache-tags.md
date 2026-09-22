# TW Framework — Cache Directives & Tag Invalidation

This document covers one thing completely: the explicit cache layer — `cache { }` in page frontmatter, `fn cached` handlers, `cacheLife` profiles in tw.config.ts, and tag-based invalidation with `revalidateTag()` / action-result `revalidateTag`.

ISR (`revalidate N`, docs/isr.md) keeps working unchanged — it is the legacy spelling of the same engine.

---

## Why

`revalidate N` is route-scoped and time-based only. The cache layer adds:

1. **Explicit windows** — `stale` (client hint), `revalidate` (server freshness), `expire` (hard limit), resolved from named **profiles**.
2. **Families** — `tag "products"` groups routes and handlers; one call expires the family.
3. **Read-your-writes** — an action returns `{ revalidateTag: "products" }` and the same user flow sees fresh data.

## Page-level: `cache { }`

```tw
page {
  title "Shop"
  render ssr
  cache { life "product", tag "products" }
}
```

Inline form (no profile):

```tw
page { cache { revalidate 3600, stale 300, expire 86400, tag "products" } }
```

Each key has ONE precise meaning:

| Key | Layer | Meaning | Default |
|-----|-------|---------|---------|
| `life` | — | profile name, resolves to all three windows below | — |
| `stale` | client | `Cache-Control: max-age` seconds — the browser/CDN may reuse the response for that long. The server cache never reads it. | 0 |
| `revalidate` | server | freshness: while age < revalidate the entry is served as `HIT` with zero work. | required* |
| `expire` | server | hard limit: between `revalidate` and `expire` the entry is served `STALE` with a background refresh; at/after `expire` it is dropped and the request blocks on a fresh render. | `revalidate` (no SWR window) |
| `tag` | invalidation | family name for `revalidateTag()` | untagged |

(*) `revalidate` or `life` must be present — otherwise build diagnostic **TW090**.

Serving model:

```
age <  revalidate            →  HIT    (serve cache, zero work)
revalidate <= age < expire  →  STALE  (serve cache + background refresh)
age >= expire                →  MISS   (blocking render, store)
```

Response headers on every cacheable route: `x-tw-cache: HIT|STALE|MISS`, `x-tw-cache-age: <seconds>` (observation), and `Cache-Control: public, max-age=<stale>, stale-while-revalidate=<expire-stale>` when `stale > 0`.

### Legacy compatibility — exact

`page { revalidate 60 }` desugars to `{ revalidate: 60, stale: 0, expire: Infinity }`: fresh for 60s, then stale-while-revalidate forever, never a blocking MISS — the v1.0.5 behavior byte-for-byte. `routes.json` keeps bare numbers for these routes.

## cacheLife profiles — tw.config.ts

```ts
export default {
  cache: {
    profiles: {
      product: { stale: 300, revalidate: 3600, expire: 86400 },
      blog:    { stale: 60,  revalidate: 90,   expire: 3600 },
    },
  },
}
```

Built-in profiles (no config needed): `seconds` (1/1/2), `minutes` (60/300/3600), `hours` (3600/14400/86400), `days` (86400/604800/2592000), `max` (30d/60d/365d).

Profiles resolve at **build time** into absolute seconds in `.tw/routes.json`:

```json
{
  "/shop": { "revalidate": 3600, "stale": 300, "expire": 86400, "tag": "products" },
  "/blog": 90
}
```

Unknown profile → build diagnostic **TW092**.

## Handler-level: `fn cached`

A GET/HEAD handler may be cached per canonical key:

```
import { next } from "counter"

fn cached get(request) {
  cache { revalidate 60, stale 5, expire 300, tag "products" }
  return { status: 200, json: { items: ["chai"], servedBy: next() } }
}
```

- The `cache { }` line is hoisted out at compile time (it is metadata, not JS).
- **Canonical cache key**: `sha256(method + pathname + canonical query + params)` — query order-independent (`?a=1&b=2` ≡ `?b=2&a=1`), empty values dropped. The body is never part of the key.
- Windows and headers are the same as page-level (HIT/STALE/MISS + `x-tw-cache`, `x-tw-cache-age`, `Cache-Control`).
- POST/actions are never cached.

### Purity rules

| Expression in a `fn cached` body | Verdict |
|----------------------------------|---------|
| `request.params`, `request.query` | ✅ key dependency |
| `request.cookies` | ❌ **TW091** — build error, handler excluded from caching |
| `request.headers` | ❌ TW091 |
| `request.body` | ❌ TW091 |
| `setSignal(...)` | ❌ TW091 |
| `Date.now()` / `Math.random()` / `crypto.randomUUID()` | ⚠️ **TW093** warning — the value freezes into the cache entry |

TW091 fails the build (`tw build`) with a clear fix message; serve logs the same diagnostic and serves the handler uncached.

## Tag invalidation

### `revalidateTag()` from `"tw"`

```
import { revalidateTag } from "tw"

fn actionPublish(request) {
  // ...mutate the database...
  revalidateTag("products")
  return { status: 200, json: { published: true } }
}
```

Expires every cached entry carrying `tag "products"` — page renders **and** cached handlers. The next request for those routes renders fresh (`MISS`). Unrelated routes keep their `HIT`s. `revalidatePath()` / `revalidateRoute()` remain the precise single-entry tools.

The tag index is derived: each cache entry carries its own tags (the single source of truth), so a process restart cannot desync it — entries simply rebuild the index as they are created.

### `updateTag` semantics — action-result form

An action may return the revalidation as part of its result:

```
fn actionPublish(request) {
  // ...mutate...
  return { status: 200, json: { published: true }, revalidateTag: "products" }
}
```

The dispatcher expires the family in the same request and answers with `x-tw-revalidated: products`. The client runtime already re-fetches the page after an action dispatch, so the user sees the fresh render without a manual reload — read-your-writes, with no new client API.

## Comparison with Next.js 16

| Concept | Next.js 16 | TW Framework |
|---------|-----------|--------------|
| opt-in cache marker | `"use cache"` string | `cache { }` directive / `fn cached` |
| lifetime profile | `cacheLife('hours')` | `cache { life "hours" }` |
| family tag | `cacheTag('x')` | `cache { tag "x" }` |
| expire family | `revalidateTag('x')` | `revalidateTag("x")` from `"tw"` |
| read-your-writes | `updateTag('x')` | action result `{ revalidateTag: "x" }` |
| network boundary | `proxy.ts` | unchanged — `tw.config.ts` rewrites/redirects/headers + `middleware.twm` request logic were already separate |

## Diagnostics

| Code | Severity | Meaning |
|------|----------|---------|
| TW090 | error | `cache { }` has neither `revalidate` nor `life` |
| TW091 | error | impure `fn cached` body (cookies/headers/body/setSignal) |
| TW092 | error | unknown `life` profile name |
| TW093 | warning | non-deterministic call in a cached handler freezes into the entry |
