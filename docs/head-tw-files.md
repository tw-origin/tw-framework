# TW Framework — head.tw Files

This document covers one thing completely: `head.tw` — injecting per-route and global content into the HTML `<head>`.

---

## Per-Route head.tw

A `head.tw` beside a page injects into that route's `<head>` only:

```text
home/
├── about/
│   ├── page.tw
│   └── head.tw         # /about only
```

```tw
// home/about/head.tw
meta name "description" content "Who we are"
link rel "preload" href "/assets/app.css" as "style"
```

## Global head.tw

`home/head.tw` injects into **every** page — analytics, favicons, verification tags:

```tw
// home/head.tw
meta name "viewport" content "width=device-width, initial-scale=1"
link rel "icon" href "/favicon.ico"
```

## Both at Once

When both exist, the global `home/head.tw` and the route's sibling `head.tw` are merged — the route-specific content is appended after the global content.

| File | Scope |
|------|-------|
| `home/head.tw` | every route |
| `home/<route>/head.tw` | that route only |

## Both Build Paths

The head block is compiled into `<head>` in the static build (`.tw/<route>/index.html`) and injected per request in server rendering — the same `head.tw` source powers both.

## Related

- [SEO Guide](./guide-seo.md)
- [Page Config](./syntax-page-config.md)
