# TW Framework — Form Validators

This document covers one thing completely: the built-in validator functions for checking field values, and `createForm` for running them.

---

## The Built-In Validators

Each validator takes its rule (and an optional message), and returns a function that checks one value:

```twm
import { validators } from "@tw/runtime"

const required = validators.required()
const email = validators.email()
const minLength = validators.minLength(8, "Use at least 8 characters")
```

| Validator | Checks |
|-----------|--------|
| `required()` | not null, not undefined, not empty string, not empty array |
| `minLength(n)` | string length is at least `n` |
| `maxLength(n)` | string length is at most `n` |
| `email()` | the value is an email address |

A validator returns `true` when the value passes, or the error message when it fails.

```twm
const check = validators.required("Pick at least one item")
check([])        // "Pick at least one item"
check(["a"])     // true
```

## Running Them Together

`createForm` wires fields, validators and submission together:

```twm
import { createForm, validators } from "@tw/runtime"

const form = createForm({
  fields: {
    email:    { value: "", validators: [validators.required(), validators.email()] },
    password: { value: "", validators: [validators.minLength(8)] }
  }
})
```

The form tracks each field's value, its validation result, and whether the field has been touched.

## Schema Shortcut

For plain shapes, `createFormFromSchema` builds the same form from a schema object:

```twm
const form = createFormFromSchema({
  email:    { value: "", validators: [validators.email()] },
  password: { value: "", validators: [validators.minLength(8)] }
})
```

## Where It Runs

Validators are pure functions over values — they run wherever the values live, on the client in a hydrated form, or on the server inside a route handler. Pair them with [Request Validation](./request-validation.md) so the server re-checks what the client validated.

## Related

- [Forms Guide](./guide-forms.md)
- [Request Validation](./request-validation.md)
