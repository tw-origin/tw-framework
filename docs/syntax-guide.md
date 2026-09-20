# TW Framework — Syntax Overview

This document is the map of the TW template language: file structure, the complete feature list, and the quick reference card. Each feature has its own deep-dive document — follow the links.

---

## File Structure — Order Matters

A `.tw` file has a specific order. Sections must appear in this sequence:

```
1. IMPORTS     — always at the top of the file
2. PAGE CONFIG — page { } block
3. STATE       — state { } block
4. MARKUP      — tags, components, control flow
```

### Example

```tw
// ─── 1. IMPORTS (top of file) ───────────────────
import Header from "@./components/Header.tw"
import Button from "@./components/Button.tw"
import "@./style/home.tss"

// ─── 2. PAGE CONFIG ─────────────────────────────
page {
  title "Home Page"
  description "Welcome to my site"
  render ssr
}

// ─── 3. STATE ───────────────────────────────────
state {
  count = 0
  name = "Mlkraj"
  items = ["Apple", "Banana", "Cherry"]
  user = { id: 1, name: "Aarav", role: "admin" }
}

// ─── 4. MARKUP ──────────────────────────────────
section.hero {
  div.container {
    Header { }
    h1 "Hello {name}"
    Button {
      label "Click me"
      on:click "count++"
    }
  }
}
```

---

## The Language, Feature by Feature

| Feature | Syntax | Deep dive |
|---------|--------|-----------|
| Imports | `import X from "..."`, `import "style.tss"` | [Imports](./syntax-imports.md) |
| Page config | `page { title ... render ssr }` | [Page Config](./syntax-page-config.md) |
| State | `state { count = 0 }` | [State](./syntax-state.md) |
| Elements | `div.class "text" { children }` | [Markup & Elements](./syntax-markup.md) |
| Interpolation | `"{name}"`, `"{a + b}"` | [Interpolation](./syntax-interpolation.md) |
| Attributes | `href "/about"`, `disabled`, `data-*` | [Attributes](./syntax-attributes.md) |
| Events | `on:click "count++"`, `.prevent`, `.stop` | [Events](./syntax-events.md) |
| Bindings | `:class "expr"`, `:value` / `bind:value` | [Bindings](./syntax-bindings.md) |
| Conditionals | `if / else`, `switch`, `try / catch` | [Conditionals](./syntax-conditionals.md) |
| Loops | `for item in {list}`, `while` | [Loops](./syntax-loops.md) |
| Components | `Button { label "Save" }` | [Components](./syntax-components.md) |
| Slots | `slot { }`, `slot name "x" { }` | [Slots](./syntax-slots.md) |
| Head content | `head { meta ... }` | [Head Block](./syntax-head-block.md) |

Server-side syntax lives in its own guides:

| Feature | Deep dive |
|---------|-----------|
| `.twm` API routes | [API Routes](./api-routes.md) |
| `middleware.twm` rules | [Middleware](./middleware.md) |
| Layouts and the layout chain | [Layouts](./layouts.md) |
| Render modes | [Render Modes](./render-modes.md) |

Client-side behaviour — npm imports, chunks, hydration, SPA routing — is in [Client Modules](./client-modules.md) and [Client Runtime](./client-runtime.md).

---

## Complete Page Example

```tw
import Header from "@./components/Header.tw"
import Button from "@./components/Button.tw"
import Card from "@./components/Card.tw"
import "@./style/dashboard.tss"

page {
  title "Dashboard - {user.name}"
  description "User dashboard with stats"
  render ssr
}

state {
  user = { id: 1, name: "Mlkraj", role: "admin" }
  sidebarOpen = true
  stats = [
    { label: "Revenue", value: "₹2,50,000", change: "+12%" },
    { label: "Users", value: "1,243", change: "+5%" },
    { label: "Orders", value: "89", change: "-3%" }
  ]
  posts = [
    { title: "Q3 Report", slug: "q3-report", date: "2026-09-01" },
    { title: "Team Update", slug: "team-update", date: "2026-09-03" }
  ]
}

div.dashboard {

  Header user={user} { }

  div.main {

    div.header {
      h1 "Welcome {user.name}"

      Button {
        label "Toggle Sidebar"
        on:click "sidebarOpen = !sidebarOpen"
      }
    }

    div.stats-grid {
      for stat in {stats} {
        Card {
          div.stat {
            span.stat-label "{stat.label}"
            span.stat-value "{stat.value}"
            span.stat-change "{stat.change}"
          }
        }
      }
    }

    if user.role == "admin" {
      div.admin-panel {
        h2 "Recent Posts"

        for post in {posts} {
          div.post-row {
            span "{post.title}"
            span "{post.date}"
            a "Edit" { href "/admin/posts/{post.slug}" }
          }
        }
      }
    } else {
      div.user-panel {
        p "You are a standard user."
      }
    }

    if sidebarOpen {
      div.sidebar {
        a "Settings" { href "/settings" }
        a "Profile" { href "/profile" }
        a "Logout" { href "/logout" }
      }
    }

  }

}
```

---

## Client Runtime — Full Reactivity + SPA

Two-way input binding, event modifiers, live conditionals, live lists and SPA client-side routing — with every page shipping the ~5 KB TW runtime. Internal links navigate without a reload (hover-prefetch included); opt out per link with `data-tw-native`. npm packages import directly into pages and are bundled for the browser automatically.

The complete model: [Client Runtime](./client-runtime.md) and [Client Modules](./client-modules.md).

```tw
import dayjs from "dayjs"

page { title "Clock" render ssr }

state { stamp = "click karo" }

div {
  button on:click "stamp = dayjs().format('DD/MM/YYYY HH:mm')" { "Abhi ka time" }
  p "{stamp}"
}
```

---

## Quick Reference Card

```
// IMPORTS (top of file)
import Component from "path"
import "style.tss"

// PAGE CONFIG
page { title "...", render ssr }

// STATE
state { var = value }

// ELEMENTS
tag.class { children }
tag "text"
tag.class "text" { attr "value" }

// INTERPOLATION
"Hello {name}"

// EVENTS
on:click "expr"

// BINDINGS
:class "expr"

// CONTROL FLOW
if cond { } else { }
for item in {list} { }
while cond { }
switch expr { case val { } }

// SLOTS
slot { }
slot name "name" { }

// COMMENTS
// comment
```

## Related

- [Error Reference](./error-reference.md) — every error code
- [Extensions Guide](./extensions-guide.md) — file types and naming
- [Project Structure](./project-tree.md)
