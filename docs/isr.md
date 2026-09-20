# TW Framework — Incremental Static Regeneration (ISR)

This document covers one thing completely: serving pages and API responses from cache with a time budget — `revalidate N` in page frontmatter and route modules, and the stale-while-revalidate behavior it produces.

---

## Page-Level ISR

A page's frontmatter can declare a revalidation window in seconds:

```tw
page {
  title "Products"
  render static
  revalidate 60
}

div.products {
  ProductList { }
}
```

`revalidate 60` means: this page's rendered HTML may be cached and served for 60 seconds. After the window expires, the next visitor still gets the page instantly — the **stale** copy — while a background render refreshes the cache. The visitor after that gets the fresh copy. No request ever waits for a re-render.

| Cache state | `x-tw-cache` response header | Visitor sees |
|-------------|------------------------------|--------------|
| First render | `MISS` | fresh HTML |
| Within the window | `HIT` | cached HTML |
| Window expired | `STALE` | cached HTML, refreshed in the background |

## Route-Level ISR

A `route.twm` declares its window with a module-level `revalidate` constant:

```
// home/api/products/route.twm
const revalidate = 60

fn get(request) {
  return { status: 200, json: buildCatalog() }
}
```

`GET` (and `HEAD`) responses are cached per path and query for 60 seconds and served with `x-tw-route-cache: HIT` on subsequent calls. Handlers that mutate (`POST`, actions) are never cached.

```
const revalidate = 30

fn get(request) { ... }        // cached 30s
fn actionRefresh(request) { ... } // never cached
```

## Choosing a Window

| Content | Suggested `revalidate` |
|---------|-------------------------|
| Product catalogs, feeds | 60–300 |
| Blog posts, docs | 3600 |
| Dashboard data | 5–30 |
| Per-user data | no revalidate — render on request (`render ssr`) |

The global default cache TTL (60000 ms) applies to pages and routes without a `revalidate` declaration; declaring one overrides it per page/route.

## Rebuilding on Demand

`revalidate` controls serving; a fresh build of changed source is still `tw build`. A common production pattern is CI on push (build + deploy) with short `revalidate` windows absorbing content churn in between.

## On-Demand Revalidation

Time windows are half the story — a handler can drop cache entries the moment the data they were built from changes. Import the helpers from `"tw"` inside any `.twm` file:

```
// home/api/products/route.twm
import { revalidatePath, revalidateRoute } from "tw"

fn actionUpdate(request) {
  saveProduct(request.body)
  revalidatePath("/products")                     // drop cached page renders
  revalidateRoute("/api/products")                 // drop cached GET responses
  return { status: 200, json: { ok: true } }
}
```

| Function | Clears | Options |
|----------|--------|---------|
| `revalidatePath(path)` | cached page renders for that path | `{ prefix: true }` drops every `/path/...` entry |
| `revalidateRoute(path)` | cached route GET responses for that path | `{ prefix: true }` same prefix semantics |

Both return the number of dropped entries. `revalidatePath` reaches the live render pipeline (the server registers it at startup); calling it outside a server returns 0. A typical pattern is a webhook or an admin action that revalidates exactly what it changed:

```
fn actionPublish(request) {
  publish(request.body.id)
  revalidatePath("/blog", { prefix: true })   // every blog page
  return { status: 200, json: { ok: true } }
}
```

## What ISR Is Not

- It is not a CDN directive — the `x-tw-cache` headers describe the framework's own render cache.
- It does not invalidate by tag. Use the cache-manager API (docs/cache-manager.md) for tagged invalidation inside handlers.
- Stale entries are served once per expiry; the background render is single-flight (a burst of visitors triggers exactly one re-render, not one per request).

## Testing

```ts
const pipeline = new RenderPipeline({ rootDir, homeDir, enableCache: true });
const first = pipeline.render("/products");    // x-tw-cache: MISS
const hit = pipeline.render("/products");      // x-tw-cache: HIT
```

## Reference

- docs/render-modes.md — `static`, `ssr`, `island`, `edge`
- docs/cache-manager.md — tagged caches and runtime invalidation
- docs/build-output.md — what `tw build` pre-renders
