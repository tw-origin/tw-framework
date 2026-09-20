# TW Framework — Production CSS

This document covers one thing completely: what `tw build` does with your styles — route-split output files, content hashing, critical CSS and cache behaviour.

---

## The Pipeline

Every stylesheet source feeds one pipeline:

```
.tss file        → tokenize → expand shorthands        → CSS
.module.tss      → tokenize → expand + scope class names → CSS
.css file        → tokenize (no expansion)              → CSS
.module.css      → tokenize + scope class names          → CSS
.scss file       → Sass compiler                        → CSS
<style> in .tw   → extracted at compile                 → CSS
```

Element-level `style="..."` attributes are runtime inline styles — they are never extracted into the CSS files.

After compilation, the build decides **which output file** each stylesheet's content lands in, based on which routes use it.

---

## Route-Split Output

`tw build` emits styles as separate, optimized CSS asset files:

```
.tw/
├── index.html
└── assets/
    ├── common.a82f31.css
    ├── app.91cd72.css
    └── dashboard.5f04de.css
```

| Rule | Output file |
|------|-------------|
| Styles used by 2 or more routes | `common.<hash>.css` |
| Styles used by one route only | `<route>.<hash>.css` |
| Styles for the `/` route | `app.<hash>.css` |

Each page links only the stylesheets it uses:

```html
<link rel="stylesheet" href="/assets/common.a82f31.css">
<link rel="stylesheet" href="/assets/dashboard.5f04de.css">
```

CSS is never duplicated across output files. A page loads its shared and its route-specific stylesheets; styles used only by other routes are not loaded at all.

During SPA navigation, if the incoming route links a stylesheet the current page did not load, the runtime loads it before the swap.

---

## Content Hashing

Output filenames are derived from the file's own content:

```
common.a82f31.css     ← hash of these bytes
```

- **Unchanged styles → same filename across builds** — browser caches stay valid after a redeploy
- **Changed styles → new hash → new filename** — no visitor ever sees a stale cached stylesheet

This is why hashed assets can be served with immutable, cache-forever headers. The production servers set exactly that (`Cache-Control: immutable` with a long max-age) — see [Server Features](./server-features.md).

---

## Critical CSS

Very small stylesheets are inlined into `<head>` as critical CSS instead of being emitted as a file:

```html
<style>/* contents of what would be a 400-byte file */</style>
```

The build makes this call per stylesheet: when the file would be smaller than the request overhead of fetching it, inlining removes a render-blocking round trip. Larger stylesheets stay as linked files.

---

## Sources Are Merged Per Route

A route's stylesheet set is the union of everything its chain imports:

```
/home/layout.tw      import "@./style/global.tss"     → every route
/home/shop/layout.tw  import "@./style/shop.tss"       → /shop routes
/home/shop/page.tw    import styles from "@/components/Product.module.tss"
```

The build computes, for each route, which styles are actually used, splits shared from route-specific, and deduplicates. You never hand-manage bundle membership — imports alone decide it.

---

## Minification and Comments

- Production output is minified — whitespace, comments and last semicolons removed
- `//` and `/* */` comments in source files are stripped
- `tw dev` serves styles unminified for debugging

---

## Cache Behaviour Summary

| Asset | Cache strategy |
|-------|----------------|
| `common.<hash>.css`, route CSS | immutable, hashed — cache forever |
| Inlined critical CSS | part of the HTML document |
| `style="..."` inline attributes | part of the markup, not cached separately |

---

## What This Means Day to Day

- **Write styles however the page needs them** — imports decide distribution
- **Never edit `.tw/` output** — it is generated; change the source and rebuild
- **No manual `<link>` tags for your own styles** — the build emits exactly the right set per page
- **Renaming classes in a module** automatically updates the scoped names in both CSS and markup

---

## Verifying Output

After a build, check what a route loads:

```bash
tw build
grep -o 'href="[^"]*\.css"' .tw/shop/index.html
```

And what is shared:

```bash
ls .tw/assets/*.css
```

---

## Quick Reference

```
imports → per-route CSS set
  ├─ 2+ routes use it   → common.<hash>.css
  ├─ one route uses it  → <route>.<hash>.css
  └─ tiny file          → inlined critical CSS
hash = content hash → immutable caching
```

## Related

- [TSS Syntax](./tss-syntax.md)
- [Scoped Styles](./scoped-styles.md)
- [Build Output](./build-output.md) — the full `.tw/` directory
- [Server Features](./server-features.md) — cache headers at serve time
