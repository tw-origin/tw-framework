# TW Framework — State

This document covers one thing completely: the `state { }` block in `.tw` files — how to declare reactive variables, every supported type, how to read them in markup, and how to change them from event handlers.

---

## What State Is

`state { }` declares the reactive variables for a page. Every variable declared here can be:

1. **Read** anywhere in the markup through interpolation — `"{name}"`
2. **Changed** from event handler expressions — `on:click "count++"`
3. **Reacted to** by the client runtime — when a variable changes, the parts of the page that display it update in place, without a reload

```tw
state {
  count = 0
  name = "Mlkraj"
}
```

State is declared with the equals sign (`=`). The block may appear anywhere in the file before or after `page { }` and before markup; by convention it sits directly under the page config.

---

## Signal Declarations

A variable can be declared as a signal by wrapping its initial value in a signal constructor. Signal constructors control how the value is shared between the server and the browser:

```tw
state {
  price = publicSignal(150.25)        // streamed to every connected client
  cart = privateSignal([])            // per-user delivery (session-scoped)
  secret = serverOnlySignal(0)        // never leaves the server
  total = derivedSignal("price * qty") // computed from other state
  count = 0                          // plain state, client-only
}
```

| Constructor | Initial render | Streamed | Notes |
|-------------|----------------|----------|-------|
| `publicSignal(v)` | value baked in | to every client | broadcast; scalar, array and object initial values are supported |
| `privateSignal(v)` | value baked in | to the declaring session | `setSignal(name, v, { request })` scopes delivery to the caller's session |
| `serverOnlySignal(v)` | not rendered | never | no seed, no markup, no manifest entry |
| `derivedSignal("expr")` | evaluated at build time | never (recomputed locally) | recomputed on the client whenever its inputs change |

Signals stream on `render signalStream` pages — see [Signal Streaming](./signal-streaming.md) for the transport, batching, resume and permission semantics.

---

## Declaring State

### Every supported type

```tw
state {
  count = 0                                    // number
  name = "Mlkraj"                              // string
  isActive = true                             // boolean
  items = ["Apple", "Banana", "Cherry"]        // array
  user = { id: 1, name: "Aarav", role: "admin" } // object
  posts = [                                    // array of objects
    { title: "First Post", slug: "first-post", date: "2026-01-01" },
    { title: "Second Post", slug: "second-post", date: "2026-02-01" }
  ]
}
```

| Type | Example | Use |
|------|---------|-----|
| Number | `count = 0` | counters, quantities, indexes |
| String | `name = "Mlkraj"` | text, labels |
| Boolean | `isActive = true` | toggles, visibility |
| Array | `items = ["A", "B"]` | lists, loops |
| Object | `user = { id: 1 }` | grouped data |
| Array of objects | `posts = [{ ... }]` | records, tables, feeds |

### What does not belong in state

- Data that only the server needs — put it in the markup directly or in `.twm` routes
- Secrets and database connections — those live in `lib/` and `.twm` files, never in a page (TW1007)

---

## Reading State in Markup

Use interpolation — braces inside a quoted string:

```tw
h1 "Hello {name}"                 // → Hello Mlkraj
p "You clicked {count} times"     // → You clicked 0 times
span "{user.name}"                // nested property
span "{items.length}"             // array property
p "Total: {price * quantity}"     // expression
```

Inside a `for` loop, the loop variable and its fields are readable the same way:

```tw
for post in {posts} {
  h2 "{post.title}"
  p "{post.date}"
}
```

Full interpolation rules live in [Interpolation](./syntax-interpolation.md).

---

## Changing State

State changes from event handler expressions:

```tw
button on:click "count++" { "Increment" }
button on:click "count--" { "Decrement" }
button on:click "count = 0" { "Reset" }
button on:click "name = 'New Name'" { "Change" }
button on:click "isActive = !isActive" { "Toggle" }
```

Any JavaScript assignment or mutation expression is valid:

```tw
button on:click "items.push('Mango')" { "Add Mango" }
button on:click "user.name = 'Aarav'" { "Rename" }
button on:click "count = count * 2" { "Double" }
```

Two-way form inputs write state as the user types:

```tw
input :value "name" { type "text" }       // shorthand
input bind:value "name" { type "text" }   // long form
```

See [Bindings](./syntax-bindings.md) for both forms.

### What happens when state changes

The TW client runtime keeps track of which parts of the page read which variables. When `count` changes:

1. The handler expression runs and updates the value
2. Every interpolated string, conditional and loop that reads `count` re-evaluates
3. Only the affected DOM nodes are patched — the page does not reload

This is the reactivity model behind the framework; see [Client Runtime](./client-runtime.md).

---

## State and Render Modes

`state { }` requires a render mode that allows interactivity:

| Mode | State allowed |
|------|---------------|
| `render static` | No — the compiler rejects state on static pages (TW200) |
| `render ssr` | Yes |
| `render island` | Yes, inside interactive islands |
| `render edge` | Yes |

A page rendered statically that needs interactivity is a contradiction the compiler catches for you.

---

## Scope

State declared in a page belongs to that page. Layouts and components do not see it. Data flows down into components through props:

```tw
// page
state { user = { id: 1, name: "Aarav" } }

Header user={user} { }
```

```tw
// components/Header.tw
header {
  span "Logged in as {user.name}"
}
```

Each page instance gets its own copy — two visitors, two tabs, two independent `count` values. State lives in the browser for the lifetime of the page.

---

## Complete Example

```tw
page {
  title "Counter Demo"
  render ssr
}

state {
  count = 0
  step = 1
  history = []
}

div.counter {
  h1 "Count: {count}"

  div.controls {
    button on:click "count = count - step" { "−{step}" }
    button on:click "count = 0" { "Reset" }
    button on:click "count = count + step" { "+{step}" }
    button on:click "history.push(count)" { "Snapshot" }
  }

  div.step {
    label "Step size"
    input :value "step" { type "number" min "1" max "10" }
  }

  if history.length > 0 {
    div.history {
      h3 "Snapshots"
      for snap, i in {history} {
        span "#{i + 1}: {snap} "
      }
    }
  }
}
```

---

## Quick Reference

```tw
state {
  num = 0
  str = "text"
  flag = true
  list = [1, 2, 3]
  obj = { key: "value" }
}
```

```tw
"{count}"              // read
on:click "count++"      // write
on:click "list.push(4)" // mutate
:value "name"           // two-way bind
```

## Related

- [Syntax Overview](./syntax-guide.md)
- [Interpolation](./syntax-interpolation.md)
- [Events](./syntax-events.md)
- [Bindings](./syntax-bindings.md)
- [Conditionals](./syntax-conditionals.md) and [Loops](./syntax-loops.md) — state-driven control flow
- [Render Modes](./render-modes.md)
