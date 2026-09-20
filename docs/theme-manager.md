# TW Framework — Theme Manager

This document covers one thing completely: `initTheme`, `useTheme`, `useThemeMode`, `setThemeMode`, and `toggleTheme` — the full theme system including custom themes and transition control. For the dark-mode toggle alone, see doc 104.

---

## initTheme

```twm
import { initTheme } from "@tw/runtime"

const manager = initTheme({
  defaultMode: "system",            // "light" | "dark" | "system"
  storageKey: "app-theme",          // where the chosen mode persists
  enableTransitions: true,          // animate color changes
  transitionDuration: 200,          // ms
  customThemes: {
    brand: {                        // Record<string, Theme>
      mode: "light",
      colors: { ...themeColors },
    },
  },
})
```

`initTheme(options?)` replaces any existing global manager. ThemeManagerOptions:

| Option | Default | Meaning |
|--------|---------|---------|
| `defaultMode` | `"system"` | Starting `ThemeMode` |
| `storageKey` | set | localStorage key for the persisted mode |
| `enableTransitions` | `true` | Animate color changes |
| `transitionDuration` | `200` | Transition length in ms |
| `customThemes` | — | Named themes beyond light/dark |

## Reactive Access

```twm
import { useTheme, useThemeMode, isDarkMode } from "@tw/runtime"

const theme = useTheme()        // Signal<Theme> — full active theme object
const mode = useThemeMode()     // Signal<ThemeMode> — "light" | "dark" | "system"
isDarkMode()                     // boolean snapshot
```

Signals update every consumer when the mode changes — no re-init needed.

## Changing the Mode

```twm
import { setThemeMode, toggleTheme } from "@tw/runtime"

setThemeMode("dark")     // switch and persist
toggleTheme()             // light <-> dark
```

## The Theme Shape

Every theme carries a mode and a `ThemeColors` object:

| Group | Keys |
|-------|------|
| Base | `background`, `foreground`, `primary`, `secondary`, `accent`, `muted` |
| Semantic | `success`, `warning`, `error`, `info` |
| Surfaces | `surface`, `surfaceHover`, `surfaceActive`, `border` |
| Text | `textPrimary`, `textSecondary`, `textMuted` |

Custom themes supply these same keys, so components written against light/dark work unchanged with a branded palette.

## Custom Theme Walkthrough

```twm
import { initTheme, useTheme } from "@tw/runtime"

const manager = initTheme({
  customThemes: {
    brand: {
      mode: "light",
      colors: {
        background: "#fdfcf9",
        foreground: "#1f2937",
        primary: "#7c3aed",
        secondary: "#a78bfa",
        accent: "#f59e0b",
        muted: "#9ca3af",
        success: "#059669",
        warning: "#d97706",
        error: "#dc2626",
        info: "#2563eb",
        surface: "#ffffff",
        surfaceHover: "#f5f3ff",
        surfaceActive: "#ede9fe",
        border: "#e5e7eb",
        textPrimary: "#111827",
        textSecondary: "#4b5563",
        textMuted: "#9ca3af",
      },
    },
  },
  defaultMode: "light",
})

manager.setTheme("brand")        // activate by name
useTheme()()                      // the brand palette
```

## Manager Lifetime

`initTheme` destroys the previous global manager; `getThemeManager()` fetches the current one. Use the manager instance for operations the signal helpers don't cover: `setTheme(name)`, `registerTheme(theme)`, `destroy()`.
