# TW Framework — Tailwind CSS

This document covers one thing completely: using Tailwind CSS utility classes in `.tw` pages — the class syntax that carries numbers and fractions, and the two-command pipeline that puts the generated stylesheet into a TW build.

---

## Classes in Dot Syntax

`.tw` pages attach classes with dot syntax, and class names accept letters, digits, hyphens and fractions:

```tw
div.flex.items-center.gap-4.bg-blue-500 {
  p.text-xl.font-bold { "Utility classes" }
  span.w-1/2.text-gray-700 { "Half width" }
}
```

This compiles to:

```html
<div class="flex items-center gap-4 bg-blue-500">
  <p class="text-xl font-bold">Utility classes</p>
  <span class="w-1/2 text-gray-700">Half width</span>
</div>
```

| Class shape | Example | Status |
|------------|---------|--------|
| letters + hyphens | `items-center` | always worked |
| with numbers | `gap-4`, `w-64`, `p-2` | supported |
| fractions | `w-1/2`, `aspect-16/9` | supported |

## The Pipeline

Tailwind is a build-time tool that scans your source for class names and emits exactly the CSS those classes need. Point its content scanner at the `.tw` files and hand its output to TW as a stylesheet:

**Step 1 — install the tool:**

```bash
npm install -D tailwindcss
```

**Step 2 — configure scanning** (`tailwind.config.js`):

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./home/**/*.tw", "./components/**/*.tw"],
  theme: { extend: {} },
  plugins: [],
};
```

**Step 3 — declare the layers** (`input.css`):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 4 — generate the stylesheet:**

```bash
npx tailwindcss -i input.css -o style/tailwind.css --minify
```

**Step 5 — import it in the layout**, so every page gets it:

```tw
// home/layout.tw
import "@./style/tailwind.css"

html {
  head { title "{page.title}" }
  body { slot { } }
}
```

Now `tw build` picks up `style/tailwind.css` like any other stylesheet — route-split, content-hashed, and linked from the pages that use it:

```
.tw/
└── assets/
    └── home.584090c4.css    ← tailwind output, hashed
```

Only the pages that import the stylesheet link it; classes you never write are never scanned in (Tailwind emits only what it finds in `home/` and `components/`).

## Dev Loop

Re-run the generator when classes change:

```bash
npx tailwindcss -i input.css -o style/tailwind.css --minify --watch
```

in one terminal, `tw dev` in the other. The dev server re-compiles the page on every save; the watcher refreshes the utility CSS.

## When a Class Cannot Be Written in Dot Syntax

Variant prefixes (`hover:bg-blue-500`, `md:flex`) contain a colon, which dot syntax does not carry. Define those as component classes in `input.css` with `@apply` — Tailwind processes them into plain CSS with the variants included:

```css
/* input.css */
@tailwind base;
@tailwind utilities;

.btn-primary {
  @apply bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded;
}

@media (min-width: 768px) {
  .sidebar-open { @apply flex; }
}
```

```bash
npx tailwindcss -i input.css -o style/tailwind.css --minify
```

```tw
// home/page.tw — dot syntax carries the generated component class
div.p-4.gap-4 {
  button.btn-primary { "Primary button" }
}
```

The emitted stylesheet contains the full variant rules:

```css
.btn-primary:hover { background-color: rgb(29 78 216); }
```

Plain CSS or `.tss` files are the alternative when you prefer writing the rule yourself:

```
/* style/home.tss */
.card:hover {
  bg #f0f9ff;
}
```

## Positioning Tailwind vs .tss

Both styles coexist in one project. Tailwind gives ready-made utilities for layout-heavy work; `.tss` gives named rules, variables and nesting with no build step. A common split: Tailwind for rapid layout and spacing, `.tss` for the design system (brand colors, typography scales).

## Reference

- docs/syntax-guide.md — the full `.tw` grammar including dot classes
- docs/styling-guide.md — `.tss` and SCSS pipelines
- docs/project-tree.md — where stylesheets live
