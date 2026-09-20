# TW Framework — Directive API

This document covers one thing completely: `registerDirective`, the `DirectiveHooks` lifecycle, and the built-in directives exported by `@tw/runtime`.

---

## Writing a Directive

A directive bundles DOM side-effects behind a name. Register it globally once:

```twm
import { registerDirective, unregisterDirective } from "@tw/runtime"

registerDirective("highlight", {
  mounted(el, binding) {
    el.style.backgroundColor = String(binding.value ?? "yellow")
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      el.style.backgroundColor = String(binding.value ?? "yellow")
    }
  },
  unmounted(el) {
    el.style.backgroundColor = ""
  },
})

unregisterDirective("highlight")     // remove it again
```

## DirectiveHooks

| Hook | Called when |
|------|-------------|
| `created` | Element created, before attributes are applied |
| `beforeMount` | Before insertion into the document |
| `mounted` | After insertion into the document |
| `beforeUpdate` | Before the binding value changes are applied |
| `updated` | After the binding value changes are applied |
| `beforeUnmount` | Before removal from the document |
| `unmounted` | After removal — clean up listeners and timers here |

## DirectiveBinding

| Field | Type | Meaning |
|-------|------|---------|
| `value` | `unknown` | Current bound value |
| `oldValue` | `unknown \| null` | Previous value on updates (`null` on mount) |
| `arg` | `string \| null` | Argument part of the directive name |
| `modifiers` | `Record<string, boolean>` | Flag suffixes |
| `expression` | `string \| null` | Source expression the value came from |
| `instance` | `unknown` | Owning component context |

## Built-in Directives

`registerBuiltinDirectives()` installs the full set (also exported individually so you can register a subset):

| Export | Behavior |
|--------|----------|
| `clickOutsideDirective` | Fires handler when a click lands outside the element |
| `clipboardDirective` | Copies the bound value to the clipboard |
| `debounceDirective` | Debounces the bound handler |
| `focusDirective` | Focuses the element on mount |
| `intersectionDirective` | Callback/visibility when the element enters the viewport |
| `lazyDirective` | Defers heavy work until the element is visible |
| `longpressDirective` | Fires handler after a long press |
| `mutationDirective` | Observes and reports DOM changes inside the element |
| `resizeDirective` | Reports the element's size changes |

```twm
import { registerBuiltinDirectives, getDirectiveRegistry } from "@tw/runtime"

registerBuiltinDirectives()
getDirectiveRegistry()          // Map of every registered directive
```

## Registry

- `registerDirective(name, directive)` — names are unique; re-registering a name replaces the directive.
- `getDirectiveRegistry()` — the `Map<string, Directive>` every renderer consults.
- Built-ins are NOT auto-installed in custom render roots; call `registerBuiltinDirectives()` once during app bootstrap.
