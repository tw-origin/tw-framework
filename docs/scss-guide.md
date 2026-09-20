# TW Framework — SCSS

This document covers one thing completely: `.scss` files — using Sass/SCSS with its mixins, variables, loops and conditionals inside a TW project.

---

## What SCSS Support Is

`.scss` files are compiled by the SCSS compiler as part of the build. Everything SCSS offers works — nesting, variables, mixins, functions, loops, conditionals:

```scss
/* style/themes.scss */
$primary: #2563eb;
$dark-bg: #0d1117;
$light-bg: #f6f8fa;
$radius: 8px;

@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin card($bg: white, $border: #ddd) {
  background: $bg;
  border: 1px solid $border;
  border-radius: $radius;
  padding: 20px;
}

.dashboard {
  background: $dark-bg;

  .sidebar {
    width: 240px;
    background: lighten($dark-bg, 5%);

    a {
      color: lighten($primary, 20%);
      padding: 8px 12px;

      &:hover {
        color: $primary;
        background: lighten($dark-bg, 10%);
      }
    }
  }

  .main-content {
    @include flex-center;
    flex-direction: column;
    padding: 2rem;
  }

  .card {
    @include card(#161b22, #30363d);

    .card-title {
      color: $primary;
    }
  }
}
```

---

## What SCSS Adds Over TSS

TSS gives you shorthands, nesting and `$variables` with zero extra concepts ([TSS Syntax](./tss-syntax.md)). SCSS adds the full Sass language:

| Feature | Example |
|---------|---------|
| Mixins | `@mixin card($bg) { ... }` + `@include card(#fff)` |
| Loops | `@for $i from 1 through 6 { .mt-#{$i} { margin-top: $i * 0.5rem; } }` |
| Each loops | `@each $name, $color in $theme-map { .#{$name} { color: $color; } }` |
| Conditionals | `@if $is-dark { ... } @else { ... }` |
| Functions | `lighten($c, 10%)`, `darken($c, 10%)`, `mix($a, $b)` |
| Maps | `$themes: (light: #fff, dark: #0d1117);` |

### A generated utility set

```scss
@for $i from 1 through 6 {
  .mt-#{$i} {
    margin-top: $i * 0.5rem;
  }
}
```

Compiles to `.mt-1 { margin-top: 0.5rem; }` ... `.mt-6 { margin-top: 3rem; }` — design-system spacing in six lines.

### Theme selection at compile time

```scss
$is-dark: true;

body {
  @if $is-dark {
    background: $dark-bg;
    color: #c9d1d9;
  } @else {
    background: $light-bg;
    color: #333;
  }
}
```

---

## When to Use SCSS

- Design systems with generated utility classes
- Complex themes built from maps and mixins
- Projects carrying existing SCSS that you want to keep as-is

For everything else, `.tss` gives you the same nesting and variables with less ceremony, and it is the framework's primary styling language. The decision guide is in [Styling Guide](./styling-guide.md).

SCSS in TW is global — there is no `.module.scss` variant. For scoped component styles use [Scoped Styles](./scoped-styles.md) (`.module.tss` / `.module.css`).

---

## Using SCSS in a Page

```tw
import "@./style/themes.scss"

page { title "Dashboard" render ssr }

div.dashboard {
  p "Styled by SCSS"
}
```

Imported from the root layout, an SCSS file feeds every page:

```tw
// home/layout.tw
import "@./style/global.scss"
```

The compiled CSS joins the same production pipeline as every other stylesheet — route-split, content-hashed, shared via `common.css` where used by multiple routes. See [Production CSS](./production-css.md).

---

## Rules

- Syntax is standard SCSS — semicolons and colons required
- Files live in `style/` by convention (`style/themes.scss`)
- `$variables` are file-scoped at compile time, like TSS variables
- The output is plain CSS — runtime theming still belongs to CSS custom properties:

```scss
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

### TSS shorthands inside .scss

```scss
.card { bg #fff; }        // ✗ — .scss is SCSS, not TSS
.card { background: #fff; }  // ✓
```

### Expecting SCSS variables to reach other files

`$primary` exists only in the file that declares it. Share values via a partial imported everywhere or CSS custom properties.

### Reaching for SCSS for simple needs

Nesting + variables already work in `.tss`. Add SCSS when you actually need mixins, loops or functions.

---

## Quick Reference

```scss
$var: value;                     // variable
@mixin name($arg) { ... }        // mixin
@include name(#fff);             // use mixin
@for $i from 1 through 6 { }     // loop
@each $k, $v in $map { }        // map loop
@if $cond { } @else { }         // conditional
lighten($c, 10%);               // function
@import "partial";              // partials
```

## Related

- [TSS Syntax](./tss-syntax.md)
- [Plain CSS](./plain-css.md)
- [Scoped Styles](./scoped-styles.md)
- [Production CSS](./production-css.md)
