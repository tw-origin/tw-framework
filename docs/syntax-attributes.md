# TW Framework — Attributes

This document covers one thing completely: element attributes in `.tw` files — static attributes, interpolation, booleans, data attributes, dynamic property bindings and the inline `style` attribute.

---

## Static Attributes

Attributes are `name "value"` pairs written inside the element's braces:

```tw
a href "/about" target "_blank" { "About" }
img src "/logo.png" alt "Logo"
input type "email" placeholder "Enter email"
meta name "viewport" content "width=device-width, initial-scale=1"
```

Rules:

- The value is a **quoted string**
- Multiple attributes sit on the same nesting level, separated by newlines
- Attribute order does not matter
- Class is written with dot notation on the tag (`div.card`), not as an attribute

```tw
div.card.active { }                 // class via dot notation
div class "card active" { }         // also works, dot notation is idiomatic
```

---

## Interpolated Attributes

Because attribute values are quoted strings, interpolation works inside them:

```tw
img src "{user.avatar}" alt "Avatar of {user.name}"
a "Edit post" { href "/admin/posts/{post.slug}" }
input type "text" value "{name}"
```

See [Interpolation](./syntax-interpolation.md).

---

## Boolean Attributes

HTML boolean attributes (`disabled`, `checked`, `required`, `readonly`, `autofocus`, ...) can be written bare:

```tw
input type "text" placeholder "Search" disabled
input type "checkbox" checked
input type "email" required
button "Save" disabled
```

---

## Data Attributes

`data-*` attributes pass through untouched, which makes them useful for third-party scripts and testing hooks:

```tw
div.card data-testid "product-card" { }
a "Docs" { href "/docs" data-tw-native }
button "Buy" data-product-id "42" on:click "buy()" { "Buy" }
```

The special `data-tw-native` attribute opts a link out of client-side SPA navigation — see [Client Runtime](./client-runtime.md).

---

## Property Bindings — `:attr`

A **bound** attribute re-evaluates when state changes. Prefix the attribute name with `:`:

```tw
div :class "isActive ? 'active' : 'hidden'" { }
input :value "name" { }
img :src "user.avatar" alt "Avatar"
div :style "color: {textColor}" { }
```

The value of a bound attribute is an **expression** (in quotes), not a literal — `"isActive ? 'active' : 'hidden'"` is evaluated against page state and re-evaluated on change. Full rules in [Bindings](./syntax-bindings.md).

---

## Inline `style` Attribute

The `style` attribute takes inline declarations as a string:

```tw
div style "color: red; padding: 4px" { }
```

With binding, it can react to state:

```tw
state { progress = 40 }

div.progress-bar :style "width: {progress}%" { }
```

Inline `style` attributes are runtime styles — they are **never extracted** into the page's CSS files. For anything reusable, use a stylesheet: [TSS Syntax](./tss-syntax.md).

---

## ARIA and Accessibility Attributes

ARIA attributes pass through exactly like any other attribute:

```tw
button "Close" aria-label "Close dialog" on:click "close()" { }
div role "alert" aria-live "polite" { "Saved successfully" }
nav aria-label "Main navigation" { }
```

---

## Special Attribute Forms — Summary

| Form | Example | Behaviour |
|------|---------|-----------|
| Static | `href "/about"` | literal value |
| Interpolated | `href "/blog/{post.slug}"` | value built from state |
| Boolean | `disabled` | attribute present or absent |
| Data | `data-testid "card"` | passes through to HTML |
| Bound | `:class "expr"` | re-evaluates on state change |
| Two-way | `:value` / `bind:value "name"` | input writes back to state |

---

## Common Mistakes

### Unquoted value

```tw
img src /logo.png { }          // WRONG
img src "/logo.png"             // RIGHT
```

### Class as attribute when dot notation is available

```tw
div class "card" { }            // works
div.card { }                    // idiomatic
```

### Mixing up `:` binding and static

```tw
img src "user.avatar"           // literal string "user.avatar" — wrong
img :src "user.avatar"          // the value of state user.avatar — right
```

### Style block vs style attribute

`style { ... }` as an element is a **compiled TSS block**; `style "..."` as an attribute is an **inline runtime style**. They are different things.

---

## Quick Reference

```tw
tag { attr "value" }                // static
tag { attr "/blog/{slug}" }         // interpolated
tag { disabled }                    // boolean
tag { data-id "42" }                // data-*
tag { :class "expr" }               // bound
tag { style "color: red" }           // inline style
tag { :style "width: {w}%" }        // bound inline style
```

## Related

- [Syntax Overview](./syntax-guide.md)
- [Markup & Elements](./syntax-markup.md)
- [Interpolation](./syntax-interpolation.md)
- [Bindings](./syntax-bindings.md)
