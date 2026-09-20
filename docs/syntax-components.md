# TW Framework — Components

This document covers one thing completely: `.tw` components — how to write them, pass props (static and dynamic), pass children, and how they expand at compile time.

---

## What a Component Is

A component is a `.tw` file that is not a page — usually kept in `components/`. It holds reusable markup that pages import and use as tags:

```tw
// components/Header.tw
header.site-header {
  nav {
    a.brand "MySite" { href "/" }
    a "About" { href "/about" }
  }
}
```

```tw
// home/page.tw
import Header from "@./components/Header.tw"

page { title "Home" render ssr }

div {
  Header { }
  main { p "Welcome" }
}
```

Components are expanded at compile time — the tag becomes the component's markup. There is no runtime component system; the page and its components compile into one HTML document.

---

## Using a Component

The imported name becomes the tag. Capitalization matters:

```tw
import Header from "@./components/Header.tw"
import Button from "@./components/Button.tw"

Header { }

Button {
  label "Save Changes"
  variant "primary"
  on:click "save()"
}
```

- `Button { }` — the component
- `button { }` — a plain HTML `<button>` — different things

---

## Props

Everything written inside a component's braces is a prop. Two forms:

### Static props — quoted strings

```tw
Button {
  label "Save Changes"
  variant "primary"
}
```

### Dynamic props — `name={expression}`

```tw
state { user = { id: 1, name: "Aarav" } }

Header user={user} { }
Stats user={user} range="7d" { }
Card title="{post.title}" count={items.length} { }
```

- `user={user}` — passes the **variable** (the object, not the text)
- `range="7d"` — passes the literal string `7d` (unquoted inside braces would be invalid here; the `={...}` form binds a value, the bare `name "value"` form passes a string)

### Reading props inside the component

Props are used like page state — interpolation, conditions, loops all work:

```tw
// components/Header.tw
header {
  span "Hello {name}"
  if role == "admin" {
    a "Admin panel" { href "/admin" }
  }
}
```

```tw
// page
Header name={user.name} role={user.role} { }
```

---

## Children — Passing Content

Whatever elements you nest inside a component tag become its children. The component decides where they render with `slot { }`:

```tw
// components/Card.tw
div.card {
  div.card-body {
    slot { }
  }
}
```

```tw
// page
import Card from "@./components/Card.tw"

Card {
  h3 "Card Title"
  p "Card content goes here"
  a "Read more" { href "/post/1" }
}
```

The three nested elements replace `slot { }` in the compiled output. Full slot mechanics (named slots, layout slots) are in [Slots](./syntax-slots.md).

---

## Components With Props + Children Together

```tw
// components/Panel.tw
section.panel {
  h2.panel-title "{title}"
  div.panel-body {
    slot { }
  }
}
```

```tw
// page
import Panel from "@/components/Panel.tw"

state { posts = [ { title: "A", body: "..." } ] }

for post in {posts} {
  Panel title="{post.title}" {
    p "{post.body}"
  }
}
```

---

## Events From the Parent

The page's handlers attach to the component tag as props. The parent page keeps ownership of the behaviour:

```tw
Button {
  label "Delete"
  variant "danger"
  on:click "deleteItem()"
}
```

The `on:click "deleteItem()"` expression runs in the **page's** scope — `deleteItem` must be reachable from the page (an imported helper or a state mutation), not something defined inside `Button.tw`.

---

## Composition Patterns

### Page shell of components

```tw
import Header from "@./components/Header.tw"
import Footer from "@./components/Footer.tw"

div.app {
  Header { }
  main { p "Page content" }
  Footer { }
}
```

### Same component, different props

```tw
Button { label "Save" variant "primary" on:click "save()" }
Button { label "Delete" variant "danger" on:click "remove()" }
Button { label "Cancel" variant "ghost" on:click "close()" }
```

### Component in a loop

```tw
for stat in {stats} {
  Card {
    span.stat-label "{stat.label}"
    span.stat-value "{stat.value}"
  }
}
```

---

## Where Components Live

| Location | Imported as |
|----------|-------------|
| `components/Header.tw` | `@/components/Header.tw` or `@./components/Header.tw` from `home/` |
| Next to the page (`home/blog/PostCard.tw`) | `@./PostCard.tw` |
| Private folders `_components/` | never routes — ideal home for components |

Private folders (`_` prefix) are skipped by the route scanner, so `_components/` is the safe place for shared parts that should never be URLs.

---

## Common Mistakes

### Lowercase tag

```tw
import Button from "@/components/Button.tw"
button { }          // plain HTML <button> — component NOT used
Button { }          // the component
```

### Importing a component from a `.twm` file

Components are UI. Server modules import helpers from `lib/`, not `.tw` components.

### Forgetting the braces

```tw
Header                          // void-looking — write it with braces
Header { }                      // right
```

---

## Quick Reference

```tw
import Card from "@/components/Card.tw"

Card { }                                  // no props
Card title="Static" { }                    // static string prop
Card title={post.title} { }               // dynamic prop
Card user={user} range="7d" { }           // mixed
Card on:click "pick()" { h3 "child" }     // event + children
```

## Related

- [Slots](./syntax-slots.md)
- [Imports](./syntax-imports.md)
- [Markup & Elements](./syntax-markup.md)
- [Project Structure](./project-tree.md)
