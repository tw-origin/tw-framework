# TW Framework — Render Modes

This document covers one thing completely: the eight render modes — `static`, `ssr`, `island`, `edge`, `csr`, `stream`, `ppr` and `signalStream` — what each does at build time and runtime, and when to use each.

---

## Where a Mode Is Set

In the page config:

```tw
page { render static }
page { render ssr }
page { render island }
page { render edge }
page { render csr }
page { render stream }
page { render ppr }
page { render signalStream }
```

Default: `static`. Every page chooses its own mode — one site can mix all eight.

## The Mode Map

| Mode | Rendering happens | Output | For |
|------|------------------|--------|----|
| `static` | Build time | Prebuilt HTML in `.tw/` | Content pages, blogs, marketing |
| `ssr` | Every request | Live HTML | Per-user, per-request data |
| `island` | Build time + client | Static shell + hydrated interactive parts | Content with widgets |
| `edge` | Build time | Static HTML served from edge CDNs | Same as `static`, edge-deployed |
| `csr` | Browser | Empty shell + client-built DOM | Apps behind a login, dashboards |
| `stream` | Request, chunked | Shell flushes first, Suspense holes follow | Slow data you refuse to block on |
| `ppr` | Build time + request holes | Prebuilt shell + per-request hole fills | Fast first paint with fresh data |
| `signalStream` | Build time + live push | Prebuilt page + server-driven signal updates | Live dashboards, tickers, notifications |

ISR (`revalidate N`, docs/179) is orthogonal — any mode can declare a revalidation window.

## render static — Static Site Generation

```
Build time: page is pre-rendered to static HTML
Runtime:    static HTML is served, no server computation
```

The build compiles the page once and writes complete HTML into `.tw/`. At runtime the file is served as-is. Interactive elements still hydrate on the client (the scripts are `defer`-loaded), which is what makes `static` and `island` near-identical in output — see `island` below.

```tw
page {
  title "About Us"
  render static
}

div {
  h1 "About"
  p "This is a static page."
}
```

## render ssr — Server-Side Rendering

```
Build time: nothing — the build skips the page
Runtime:    the page is rendered on every request
```

```tw
page {
  title "Dashboard"
  render ssr
}

div {
  h1 "Dashboard for {user}"
}
```

The page renders per request through the render pipeline — combine with `revalidate` (docs/isr.md) to cache renders between requests, and `revalidatePath` to drop them on demand.

## render island — Static Shell + Hydrated Interactive Parts

```
Build time: shell pre-rendered like `static`
Runtime:    shell served from the build; interactivity attaches client-side
```

TW pages are islands by construction: the shell ships as plain crawlable HTML, event handling is document-delegated (no per-element listener work), and hydration scripts load `defer` — the browser finishes parsing the shell before any framework code runs.

```tw
page {
  title "Pricing"
  render island
}

div.pricing {
  h1 "Plans"
  button.btn on:click "pick('pro')" { "Choose Pro" }
}
```

Use `island` (rather than `static`) to make the intent explicit on content pages that carry interactive widgets.

## render edge — Static, Edge-Deployed

Same build output as `static`; the mode marks pages intended for edge CDN serving through an adapter (`tw adapter <platform>`, docs/64-75). Nothing framework-level changes at build.

## render csr — Client-Side Rendering

```
Build time: an empty shell + the page markup inside a <template>
Runtime:    the browser builds the visible DOM from the template
```

```tw
page {
  title "Editor"
  render csr
}

div.editor {
  h1 "Client-rendered editor"
  p "This DOM is built by the browser."
}
```

The served body contains `<div id="tw-root"></div>` and a `<template id="tw-csr-template">` holding the compiled markup. A bootstrap script instantiates the template during parsing, then hydration attaches. View-source shows an empty root — the tradeoff is the classic CSR one: no content without JavaScript, so keep it off SEO-facing pages.

## render stream — Streaming SSR

```
Build time: nothing — the build skips the page
Runtime:    the shell flushes immediately; each Suspense boundary's
            content follows as a __TW_RESOLVE__ chunk
```

```tw
page {
  title "Feed"
  render stream
}

div.feed {
  h1 "Streamed shell"
  Suspense { fallback div.loading { "Loading..." }
    div.data { "Heavy content" }
  }
}
```

The response starts with everything up to the first boundary (fallback visible), and each boundary's content arrives on the wire as a `<script>window.__TW_RESOLVE__(id, "…")</script>` chunk that swaps the fallback without reconciliation. Pair with Suspense (docs/suspense.md).

## render ppr — Partial Prerendering

```
Build time: the shell pre-renders with Suspense fallbacks, boundaries
            marked data-tw-ppr
Runtime:    the static shell serves instantly; the client fetches each
            marked boundary's fresh content from /_tw/ppr and swaps it in
```

```tw
page {
  title "Product"
  render ppr
}

div.product {
  h1 "Product page (instant shell)"
  Suspense { fallback div.skeleton { "..." }
    div.fresh { "Fresh per-request data" }
  }
}
```

First paint comes from the prebuilt file; the holes fill from the live server. Boundary ids are deterministic (derived from their content), so the built shell and the per-request render agree on which hole is which. If a hole's fetch fails, the fallback simply stays.

## render signalStream — Signal Streaming

```
Build time: the page pre-renders with initial signal values
Runtime:    the client holds a persistent stream open; every
            setSignal() on the server patches the page in place
```

```tw
page {
  title "Live Prices"
  render signalStream
}

state {
  price = publicSignal(150.25)
}

div { h2 "Price: {price}" }
```

Route modules push updates with `import { setSignal } from "tw"`; connected browsers receive batched frames (`{"v":1,"seq":N,"updates":[...]}`) and re-render only the affected bindings. Signals carry permissions — `publicSignal` broadcasts, `privateSignal` goes to pages that declare it, `serverOnlySignal` never leaves the server. Full protocol: docs/signal-streaming.md.

## Choosing

| Situation | Mode |
|-----------|------|
| Content that rarely changes | `static` |
| Content + widgets | `island` |
| Per-user data | `ssr` |
| Behind-a-login app | `csr` |
| Slow data, fast shell | `stream` |
| Fast shell + fresh data | `ppr` |
| Live server-pushed data | `signalStream` |
| Edge CDN deployment | `edge` |

## Reference

- docs/streaming.md — the streaming protocol
- docs/suspense.md — Suspense boundaries and fallbacks
- docs/isr.md — `revalidate` and on-demand invalidation
- docs/signal-streaming.md — the signal streaming protocol
- docs/syntax-page-config.md — the full `page { }` frontmatter
