# TW Framework — DevTools

This document covers one thing completely: `enableDevTools`, `disableDevTools`, and `getDevTools` — the runtime inspection surface exposed by `@tw/runtime`.

---

## Enabling

```twm
import { enableDevTools, disableDevTools, isDevToolsEnabled } from "@tw/runtime"

enableDevTools()
isDevToolsEnabled()      // true
disableDevTools()
isDevToolsEnabled()      // false
```

DevTools are off by default; enabling them starts collecting the component tree and state snapshots the inspector needs.

## The DevTools State

```twm
import { getDevTools } from "@tw/runtime"

const devtools = getDevTools()
const state = devtools.getState()

state.enabled             // boolean
state.componentTree       // ComponentTreeNode[] — live component hierarchy
```

`ComponentTreeNode` describes one component in the live tree:

| Field | Meaning |
|-------|---------|
| `id` | Component instance id |
| `name` | Component name (from `defineComponent`) |
| `type` | Component or element node |
| `children` | Nested `ComponentTreeNode[]` |
| `props` / `state` | Current snapshot values |

## Building a Panel

`getDevTools().getState()` returns plain data — a custom panel is just rendering it:

```twm
import { getDevTools, isDevToolsEnabled } from "@tw/runtime"
import { findAll, readDOM, writeDOM } from "@tw/runtime"

function renderPanel(container: HTMLElement) {
  readDOM(() => getDevTools().getState().componentTree)
  writeDOM(() => {
    container.textContent = JSON.stringify(
      getDevTools().getState().componentTree.map(n => n.name),
    )
  })
}
```

Because the state is a snapshot, consumers must poll or re-render on their own trigger — the tree is not a signal.

## Production Discipline

```twm
if (isDev()) enableDevTools()
```

Tree snapshots cost time and keep references alive; gate devtools on `isDev()` and call `disableDevTools()` when a debug session ends so captured state can be collected.

## What DevTools Sees

- Components defined through `defineComponent` (name, props, state)
- The mounted hierarchy at snapshot time
- Anything routed through the debug utilities' log buffer (see doc 136)

DevTools never modify application behavior — inspection is read-only.
