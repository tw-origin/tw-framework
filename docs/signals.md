# TW Framework — Signals

This document covers one thing completely: `@tw/runtime` reactivity — creating reactive values and reacting to their changes.

---

## Creating a Signal

```twm
import { signal, computed, effect } from "@tw/runtime"

const count = signal(0)
```

Read with `.value`; write by assigning `.value`:

```twm
count.value          // 0
count.value = 1
count.value = count.value + 1
count.update(n => n * 2)   // transform helper
count.peek()               // read without subscribing
```

## Computed Values

`computed` derives a value from other signals and updates only when they change:

```twm
import { signal, computed } from "@tw/runtime"

const price = signal(100)
const qty = signal(2)
const total = computed(() => price.value * qty.value)   // 200

price.value = 250
total.value   // 500
```

The compute function runs once per change, not once per read.

## Effects and Watching

```twm
import { effect, watch } from "@tw/runtime"

effect(() => {
  console.log("total is", total.value)
})

watch(count, (newValue, oldValue) => {
  console.log("count", oldValue, "->", newValue)
})
```

Effects re-run when any signal they read changes. `watch` tracks one source and hands you both values.

## The Wider API

| API | Purpose |
|-----|---------|
| `signal` | single reactive value |
| `computed` | derived value, cached |
| `effect` / `watch` | run on change |
| `reactive` | deeply reactive object (property access tracks) |
| `ref` / `toRef` / `toRefs` | reactive references for object properties |
| `batch` | group writes into one notification round |
| `untrack` | read a signal without subscribing |
| `createScope` | own a set of effects, `dispose()` cleans them up |
| `isSignal` | check whether a value is a signal |

## Batching

```twm
import { signal, batch } from "@tw/runtime"

const a = signal(1)
effect(() => console.log("a + b =", a.value))

batch(() => {
  a.value = 2
  a.value = 3        // the effect sees only the final value
})
// logged once: a + b = 3
```

## In Pages

Signals imported from `@tw/runtime` are usable inside handler expressions — the chunk that ships them is tree-shaken to just what you import. See [Client Modules](./client-modules.md).

## Related

- [Stores](./stores.md)
- [Client Runtime](./client-runtime.md)
