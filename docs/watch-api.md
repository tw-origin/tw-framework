# TW Framework — Watch API

This document covers one thing completely: `watchAll`, `watchDeep`, and `watchOnce` — observing reactive state changes beyond the basics.

---

## watchDeep

Signals and plain objects nested inside state need recursive observation. `watchDeep` fires when ANY nested value changes.

```twm
import { watchDeep, signal } from "@tw/runtime"

const settings = signal({
  theme: { mode: "light", contrast: "normal" },
  editor: { fontSize: 14, ligatures: false },
})

const handle = watchDeep(settings, (newValue, oldValue) => {
  persist(newValue)        // any nested mutation lands here
})

settings.peek().theme.mode = "dark"   // nested write -> handler runs
handle.stop()
```

Deep watchers walk arrays and plain objects; Maps, Sets, and class instances are compared by reference change at their level.

## watchAll

Observe several sources with one callback:

```twm
import { watchAll, signal } from "@tw/runtime"

const page = signal(1)
const query = signal("")

const handle = watchAll([page, query], ([p, q]) => {
  reload(p, q)
})

page.set(2)        // reload(2, "")
query.set("shoes")  // reload(2, "shoes")
handle.stop()
```

`watchAll(sources, callback)` fires with the array of current values whenever any source changes.

## watchOnce

A watcher that detaches itself after the first change — perfect for "wait until ready":

```twm
import { watchOnce, signal } from "@tw/runtime"

const ready = signal(false)

watchOnce(ready, (value) => {
  if (value) bootstrapCharts()      // runs exactly once, then unsubscribes
})
```

## WatcherHandle

Every watcher returns the same control object:

```twm
const handle = watchDeep(source, cb)

handle.pause()     // stop firing; source keeps working
handle.resume()    // continue from now
handle.stop()      // detach permanently
```

## WatchOptions

These helpers accept the standard watcher options:

| Option | Default | Meaning |
|--------|---------|---------|
| `deep` | `false` (auto-on for `watchDeep`) | Recurse into nested objects |
| `immediate` | `false` | Fire the callback immediately with the current value |
| `flush` | `"pre"` | `"pre"` = before render, `"post"` = after render, `"sync"` = synchronously |
| `once` | `false` | Auto-stop after the first invocation |

```twm
watchDeep(settings, save, { immediate: true, flush: "post" })
```

## Choosing the Watcher

| Need | Tool |
|------|------|
| Nested mutation visibility | `watchDeep` |
| Multiple inputs, one effect (filters + pagination) | `watchAll` |
| One-time readiness/first-event | `watchOnce` |
| Fine-grained single-source tracking with old/new values | `watch` (see doc 92) |

Always keep the `WatcherHandle` and `stop()` it in `beforeUnmount` — a forgotten watcher keeps its callback and referenced objects alive.
