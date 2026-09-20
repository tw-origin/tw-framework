# TW Framework — VNode Pool

This document covers one thing completely: the virtual-node object pool — `acquireVNode`, `releaseVNode`, `configurePool`, and `poolSize` — reusing VNode objects instead of allocating thousands per render.

---

## The Problem

Every render creates VNode objects for every element; a big page discards thousands per second. The pool recycles them.

## acquireVNode

```twm
import { acquireVNode, releaseVNode } from "@tw/runtime"

const vnode = acquireVNode("element", "div", { class: "card" }, [child1, child2])
```

`acquireVNode(type?, tag?, props?, children?)` pops a VNode from the pool (or creates one when empty) and fills it with the given fields — the shape matches `createVNode`, but the object is recycled.

## releaseVNode

```twm
releaseVNode(vnode)          // release one subtree (children released recursively)
releaseVNodes([v1, v2, v3])  // release an array
```

Release walks the whole subtree — a root release covers every descendant.

## Configuring the Pool

```twm
import { configurePool, poolSize, clearPool } from "@tw/runtime"

configurePool({
  maxSize: 5000,       // pooled VNodes kept for reuse
})

poolSize()      // current pooled count
clearPool()      // drop pooled objects entirely
```

| Function | Purpose |
|----------|---------|
| `configurePool(config)` | Set `maxSize` and pooling behavior |
| `poolSize()` | How many VNodes sit in the pool |
| `clearPool()` | Empty the pool (useful between test runs) |

## When You Touch This API

The renderer acquires and releases VNodes automatically during diffing — most apps never call these directly. You need them when:

- Building VNode trees manually for repeated injection (a virtualizing table building rows by hand)
- Writing a custom renderer on top of the runtime
- Profiling allocation pressure (see `poolSize()` alongside doc 136's `measureTime`)

## Manual Pattern

```twm
import { acquireVNode, releaseVNode } from "@tw/runtime"

function buildRow(cells: string[]) {
  const children = cells.map((text) => acquireVNode("element", "td", {}, [acquireVNode("text", undefined, {}, [])]))
  return acquireVNode("element", "tr", { class: "row" }, children)
}

const rows = data.map(buildRow)
mount(rows)
releaseVNodes(previousRows)   // recycle the last batch
```

## Rules

- Release a VNode only after it is fully detached — a released node still mounted will be reused under another subtree.
- Never keep references to released children; the pool overwrites their fields on next `acquire`.
- Pooled capacity is bounded by `maxSize`; excess releases are simply garbage-collected, so over-releasing is safe.
