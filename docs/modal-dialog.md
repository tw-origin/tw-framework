# TW Framework — Modal Dialogs

This document covers one thing completely: `showModal`, `openModal`, `closeModal`, `confirmDialog`, and `alertDialog` — the modal system exported by `@tw/runtime`.

---

## showModal

Creates a modal with generated id, adds it to the modal layer, and starts its open animation.

```twm
import { showModal, closeModal } from "@tw/runtime"

const content = document.createElement("p")
content.textContent = "Saved successfully."

const id = showModal(content, {
  backdrop: true,          // dim the page behind the dialog
  backdropClose: true,     // clicking the backdrop closes it
  escapeClose: true,       // Escape key closes it
  focusTrap: true,         // keep keyboard focus inside the dialog
  lockScroll: true,        // freeze page scroll while open
  animation: "fade",       // entrance animation name
  onOpen: () => console.log("opened"),
  onClose: () => console.log("closed"),
})
```

`showModal(content, options?)` accepts either an `HTMLElement` or an HTML string, and returns the modal id.

## ModalOptions

| Option | Default | Meaning |
|--------|---------|---------|
| `backdrop` | `true` | Render a dimmed backdrop |
| `backdropClose` | `true` | Backdrop click closes the modal |
| `escapeClose` | `true` | Escape key closes the modal |
| `focusTrap` | `true` | Trap Tab focus inside the dialog |
| `lockScroll` | `true` | Lock body scroll while open |
| `animation` | — | Entrance animation name |
| `onOpen` / `onClose` | — | Lifecycle callbacks |
| `beforeClose` | — | Guard; return `false` (or a promise of it) to cancel closing |

## openModal / closeModal

For imperatively staged content, create the modal first and open it later.

```twm
import { showModal, openModal, closeModal } from "@tw/runtime"

const id = showModal(content)   // registered, animated open
await openModal(id)             // resolves when the open transition ends
await closeModal(id)            // resolves when the close transition ends
```

## beforeClose guard

```twm
showModal(content, {
  beforeClose: () => {
    return confirm("Discard changes?")    // false keeps the dialog open
  },
})
```

`beforeClose` may return `boolean` or `Promise<boolean>`.

## confirmDialog

A promise-based confirmation dialog. Resolves `true` when accepted, `false` when dismissed.

```twm
import { confirmDialog } from "@tw/runtime"

const ok = await confirmDialog({
  title: "Delete post",
  message: "This cannot be undone.",
  ...modalOptions,             // ConfirmOptions extends ModalOptions
})
if (ok) deletePost()
```

ConfirmOptions adds:

| Option | Type | Meaning |
|--------|------|---------|
| `title` | `string` | Dialog heading |
| `message` | `string` | Body text (required) |

## alertDialog

Fire-and-forget information dialog; resolves when dismissed.

```twm
import { alertDialog } from "@tw/runtime"

await alertDialog("Report generated.", "Done")
```

`alertDialog(message, title?, options?)`

## Managing Every Open Modal

The manager keeps a stack, so Escape and focus restoration behave correctly across nested modals.

```twm
import { getModalManager, closeAllModals } from "@tw/runtime"

getModalManager().modals      // currently open modal entries
closeAllModals()               // emergency teardown
```
