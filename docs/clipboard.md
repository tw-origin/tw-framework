# TW Framework — Clipboard

This document covers one thing completely: `copyText` — writing text to the system clipboard from the browser.

---

## Copying

```twm
import { copyText } from "@tw/runtime"

await copyText("https://myapp.com/blog/q3-report")
```

`copyText` returns a promise — it resolves when the text is on the clipboard.

## The Button Pattern

```tw
state { copied = false }

div.share {
  button on:click "copied = true" { "Copy link" }
  if copied { span.hint { "Copied!" } }
}
```

## Errors

Clipboard access can fail — the page is not focused, or the environment denies it. Always await and treat a rejection as "not copied":

```twm
try {
  await copyText(link)
} catch {
  // show the link so the user can copy it manually
}
```

## Manager

`getClipboardManager()` returns the shared manager behind `copyText` — the same instance the runtime uses, for advanced flows (multiple writes, listening for failures).

| API | Purpose |
|-----|---------|
| `copyText(text)` | copy a string (promise) |
| `getClipboardManager()` | the shared manager instance |

## Related

- [Client Runtime](./client-runtime.md)
