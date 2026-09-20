# TW Framework — Images Configuration

This document covers one thing completely: the `images` block in `tw.config.ts` — quality, formats, breakpoints, and the remote-host allowlist consumed by the build and the `/_tw/img` handler.

---

## Configuration

```twm
export default {
  images: {
    quality: 75,
    formats: ["avif", "webp"],
    breakpoints: [320, 640, 768, 1024, 1280, 1920],
    remoteAllowHosts: ["cdn.example.com"],
    cacheMaxAge: 86400,
  },
}
```

| Key | Default | Meaning |
|-----|---------|---------|
| `quality` | `75` | Lossy quality (1–100) used when a request omits `q` |
| `formats` | `["avif", "webp"]` | Negotiation order — first the browser accepts wins |
| `breakpoints` | `[320, 640, 768, 1024, 1280, 1920]` | Widths emitted into `srcset` |
| `remoteAllowHosts` | `[]` | Hosts the remote proxy (doc 155) may fetch from |
| `cacheMaxAge` | `86400` | `Cache-Control` seconds on image responses |

## Where It Applies

`tw build` reads this block and passes it into the compiler (`optImage` markup generation picks up `breakpoints` and `quality`), and `tw serve` / `tw dev` construct the `/_tw/img` handler with the same values — so the markup the compiler writes and the URLs the server answers always agree.

## Quality and Formats

`formats` is best-first: with `["avif", "webp"]`, a browser that accepts AVIF gets AVIF; one that accepts only WebP gets WebP; one that accepts neither falls back to the original bytes. Add `"jpeg"`/`"png"` to the END of the list only when you need forced conversion targets.

Quality applies to lossy conversion; requests can override per-URL with `q=` (1–100, clamped).

## Breakpoints

The compiler filters breakpoints against the declared `width` of an image (up to 2x) — a 300px-wide image emits only the 320/576-ish variants it can use, not the 1920 one. Keep the list coarse: each entry is a cache variant on disk and a candidate URL in `srcset`.

## remoteAllowHosts

```twm
images: {
  remoteAllowHosts: ["images.example.com", "cdn.partner.io"],
}
```

The remote proxy refuses EVERY host by default. Each allowed host may serve images through `/_tw/img/_remote?src=...`; fetches resolve DNS and refuse private/reserved addresses (full rules in doc 155).

## Verified Round Trip

```bash
$ curl -s -A "Mozilla/5.0" "http://localhost:3000/_tw/img/photo.jpg?w=640&f=auto" -D - -o /dev/null | grep -Ei "content-type|x-tw-image|cache-control"
Content-Type: image/webp
Cache-Control: public, max-age=86400
X-TW-Image: optimized
```

With `sharp` installed the variant is a real resized WebP; without it the same URL serves the original bytes with `X-TW-Image: passthrough` — requests never 500 either way.
