# TW Framework — Event Delegation

This document covers one thing completely: `delegate`, the typed helpers `onClick`/`onInput`/`onChange`/`onKeydown`/`onSubmit`, and `parseEventModifiers` — handling events for dynamic children with one listener.

---

## The Problem

Long lists rebind a listener per row, and rows added later need binding again. Event delegation attaches ONE listener on a stable parent and matches the event target against a selector when it bubbles up.

## delegate

```twm
import { delegate } from "@tw/runtime"

const off = delegate(listElement, "click", ".delete-btn", (event, element) => {
  const row = element.closest("tr")
  deleteRow(row.dataset.id)
})
```

`delegate(event, selector, handler, options?)` — note the argument order: event type first. It returns an unsubscribe function. The handler receives the native event and the matched element (not the parent).

HandlerOptions:

| Option | Meaning |
|-------|---------|
| `capture` | Listen in the capture phase |
| `passive` | Browser may skip `preventDefault` bookkeeping — for scroll handlers |

## Typed Shortcuts

Common cases have one-call helpers:

```twm
import { onClick, onInput, onChange, onKeydown, onSubmit } from "@tw/runtime"

onClick(container, ".row", (e, el) => selectRow(el))
onInput(form, "input", (e, el) => validate(el))
onChange(form, "select", (e, el) => recalc(el))
onKeydown(table, "input", (e, el) => {
  if (e.key === "Enter") commitCell(el)
})
onSubmit(form, "button[type=submit]", (e, el) => e.preventDefault())
```

Each returns its unsubscribe function.

## Global Delegation

For widgets rendered outside any known parent (portals, overlays):

```twm
import { delegateGlobal, initEventDelegation, destroyEventDelegation } from "@tw/runtime"

initEventDelegation()                          // installs document-level delegation
const off = delegateGlobal("click", ".close-btn", handler)
destroyEventDelegation()                       // full teardown
```

## The Delegator Object

`EventDelegator` (via `getDelegator()`) manages the installed listeners and selector matching; `buildSelector` normalizes a selector or element into the matcher form the delegator uses internally.

```twm
import { getDelegator } from "@tw/runtime"

const delegator = getDelegator()
```

## parseEventModifiers

Parses a handler spec like `submit.prevent` or `key.enter.stop` into its base event and modifiers — the same parser the template event system uses.

```twm
import { parseEventModifiers } from "@tw/runtime"

parseEventModifiers("submit.prevent")
// { event: "submit", modifiers: { prevent: true } }

parseEventModifiers("key.enter.stop")
// { event: "keydown", key: "enter", modifiers: { stop: true } }
```

## Rules for Selectors

- The selector must match the element the user actually interacts with, or an ancestor of it up to (but not including) the delegate root — matching walks up from `event.target`.
- Selector specificity does not matter; the first match wins.
- Stopping propagation inside a child's own handler prevents the delegated handler from seeing it.
