# TW Framework — Form State (TWForm)

This document covers one thing completely: `createForm` and `createFormFromSchema` — `TWForm`, the typed form-state container with per-field signals, validation triggers, and submit lifecycle. For the validator functions themselves, see doc 94.

---

## createForm

```twm
import { createForm, validators } from "@tw/runtime"

const form = createForm({
  fields: {
    email: {
      value: "",
      validators: [validators.required("Email is required"), validators.email()],
    },
    age: {
      value: 18,
      validators: [validators.min(18, "Must be an adult")],
    },
  },
  validateOnChange: true,
  validateOnBlur: true,
  validateOnSubmit: true,
})
```

`createFormFromSchema(schema)` is the shorthand when the object IS the fields map:

```twm
const form = createFormFromSchema({
  email: { value: "", validators: [validators.email()] },
})
```

## FormConfig

| Option | Default | Meaning |
|--------|---------|---------|
| `fields` | — | `Record<string, FieldConfig>` |
| `onSubmit` | — | `(values) => void \| Promise<void>` |
| `validateOnChange` | `true` | Re-validate a field on each change |
| `validateOnBlur` | `true` | Re-validate a field when it loses focus |
| `validateOnSubmit` | `true` | Full validation before `onSubmit` runs |

## Values

```twm
form.getValue("email")               // current value
form.setValue("email", "a@b.com")    // write + trigger validation
form.getFieldNames()                 // every field name
```

## Field and Form State

```twm
form.getFieldState("email")   // FieldState: { value, error, touched, ... } | undefined
form.getFormState()           // FormState for the whole form
```

Fields own signals internally — `getFieldState` returns the current snapshot; subscribe through the reactive layer for live UI.

## Validation

```twm
const error = await form.validateField("email")   // error string | null
const ok = await form.validateAll()                // boolean — every field passes
form.setFieldError("email", "Already registered")  // manual error (null clears)
form.clearErrors()
```

## Fields as a Set

```twm
form.addField("phone", { value: "", validators: [validators.phone()] })
form.removeField("phone")
form.setFieldDisabled("phone", true)
```

Forms whose fields depend on other selections (an "other" reason input, country-dependent fields) grow and shrink with the data.

## Submit Lifecycle

```twm
const values = await form.submit()
// 1. runs validateOnSubmit validation
// 2. when invalid: marks fields, errors update, returns null
// 3. when valid: calls config.onSubmit(values) and returns the values

form.touch("email")            // mark a field touched (drives blur validation UX)
form.reset()                   // values back to initial, errors cleared
```

## Wiring to the DOM

```twm
import { on } from "@tw/runtime"

const input = document.querySelector("input[name=email]")
on(input, "input", () => form.setValue("email", input.value))
on(input, "blur", () => form.touch("email"))

const render = () => {
  const state = form.getFieldState("email")
  errorLabel.textContent = state?.error ?? ""
  input.classList.toggle("invalid", state?.error != null)
}
render()
```

## Pattern: Registration Form

```twm
const form = createForm({
  fields: {
    name:  { value: "", validators: [validators.required()] },
    email: { value: "", validators: [validators.required(), validators.email()] },
    pass:  { value: "", validators: [validators.required(), validators.minLen(8)] },
  },
  onSubmit: async (values) => {
    await registerAccount(values)
  },
})

if (await form.submit()) toastSuccess("Account created")
```
