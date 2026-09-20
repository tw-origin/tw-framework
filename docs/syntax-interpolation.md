# TW Framework — Interpolation

This document covers one thing completely: `{...}` interpolation — putting dynamic values inside text, attributes and expressions.

---

## What Interpolation Is

Interpolation inserts the value of a variable or the result of an expression into the page. It is written with braces inside a quoted string:

```tw
h1 "Hello {name}"
```

When `name` is `"Mlkraj"`, this renders `<h1>Hello Mlkraj</h1>`.

The compiler distinguishes four situations:

| Syntax | Meaning | Output |
|--------|---------|--------|
| `"name"` | String literal | the text `name` |
| `"{name}"` | Interpolated variable | the value of `name` |
| `"{a + b}"` | Interpolated expression | the result |
| `{items}` | Bare expression (control flow, props) | not text — consumed by the parser |

---

## In Text

```tw
state {
  name = "Mlkraj"
  count = 0
  user = { id: 1, name: "Aarav", role: "admin" }
  items = ["Apple", "Banana", "Cherry"]
}

h1 "Hello {name}"                  // Hello Mlkraj
p "You clicked {count} times"      // You clicked 0 times
span "{user.name}"                 // Aarav — nested property
span "{items.length}"              // 3 — array property
span "{user.id}: {user.role}"      // 1: admin — several in one string
```

Mixed text and braces is the normal case — everything outside `{}` is literal text.

---

## Expressions

Anything inside `{}` is evaluated as a JavaScript expression using the page's state:

```tw
p "Total: {price * quantity}"
p "Full name: {user.first + ' ' + user.last}"
p "Items: {items.length} of {items.length + more}"
p "Is admin: {user.role == 'admin'}"
p "Rounded: {Math.round(ratio * 100)}%"
```

You can call imported helper functions too:

```tw
import { formatDate } from "@/lib/utils.ts"

p "Published on {formatDate(post.date)}"
```

---

## In Attributes

Attribute values are quoted strings, so interpolation works the same way:

```tw
img src "{user.avatar}" alt "Avatar of {user.name}"
a "Read {post.title}" { href "/blog/{post.slug}" }
input type "text" value "{name}"
```

Inside a `for` loop, the loop variable interpolates identically:

```tw
for post in {posts} {
  a "{post.title}" { href "/blog/{post.slug}" }
}
```

---

## In the Page Config

The `page { }` block interpolates the same way, which is how dynamic titles work:

```tw
state { post = { title: "Q3 Report" } }

page {
  title "Dashboard — {post.title}"
}
```

---

## In Loops and Control Flow

Control-flow keywords take a **bare** expression in braces — no quotes:

```tw
for post in {posts} { }          // the list itself
if count > 5 { }                  // condition, no braces needed
while loading { }
```

`for` uses `{posts}` (bare). `if` / `while` take the condition directly — `if {count > 5}` is wrong; `if count > 5` is right. See [Conditionals](./syntax-conditionals.md) and [Loops](./syntax-loops.md).

---

## Reactivity

Interpolated values are live. When the state behind an interpolation changes, the text updates in the browser without a reload:

```tw
state { count = 0 }

button on:click "count++" { "Add one" }
p "Count is {count}"        // updates on every click
```

See [Client Runtime](./client-runtime.md) for how the runtime tracks and patches these nodes.

---

## Escaping

All interpolated output is HTML-escaped before it reaches the page. A value containing `<script>` renders as visible text, never as markup. This is automatic; there is no "raw HTML" escape hatch in interpolation — build markup with elements instead:

```tw
// if intro = "<b>Hi</b>"
p "{intro}"               // prints the tags as text: <b>Hi</b> — safe
```

---

## Common Mistakes

### Forgetting the quotes

```tw
h1 Hello {name}        // WRONG — unquoted words are not text
h1 "Hello {name}"      // RIGHT
```

### Braces in a bare condition

```tw
if {count > 5} { }       // WRONG
if count > 5 { }         // RIGHT
```

### Interpolating an object directly

```tw
p "{user}"              // prints [object Object]
p "{user.name}"          // RIGHT — read the field
```

### Expecting interpolation in `.tss` files

Style files use their own variable system (`$primary`), not `{state}`. See [TSS Syntax](./tss-syntax.md).

---

## Quick Reference

```tw
"{name}"                     // variable
"{user.name}"                // nested
"{items.length}"             // property
"{price * quantity}"         // expression
"{fn(value)}"                // function call
href "/blog/{post.slug}"     // in attributes
title "Page — {name}"        // in page config
for x in {list} { }           // bare expression (no quotes)
if count > 5 { }              // condition (no braces)
```

## Related

- [State](./syntax-state.md)
- [Attributes](./syntax-attributes.md)
- [Bindings](./syntax-bindings.md)
- [Client Runtime](./client-runtime.md)
