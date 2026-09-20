# TW Framework — Page Config

This document covers one thing completely: the `page { }` block — title, description and render mode, the config that every page can declare.

---

## The page { } Block

```tw
page {
  title "Home Page"
  description "Welcome to my site"
  render ssr
}
```

The block is optional but recommended. It configures the page — its `<title>`, its meta description and how it renders.

---

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | The page `<title>`. Supports interpolation: `"Dashboard — {user.name}"` |
| `description` | string | No | The meta description tag |
| `render` | keyword | No | Render mode — `static`, `ssr`, `island`, `edge`. Default: `ssr` |

---

## title

```tw
page { title "About Us" }
```

Renders `<title>About Us</title>`. Interpolation reads page state:

```tw
state { user = { name: "Aarav" } }

page { title "Dashboard — {user.name}" }
```

Every page should set a title; the root layout's title is the fallback for pages that don't.

---

## description

```tw
page {
  title "Pricing"
  description "Simple plans for every team size"
}
```

Renders `<meta name="description" content="Simple plans for every team size">`.

---

## render

The render mode decides where and when the page is rendered, and how much interactivity is allowed:

```tw
page { render static }   // pre-rendered at build time, no interactivity
page { render ssr }      // rendered on the server per request, full interactivity
page { render island }   // static shell, interactive islands hydrate on the client
page { render edge }     // rendered at the CDN edge
```

Default is `ssr`.

### The one hard rule

```tw
page { render static }

state { count = 0 }                       // ✗ TW200
button on:click "count++" { "Add" }      // ✗ TW200
```

A static page cannot declare state or events — the compiler rejects the file. Static means fully pre-rendered HTML, zero client runtime for interactivity.

The complete behaviour of each mode is in [Render Modes](./render-modes.md).

---

## Placement and Order

The `page { }` block is a directive — it may appear before or after `state { }` but must come before markup. By convention:

```tw
// 1. imports
import Header from "@./components/Header.tw"
import "@./style/home.tss"

// 2. page config
page {
  title "Home Page"
  render ssr
}

// 3. state
state { count = 0 }

// 4. markup
div { Header { } }
```

Only one `page { }` block per file — a second one is a compile error (TW004).

---

## In Layouts

Layouts also accept a `page { }` block — commonly for the site title and default render mode:

```tw
// home/layout.tw
import "@./style/global.tss"

page { title "MySite" }

html {
  body {
    slot { }
  }
}
```

Pages under the layout override the title with their own `page { title ... }`.

---

## Per-Page Metadata Beyond title/description

Anything richer — Open Graph, canonical URLs, per-route meta — goes in the [Head Block](./syntax-head-block.md) or a route-level `head.tw` file:

```tw
page { title "Product" }

head {
  meta property "og:title" content "Product — MyShop"
  meta name "description" content "Buy the thing"
}
```

---

## Common Mistakes

### Strings around the render mode

```tw
page { render "ssr" }     // wrong — it's a keyword, not a string
page { render ssr }       // right
```

### Two page blocks

```tw
page { title "A" }
page { render ssr }        // ✗ TW004 — duplicate page config
```

Merge into one block.

### Interactive content on a static page

```tw
page { render static }
button on:click "go()" { }   // ✗ TW200 — use ssr or island
```

---

## Quick Reference

```tw
page { title "About" }
page { title "About" description "Who we are" }
page { title "About" render static }
page { title "Dash — {user.name}" render ssr }
page { render island }
```

## Related

- [Render Modes](./render-modes.md) — complete mode behaviour
- [Head Block](./syntax-head-block.md)
- [State](./syntax-state.md)
- [Syntax Overview](./syntax-guide.md)
