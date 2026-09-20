# TW Framework — Bindings

This document covers one thing completely: `:prop` property bindings and `bind:value` two-way bindings — attributes that track and react to state.

---

## Two Kinds of Binding

| Form | Direction | Use |
|------|-----------|-----|
| `:prop "expr"` | state → element | class, src, style, any attribute driven by state |
| `:value` / `bind:value "var"` | state ⇄ element | form inputs that also write back |

---

## Property Bindings — `:prop`

A bound attribute takes an **expression** (quoted) that is evaluated against page state and re-evaluated whenever the state it reads changes:

```tw
div :class "isActive ? 'active' : 'hidden'" { }
input :value "name" { }
img :src "user.avatar" alt "Avatar"
div :style "color: {textColor}" { }
```

### `:class`

```tw
state { isActive = false }

button :class "isActive ? 'btn-on' : 'btn-off'" on:click "isActive = !isActive" {
  "Toggle"
}
```

The expression may combine several classes and interpolate values:

```tw
div :class "card {selected ? 'selected' : ''} {disabled ? 'disabled' : ''}" { }
```

### `:src`, `:href`

```tw
img :src "user.avatar" alt "Avatar of {user.name}"
a "Open" :href "post.url" { }
```

### `:style`

```tw
state { progress = 40 }

div.progress-track {
  div.progress-fill :style "width: {progress}%" { }
}
```

Bound inline styles are runtime styles — they are not extracted into the page's CSS files.

### The difference between `attr` and `:attr`

```tw
img src "user.avatar"      // static — the literal string "user.avatar"
img :src "user.avatar"    // bound — the value of state user.avatar, live
```

A static attribute is set once with the literal text. A bound attribute re-renders whenever the expression's inputs change.

---

## Two-Way Binding — `bind:value`

Form inputs bound with `:value` update **from** state. `bind:value` also writes **back** to state as the user types:

```tw
state { name = "" email = "" }

div.form {
  input :value "name" { type "text" placeholder "Name" }        // shorthand
  input bind:value "email" { type "email" placeholder "Email" }  // long form
  p "Hello {name}"
  p "Email: {email}"
}
```

Both forms are identical to the compiler — `:value` on an input is the shorthand for `bind:value`. Typing into either input updates the state variable, and the paragraph re-renders instantly.

### What two-way means in practice

```tw
state { draft = "" }

input :value "draft" { }
button on:click "draft = ''" { "Clear" }
```

- Type in the input → `draft` updates
- Click Clear → the input empties

Works on text inputs, email, password, number, search and textarea-style fields. For checkboxes and selects, read state with `on:change`:

```tw
input type "checkbox" on:change "agreed = event.target.checked" { }
select on:change "country = event.target.value" {
  option "India" { value "IN" }
  option "Other" { value "ZZ" }
}
```

---

## Where Bindings Can Be Used

Bound attributes are real HTML attributes bound to state — they work on any element:

```tw
div :class "theme" { }
span :class "badge {level}" { "{level}" }
td :class "row.done ? 'done' : ''" { "{row.text}" }
video :src "clip.url" controls { }
```

Inside loops, bindings close over the loop variable like everything else:

```tw
for row in {rows} {
  tr :class "row.done ? 'complete' : 'pending'" {
    td "{row.text}"
  }
}
```

---

## Reactivity

Bindings participate in the same reactivity model as interpolation and control flow:

1. The page renders with initial state
2. An event handler changes state
3. Every binding whose expression reads that state re-evaluates
4. The DOM attribute is patched in place — no reload

See [Client Runtime](./client-runtime.md).

---

## Common Mistakes

### Static attribute where a binding was meant

```tw
img src "user.avatar"      // literal text "user.avatar"
img :src "user.avatar"    // the state value
```

### Quotes inside the class expression

```tw
div :class 'a b' { }               // fine but inconsistent
div :class "isActive ? 'on' : 'off'" { }   // single quotes inside double — right
```

### Expecting `bind:value` on a `<div>`

Two-way binding reads and writes the element's `.value` — only form elements have one. On non-form elements use `:class` / `:style` bindings or interpolation.

---

## Quick Reference

```tw
:class "expr"                // bound class
:src "expr"                  // bound source
:href "expr"                 // bound link
:style "width: {w}%"         // bound inline style
:value "name"                // input ← state (shorthand two-way)
bind:value "name"            // input ⇄ state (long form)
```

## Related

- [Attributes](./syntax-attributes.md)
- [State](./syntax-state.md)
- [Events](./syntax-events.md)
- [Client Runtime](./client-runtime.md)
