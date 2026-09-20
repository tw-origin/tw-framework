# TW Framework — Context API

This document covers one thing completely: `createContext` and the provide/consume functions — passing values down the component tree without prop drilling.

---

## createContext

```twm
import { createContext, useContext, useContextSignal } from "@tw/runtime"

const ThemeContext = createContext<"light" | "dark">("light")
```

`createContext(defaultValue?)` returns a `Context<T>` with:

| Member | Purpose |
|--------|---------|
| `key` | Internal unique key |
| `defaultValue` | Used when no provider is found |
| `Provider` | Component that supplies a value: `(props: { value, children })` |

## Providing Values

A Provider creates a layer; everything rendered inside it (any depth) reads that value.

```twm
import { createVNode } from "@tw/runtime"

createVNode(ThemeContext.Provider, { value: "dark" }, [
  createVNode(App, {}),
])
```

Programmatic layer management is also available for render functions that run outside the component tree:

```twm
import { provideContext, pushContextScope, popContextScope, withContextScope } from "@tw/runtime"

withContextScope(() => {
  provideContext(ThemeContext, "dark")
  return renderApp()        // consumers inside see "dark"
})
```

| Function | Purpose |
|----------|---------|
| `provideContext(context, value)` | Write a value into the current scope |
| `pushContextScope()` / `popContextScope()` | Enter/leave an isolated layer |
| `withContextScope(fn)` | Scoped provide/consume around a synchronous function |
| `setContextValue` / `clearAllContexts` | Direct registry manipulation and reset |

## Consuming Values

```twm
import { useContext } from "@tw/runtime"

const theme = useContext(ThemeContext)            // "dark" — or the default
```

Consumption walks the provider stack from the innermost layer outward — the nearest enclosing Provider wins; `undefined` only when no layer has the key AND no default was given.

For reactive updates, consume the underlying signal so components re-render when a provider's value changes:

```twm
import { useContextSignal } from "@tw/runtime"

const theme = useContextSignal(ThemeContext)      // Signal<"light" | "dark">
theme()                                            // read the current value
theme.set("light")                                 // providers accept updates
```

## Mapping and Validation

```twm
import { mapContext, validateContext } from "@tw/runtime"

const isDark = mapContext(ThemeContext, (t) => t === "dark")
const ok = validateContext(ThemeContext, (v) => v === "light" || v === "dark")
```

- `mapContext(context, fn)` — derive a new value from the nearest provider.
- `validateContext(context, fn)` — assert the current value satisfies a predicate.

## Pattern: Feature Flags

```twm
const Features = createContext<{ beta: boolean }>({ beta: false })

// bootstrap
createVNode(Features.Provider, { value: { beta: true } }, [page])

// any descendant
const features = useContext(Features)
if (features.beta) renderBetaUI()
```

## Rules

- Context identity is by `createContext` call — two contexts with the same shape never collide.
- Providers compose: nested providers shadow outer ones for their subtree only.
- Prefer `useContextSignal` inside components that must live-update; plain `useContext` is a one-time read.
- `clearAllContexts()` exists for test teardown — it wipes every layer on the stack.
