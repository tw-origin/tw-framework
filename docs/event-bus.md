# TW Framework — Event Bus

This document covers one thing completely: the pub/sub event bus exported by `@tw/runtime` — `createEventBus`, `emit`, `emitSync`, `off`, `offAll`.

---

## The Default Bus

One global bus is pre-created; `getEventBus()` returns it.

```twm
import { getEventBus } from "@tw/runtime"

const bus = getEventBus()
```

## Subscribing

`bus.on(event, handler, options?)` returns a `Subscription`.

```twm
const sub = bus.on("cart:updated", (payload, meta) => {
  refreshBadge(payload.count)
}, { priority: 10 })
```

EventOptions:

| Option | Default | Meaning |
|--------|---------|---------|
| `priority` | `0` | Lower numbers run first when several handlers share an event |
| `once` | `false` | Unsubscribe automatically after the first call |
| `namespace` | — | Tag handlers so a whole group can be removed together |

## Emitting

```twm
import { emit, emitSync } from "@tw/runtime"

emit("cart:updated", { count: 3 })       // schedules handlers asynchronously
emitSync("cart:updated", { count: 3 })   // runs handlers immediately, in priority order
```

- `emit` — handler execution is deferred; the emitter continues. Ideal for UI events.
- `emitSync` — handlers run before `emitSync` returns; their return values propagate. Use when order or completion matters.
- Handler signature: `(payload, meta)` where `meta` carries the `EventMeta` (event name, timestamp, namespace).

## Removing Handlers

```twm
import { off, offAll } from "@tw/runtime"

off("cart:updated")         // all handlers for that event
offAll()                    // every handler on the bus (reset for tests)
```

The `Subscription` object returned by `bus.on` also has its own removal method — prefer it when only one listener must go:

```twm
const sub = bus.on("x", handler)
sub.unsubscribe()
```

## Custom Buses

`createEventBus()` builds isolated buses — scope them per feature instead of one global namespace:

```twm
import { createEventBus } from "@tw/runtime"

const paymentBus = createEventBus()
paymentBus.on("charge:settled", (p) => invoice(p))
paymentBus.emit("charge:settled", { id: "ch_1" })
```

A custom bus has the identical surface: `on`, `off`, `offAll`, `emit`, `emitSync`.

## Handler Ordering

Handlers for one event run in ascending `priority` order (ties keep registration order). When a handler needs to run before default-priority handlers, give it a negative priority; wrap-up handlers get a high one.

## Pattern: Cross-Feature Communication

```twm
// checkout module
import { emit } from "@tw/runtime"
emit("checkout:completed", { orderId, total })

// notification module
import { getEventBus } from "@tw/runtime"
getEventBus().on("checkout:completed", ({ orderId }) => {
  toastSuccess("Order " + orderId + " confirmed")
})
```

Neither module imports the other — the bus is the only shared dependency.
