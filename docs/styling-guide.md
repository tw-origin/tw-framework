# TW Framework — Styling Overview

This document is the map of the styling system: the file types, the cascade order, the decision guide and the common patterns. Each file type has its own deep-dive document — follow the links.

---

## Style File Types

| File | Scope | Language | Shorthands | Nesting | Deep dive |
|------|-------|----------|------------|---------|-----------|
| `.tss` | Global | CSS + TSS shorthands | Yes | Yes | [TSS Syntax](./tss-syntax.md) |
| `.module.tss` | Scoped | CSS + TSS shorthands | Yes | Yes | [Scoped Styles](./scoped-styles.md) |
| `.css` | Global | Plain CSS | No | No | [Plain CSS](./plain-css.md) |
| `.module.css` | Scoped | Plain CSS | No | No | [Scoped Styles](./scoped-styles.md) |
| `.scss` | Global | SCSS/Sass | No (SCSS has its own) | Yes | [SCSS](./scss-guide.md) |

All five feed the same production pipeline — route-split, content-hashed, minified output. See [Production CSS](./production-css.md).

Inline `style "..."` attributes on elements are runtime styles and are never extracted into the CSS files.

---

## Importing Styles

### Global styles (side-effect import)

```tw
import "@./style/global.tss"
import "@./style/blog.tss"
```

The styles are included in the page's CSS automatically.

### Scoped styles (named import)

```tw
import styles from "@./components/Button.module.tss"
```

### Multiple imports

```tw
import "@./style/global.tss"
import "@./style/variables.tss"
import "@./style/themes.tss"
import "@./style/animations.tss"
import styles from "@./components/Card.module.tss"
```

---

## Inline Styles in .tw Files

`<style>` blocks inside `.tw` files are extracted by the compiler and included in the page's CSS output:

```tw
div.card {
  h1 "Title"
  p "Content"
}

style {
  .card {
    bg #fff
    p 20px
    br 8px
  }
}
```

---

## Style Cascade Order

Styles are applied in this order (lowest to highest priority):

```
1. reset.css / globals.tss        (base — lowest)
2. section/*.tss                  (section styles)
3. component inline <style>       (inline in .tw file)
4. *.module.tss / *.module.css    (scoped — highest)
```

---

## When to Use Each — Decision Guide

```
Do you need styles for a specific component?
  ├─ YES → Do you want TSS shorthands?
  │        ├─ YES → .module.tss
  │        └─ NO  → .module.css
  │
  └─ NO → Do you need styles for a whole section/page?
           ├─ YES → Do you want TSS shorthands?
           │        ├─ YES → .tss
           │        └─ NO  → .css
           │
           └─ NO → Do you need SCSS features (mixins, loops)?
                    ├─ YES → .scss
                    └─ NO  → You probably do not need a new file
```

---

## Common Patterns

### Global reset + base styles
```
style/
  global.tss    ← reset, body, a, etc.
```

### Per-section styles
```
style/
  blog.tss       ← blog section
  dashboard.tss  ← dashboard section
  shop.tss       ← shop section
```

### Per-component styles
```
components/
  Button.tw
  Button.module.tss    ← scoped to Button
  Card.tw
  Card.module.tss      ← scoped to Card
```

### Theme system
```
style/
  variables.tss    ← colors, spacing, z-index
  themes.tss        ← light/dark theme definitions
  animations.tss    ← shared keyframes and transitions
```

### Dark mode

```tss
:root {
  --bg: #0d1117
  --text: #c9d1d9
}

[data-theme="light"] {
  --bg: #ffffff
  --text: #333333
}

body {
  bg var(--bg)
  c var(--text)
}
```

---

## Production Output — At a Glance

`tw build` emits styles as separate, optimized CSS asset files. Each page links only the stylesheets it uses; styles shared by two or more routes land in `common.<hash>.css`, single-route styles in `<route>.<hash>.css`, and very small stylesheets are inlined as critical CSS. Filenames are content-hashed, so unchanged styles keep their cache across builds. The full pipeline: [Production CSS](./production-css.md).

---

## Complete Style Example

### style/global.tss
```tss
* { margin 0; padding 0; box-sizing border-box }
body { font-family system-ui, sans-serif; bg #0d1117; c #c9d1d9; lh 1.6 }
a { c #58a6ff; td none }
a:hover { td underline }
.container { max-w 1200px; m 0 auto; p 2rem }
```

### style/dashboard.tss
```tss
$sidebar-width: 240px
$primary: #2563eb

.dashboard {
  d flex
  min-h 100vh

  .sidebar {
    w $sidebar-width
    bg #161b22
    p 1rem
    pos fixed
    h 100vh
    ov-y auto
    z 10

    .nav-link {
      d block
      c #c9d1d9
      p 0.5rem 1rem
      br 4px
      m-b 2px

      &:hover {
        bg #21262d
        c #58a6ff
      }
    }
  }

  .main-content {
    flex 1
    ml $sidebar-width
    p 2rem
  }
}

@media (max-width: 768px) {
  .sidebar { d none }
  .main-content { ml 0; p 1rem }
}
```

### components/Button.module.tss
```tss
.btn {
  bg #2563eb
  c white
  p 0.5rem 1rem
  br 8px
  bd none
  cur pointer
  fs 14px
  fw 600
  tr background 0.2s ease

  &:hover {
    bg #1d4ed8
  }

  &:active {
    tf scale(0.98)
  }
}

.btn-danger {
  bg #dc2626

  &:hover {
    bg #b91c1c
  }
}

.btn-ghost {
  bg transparent
  c #58a6ff
  bd 1px solid #30363d

  &:hover {
    bg #21262d
  }
}
```

## Related

- [TSS Syntax](./tss-syntax.md) — shorthands, nesting, variables
- [Scoped Styles](./scoped-styles.md)
- [SCSS](./scss-guide.md)
- [Plain CSS](./plain-css.md)
- [Production CSS](./production-css.md)
