# TW Framework — Suspense

This document covers one thing completely: `Suspense` — showing a fallback while async content loads, then swapping it in.

---

## The Boundary

Wrap async-dependent content in a `Suspense` boundary with a `fallback`:

```tw
div.page {
  h1 { "Dashboard" }

  Suspense {
    fallback div.loading { "Loading stats..." }
    StatsPanel { }
  }
}
```

The fallback renders first — instantly — and the panel's content replaces it when it is ready. The rest of the page never waits.

## What Compiles Out

A boundary becomes a swap container: a visible fallback node plus the content held in a hidden template, identified by a deterministic boundary id.

```html
<div data-tw-suspense="tw-s-<id>">
  <div data-tw-suspense-fallback="tw-s-<id>">
    <div class="loading">Loading stats...</div>
  </div>
  <template data-tw-content="tw-s-<id>" hidden>
    <div class="stats">…the panel…</div>
  </template>
</div>
```

A small runtime ships with every page that uses `Suspense`. It exposes the swap:

```js
window.__TW_RESOLVE__("tw-s-<id>", "<html>");   // replace the fallback
window.__TW_RESOLVE__("tw-s-<id>");              // use the page's own template
```

With no second argument, the content template the page already carries is used — that is the static/SSR path. With an HTML argument, that content replaces the fallback — that is the streaming (`render stream`) and PPR (`render ppr`) path.

## How Content Arrives, by Mode

| Page mode | Content source |
|-----------|----------------|
| `static` / `island` / `csr` | already inside the page's template — resolved on load |
| `ssr` | same: rendered into the page, resolved on load |
| `stream` | streamed after the shell as a `__TW_RESOLVE__` chunk (docs/89) |
| `ppr` | fetched per request from `/_tw/ppr?path=…&id=…` (docs/30) |

## Deterministic Boundary Ids

The id is derived from the boundary's own content (fallback + children). Compiling the same page twice — once for the static shell, once for a request-time render — produces the same id, which is what lets a PPR shell and its hole fill find each other.

## Behaviour

| Situation | Result |
|-----------|--------|
| async content pending | fallback shown |
| content ready | fallback replaced, in place |
| content fails | the boundary shows its error state, not the whole page |

## When to Use It

- panels that fetch data (dashboards, feeds)
- any section that is slow and below the fold
- pages where one slow widget should not hold back the rest

## Related

- [Streaming HTML](./streaming.md)
- [Render Modes](./render-modes.md)
- [Async Components](./async-components.md)
- [Error Boundaries](./error-boundaries.md)
