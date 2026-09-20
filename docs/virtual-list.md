# TW Framework — Virtual List

This document covers one thing completely: `createVirtualList` — rendering long lists by mounting only the visible rows.

---

## The Function

```twm
import { createVirtualList } from "@tw/runtime"

const list = createVirtualList(container, {
  itemCount: 10_000,
  itemHeight: 48,          // fixed row height in px
  renderItem: (index, item) => {
    item.textContent = "Item " + index
  }
})
list.render()               // draw the first window
```

| Option | Meaning |
|--------|---------|
| `itemCount` | total rows in the data |
| `renderItem` | fills a pooled row element for a row index |
| `itemHeight` | fixed row height (px) — precalculates positions |
| `estimatedItemHeight` | row height estimate when heights vary (default 40) |
| `overscan` | extra rows rendered above/below the window (default 5) |
| `horizontal` | scroll horizontally instead of vertically |
| `stickyHeader` / `stickyFooter` | elements pinned while scrolling |

The container scrolls natively; the list positions rows absolutely, mounts what is visible plus the overscan buffer, and recycles the rest into a pool.

## Operations

| Method | Purpose |
|--------|---------|
| `render()` | draw (or redraw) the current window |
| `scrollToItem(index, align?)` | jump to a row — `"start"`, `"center"` or `"end"` |
| `scrollToPosition(px)` | jump to a pixel offset |
| `setItemCount(n)` | re-sync after the data length changes |
| `setRenderItem(fn)` | swap the row renderer |
| `remeasure()` | re-measure after heights change |
| `getFirstVisibleIndex()` / `getLastVisibleIndex()` | the current window |

## When It Pays Off

| List size | Approach |
|-----------|----------|
| under ~100 rows | render normally |
| 100 – 1,000 | normal render, measure first |
| 1,000+ | virtual list |

Initial render cost and memory both stay flat as the data grows.

## Fixed Heights

Rows must share one height — the position math for row `i` is `i * itemHeight`. Mixed-height rows are not supported; normalize height with padding or group rows into fixed-height sections.

## Related

- [Performance Guide](./guide-performance.md)
- [Scheduler](./scheduler.md)
