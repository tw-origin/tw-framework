# TW Framework — Cache Manager

This document covers one thing completely: the key/value cache exported by `@tw/runtime` — `cacheSet`/`cacheGet`/`cacheHas`/`cacheDelete`/`cacheClear`/`cacheStats` — TTLs, tags, and stale-while-revalidate.

---

## Basic Operations

```twm
import { cacheSet, cacheGet, cacheHas, cacheDelete, cacheClear } from "@tw/runtime"

cacheSet("user:42", profile)
cacheGet<User>("user:42")        // profile — undefined when absent/expired
cacheHas("user:42")              // boolean
cacheDelete("user:42")
cacheClear()                      // drop everything
```

## CacheOptions

```twm
cacheSet("user:42", profile, {
  ttl: 60_000,                    // ms until expiry
  tags: ["user", "session"],      // group invalidation
  layer: "memory",                // CacheLayer
  staleWhileRevalidate: true,     // serve stale value while refreshing
  revalidateFn: () => fetchProfile(42),   // refresh implementation
  revalidateInterval: 30_000,     // periodic refresh in ms
})
```

| Option | Meaning |
|--------|---------|
| `ttl` | Lifetime in milliseconds; no ttl means the entry lives until evicted |
| `tags` | Labels for tag-based invalidation |
| `staleWhileRevalidate` | Return the stale value immediately and refresh in the background |
| `revalidateFn` | Function that produces a fresh value |
| `revalidateInterval` | Re-run `revalidateFn` on this cadence |

## Stale-While-Revalidate

```twm
cacheSet("feed", feed, {
  ttl: 10_000,
  staleWhileRevalidate: true,
  revalidateFn: () => fetchFeed(),
})

// Later: instant stale answer on the first call, fresh value from the next
const data = cacheGet("feed")
```

The first read after expiry returns the stale value and triggers `revalidateFn` in the background — the following read returns the refreshed entry.

## Tags: Invalidation by Group

```twm
import { cacheSet, cacheDelete, getCacheManager } from "@tw/runtime"

cacheSet("user:42", p, { tags: ["user"] })
cacheSet("user:42:posts", posts, { tags: ["user", "posts"] })
getCacheManager().invalidateTag("user")   // returns count of dropped entries
```

`invalidateTag(tag)` on the manager removes every entry carrying that tag (both above); `cacheDelete(key)` removes one exact key.

## Statistics

```twm
import { cacheStats } from "@tw/runtime"

const stats = cacheStats()
stats.size          // live entries
stats.hits          // successful lookups
stats.misses        // lookups that found nothing (or expired)
stats.evictions     // entries dropped by capacity pressure
stats.hitRate       // hits / (hits + misses)
stats.entries       // per-entry { key, size, lastAccessed, tags }
```

`stats.entries` makes cache inspection possible without mutating it — ideal for a devtools readout.

## The Manager

```twm
import { getCacheManager } from "@tw/runtime"

const manager = getCacheManager()      // same instance the helpers use
```

The module-level helpers all delegate to this singleton; `getCacheManager()` gives direct access for advanced flows (custom layers, bulk operations).

## Pattern: API Response Cache

```twm
import { cacheGet, cacheSet } from "@tw/runtime"

async function getCachedProducts(category: string) {
  const key = "products:" + category
  const hit = cacheGet(key)
  if (hit) return hit
  const fresh = await fetchProducts(category)
  cacheSet(key, fresh, { ttl: 120_000, tags: ["products"] })
  return fresh
}
```
