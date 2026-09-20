# TW Framework — Tips: Styling

This is a quick-fire collection of practical styling tips for TSS. Each links to the full document.

---

## Default to .tss

Shorthands + nesting + variables, zero setup. Reach for the others only when you need them:

```tss
.card { bg #fff; p 20px; br 8px }
```

[Styling Overview](./styling-guide.md)

## Custom Properties for Shared Values

`$variables` are file-scoped at compile time; `--custom-properties` cascade everywhere:

```tss
:root { --primary: #2563eb }
.btn { bg var(--primary) }
```

Use `$` for file-local values, `--` for the theme. [TSS Syntax](./tss-syntax.md)

## Nest With &:hover

```tss
.nav-link {
  c #c9d1d9
  &:hover { c #58a6ff }
}
```

The `&` refers to the parent selector — no repeated selector names.

## One Module Per Component

```text
Button.tw + Button.module.tss
Card.tw   + Card.module.tss
```

Scoped names never collide; simple class names stay safe. [Scoped Styles](./scoped-styles.md)

## Responsive: Mobile Styles First

```tss
.card { p 1rem }                        // base = mobile
@media (min-width: 768px) {
  .card { p 2rem }                      // add for larger screens
}
```

The base rule applies everywhere; media queries add, not undo.

## Dark Mode Through Data Attributes

```tss
:root { --bg: #0d1117; --text: #c9d1d9 }
[data-theme="light"] { --bg: #fff; --text: #333 }
body { bg var(--bg); c var(--text) }
```

One attribute flips the whole palette — no duplicated rules.

## Inline style Blocks for Page-Local Rules

```tw
style {
  .page-hero { min-h 60vh }
}
```

Extract to a stylesheet the moment a second page needs it. [Styling Overview](./styling-guide.md)

## Never Fight the Cascade

```
global .tss  <  section .tss  <  inline <style>  <  .module.tss
```

Scoped module styles win — design overrides top-down, not by specificity hacking.

## Keep Shorthands for Reads, Full Names for Searches

`bg` reads fastest; `background-image` greps fastest. Mixing both in one file is fine — pick per rule.

## Check What Shipped

```bash
tw build && ls .tw/assets/
```

If a stylesheet is bigger than expected, a section import probably pulls more than the page uses. [Production CSS](./production-css.md)
