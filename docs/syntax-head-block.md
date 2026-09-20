# TW Framework — Head Block

This document covers one thing completely: the `<head>` of a TW page — the `head { }` block for inline head content and the `head.tw` file for per-route head content.

---

## The head { } Block

A `.tw` file can declare `<head>` elements directly:

```tw
head {
  meta charset "utf-8"
  meta name "viewport" content "width=device-width, initial-scale=1"
  meta name "description" content "My page description"
  meta property "og:title" content "My Page"
  meta property "og:image" content "/img/og.png"
  link rel "stylesheet" href "/css/custom.css"
  script src "/js/analytics.js"
}
```

Each line becomes the corresponding HTML element inside `<head>`. Attributes use the normal element syntax — `name "value"` pairs.

The compiler merges the block into the page's head, together with the page title from the `page { }` config and any stylesheets the page imports.

---

## What Goes in head { }

| Element | Purpose |
|---------|---------|
| `meta` | charset, viewport, description, Open Graph, Twitter cards |
| `link` | extra stylesheets, favicon, preconnect |
| `script` | analytics, CDN libraries (with `src`) |
| `title` | use `page { title ... }` instead — one source of truth |

Title comes from the page config:

```tw
page { title "Pricing — MySite" }

head {
  meta name "description" content "Plans and pricing"
}
```

---

## Per-Route Head — head.tw

For head content tied to a route (not a component), place a `head.tw` file in the route's directory:

```text
home/
├── layout.tw
├── page.tw
└── blog/
    ├── head.tw          ← head content for /blog and below (nearest wins)
    ├── page.tw
    └── [slug]/
        ├── head.tw      ← head content for /blog/:slug
        └── page.tw
```

The layout chain resolves `head.tw` from leaf to root — the nearest `head.tw` to the page is used. Its content compiles the same way as a `head { }` block:

```tw
// home/blog/[slug]/head.tw
meta name "description" content "A blog post"
meta property "og:type" content "article"
```

Use `head { }` in the page when the content belongs with the page file; use `head.tw` when different pages share one head definition at a route level.

---

## Loading CDN Libraries

`script src` in the head is the classic way to load a browser library whose global you then use in handlers:

```tw
page { title "Confetti" render ssr }

html {
  head {
    script src "https://cdn.example.com/confetti.min.js"
  }
  body {
    button on:click "confetti()" { "Celebrate" }
  }
}
```

Prefer an npm import when the package is on npm — you get versioning in `package.json`, tree-shaking and content-hashed chunks ([Client Modules](./client-modules.md)). The script tag remains available for CDN builds.

---

## Stylesheets

Style files imported in the page or layout are compiled and linked automatically — you never write a `<link>` for your own TSS. The `link` element in `head { }` is for **external** CSS only:

```tw
head {
  link rel "stylesheet" href "https://fonts.example.com/reset.css"
}
```

See [Production CSS](./production-css.md) for how the page's own styles are emitted and linked.

---

## Full Example

```tw
page { title "Product — MyShop" render ssr }

head {
  meta charset "utf-8"
  meta name "viewport" content "width=device-width, initial-scale=1"
  meta name "description" content "Buy the thing — free shipping in India"
  meta property "og:title" content "Product — MyShop"
  meta property "og:image" content "/img/product-og.png"
  meta property "og:url" content "https://myshop.example.com/product"
  link rel "icon" href "/favicon.ico"
  link rel "preconnect" href "https://fonts.example.com"
  script src "https://analytics.example.com/t.js"
}

div.product {
  h1 "The Thing"
  p "₹ 499"
}
```

Compiled `<head>` contains: charset, title from `page { }`, all of the above, and the linked stylesheet(s) for this page.

---

## Common Mistakes

### Setting the title in head { }

Use `page { title ... }` — the page config is the single source for the title, and it supports interpolation (`title "Dashboard — {user.name}"`).

### Linking your own .tss

```tw
head {
  link rel "stylesheet" href "/style/global.tss"    // ✗ never — imports handle this
}
```

Use `import "@./style/global.tss"` instead.

### Putting visible markup in head { }

Only `meta`, `link`, `script`, `title`, `base` and `noscript` belong in a document head. Body markup goes in the page body.

---

## Quick Reference

```tw
page { title "My Page" }

head {
  meta charset "utf-8"
  meta name "viewport" content "width=device-width, initial-scale=1"
  meta name "description" content "..."
  link rel "stylesheet" href "external.css"
  script src "library.js"
}
```

## Related

- [Page Config](./syntax-page-config.md)
- [Markup & Elements](./syntax-markup.md)
- [Production CSS](./production-css.md)
- [Client Modules](./client-modules.md)
