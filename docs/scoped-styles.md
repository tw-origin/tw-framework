# TW Framework — Scoped Styles

This document covers one thing completely: `.module.tss` and `.module.css` — styles scoped to one component, how the scoping works, and how to use scoped class names in markup.

---

## What a Module Stylesheet Is

A `.module.tss` (or `.module.css`) file contains styles for exactly one component. Class names in it are automatically rewritten so they can only apply to elements rendered by pages that import that module:

```tss
/* components/Button.module.tss */
.btn {
  bg #2563eb
  c white
  p 10px 18px
  br 8px
  cur pointer

  &:hover {
    bg #1d4ed8
  }
}
```

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

Everything about the languages inside is the same as their global counterparts — [TSS Syntax](./tss-syntax.md) for `.module.tss`, [Plain CSS](./plain-css.md) for `.module.css`. The module extension changes only the **scoping**.

---

## How Scoping Works

The compiler hashes the class names into names unique to the file:

```text
.btn      →  .btn_btn__a3f2k
.card     →  .card_card__b91de
```

This gives three guarantees:

1. **The styles only apply where the module is imported** — a `.btn` class in another component's stylesheet never collides
2. **Simple class names stay safe** — every component can have its own `.btn`, `.card`, `.title`
3. **No accidental style leakage** between components

The same class written in two different module files produces two different scoped names — they never fight.

---

## Importing a Module

```tw
import styles from "@./components/Button.module.tss"
```

The module import binds the file's class map to `styles`. The stylesheet joins the page's CSS output automatically.

## Using Scoped Class Names in Markup

Dot-notation classes on the page are matched to the imported module and scoped automatically:

```tw
import styles from "@./components/Button.module.tss"

button.btn {
  "Click me"
}
```

The compiler resolves `.btn` through the imported module's map and emits the hashed name. You write the plain class name; the build rewrites both the CSS and the markup to the same scoped name.

### Convention

Keep the module file next to its component, named after it:

```text
components/
  Button.tw
  Button.module.tss
  Card.tw
  Card.module.tss
```

Import the module from the pages (or layouts) that render the component's classes.

---

## Scoped + TSS Together

`.module.tss` has everything `.tss` has — shorthands, nesting, `$variables`:

```tss
/* components/Stats.module.tss */
$label-color: #8b949e

.stats-grid {
  d grid
  grid-template-columns repeat(3, 1fr)
  gap 16px

  .stat {
    bg #161b22
    br 8px
    p 16px

    .stat-label {
      fs 12px
      c $label-color
      tt uppercase
      ls 0.5px
    }

    .stat-value {
      fs 24px
      fw 700
      c #c9d1d9
    }
  }
}
```

---

## Where Scoped Styles Sit in the Cascade

Styles apply in this order, lowest to highest priority:

```
1. reset.css / globals.tss         (base — lowest)
2. section/*.tss                   (section styles)
3. component inline <style>        (inline style block in .tw file)
4. *.module.tss / *.module.css     (scoped — highest)
```

A scoped rule wins over a global rule with the same specificity — component styles override the page around them.

---

## When to Use Scoped Styles

| Situation | Use |
|-----------|-----|
| Styles for one specific component | `.module.tss` (TSS) or `.module.css` (standard CSS) |
| A section or page's look | global `.tss` in `style/` |
| Third-party resets, overrides | global `.css` |
| Mixins, loops, generated utilities | `.scss` |

The full decision guide is in [Styling Guide](./styling-guide.md).

---

## Common Mistakes

### Importing the module but writing an unlisted class

Only classes that exist in the module's file get scoped. A class the module does not define stays global — define it in the module or in a global stylesheet.

### Two components sharing one module

A module belongs to one component. Shared styles go in a global stylesheet under `style/`.

### Expecting `.module.scss`

The SCSS pipeline is global-only. For scoped component styles, use `.module.tss` or `.module.css`.

---

## Quick Reference

```tss
/* components/Button.module.tss */
.btn { bg #2563eb; br 8px }
.btn-ghost { bg transparent; bd 1px solid #30363d }
```

```tw
/* page */
import styles from "@./components/Button.module.tss"

button.btn "Save" { }
button.btn-ghost "Cancel" { }
```

## Related

- [TSS Syntax](./tss-syntax.md)
- [Plain CSS](./plain-css.md)
- [Styling Guide](./styling-guide.md) — cascade order and decision guide
- [Production CSS](./production-css.md)
