# TW Framework — Drag and Drop

This document covers one thing completely: `makeDraggable` and `makeSortable` — dragging elements and reordering lists.

---

## Dragging One Element

```twm
import { makeDraggable } from "@tw/runtime"

makeDraggable(element, { axis: "x", handle: ".drag-handle" })
```

The element follows the pointer; `axis` restricts movement to one dimension, and `handle` limits where a drag can start.

## Sorting a List

```twm
import { makeSortable } from "@tw/runtime"

makeSortable(listEl, {
  onSort(oldIndex, newIndex) {
    console.log("moved", oldIndex, "->", newIndex)
  }
})
```

Sortable items are marked with the `data-tw-sortable-item` attribute — the sortable walks its children, tracks their drag, and reports the move through `onSort(oldIndex, newIndex)`.

```html
<ul id="list">
  <li data-tw-sortable-item>First</li>
  <li data-tw-sortable-item>Second</li>
  <li data-tw-sortable-item>Third</li>
</ul>
```

## Persisting the Order

`onSort` hands you the move — send it to a route handler to save it:

```twm
makeSortable(listEl, {
  onSort: (from, to) => {
    fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: from, to: to })
    })
  }
})
```

## Server Pairing

Drag state lives in the browser only. The server sees whatever the reorder handler sends — validate it like any request input ([Request Validation](./request-validation.md)).

## Related

- [Signals](./signals.md)
- [Client Runtime](./client-runtime.md)
