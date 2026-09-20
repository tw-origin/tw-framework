# TW Framework — Conditionals

This document covers one thing completely: conditional rendering — `if / else`, chained branches and `switch`, and how they re-evaluate when state changes.

---

## if / else

```tw
if count > 5 {
  p "Many clicks!"
} else {
  p "Keep clicking"
}
```

The condition is a **bare expression** — no quotes, no braces around the whole thing:

```tw
if count > 5 { }        // right
if "count > 5" { }      // wrong
if {count > 5} { }      // wrong
```

The chosen branch renders; the other is compiled out for that render.

---

## else if — Chained Branches

```tw
if status == "loading" {
  p "Loading..."
} else if status == "error" {
  p "Something went wrong"
} else {
  p "Content loaded"
}
```

Branches are checked top to bottom; the first truthy condition wins.

---

## Conditions Read State

Conditions can use any state variable, property access, length checks and comparisons:

```tw
if user.role == "admin" { }
if items.length > 0 { }
if isLoggedIn && !isBanned { }
if query == "" { }
if total >= 100 { }
```

---

## Live Re-Evaluation

In the browser, conditionals re-evaluate when the state they read changes — the branch swaps without a reload:

```tw
state { count = 0 }

button on:click "count++" { "Click" }

if count >= 5 {
  p "Power user!"
} else {
  p "Keep clicking... ({5 - count} to go)"
}
```

Every click re-runs both the condition and the winning branch's interpolations.

---

## switch

For matching one value against several cases:

```tw
switch status {
  case "loading" {
    p "Loading..."
  }
  case "error" {
    p "Error occurred"
  }
  case "success" {
    p "Done!"
  }
  default {
    p "Unknown status"
  }
}
```

Rules:

- The subject is a bare expression: `switch status {`, `switch user.role {`
- Each `case "value" { }` compares with `==`
- `default { }` is optional and runs when nothing matches
- The first matching case wins; no fall-through

---

## Nesting

Conditionals nest inside each other and inside loops:

```tw
for order in {orders} {
  if order.paid {
    if order.shipped {
      span "Delivered"
    } else {
      span "In transit"
    }
  } else {
    span "Payment pending"
  }
}
```

And inside any element:

```tw
div.cart {
  if cart.length == 0 {
    p "Your cart is empty"
  } else {
    p "{cart.length} items"
  }
}
```

---

## try / catch

The companion block for error boundaries around risky content:

```tw
try {
  div.content {
    // content that may fail to render
  }
} catch {
  div.error {
    p "Something went wrong"
  }
}
```

---

## Truthiness

Conditions follow standard JavaScript truthiness:

| Value | Renders |
|-------|---------|
| `true`, non-empty string, non-zero number, non-empty array | true branch |
| `false`, `""`, `0`, `null`, `undefined`, empty array check `length == 0` | else branch |

```tw
if name { }              // true when name is not ""
if items.length { }      // true when the array is not empty
```

---

## Common Mistakes

### Braces around the condition

```tw
if {count > 5} { }         // wrong
if count > 5 { }           // right
```

### `=` instead of `==`

```tw
if status = "ok" { }        // assignment — wrong
if status == "ok" { }       // comparison — right
```

### `else` on its own line without the block

```tw
if x { }
else { }                    // wrong — else attaches to the if
if x { } else { }           // right
```

---

## Quick Reference

```tw
if cond { } else { }
if cond { } else if cond2 { } else { }
switch value {
  case "a" { }
  default { }
}
try { } catch { }
```

## Related

- [Loops](./syntax-loops.md)
- [State](./syntax-state.md)
- [Interpolation](./syntax-interpolation.md)
- [Client Runtime](./client-runtime.md)
