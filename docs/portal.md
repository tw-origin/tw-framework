# TW Framework — Portal

This document covers one thing completely: `createPortal` (also exported as `teleport`, with `Teleport` and `createTeleportNode` for virtual-DOM usage) — rendering content outside the current DOM position.

---

## Why a Portal

Markup nested deep in the tree — dropdowns, modals, tooltips — needs to escape `overflow: hidden` and stacking-context ancestors. A portal moves rendered content to a chosen container while keeping it driven by the same rendering code.

## createPortal

```twm
import { createPortal, destroyPortal, getPortal } from "@tw/runtime"

const portal = createPortal("user-menu", {
  target: document.getElementById("overlay-root"), // element
  // targetSelector: "#overlay-root",               // or a selector
  append: false,        // false = clear the target first; true = append
  wrapperClass: "tw-portal",  // class on the wrapper div
  disabled: false,      // true renders in place instead of teleporting
})
```

`createPortal(id, options?)` registers a named portal. Two aliases exist for familiar naming: `teleport` is `createPortal`, `Teleport` is the Portal class itself.

## PortalOptions

| Option | Type | Meaning |
|--------|------|---------|
| `target` | `HTMLElement` | Container element (mutually exclusive with `targetSelector`) |
| `targetSelector` | `string` | CSS selector resolved at creation and on each re-target |
| `append` | `boolean` | Append to the target instead of replacing its content |
| `wrapperClass` | `string` | Class applied to the injected wrapper |
| `disabled` | `boolean` | Disable teleporting — content renders in place |

## Portal Operations

```twm
portal.mount(content)     // element or HTML string -> moved into the target
portal.unmount()          // remove the content from the target
portal.update(content)    // replace the current content
portal.destroy()          // unmount AND unregister the portal

// By id:
getPortal("user-menu")    // look up a registered portal
destroyPortal("user-menu")
destroyAllPortals()
```

## createTeleportNode

When building virtual-DOM output, wrap children so the renderer sends them through a portal at mount time.

```twm
import { createTeleportNode, createVNode } from "@tw/runtime"

const vdom = createTeleportNode("#overlay-root", [
  createVNode("div", { class: "menu" }, [createVNode("span", {}, ["Portaled"])]),
])
```

## Registry Behavior

- Portal ids are unique: re-registering an existing id replaces the entry.
- `destroyAllPortals()` is safe during teardown — each portal unmounts its content first.
- A portal whose `target`/`targetSelector` cannot be resolved stays dormant; `mount` throws only when no target was ever found.

## Typical Use: Hovercard Outside a Clipped Parent

```twm
import { createPortal } from "@tw/runtime"

const card = createPortal("hovercard", { targetSelector: "body", append: true })

anchorElement.addEventListener("mouseenter", () => {
  card.mount(renderCard())
  positionAt(anchorElement)
})
anchorElement.addEventListener("mouseleave", () => {
  card.unmount()
})
```
