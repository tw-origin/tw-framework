# TW Framework — Static Assets in public/

This document covers one thing completely: the `public/` directory — serving files as-is, and what the server refuses to serve from it.

---

## The Directory

Everything in `public/` is served from the site root, byte for byte:

```text
public/
├── favicon.ico        # /favicon.ico
├── robots.txt         # /robots.txt
├── img/hero.jpg       # /img/hero.jpg
└── docs/handbook.pdf  # /docs/handbook.pdf
```

`tw build` copies `public/` into `.tw/` so the production server serves the same files the dev server did.

## Caching

Static assets answer with `ETag` + `Last-Modified` and `Cache-Control: public, max-age=3600` — one hour. Browsers revalidate after that with `If-None-Match` / `If-Modified-Since` and get a `304` when nothing changed — see [ETag and 304](./server-features.md).

For immutable assets, fingerprint the filename (`app.5b19da.css` style) so a new deploy is a new URL.

## The Security Blocklist

The server refuses to serve source-like files from the output, wherever they appear — these answer `404`:

| File type | Why |
|-----------|-----|
| `.twm` route modules | server code, not for the browser |
| `.ts` sources | compiled into chunks already |
| `.env` and dotfiles | configuration, never public |

Put a `.ts` file in `public/` and request it: `404`, not the source.

## MIME Types

The correct `Content-Type` is served per extension — `.css` is `text/css`, `.jpg` is `image/jpeg`, and unknown extensions are served as `application/octet-stream`, which browsers download instead of executing.

## Large Files

`public/` is for assets your pages reference. For large downloads, prefer a CDN or object storage in front of the app — the static handler streams from disk, but the app process is a wasteful download server.

## Related

- [Gzip](./gzip.md)
- [Assets and Images Guide](./guide-assets-images.md)
