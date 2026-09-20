# TW Framework — Keep-Alive

This document covers one thing completely: `createKeepAlive` — caching unmounted component subtrees so navigating back restores their DOM and state instantly.

---

## The Problem

By default, leaving a route unmounts its component and state. Returning rebuilds both. For heavy lists or scrolled views, `KeepAlive` caches the subtree on unmount and reuses it on return.

## createKeepAlive

```twm
import { createKeepAlive } from "@tw/runtime"

const keepAlive = createKeepAlive({
  max: 10,                  // LRU cap on cached entries
  include: ["Dashboard", "Users"],   // cache only these component names
  // exclude: ["Cart"],                // or cache everything EXCEPT these
  cacheKey: (name, props) => name + ":" + props.userId,  // custom identity
})
```

## KeepAliveOptions

| Option | Type | Meaning |
|--------|------|---------|
| `max` | `number` | Maximum cached entries; the least recently used entry is dropped when exceeded |
| `include` | `string[] \| RegExp` | Cache only components matching by name |
| `exclude` | `string[] \| RegExp` | Never cache components matching by name |
| `cacheKey` | `(name, props) => string` | Custom cache key; default is the component name |

`include` and `exclude` accept an array of names or a single `RegExp` tested against the component name.

## Cache Operations

```twm
keepAlive.set(key, name, vnode, dom, props, state)  // cache a subtree
keepAlive.get(key)            // CacheEntry | undefined
keepAlive.has(key)            // boolean
keepAlive.remove(key)         // drop one entry
keepAlive.clear()             // drop everything
keepAlive.shouldCache(name)   // true when name passes include/exclude
```

## CacheEntry

Each cached subtree stores everything needed to reattach:

| Field | Meaning |
|-------|---------|
| `key` | Cache key used for lookup |
| `name` | Component name |
| `vnode` | Virtual node — reattachment keeps diffing consistent |
| `dom` | The detached DOM subtree |
| `props`, `state` | Snapshot of props and state at unmount |
| `createdAt`, `lastAccessed` | Timestamps used for LRU pruning |

## LRU Behavior

- `set` writes `createdAt`/`lastAccessed` and prunes past `max`.
- `get` refreshes `lastAccessed`, so recently used subtrees survive pruning.
- `include`/`exclude` are checked by `shouldCache` — components that fail the check are simply not stored.

## Usage Pattern

```twm
import { createKeepAlive } from "@tw/runtime"

const keepAlive = createKeepAlive({ max: 5, exclude: ["Login"] })

function onRouteLeave(route, name, vnode, dom, props, state) {
  if (keepAlive.shouldCache(name)) {
    keepAlive.set(route, name, vnode, dom, props, state)
  }
}

function onRouteEnter(route) {
  const cached = keepAlive.get(route)
  if (cached) {
    reattach(cached.dom)          // DOM returns scrolled, focused, populated
    return cached.state           // restore state instead of refetching
  }
  return null
}
```

`KeepAlive` is also exported as a class for subclassing; `createKeepAlive(options?)` is the constructor shorthand.
