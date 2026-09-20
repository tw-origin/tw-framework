# TW Framework — Async Components

This document covers one thing completely: `defineAsyncComponent` — loading a component's code only when it renders.

---

## Defining One

```twm
import { defineAsyncComponent } from "@tw/runtime"

const HeavyChart = defineAsyncComponent(() =>
  import("@tw/chart").then(m => m.Chart)
)
```

The component renders nothing until its module arrives, then renders normally. The loader function runs once — later renders reuse the loaded module.

## Preloading

Load ahead of need so the render does not wait:

```twm
import { preloadAsyncComponent } from "@tw/runtime"

// e.g. on hover over the section that shows the chart
preloadAsyncComponent(HeavyChart)
```

A common pairing: preload on pointer-over, render on click — the code is already local when the component mounts.

## With Suspense

Inside a [Suspense](./suspense.md) boundary, the async component's arrival is the boundary's completion — the fallback shows until then:

```twm
import { withSuspense } from "@tw/runtime"

withSuspense(HeavyChart, { fallback: spinner })
```

## When to Reach for It

| Component | Load it async? |
|-----------|----------------|
| big charting / editing libraries | yes — keep them out of the initial chunk |
| below-the-fold panels | often — with preload on scroll |
| every small component | no — overhead for nothing |

The chunk splitting already works per import — see [Code Splitting](./code-splitting.md); async components control *when* the import happens, not just that it is split.

## Related

- [Suspense](./suspense.md)
- [Code Splitting](./code-splitting.md)
