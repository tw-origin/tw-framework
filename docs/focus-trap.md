# TW Framework — Focus Trap

This document covers one thing completely: `createFocusTrap` — keeping keyboard focus inside a modal or menu while it is open.

---

## Creating the Trap

```twm
import { createFocusTrap } from "@tw/runtime"

const trap = createFocusTrap(modalElement, {
  initialFocus: modalElement.querySelector("input"),  // element or selector
  escapeDeactivates: true,    // Esc releases the trap
  onDeactivate: () => closeModal()
})
```

| Option | Meaning |
|--------|---------|
| `initialFocus` | an `HTMLElement` or selector string to focus on activation |
| `escapeDeactivates` | Esc exits the trap (default true) |
| `onDeactivate` | called when the trap ends (Esc or programmatic) |
| `fallbackFocus` | focused when `initialFocus` matches nothing |
| `allowOutsideClick` | let clicks outside the container through |

## The Behaviour

While active:

- `Tab` and `Shift+Tab` cycle through the tabbable elements **inside** the container
- focus that escapes to the page is pulled back in
- screen reader users browse the modal as a self-contained unit

## Activation Lifecycle

```twm
const trap = createFocusTrap(el, { ... })
trap.activate()      // when the modal opens
trap.deactivate()    // when it closes — focus returns to the trigger
```

## Where It Belongs

- dialogs and modals
- slide-out menus and drawers
- any overlay where `Tab` should not reach the page behind it

One trap at a time — opening a second overlay replaces the first trap, closing it restores the outer one.

## Related

- [Keyboard Shortcuts](./keyboard-shortcuts.md)
- [Client Runtime](./client-runtime.md)
