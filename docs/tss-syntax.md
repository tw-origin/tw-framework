# TW Framework — TSS Syntax

This document covers one thing completely: `.tss` — TW Style Sheets — shorthand properties, nesting, variables, media queries and comments.

---

## What TSS Is

TSS is CSS with a shorthand layer. Every valid CSS works, and frequently-used properties get short space-separated forms:

```tss
/* shorthands — no colon */
.card {
  bg #fff
  p 20px
  m 16px 0
  br 8px
  d flex
  gap 16px
}

/* standard CSS — with colon */
.card {
  background: #fff;
  padding: 20px;
  margin: 16px 0;
  border-radius: 8px;
  display: flex;
  gap: 16px;
}
```

Both forms compile to the same CSS, and you can mix them freely within one rule. Shorthands are optional — use them where they read well.

`shorthand` is TSS-only. In plain `.css` files, writing `bg #fff` is an error (TW301) — see [Plain CSS](./plain-css.md).

---

## The Complete Shorthand Reference

| Shorthand | Expands to | Example |
|-----------|------------|---------|
| `bg` | `background` | `bg #fff` |
| `bg-c` | `background-color` | `bg-c #ff0000` |
| `bg-i` | `background-image` | `bg-i url(...)` |
| `m` | `margin` | `m 20px` |
| `mt` | `margin-top` | `mt 10px` |
| `mr` | `margin-right` | `mr 10px` |
| `mb` | `margin-bottom` | `mb 10px` |
| `ml` | `margin-left` | `ml 10px` |
| `p` | `padding` | `p 20px` |
| `pt` | `padding-top` | `pt 10px` |
| `pr` | `padding-right` | `pr 10px` |
| `pb` | `padding-bottom` | `pb 10px` |
| `pl` | `padding-left` | `pl 10px` |
| `w` | `width` | `w 100%` |
| `min-w` | `min-width` | `min-w 200px` |
| `max-w` | `max-width` | `max-w 800px` |
| `h` | `height` | `h 100vh` |
| `min-h` | `min-height` | `min-h 400px` |
| `max-h` | `max-height` | `max-h 600px` |
| `d` | `display` | `d flex` |
| `c` | `color` | `c #333` |
| `fs` | `font-size` | `fs 16px` |
| `fw` | `font-weight` | `fw bold` |
| `ff` | `font-family` | `ff system-ui` |
| `lh` | `line-height` | `lh 1.6` |
| `ls` | `letter-spacing` | `ls 0.5px` |
| `ta` | `text-align` | `ta center` |
| `td` | `text-decoration` | `td underline` |
| `tt` | `text-transform` | `tt uppercase` |
| `bd` | `border` | `bd 1px solid #ddd` |
| `bd-t` | `border-top` | `bd-t 2px solid red` |
| `bd-r` | `border-right` | `bd-r 1px solid #ddd` |
| `bd-b` | `border-bottom` | `bd-b 1px solid #ddd` |
| `bd-l` | `border-left` | `bd-l 1px solid #ddd` |
| `br` | `border-radius` | `br 8px` |
| `br-tl` | `border-top-left-radius` | `br-tl 4px` |
| `br-tr` | `border-top-right-radius` | `br-tr 4px` |
| `br-bl` | `border-bottom-left-radius` | `br-bl 4px` |
| `br-br` | `border-bottom-right-radius` | `br-br 4px` |
| `pos` | `position` | `pos fixed` |
| `t` | `top` | `t 0` |
| `r` | `right` | `r 0` |
| `b` | `bottom` | `b 0` |
| `l` | `left` | `l 0` |
| `z` | `z-index` | `z 100` |
| `fl` | `float` | `fl left` |
| `cl` | `clear` | `cl both` |
| `ov` | `overflow` | `ov hidden` |
| `ov-x` | `overflow-x` | `ov-x auto` |
| `ov-y` | `overflow-y` | `ov-y scroll` |
| `cur` | `cursor` | `cur pointer` |
| `op` | `opacity` | `op 0.8` |
| `tr` | `transition` | `tr all 0.3s ease` |
| `tf` | `transform` | `tf scale(1.1)` |
| `box` | `box-sizing` | `box border-box` |
| `gap` | `gap` | `gap 16px` |
| `dir` | `direction` | `dir rtl` |
| `ws` | `white-space` | `ws nowrap` |
| `ww` | `word-wrap` | `ww break-word` |
| `va` | `vertical-align` | `va middle` |

Values pass through unchanged — multi-value, functions, units all work: `m 16px 0`, `tf scale(1.05) rotate(2deg)`, `tr background 0.2s ease`.

---

## Nesting

TSS nests like SCSS:

```tss
.dashboard {
  bg #0d1117
  d flex
  min-h 100vh

  .sidebar {
    w 240px
    bg #161b22
    p 1rem

    .nav-link {
      d block
      c #c9d1d9
      p 0.5rem 1rem
      td none

      &:hover {
        c #58a6ff
        bg #21262d
      }
    }
  }

  .main-content {
    flex 1
    p 2rem
  }
}
```

Compiles to descendant selectors — `.dashboard .sidebar .nav-link:hover`. The `&` refers to the parent selector.

---

## Variables

`$name: value` at the top of a file:

```tss
$primary: #2563eb
$danger: #dc2626
$radius: 8px
$spacing: 1rem

.btn {
  bg $primary
  c white
  p 0.5rem 1rem
  br $radius
  cur pointer
}

.btn-danger {
  bg $danger
  br $radius
}
```

Variables are compile-time substitutions inside the file that declares them. For values shared across every stylesheet, use CSS custom properties instead:

```tss
:root {
  --bg: #0d1117
  --text: #c9d1d9
}

body {
  bg var(--bg)
  c var(--text)
}
```

Custom properties are runtime CSS variables — they cascade, they work across files, and they power themes ([Styling Guide](./styling-guide.md)).

---

## Media Queries

Standard `@media` blocks, nesting allowed inside rules:

```tss
.container {
  max-w 1200px
  m 0 auto
  p 2rem
}

@media (max-width: 768px) {
  .container { p 1rem }
  .sidebar { d none }
}

@media (min-width: 1200px) {
  .container { p 3rem }
}
```

---

## Comments

Both forms work, including inline:

```tss
// single-line comment
/* block comment */

.card {
  bg #fff    // inline comment
  p 20px
}
```

Comments are stripped from production output.

---

## Where TSS Files Live

```text
style/
  global.tss      ← reset, body, base
  dashboard.tss   ← section styles
  variables.tss   ← $variables and :root custom properties
components/
  Button.tw
  Button.module.tss   ← scoped component styles (see Scoped Styles)
```

Convention: global and section styles in `style/`, per-component styles next to the component as `.module.tss`. Import from pages/layouts:

```tw
import "@./style/global.tss"
import "@./style/dashboard.tss"
```

---

## Complete Example

```tss
/* style/dashboard.tss */
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
      mb 2px

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

---

## Quick Reference

```tss
$name: value                 // variable
selector { prop value }      // shorthand
selector { prop: value; }    // standard CSS
parent { child { } }          // nesting
parent { &:hover { } }        // parent reference
@media (max-width: 768px) { } // media query
// comment  /* comment */
```

## Related

- [Styling Guide](./styling-guide.md) — choosing between file types
- [Scoped Styles](./scoped-styles.md) — `.module.tss`
- [SCSS](./scss-guide.md)
- [Production CSS](./production-css.md)
