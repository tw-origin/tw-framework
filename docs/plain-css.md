# TW Framework — Plain CSS

This document covers one thing completely: `.css` and `.module.css` files — writing standard CSS in a TW project.

---

## .css — Plain Global CSS

A `.css` file is standard CSS, passed through with no expansion and no transformation:

```css
/* style/globals.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, sans-serif;
  background: #0d1117;
  color: #c9d1d9;
}

a {
  color: #58a6ff;
  text-decoration: none;
}
```

Rules:

- Standard syntax only — **colons and semicolons required**
- No TSS shorthands — `bg #fff` is an error (TW301)
- No nesting — flat selectors only
- No `$variables` — use CSS custom properties

Imported like any stylesheet:

```tw
import "@./style/globals.css"
```

---

## What a TSS Shorthand in .css Looks Like

The compiler rejects TSS shorthands inside `.css` files with a clear fix:

```css
/* WRONG — this will error: */
.card { bg: #fff; p: 20px; }
```

```
Error TW301: TSS shorthand "bg" is not valid in a .css file.

  Fix:
    1. Use full CSS: background: #fff;
    2. Or rename to .tss: card.tss
```

Shorthands belong to `.tss` and `.module.tss` — see [TSS Syntax](./tss-syntax.md).

---

## When to Use .css

- **CSS reset / normalize** — drop-in standard files
- **Third-party library overrides** — plugin CSS you want verbatim
- **Legacy CSS** — existing styles you keep as-is
- Standard-CSS-only preference — no framework conveniences, no surprises

---

## .module.css — Scoped Plain CSS

Same standard-CSS rules, plus automatic class-name scoping:

```css
/* components/Card.module.css */
.card {
  background: #fff;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 20px;
}

.card-title {
  font-size: 18px;
  color: #58a6ff;
  margin-bottom: 8px;
}
```

Import and use exactly like a `.module.tss` module:

```tw
import styles from "@./components/Card.module.css"

div.card {
  h3.card-title "Title"
  p "Content"
}
```

Class names are hashed to the module (`.card_card__b91de`), so they apply only where this module is imported. The full scoping model is in [Scoped Styles](./scoped-styles.md).

Use `.module.css` when you want CSS-Modules-style scoping with standard CSS syntax — migrating from a CSS Modules codebase, or when everyone on the team prefers full property names.

---

## Where Plain CSS Sits

| File | Syntax | Scope |
|------|--------|-------|
| `.css` | standard CSS | global |
| `.module.css` | standard CSS | scoped to the component |
| `.tss` | CSS + shorthands | global |
| `.module.tss` | CSS + shorthands | scoped |
| `.scss` | SCSS | global |

All five feed the same production pipeline — route-split, content-hashed, minified output. See [Production CSS](./production-css.md).

---

## CSS Custom Properties Work Everywhere

Runtime theming uses standard custom properties, which work in every file type:

```css
/* style/theme.css */
:root {
  --bg: #0d1117;
  --text: #c9d1d9;
}

[data-theme="light"] {
  --bg: #ffffff;
  --text: #333333;
}

body {
  background: var(--bg);
  color: var(--text);
}
```

---

## Common Mistakes

### Dropping the semicolons

```css
.card { background: #fff padding: 20px }    /* ✗ invalid CSS */
.card { background: #fff; padding: 20px; }  /* ✓ */
```

### Nesting selectors

```css
.card { .title { color: red; } }   /* ✗ plain CSS does not nest */
.card .title { color: red; }        /* ✓ */
```

### Module import without usage

Importing a module and then writing a class the module does not define leaves that class global. Define it in the module or in a global stylesheet.

---

## Quick Reference

```css
/* global */
selector { property: value; }

/* module — scoped */
import styles from "@/components/X.module.css";
selector.card { }
```

## Related

- [TSS Syntax](./tss-syntax.md)
- [Scoped Styles](./scoped-styles.md)
- [Styling Guide](./styling-guide.md)
- [Production CSS](./production-css.md)
