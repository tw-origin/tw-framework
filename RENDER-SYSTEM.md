# TW Framework — The Render System

Eight render modes. One syntax. Every page picks how it renders — from build-time static to server-pushed live updates — with no plugins, no extra libraries, no configuration ceremony.

```tw
page { render static }        # prebuilt HTML, served as-is
page { render ssr }          # rendered on every request
page { render island }        # static shell + hydrated interactive parts
page { render edge }          # static output, edge-CDN deployment
page { render csr }          # the browser builds the DOM
page { render stream }        # shell first, content streams in
page { render ppr }           # prebuilt shell + per-request holes
page { render signalStream }  # server-pushed live updates
```

A single site mixes all eight. A marketing page can be `static`, its dashboard `signalStream`, the admin panel `csr` — same project, same build, same runtime.

---

## The Mode Map

| Mode | Rendering happens | For |
|------|------------------|-----|
| `static` | Build time | Content pages, blogs, marketing |
| `ssr` | Every request | Per-user, per-request data |
| `island` | Build time + client | Content with interactive widgets |
| `edge` | Build time | Edge-CDN serving through adapters |
| `csr` | In the browser | Apps behind a login, dashboards |
| `stream` | Request, chunked | Fast shell, slow data follows |
| `ppr` | Build + request holes | Instant paint with fresh data |
| `signalStream` | Build + live push | Tickers, dashboards, notifications |

Every mode is real, not advisory: the build and the server each change their behavior to match — `static` prebuilds, `ssr` renders per request, `stream` flushes the shell before the data, `ppr` ships a prebuilt shell and fills its holes live, `signalStream` keeps an open connection and pushes.

---

## Streaming: the Page That Fills Itself

`render stream` splits a page into its shell and its holes. The shell — everything that does not wait on data — is flushed the moment the request arrives. Each `Suspense` boundary's content follows on the wire as its own chunk, and the browser swaps the fallback in place. No reconciliation, no re-parsing, and if JavaScript never runs, the fallback simply stays.

```tw
page { title "Feed" render stream }

div.feed {
  h1 "Streamed shell"
  Suspense { fallback div.loading { "Loading..." }
    div.data { "Heavy content" }
  }
}
```

Boundary ids are derived from their content, so the built shell and the request-time render always agree on which hole is which.

## Partial Prerendering: Static Shell, Live Holes

`render ppr` prebuilds the shell with fallbacks baked in — first paint comes from a static file — and the marked holes fetch fresh content from the server on every visit. Fast shell, fresh data, both at once.

```tw
page { title "Product" render ppr }

div.product {
  h1 "Instant shell"
  Suspense { fallback div.skeleton { "..." }
    div.fresh { "Fresh per-request data" }
  }
}
```

## Signal Streaming: the Page That Updates Itself

The flagship. `render signalStream` pages hold a persistent connection open to the server, and server-side signal changes push straight into the browser — the parts of the page bound to that signal update in place. No reload, no polling, no socket library, no event handlers, no DOM code.

```tw
page { title "Live Prices" render signalStream }

state {
  price = publicSignal(150.25)          # broadcast to every client
  qty = 2
  cart = privateSignal([])              # per-user, session-scoped
  secret = serverOnlySignal(0)          # never leaves the server
  total = derivedSignal("price * qty")  # computed, recomputed live
}

div.live {
  h2 "Price: {price}"
  h3 "Total: {total}"
}
```

Somewhere on the server, a route module pushes an update:

```twm
import { setSignal } from "tw";

fn post(request) {
  setSignal("price", 151.2);
  setSignal("balance", 100, { request });   # only this user's session
  return { status: 200, json: { ok: true } };
}
```

Every connected browser watching `price` now shows **151.2**. The developer wrote markup — the framework did the transport, the batching, the diffing, the reconnect.

### The protocol under it

- **Batched frames** — updates inside one 100ms window leave as a single frame; the last write per signal wins
- **Sequence numbers + resume** — a dropped connection resumes from its last applied frame, or falls back to one snapshot frame when the history window has moved on
- **Permissions in the type system** — `publicSignal` broadcasts, `privateSignal` is scoped to the caller's session, `serverOnlySignal` is never serialized, never streamed, never rendered
- **Derived state for free** — `derivedSignal("price * qty")` recomputes on every frame, on the client, with the build already having evaluated it for first paint
- **Lists stream too** — push a new array and the page's lists re-render in place

Verified end to end in a real browser: a price pushed from the server updated the bound element, recomputed the derived total, and re-rendered the list — without a page reload and without a single line of client code.

---

## What It Costs

Almost nothing. The client runtime is ~5KB, loads `defer`, and binds events through delegation — the static shell parses to interactive with zero framework blocking. Signal updates travel as compact JSON frames (`{"v":1,"seq":42,"updates":[["price",151.2]]}`) carrying only what changed. A fifty-client fan-out delivers to all fifty, batched into one frame.

## Backed By

- 869 passing tests
- 183 reference documents
- Zero type errors across all eleven packages

---

## Go Deeper

- [Render modes — the full reference](./docs/render-modes.md)
- [Signal Streaming — the protocol](./docs/signal-streaming.md)
- [Suspense boundaries](./docs/suspense.md)
- [Streaming HTML](./docs/streaming.md)
- [State and signal declarations](./docs/syntax-state.md)
- [Getting started](./GETTING-STARTED.md)
