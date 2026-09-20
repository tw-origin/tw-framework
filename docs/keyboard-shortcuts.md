# TW Framework — Keyboard Shortcuts

This document covers one thing completely: `registerShortcut` — binding key combinations to handlers.

---

## Registering

```twm
import { registerShortcut } from "@tw/runtime"

const off = registerShortcut("mod+k", (event) => {
  event.preventDefault()
  openSearch()
})
```

The function returns an unregister handle — call it to stop the shortcut:

```twm
off()   // "mod+k" no longer triggers
```

## Key Syntax

Keys are written lowercase, `+`-combined:

| Token | Matches |
|-------|---------|
| `ctrl` | the Ctrl key |
| `cmd` or `meta` | the Cmd key (macOS) / Meta key |
| `alt`, `shift` | those modifiers |
| `a`–`z`, `0`–`9` | literal keys |
| `enter`, `escape`, `tab`, `arrowup` | named keys — the browser's key name, lowercased |

Examples: `"ctrl+k"`, `"cmd+shift+p"`, `"alt+arrowright"`. A space splits a sequence — `"g d"` presses `g`, then `d`.

## Scopes

Shortcuts can be scoped so the same keys mean different things in different parts of the app:

```twm
import { setShortcutScope } from "@tw/runtime"

setShortcutScope("editor")
```

Register with a `scope` option to limit when a shortcut is active.

## Help Panel

`getShortcutHelp()` returns the registered shortcuts (keys, description, scope) — render it as your `?`-overlay so users can discover them.

## Cleanup

Unregister shortcuts when their UI goes away — a handler that fires after its panel is gone is a bug. Pair registration with teardown in the same place.

## Related

- [Focus Trap](./focus-trap.md)
- [Client Runtime](./client-runtime.md)
