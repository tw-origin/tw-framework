# TW Framework — Client Runtime (TW VDOM 1)

This document covers one thing completely: what runs in the browser — hydration, live reactivity, two-way inputs, and SPA navigation powered by TW VDOM 1.

---

## What Ships to the Browser

Every page with interactivity ships the TW runtime (~5 KB). Its jobs:

1. **Hydrate** — attach live behaviour to the server-rendered markup
2. **React** — re-evaluate interpolated text, conditionals, loops and bindings when state changes
3. **Route** — navigate between pages without reloading the document

The runtime loads last, after any page chunks:

```html
<script src="/js/c-a81f2k.js"></script>    <!-- dayjs (page's imports) -->
<script src="/js/p-f31ac7.js"></script>   <!-- this page's symbol scope -->
<script src="/__tw_runtime.js"></script>  <!-- TW VDOM 1 runtime (last) -->
```

---

## Hydration

The server renders HTML with data attributes that describe which nodes are interactive and what they read:

```html
<p data-tw="count">Count is 0</p>
<button data-tw-on-click="count++">Add one</button>
```

On load, the runtime reads those markers and wires:

- event handlers to their expressions
- interpolations to the state they read
- conditionals and loops to their state dependencies
- bound attributes (`:class`, `:value`) to their expressions

The result is a fully live page on top of server-rendered HTML — the page is visible immediately, interactivity attaches without a re-render.

---

## Live Reactivity

When a handler changes state, the runtime finds every dependent part and patches only those DOM nodes:

```tw
state { count = 0 }

button on:click "count++" { "Add one" }
p "Count is {count}"
if count >= 5 { p "Power user!" } else { p "Keep clicking... ({5 - count} to go)" }
```

After one click on the button:

- the paragraph's text becomes `Count is 1` — a text patch, nothing else
- the conditional re-evaluates and swaps branches when `count` crosses 5
- the button label, the layout, the rest of the page — untouched

No diff of the whole page, no re-running of unrelated handlers, no reload.

---

## Live Lists

`for` loops re-render when the list they read changes, and **items keep their identity** across re-renders:

```tw
state {
  todos = [
    { id: 1, text: "Write docs", done: false },
    { id: 2, text: "Ship release", done: false }
  ]
}

for t in {todos} {
  li :class "t.done ? 'done' : ''" on:click "t.done = !t.done" {
    "{t.text}"
    button on:click "todos = todos.filter(x => x.id !== t.id)" { "x" }
  }
}
```

Because each iteration's handler refers to its own `t` (the runtime substitutes the current item), per-item buttons toggle and remove exactly their own row — even after the list re-renders.

---

## Two-Way Inputs

```tw
state { name = "" }

input :value "name" { type "text" }
p "Hello {name}"
```

Typing updates `name`; changing `name` (a Clear button, a fetch handler) updates the input. The `:value` shorthand and the `bind:value` long form are the same binding.

---

## SPA Navigation

Internal links — `href` starting with `/` — are intercepted:

1. The runtime fetches the target page's HTML
2. The document is swapped in place — no full browser reload
3. History and `popstate` work — back and forward navigate the same way
4. Hovering a link prefetches the page, so clicks feel instant

```tw
a "About" { href "/about" }                 // SPA navigation
a "External doc" { href "/about" data-tw-native }   // full reload instead
```

Opt out per link with `data-tw-native`. SPA navigation also loads any stylesheet the incoming route links that the current page didn't.

---

## Imported Client Packages

npm imports in pages and layouts become browser chunks; their symbols are usable inside handler expressions:

```tw
import dayjs from "dayjs"

state { stamp = "click karo" }

div {
  button on:click "stamp = dayjs().format('DD/MM/YYYY HH:mm')" { "Abhi ka time" }
  p "{stamp}"
}
```

Rules recap ([Client Modules](./client-modules.md)):

- Import in a **page** → symbol access for that page
- Import in a **layout** → chunk loads for every page below it, symbol access only for the layout itself
- No imports in the chain → no chunk loaded at all
- Server-only imports in pages fail the build (TW1007)

---

## Event Modifiers

```tw
form on:submit.prevent "saveForm" { }      // preventDefault — no reload
button on:click.stop "pick" { }             // stopPropagation
```

---

## When the Runtime Is Not Needed

- `render static` pages — no state, no events, no runtime for interactivity
- Pages whose chain has no client imports and no interactivity ship the runtime shell only

---

## Mental Model Summary

```
server render → HTML with data markers
runtime load  → hydrate: handlers + dependencies wired
user event    → expression runs → state changes
state change  → dependents re-evaluate → DOM patched in place
link click    → fetch + swap, history updated, prefetch on hover
```

That is everything the browser side does — the rest of the framework lives at compile time and on the server.

---

## Related

- [State](./syntax-state.md)
- [Events](./syntax-events.md)
- [Bindings](./syntax-bindings.md)
- [Conditionals](./syntax-conditionals.md) and [Loops](./syntax-loops.md)
- [Client Modules](./client-modules.md)
