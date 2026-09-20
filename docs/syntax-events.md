# TW Framework — Events

This document covers one thing completely: `on:event` handlers — how to react to clicks, input, keyboard and form activity with state-changing expressions.

---

## The Event Form

```tw
tag on:event "expression" {
  // attributes, children
}
```

- `event` is a standard DOM event name (`click`, `input`, `submit`, ...)
- The expression is a **quoted JavaScript expression** — usually an assignment or call that changes page state

```tw
button on:click "count++" { "Increment" }
button on:click "submitForm()" { "Submit" }
input on:input "name = event.target.value" { }
```

The expression runs in the browser when the event fires, with the page's state and imported symbols in scope.

---

## Supported Events

| Event | Fires when |
|-------|------------|
| `on:click` | element is clicked |
| `on:input` | input value changes (as you type) |
| `on:change` | form element commits a change |
| `on:submit` | a form is submitted |
| `on:focus` | element receives focus |
| `on:blur` | element loses focus |
| `on:keydown` | a key is pressed |
| `on:keyup` | a key is released |
| `on:mouseenter` | pointer enters the element |
| `on:mouseleave` | pointer leaves the element |
| `on:load` | element finishes loading |

Any DOM event name is accepted — if the browser dispatches it, the handler binds it.

---

## The `event` Object

Handler expressions can use the standard DOM `event` variable:

```tw
input on:input "name = event.target.value" { type "text" }
div on:click "lastKey = event.target.tagName" { "Click me" }
form on:submit "form = event.target" { }
```

For keyboard events, modifiers are readable directly:

```tw
input on:keydown "keys = event.key" { }
```

---

## Event Modifiers

Append `.prevent`, `.stop` after the event name:

```tw
form on:submit.prevent "saveForm" { }
```

| Modifier | Equivalent DOM call |
|----------|---------------------|
| `.prevent` | `event.preventDefault()` — stops the default action (page reload on submit, URL change on click) |
| `.stop` | `event.stopPropagation()` — stops the event bubbling to parents |

Both can combine:

```tw
form on:submit.prevent.stop "saveForm" { }
button on:click.stop "pick" { "Pick" }
```

`.prevent` on a form submit is the normal way to handle forms without a reload:

```tw
state { email = "" sent = false }

form on:submit.prevent "sent = true" {
  input :value "email" { type "email" placeholder "you@example.com" required }
  button "Subscribe" { type "submit" }
}
if sent {
  p "Thanks — check {email} to confirm."
}
```

---

## Handlers That Change State

The expression is evaluated against page state. Anything assign-able works:

```tw
button on:click "count = count + 1" { "Add one" }
button on:click "count--" { "Remove one" }
button on:click "isActive = !isActive" { "Toggle" }
button on:click "items.push('New item')" { "Add" }
button on:click "user.name = 'Aarav'" { "Rename" }
```

Function calls to imported client packages also work:

```tw
import dayjs from "dayjs"

button on:click "stamp = dayjs().format('DD/MM/YYYY HH:mm')" { "Now" }
```

After the expression runs, the runtime re-evaluates every part of the page that reads the changed state — text, conditionals, loops and bindings — and patches the DOM in place.

---

## Events on Any Element

Handlers are not restricted to buttons and inputs:

```tw
div on:mouseenter "hovered = true" on:mouseleave "hovered = false" {
  if hovered { span "You are hovering" } else { span "Hover me" }
}

li on:click "selected = item.id" { "{item.title}" }
```

---

## Inside Loops

Each iteration's handler closes over that iteration's loop variable:

```tw
state {
  todos = [
    { id: 1, text: "Write docs" },
    { id: 2, text: "Ship release" }
  ]
}

for t in {todos} {
  li "{t.text}"
    button on:click "todos = todos.filter(x => x.id !== t.id)" { "x" }
}
```

Write the loop variable **bare** (`t`, not `'t'` or `{t}`) inside the handler — the runtime substitutes the current iteration's item automatically. Per-item remove buttons work because each `on:click` refers to its own `t`. See [Loops](./syntax-loops.md).

---

## Static Pages

`on:*` requires an interactive render mode. On `render static` pages, events are a compiler error (TW200):

```tw
page { render static }
button on:click "x()" { }        // ✗ TW200 — static pages cannot be interactive
```

---

## Common Mistakes

### Forgetting quotes

```tw
button on:click count++ { }      // WRONG
button on:click "count++" { }    // RIGHT
```

### Quotes around the loop variable in handlers

```tw
for t in {todos} {
  button on:click "remove('t')" { }        // WRONG — string 't', not the item
  button on:click "remove(t)" { }           // RIGHT — bare loop variable
}
```

### Expecting a page reload after a state change

Handlers update the page in place. The browser does not navigate and form inputs keep their focus.

---

## Quick Reference

```tw
on:click "count++"
on:input "name = event.target.value"
on:submit "save()"
on:submit.prevent "save()"        // preventDefault
on:click.stop "pick()"            // stopPropagation
on:mouseenter "show = true"
```

## Related

- [State](./syntax-state.md)
- [Bindings](./syntax-bindings.md) — `:value` two-way inputs
- [Loops](./syntax-loops.md) — per-item handlers
- [Client Runtime](./client-runtime.md) — how handlers are wired and patched
