# TW Framework — Signal Streaming

This document covers one thing completely: Signal Streaming — the `render signalStream` mode where server-side signal updates stream to connected browsers and patch the page in place, no page reload, no manual wiring.

---

## The Model

```tw
page {
  title "Live Prices"
  render signalStream
}

state {
  price = publicSignal(150.25)
  trend = privateSignal("neutral")
  secret = serverOnlySignal(0)
}

div.live {
  h1 "Live ticker"
  h2 "Price: {price}"
  h3 "Trend: {trend}"
}
```

A route module pushes an update:

```twm
import { setSignal } from "tw";

fn post(request) {
  const value = Number(request.body?.price ?? 0);
  setSignal("price", value);
  // Per-user scope: pass the request and the update goes only to the
  // caller's session (private signals).
  setSignal("balance", 100, { request });
  return { status: 200, json: { ok: true } };
}
```

Every connected browser watching `price` receives the update and the `<h2>` re-renders — the developer wrote no event code, no DOM code, no transport code.

## Signal Kinds

| Declaration | Seeded into the page | Streamed | Notes |
|-------------|---------------------|----------|-------|
| `publicSignal(v)` | yes | to every client | broadcast; arrays and objects work as initial values |
| `privateSignal(v)` | yes | to the declaring session | `setSignal(name, v, { request })` scopes delivery to the caller's `tw_session`; without a request, declaring pages receive it |
| `serverOnlySignal(v)` | never | never | no markup, no seed, no manifest entry |
| `derivedSignal("expr")` | evaluated at build time | never (computed) | recomputed on the client whenever its inputs change |
| `signal(v)` / plain state | yes | no | ordinary client-side state |

## What the Compiler Emits

Interpolations of streamed signals become live bindings:

```html
<h2>Price: <span data-tw-i="price" data-tw-s="price">150.25</span></h2>
```

`data-tw-s` names the signal the element is bound to. The page also carries a manifest:

```html
<script id="__TW_SIGNALS__" type="application/json">
  {"v":1,"route":"/live","signals":{"price":"public","trend":"private"}}
</script>
```

The client runtime reads the manifest, seeds state from the initial values, and opens the stream.

## The Stream Protocol

`GET /_tw/stream?s=price,trend&since=0` — a persistent HTTP response (`text/event-stream`):

```
data: {"v":1,"seq":1842,"updates":[["price",151.2]]}

data: {"v":1,"seq":1843,"updates":[["price",151.2],["trend","bullish"]]}
```

- **Batching**: updates set within the same 100ms window leave as one frame — the last write per signal wins.
- **Sequence numbers**: every frame carries `seq`; the client tracks the last applied value.
- **Resume**: on disconnect the client reconnects with `&since=<lastSeq>`. If the server's history window (1000 frames) still covers the gap, the missed frames replay; otherwise the client receives one snapshot frame (`{"snapshot":{"price":151.2}}`) and continues live.
- **Permissions**: public updates broadcast to all connected clients; private updates go only to clients whose page declared that signal, and when the push carries `{ request }` (session-scoped), only to clients authenticated as that same session.
- **Keep-alive**: a comment frame every 25 seconds keeps proxies from idling the connection.

## Runtime API

| Function | Where | Purpose |
|----------|-------|---------|
| `setSignal(name, value)` | `.twm` route modules (`import { setSignal } from "tw"`) | queue a server-side signal update |
| `window.__tw.signalStream` | browser | `{ reconnect(), lastSeq() }` — debug/manual control |

## Page Lifecycle

1. The build pre-renders the page (like `static`) with initial values baked in — first paint needs no connection.
2. On load, the runtime opens `/_tw/stream` with the page's declared signals.
3. Frames apply to the signal state; bindings refresh in place.
4. SPA navigation closes the previous page's connection and opens one for the new page's manifest (or none, if the next page does not stream).

## When to Use It

| Situation | Why |
|-----------|-----|
| live dashboards, tickers, scores | data changes land without polling |
| notifications | push straight into the page |
| admin panels | shared state visible across operators |

Not the tool for form submissions or one-shot fetches — those remain plain API routes.

## Reference

- docs/render-modes.md — the full mode map
- docs/streaming.md — response streaming (`render stream`), a different feature
- docs/suspense.md — deferred content boundaries
