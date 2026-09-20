# TW Framework — Stores

This document covers one thing completely: `defineStore` — shared state with getters and actions, available to every component that asks for it.

---

## Defining a Store

```twm
import { defineStore } from "@tw/runtime"

export const useCart = defineStore({
  id: "cart",
  state: () => ({
    items: [],
    coupon: null
  }),
  getters: {
    count: (state) => state.items.length,
    total: (state) => state.items.reduce((sum, item) => sum + item.price, 0)
  },
  actions: {
    add(item) {
      this.items.push(item)
    },
    remove(index) {
      this.items.splice(index, 1)
    }
  }
})
```

## Using It

Call the store's hook where needed — the same instance is returned everywhere:

```twm
const cart = useCart()

cart.count          // getter value
cart.add({ price: 100 })
```

## The Shape

| Part | Purpose |
|------|---------|
| `id` | registry key — one instance per id |
| `state` | a function returning the initial state object |
| `getters` | computed values derived from state |
| `actions` | functions that read and write state through `this` |

Both calling conventions work:

```twm
defineStore({ id: "cart", state: () => ({ ... }) })
defineStore("cart", { state: () => ({ ... }) })
```

## Stores vs Page State

| | page `state { }` | a store |
|--|-------------------|---------|
| scope | one page | whole app |
| survives navigation | no | yes |
| good for | page-local values | cart, user, theme |

Start with page state. Reach for a store when two far-apart components need the same value.

## Related

- [Signals](./signals.md)
- [Syntax: State](./syntax-state.md)
