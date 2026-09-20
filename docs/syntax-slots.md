# TW Framework — Slots

This document covers one thing completely: the `slot { }` element — where injected content renders, in components, layouts and named-slot panels.

---

## What a Slot Is

`slot { }` is a placeholder. It says: *render the content that was passed to me here*. Two things pass content:

1. **Components** — children written inside a component tag
2. **Layouts** — the page content rendered inside the layout's shell

```tw
// components/Card.tw
div.card {
  div.card-body {
    slot { }          // ← children land here
  }
}
```

```tw
// page
Card {
  h3 "Title"
  p "Content"
}
```

Compiled result:

```html
<div class="card"><div class="card-body"><h3>Title</h3><p>Content</p></div></div>
```

---

## Slot in Layouts

This is the most important slot in the framework. The root layout wraps every page:

```tw
// home/layout.tw
import "@./style/global.tss"

html {
  body {
    nav { "Navigation here" }
    slot { }           // ← every page's content injects here
    footer { "Footer" }
  }
}
```

When `/about` renders:

1. `home/about/page.tw` compiles to its HTML
2. The layout's `slot { }` is replaced by that HTML
3. The result is the complete document

Nested layouts stack the same way — each level's `slot { }` receives the content one level deeper. The full chain is in [Layouts](./layouts.md) — see also [Core System](./core-system.md) for how the chain resolves.

---

## Slot Syntax Forms

The layout chain recognizes several spellings, so hand-written HTML layouts also work:

| Form | Notes |
|------|-------|
| `slot { }` | TW syntax — the normal form |
| `<slot />` | HTML form |
| `<slot></slot>` | HTML form |

Inside `.tw` files, always write `slot { }`.

---

## Named Slots

A layout can define several holes, each filled by name:

```tw
// home/dashboard/layout.tw
div.dashboard {
  div.sidebar {
    slot name "sidebar" { }      // ← @sidebar content goes here
  }
  div.main {
    slot { }                      // ← default slot (page content)
  }
  div.right-panel {
    slot name "analytics" { }     // ← @analytics content goes here
  }
}
```

Named slots pair with **parallel routes** — sibling directories whose pages fill the named holes. See [Project Structure](./project-tree.md) for the `@name` directory pattern.

The unnamed `slot { }` is the default; it receives the page content unless a more specific match exists.

---

## Slot in Components — Detailed

### Basic pass-through

```tw
// components/Panel.tw
section.panel {
  h2.panel-title "{title}"
  div.panel-body {
    slot { }
  }
}
```

### Everything nests

Children passed into a component can be any markup — elements, interpolations, control flow, even other components:

```tw
// page
import Panel from "@/components/Panel.tw"
import Badge from "@/components/Badge.tw"

state { alerts = [ { level: "high", text: "Disk 90%" } ] }

Panel title="Alerts" {
  for a in {alerts} {
    div.alert {
      Badge label="{a.level}" { }
      span "{a.text}"
    }
  }
}
```

The `for` loop is part of the children; it is compiled in the page's scope (it reads the page's `alerts` state) and its output is injected into the panel's slot.

---

## Empty Slot Content

`slot { }` accepts fallback content — markup written inside renders only when nothing is passed:

```tw
// components/Card.tw
div.card {
  slot {
    p "No content provided"
  }
}
```

A page that uses `Card { }` with no children shows the fallback text; a page that passes children shows them instead.

---

## Rules

- A component or layout may contain any number of slots (one default + named ones)
- The default slot is the unnamed `slot { }`
- Children always compile in the **parent's** scope — the page's state and imports, not the component's
- Slot replacement happens at compile/render time, not in the browser

---

## Common Mistakes

### Slot in a page

`slot { }` belongs in components and layouts. A `page.tw` has nothing passing content into it — the slot renders empty (or its fallback).

### Expecting slot content to see the component's variables

```tw
// Card.tw declares title; page passes children
Card title="Alerts" {
  span "{title}"      // ✗ title is the component's prop — not visible in children
}
```

Children compile with the page's scope. Pass what you need as part of the children instead:

```tw
Card title="Alerts" {
  span "Alerts"        // ✓ from the page
}
```

### Mixing HTML and TW forms in one file

Write `slot { }` in `.tw` files. The `<slot />` forms exist for HTML compatibility.

---

## Quick Reference

```tw
slot { }                    // default slot
slot name "sidebar" { }     // named slot
slot { p "fallback" }      // slot with fallback content
```

## Related

- [Components](./syntax-components.md)
- [Layouts](./layouts.md)
- [Project Structure](./project-tree.md) — parallel routes and `@name` directories
