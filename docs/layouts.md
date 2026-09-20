# TW Framework — Layouts

This document covers one thing completely: the layout system — `layout.tw` files, the layout chain, and how every page gets its shell.

---

## What a Layout Is

A `layout.tw` in a route directory wraps every page below it:

```tw
// home/layout.tw — the ROOT layout
import "@./style/global.tss"

page { title "MySite" }

html {
  body {
    nav.topbar {
      a.brand "MySite" { href "/" }
      div.links {
        a "Home" { href "/" }
        a "Pricing" { href "/pricing" }
      }
    }
    slot { }              // ← page content renders here
    footer {
      p "© 2026 MySite"
    }
  }
}
```

Every page on the site renders inside this shell: navigation on top, the page where `slot { }` stands, footer at the bottom.

A layout is a normal `.tw` file — it can import components and styles, declare a `page { }` block (for the fallback title), and use any markup. The one thing that makes it a layout is `slot { }` marking where the child content goes.

---

## The Layout Chain

Layouts stack from root to leaf. For `/dashboard/settings`:

```text
home/
├── layout.tw                 ← ROOT layout (outermost)
└── dashboard/
    ├── layout.tw             ← dashboard layout
    └── settings/
        └── page.tw           ← page (innermost)
```

Rendering order:

1. `settings/page.tw` compiles to its HTML
2. `dashboard/layout.tw` compiles; its `slot { }` is replaced by the page HTML
3. `home/layout.tw` compiles; its `slot { }` is replaced by the result of step 2

```html
<!-- root layout html -->
<body>
  <nav>…</nav>
  <!-- dashboard layout -->
  <aside>…</aside>
  <!-- settings page -->
  <section>…</section>
  <footer>…</footer>
</body>
```

Every level can also declare its own styles, imports and page config — nested layouts inherit and override:

| Declared in | Effect |
|-------------|--------|
| Root layout `page { title }` | fallback title for every page |
| Page `page { title }` | overrides the chain's title |
| Root layout style import | included on every page |
| Nested layout style import | included on pages under it |

---

## Section Layouts

A nested layout gives a section its own shell — different chrome, shared across the section:

```text
home/
├── layout.tw                 ← site shell (nav + footer)
├── page.tw
├── (marketing)/
│   ├── layout.tw             ← marketing: centered hero shell
│   ├── about/page.tw
│   └── pricing/page.tw
└── dashboard/
    ├── layout.tw             ← dashboard: sidebar shell
    └── settings/page.tw
```

`/about` renders inside the marketing layout, which itself renders inside the root layout. `/dashboard/settings` gets the sidebar shell inside the root shell. A section with no layout simply uses the nearest one above it.

---

## Layouts and Client Imports

An import written in a layout loads its chunk for **every page under it**:

```tw
// home/layout.tw
import dayjs from "dayjs"       // dayjs chunk loads on every page of the site
```

```tw
// home/shop/layout.tw
import Chart from "chart.js"    // chart.js loads only on pages under /shop
```

The chunk is inherited, the symbol is not — a page that wants to call `Chart` writes its own import (the chunk is already cached). The complete model is in [Client Modules & Dependency Graph](./client-modules.md).

---

## Special Sibling Files

The layout chain also resolves these per-route files, nearest to the page wins:

| File | Purpose |
|------|---------|
| `template.tw` | like layout, but re-renders on navigation |
| `loading.tw` | loading skeleton while the route renders |
| `error.tw` | error boundary for the route |
| `not-found.tw` | 404 UI for the route |
| `head.tw` | per-route `<head>` content |

See [Project Structure](./project-tree.md) for the complete special-file reference.

---

## When NOT to Use a Layout

- **One-off wrapper around one page** — put the markup directly in the page or make a component
- **Reusable card/panel chrome** — that is a component with a `slot { }`, not a layout ([Components](./syntax-components.md))
- **Route grouping without a URL** — use a route group `(name)` directory instead ([Project Structure](./project-tree.md))

Layout = file-based, route-scoped shell. Component = imported, reusable markup.

---

## Common Mistakes

### Forgetting slot { } in a layout

```tw
// layout.tw without a slot
html { body { nav { "Nav" } } }
```

The page content has nowhere to inject — the layout renders only its own markup. Every layout needs at least one `slot { }`.

### Putting page content in the layout

The root layout is shared by every page. Page-specific markup belongs in `page.tw`, not in the shell.

### Expecting layout state in pages

State declared in a layout belongs to the layout. Pages declare their own; data flows to components through props.

---

## Quick Reference

```tw
// home/layout.tw
import "@./style/global.tss"

page { title "MySite" }

html {
  body {
    nav { }
    slot { }        // ← required
    footer { }
  }
}
```

## Related

- [Slots](./syntax-slots.md)
- [Project Structure](./project-tree.md)
- [Client Modules](./client-modules.md)
- [Core System](./core-system.md) — how the chain resolves internally
