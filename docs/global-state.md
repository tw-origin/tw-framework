# TW Framework — Global State

This document covers one thing completely: `createGlobalState` — a standalone reactive singleton shared across the app without store ceremony.

---

## createGlobalState

```twm
import { createGlobalState } from "@tw/runtime"

const currentUser = createGlobalState({ name: "Guest", id: null })

currentUser.get()                 // { name: "Guest", id: null }
currentUser.set({ name: "Asha", id: 7 })
currentUser.get()                 // { name: "Asha", id: 7 }
```

It returns exactly three members:

| Member | Type | Purpose |
|--------|------|---------|
| `get` | `() => T` | Read the current value |
| `set` | `(v: T) => void` | Replace the value and notify subscribers |
| `subscribe` | `(listener) => Unsubscribe` | React to changes; returns an unsubscribe function |

## Subscribing

```twm
const unsubscribe = currentUser.subscribe((value) => {
  updateHeader(value.name)
})

unsubscribe()     // stop listening
```

The listener fires with the new value on every `set`.

## When to Use Global State vs a Store

A store (doc 93) adds actions, getters, and per-component wiring. `createGlobalState` is for the small set of cross-cutting values where a plain reactive variable is enough:

- current session/user
- feature flags resolved at boot
- a connection status flag
- a shared counter or theme override

```twm
// session.ts — created once, imported everywhere
export const connection = createGlobalState<"online" | "offline" | "reconnecting">("online")

// widget A
connection.set("reconnecting")

// widget B — reacts without importing A
connection.subscribe((status) => badge.setText(status))
```

## Composition with Signals

Inside components, derive reactivity by pairing the subscription with the renderer's effect system:

```twm
const unsubscribe = connection.subscribe(() => {
  scheduleRender()      // any render function that reads connection.get()
})
```

## Rules

- One instance per logical value — create it in a module and export it; never recreate inside components.
- `set` replaces the whole value — build the new object yourself when updating fields:
  `currentUser.set({ ...currentUser.get(), name: "Ravi" })`
- Subscriptions must be unsubscribed (page teardown, component unmount) — the singleton itself lives for the process.
