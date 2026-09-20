# TW Framework — Two-Way Binding

This document covers one thing completely: `:value` — binding an input to state so typing updates state and state updates the input.

---

## The Binding

```tw
state { name = "" }

div.form {
  input :value "name" { type "text" placeholder "Your name" }
  p.preview { "Hello, {name}!" }
}
```

The `:value` binding does two things:

1. the input starts with `name`'s current value
2. typing in the input writes back into `name` — the preview line updates as you type

## Which Inputs It Works On

| Input | Bind with |
|-------|-----------|
| text, password, email, number | `:value` |
| textarea content | `:value` |
| checkbox | `:value` |
| select | `:value` |

## Binding Is an Expression

The bound name can be a state field; the runtime reads it for the attribute and writes user input back into it on `input` events.

## Beyond Plain Inputs

For derived or transformed values, bind the plain field and compute in the markup:

```tw
state { price = 100, qty = 2 }

div.row {
  input :value "qty" { type "number" min 1 }
  p { "Total: {price * qty}" }
}
```

## Submitting

Bind inputs, then handle the submit as an event — see [Forms Guide](./guide-forms.md):

```tw
state { email = "" sent = false }

form on:submit "sent = true" {
  input :value "email" { type "email" required }
  button { "Subscribe" }
}
if sent { p { "Thanks — check {email}." } }
```

## Related

- [Syntax: Bindings](./syntax-bindings.md)
- [Forms Guide](./guide-forms.md)
