# TW Framework — The /_tw/img Handler

This document covers one thing completely: the request engine behind `/_tw/img/*` — parameters, format negotiation, the content-keyed disk cache, ETags, and the remote proxy. For the markup side, see doc 62; for the client helpers, doc 148.

---

## Request Shape

```
GET /_tw/img/<source path>?w=640&h=480&q=75&f=auto
GET /_tw/img/_remote?src=<urlencoded https url>&w=640&f=auto
```

| Param | Range | Meaning |
|-------|-------|---------|
| `w` | 0–10000 | Target width |
| `h` | 0–10000 | Target height |
| `q` | 1–100 | Lossy quality |
| `f` | `auto / avif / webp / jpeg / png` | Output format |

`f=auto` negotiates per request using the browser's `Accept` header (AVIF before WebP when both are accepted).

## Response Behavior

| Case | Result |
|------|--------|
| Missing source | `404 Not Found` |
| Non-GET/HEAD | `405 Method Not Allowed` |
| SVG source | Served untouched (`image/svg+xml`) |
| No `w`/`h`/`f` work to do | Original bytes, correct content type |
| sharp missing or conversion fails | Original bytes served (never a 500 for a broken image) |

Every response carries `Cache-Control: public, max-age=<cacheMaxAge>` and an `X-TW-Image` header describing which path was taken: `svg-passthrough`, `original`, `cache`, `optimized`, or `passthrough`.

## The Disk Cache

Processed variants are cached under `.tw/img/cache/` keyed by a SHA-256 of `source | mtime | w | h | q | f`:

- **mtime in the key** — replacing the source file invalidates every derived variant automatically.
- Only real conversions are cached; fallbacks that served original bytes are never stored under a `.webp` name (that would permanently serve the wrong format).
- Cache files are keyed with the format extension, so a WebP and an AVIF of the same image coexist.

## ETag / 304

The cache key doubles as the ETag. Send `If-None-Match` matching it and the handler answers `304 Not Modified` without reading any bytes — including for the first request after a build when the source and mtime are unchanged.

## Path Safety (Local Sources)

- Percent-decoding failures (`/_tw/img/%zz`) answer `404`, never an error.
- `..` segments, null bytes, and dot-files are rejected.
- The resolved path must sit inside the source directory (`public/` by default).

## The Remote Proxy

Remote images go through `/_tw/img/_remote?src=<encoded url>` and are fetched under full SSRF protection:

1. Every redirect hop (max 3) must resolve to an **allowlisted host** (`remoteAllowHosts` in image config).
2. The hostname is DNS-resolved and **every resolved address** is checked against private/reserved ranges — loopback, private ranges, link-local, multicast, IPv6 ULA, IPv4-mapped IPv6. Rebinding to an internal target is refused.
3. No credentials in the URL; http/https only.

```
GET /_tw/img/_remote?src=https%3A%2F%2Fcdn.example.com%2Fphoto.jpg&w=640&f=auto
```

The default `remoteAllowHosts` is empty — remote optimization is opt-in.

## Handler Options

```twm
import { createImageHandler } from "@tw/image"

const handler = createImageHandler({
  rootDir: ".",                        // app root
  sourceDir: "./public",               // local sources
  cacheDir: "./.tw/img/cache",         // processed variants
  config: {
    quality: 75,
    formats: ["avif", "webp"],
    breakpoints: [320, 640, 768, 1024, 1280, 1920],
    remoteAllowHosts: ["cdn.example.com"],
    cacheMaxAge: 86400,
  },
})
```

`tw serve` and `tw dev` construct this handler automatically from `tw.config.ts`.
