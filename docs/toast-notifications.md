# TW Framework — Toast Notifications

This document covers one thing completely: `toast` and its typed shortcuts — the notification system exported by `@tw/runtime`.

---

## toast

Shows a transient notification. Returns the toast id.

```twm
import { toast, toastSuccess, toastError, toastWarning, toastInfo } from "@tw/runtime"

toast("Connection restored")
toastSuccess("Saved")
toastError("Upload failed")
toastWarning("Storage almost full")
toastInfo("Tip: press ? for shortcuts")
```

## ToastOptions

```twm
toast("File exported", {
  id: "export-toast",        // reuse to replace instead of stack
  type: "success",           // "success" | "error" | "warning" | "info" | "default"
  title: "Export complete",  // bold heading above the message
  message: "File exported",  // required — body text
  duration: 5000,            // ms until auto-dismiss (0 = sticky)
  position: "bottom-right",  // corner/edge for this toast
  dismissible: true,         // show the close button
  showProgress: true,        // drain bar showing remaining time
  action: { label: "Open", handler: () => openFolder() },
  priority: "high",          // "low" | "normal" | "high" — high jumps the queue
  onClose: () => console.log("dismissed"),
  onClick: () => console.log("clicked"),
})
```

| Option | Values / Type | Meaning |
|--------|---------------|---------|
| `type` | `success / error / warning / info / default` | Visual style |
| `position` | `top-left / top-right / bottom-left / bottom-right / top-center / bottom-center` | Where it appears |
| `duration` | ms number | Auto-dismiss delay; `0` keeps it until dismissed |
| `dismissible` | boolean | Close button |
| `showProgress` | boolean | Countdown bar |
| `action` | `{ label, handler }` | One inline action button |
| `priority` | `low / normal / high` | Queue order when the stack is capped |
| `onClose`, `onClick` | callbacks | Interaction callbacks |

## Dismissing

```twm
import { toast, dismissToast, dismissAllToasts } from "@tw/runtime"

const id = toast("Uploading…", { duration: 0 })
await upload()
dismissToast(id)        // close one by id
dismissAllToasts()       // close everything
```

## The Toast Manager

All toasts live in one manager that owns the containers for each position.

```twm
import { getToastManager } from "@tw/runtime"

const manager = getToastManager()
manager.toasts          // currently visible toast entries
```

ToastEntry carries `{ id, type, title, message, position, createdAt }` — useful for rendering your own stack in tests.

## Practical Patterns

Replacer toast for long operations:

```twm
const id = toast("Uploading…", { duration: 0, type: "info" })
try {
  await uploadFile(file)
  dismissToast(id)
  toastSuccess("Upload complete")
} catch (err) {
  dismissToast(id)
  toastError("Upload failed: " + err.message)
}
```

Undo pattern using `action`:

```twm
toastWarning("Row deleted", {
  duration: 8000,
  action: { label: "Undo", handler: () => restoreRow() },
})
```
