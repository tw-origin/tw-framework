# TW Framework — Streaming HTML

This document covers one thing completely: sending the shell of a page immediately and its data-dependent sections after — how a `render stream` response is chunked.

---

## The Model

A streamed page has two kinds of markup:

1. **The shell** — everything that does not depend on slow data. It is flushed the moment the request arrives.
2. **Suspense holes** — each `Suspense` boundary's content. It follows as its own chunk when ready.

```tw
page {
  title "Feed"
  render stream
}

div.feed {
  h1 "Streamed shell"           // in the first flush
  Suspense { fallback div.loading { "Loading..." }
    div.data { "Heavy content" }  // streamed after
  }
}
```

## The Wire Protocol

The response is a chunked stream. First flush — the shell, fallbacks visible, content templates stripped:

```html
<div class="feed"><h1>Streamed shell</h1>
<div data-tw-suspense="tw-s-<id>">
  <div data-tw-suspense-fallback="tw-s-<id>">…loading…</div>
</div></div>
```

Then one chunk per boundary as its content completes:

```html
<script>window.__TW_RESOLVE__("tw-s-<id>", "…content…");</script>
```

The client swaps the fallback for the content immediately — no reconciliation, no re-parsing of the shell. No JavaScript? The fallback stays visible; nothing breaks.

`render stream` pages are skipped by `tw build` (like `render ssr`) — streaming is a serve-time behaviour. The boundary ids match between compiles because they are content-derived (docs/suspense.md).

## When to Use Streaming

| Situation | Why |
|-----------|-----|
| feed/dashboard pages with slow queries | the shell paints instantly |
| one slow widget on an otherwise fast page | the fast parts stop waiting for it |
| SEO matters and content must be in HTML | prefer `ppr` — the shell is prebuilt and crawlable |

## Related

- [Suspense](./suspense.md) — the boundaries that mark the holes
- [Render Modes](./render-modes.md) — `stream` vs the other six modes
