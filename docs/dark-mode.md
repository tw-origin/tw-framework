# TW Framework — Dark Mode

This document covers one thing completely: theme modes — reading, setting and reacting to dark mode.

---

## The API

| Function | Purpose |
|----------|---------|
| `useThemeMode()` | a signal of the current mode — `"light" \| "dark" \| "auto"` |
| `setThemeMode(mode)` | set the mode explicitly |
| `isDarkMode()` | is dark currently active (resolves `"system"`) |

```twm
import { useThemeMode, setThemeMode, isDarkMode } from "@tw/runtime"

const mode = useThemeMode()   // a signal — read with .value
mode.value                    // "dark"
setThemeMode("dark")
isDarkMode()                  // true
```

## The Toggle

```tw
state { dark = false }

header.app {
  button.toggle on:click "dark = !dark" {
    if dark { "Switch to light" }
    else { "Switch to dark" }
  }
}
```

Pair the page state with the runtime mode — set it once on change:

```twm
setThemeMode(dark ? "dark" : "light")
```

## System Preference

`"auto"` follows the OS setting. `isDarkMode()` resolves it against the system preference at read time, so a change in OS theme reflects on the next render.

## Styling for Both Modes

Drive colours from a class on the root, and let CSS do the rest:

```css
.site { background: #ffffff; color: #111111; }
.dark .site { background: #111111; color: #eeeeee; }
```

Media-query-free switching: one class, one repaint.

## Related

- [Styling Guide](./styling-guide.md)
- [Signals](./signals.md)
