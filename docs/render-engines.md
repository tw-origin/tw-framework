# TW Framework — Render Engines

This document covers one thing completely: the `render.engine` strategy — what
each engine does, how a React or Preact component becomes an island, and how to
choose between them.

---

## The setting

```ts
// tw.config.ts
export default {
  strategies: {
    render: { engine: "tw-vdom" },  // "tw-vdom" | "react" | "preact" | "none"
  },
};
```

Omitted, the engine is `tw-vdom` — today's behaviour. Adding the block never
breaks an existing project.

| Engine | What it means | Needs |
|--------|---------------|-------|
| `tw-vdom` | TW's own VDOM — built in, about 3 KB, capable of shipping zero JavaScript | nothing |
| `react` | React components rendered by TW, as islands | `react`, `react-dom` |
| `preact` | Preact components (a smaller React-compatible runtime) | `preact`, `preact-render-to-string` |
| `none` | No client renderer — static HTML only | nothing |

---

## `tw-vdom` — the default

TW's own virtual DOM. It is part of the framework, so there is nothing to
install, and a page that needs no interactivity ships no JavaScript at all. The
`state { }` block and `on:click "count++"` expressions are handled here.

Choose it unless you have a specific reason not to.

---

## `react` and `preact` — foreign components as islands

With `render.engine` set to `react` or `preact`, a component imported from those
ecosystems works inside a `.tw` file:

```tw
// home/page.tw
import Counter from "@./components/Counter.tsx"

page { title "Home" render ssr }

div {
  h1 "Counter"
  Counter { start 5 }
}
```

The build:

1. **Detects the engine** and checks the packages are installed. If they are
   missing it offers to install them (or fails the build with the exact command
   to run).
2. **Scans the foreign imports** in every page and component.
3. **Server-renders** each one, so the first paint already has the markup.
4. **Builds a hydration chunk** for the browser and injects the script tag.

At build time each island is reported:

```
  ⚡ island: Counter (preact)
```

And the page arrives server-rendered, then hydrates:

```html
<div data-tw-island="Counter"><button>5</button></div>
```

Click it and it counts — the island is live, the rest of the page stays static.

### Choosing between React and Preact

Preact is the smaller runtime and a near drop-in for React, so it is the better
default for an island or two. React is the right choice when the components you
are reusing already depend on it, or on a React-only library.

---

## Mixing React and Preact in one project

You do not have to choose one engine for the whole project. Each foreign
component is assigned the engine **its own imports** name:

```tsx
// components/RChart.tsx
import { useEffect } from "react";        // -> react

// components/PToggle.tsx
import { useState } from "preact/hooks";  // -> preact
```

```tw
import RChart from "@./components/RChart.tsx"
import PToggle from "@./components/PToggle.tsx"

page { title "Dashboard" render static }

div {
  RChart { series "a,b,c" }
  PToggle { on true }
}
```

```
  ⚡ island: RChart (react, eager)
  ⚡ island: PToggle (preact, eager)
```

`render.engine` is only the **fallback**, used when a component imports neither
framework of its own. Both packages must be installed; the build checks the ones
that are actually used and installs a missing one (or fails with the command).

---

## When an island hydrates

A foreign component's `@client:*` directive decides *when* its island becomes
interactive. The default is eager, which is what every island did before this
existed.

| Directive | Hydrates |
|---|---|
| *(none)* or `@client` or `@client:eager` | on `DOMContentLoaded` |
| `@client:lazy` | when the browser is idle (`requestIdleCallback`, `setTimeout` fallback) |
| `@client:visible` | when the island scrolls into view (`IntersectionObserver`) |
| `@server` | never — **no JavaScript is shipped at all** |

```tsx
// components/HeavyChart.tsx
// @client:visible
import { useEffect } from "react";
export default function HeavyChart({ series }) { /* ... */ }
```

The server-rendered markup is on screen from the first paint either way. What
differs is when the island's JavaScript arrives:

- `@client:lazy` — the chunk loads with the page and hydrates when the browser
  is idle.
- `@client:visible` — the chunk is **not downloaded at all** until the island
  scrolls into view, so bytes are never fetched for a part of the page the
  visitor does not reach. The build emits a small loader instead of a script tag.

Put `@client:visible` on anything below the fold and `@client:lazy` on anything
that is not needed for the first interaction.

---

## `none` — static HTML only

No client renderer is shipped. Pages render to HTML and stay that way;
interactive expressions do not run in the browser. This is the engine for a
purely static site where you want the smallest possible output.

---

## Seeing what is resolved

`tw doctor` reports the engine, whether its packages are present, and any
warning — the same resolution the build uses:

```
render.engine    preact    preact found
```

A missing package is reported before the build rather than as a failure in the
middle of it.

---

## Compatibility

- `render.engine` is independent of `hydration.mode`. An island needs
  `hydration.mode` to allow hydration (`auto` or `islands`); `none` disables it
  and leaves the server-rendered markup static.
- `state.model` = `hooks` requires a React-compatible renderer. With
  `render.engine` of `tw-vdom` or `none` and no hooks runtime available, the
  build reports the conflict instead of failing at run time.

## Related

- [Strategies](./strategies.md) — the full option list and the compatibility matrix
- [Configuration](./configuration.md) — where the `strategies` block lives
- [Render modes](./render-modes.md) — `static`, `ssr`, `island`, `stream`
