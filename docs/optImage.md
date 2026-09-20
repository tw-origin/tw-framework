# TW Framework — optImage

This document covers the `optImage` component completely and exactly: the syntax, every prop, the generated HTML, the `/_tw/img` engine, remote images, configuration, and behavior without `sharp`.

---

## The Idea

Images are usually the heaviest thing on a page. optImage fixes that at two levels:

1. **At compile time** — the `optImage` tag becomes a plain `<img>` with the correct `srcset`, `sizes`, `width`/`height` (prevents layout shift), `loading` and `decoding` attributes. **Zero client-side JavaScript** — the browser picks the right file natively.
2. **At serve time** — `/_tw/img/*` URLs are processed on demand: resized, converted to AVIF or WebP based on what the browser accepts, cached to disk, and served with ETag revalidation.

## Using optImage

```tw
import optImage from "@tw/optImage"

div.page {

  optImage {
    src "/photos/shop.jpg"
    width 800
    height 600
    alt "Our storefront"
  }

}
```

Numeric props (`width`, `height`, `quality`) take bare numbers — `width 800` and `width "800"` are both accepted.

The import is a **compile-time component** — nothing from `@tw/optImage` is shipped to the browser. Conceptually it compiles to an ordinary `<img>` with the optimization attributes. Output of the current version:

```html
<img src="/_tw/img/photos/shop.jpg?w=800&h=600&q=75&f=auto"
     alt="Our storefront"
     loading="lazy" decoding="async"
     width="800" height="600"
     srcset="/_tw/img/photos/shop.jpg?w=320&q=75&f=auto 320w, /_tw/img/photos/shop.jpg?w=640&q=75&f=auto 640w, /_tw/img/photos/shop.jpg?w=768&q=75&f=auto 768w, /_tw/img/photos/shop.jpg?w=1024&q=75&f=auto 1024w, /_tw/img/photos/shop.jpg?w=1280&q=75&f=auto 1280w"
     sizes="(max-width: 800px) 100vw, 800px">
```

### Props

| Prop | What it does |
|------|--------------|
| `src` | image path from `public/` (or a remote URL — see below). Required; without it the tag compiles to an HTML comment. |
| `width` / `height` | intrinsic size in pixels. Sets `width`/`height` attributes (no layout shift), caps the srcset at 2x this width, and produces `sizes="(max-width: {width}px) 100vw, {width}px"`. Numbers — `width 800` — or strings. |
| `alt` | accessibility text. `alt "Product"` marks a meaningful image; `alt ""` explicitly marks it decorative. A **missing** `alt` triggers a build warning (the output still carries `alt=""` for safety) — decide which of the two you mean. |
| `quality` | 1-100, overrides the configured default (75). Applies to the main URL and every srcset entry. |
| `priority` | above-the-fold image: `loading="eager"` **and** `fetchpriority="high"`. srcset and everything else stay the same. |
| `placeholder` | `"solid"` — adds `data-tw-placeholder` and an inline `style="background-color:#e5e7eb;border-radius:inherit"` so the area shows a soft grey block while the file loads. (`"blur"` is accepted as an alias — the behavior is the same solid placeholder.) |
| `id` | emitted as the `id` attribute. |

### Styling — dot syntax

`class` is a keyword in the markup grammar, so inside the braces it does not work as a prop. Use the dot class syntax instead — it works on any element:

```tw
optImage.hero-img {
  src "/hero.jpg"
  width "1920"
  height "1080"
  alt "Hero"
}
```

```html
<img ... class="hero-img">
```

### Behavior without width

Without a `width`, the URL has no `w` param (`/_tw/img/a.jpg?q=75&f=auto`), `sizes` is `100vw`, and the srcset contains every configured breakpoint.

### Small images

If the declared width is smaller than the smallest breakpoint (320 by default), there is no point in a srcset — it is omitted entirely and the browser uses the plain `src`.

## optImage vs the optimize attribute

The two forms are one engine with two entry points: **optImage is the convenience component API**, and **the `optimize` attribute is the native `<img>` opt-in** for markup that is already written. Both compile to the same optimized `<img>`.

## The Attribute Form

Any plain `img` gets the same optimization by adding the `optimize` attribute:

```tw
img {
  src "/photos/shop.jpg"
  optimize
  width "800"
  height "600"
  alt "Our storefront"
}
```

Same result as the component, including `quality`, `priority`, `placeholder` and `id`:

```tw
img {
  src "/hero.jpg"
  optimize
  width "1920"
  priority
}
```

## What The Engine Does

Requests like `/_tw/img/photos/shop.jpg?w=800&h=600&q=75&f=auto` are handled by the server:

### Resize on demand

`w`/`h` resize the image server-side with `fit: inside` — the aspect ratio is preserved and images are never upscaled. Note that `w=800&h=600` therefore does **not** force an exact 800×600 output: the image is scaled to fit inside that box, keeping its aspect ratio.



### Responsive srcset rule

srcset widths are selected from the configured breakpoints up to 2 × the declared width. For `width 800` with the default breakpoints that means 320, 640, 768, 1024 and 1280 — 1920 exceeds 1600 and is excluded.

### Format negotiation

`f=auto` reads the browser's `Accept` header and serves the first format the browser supports, in configured order (AVIF, then WebP by default). `f=jpeg`/`f=png`/`f=webp` forces a format. A typical 880KB JPEG becomes ~4KB as 320px WebP, ~2KB as AVIF.

### Disk cache

Every processed variant is written to `.tw/img/cache/`, keyed by a hash of source path + source mtime + parameters. Repeated requests are served straight from disk (`X-TW-Image: cache`). When the source file changes, the mtime changes and the old cache entry is simply never hit again.

### ETag / 304

Every variant response carries an `ETag`. Sending it back with `If-None-Match` returns `304 Not Modified` with no body.

### Cache-Control

`public, max-age=86400` by default (`cacheMaxAge` in the config).

### Response header

`X-TW-Image` tells you exactly what happened: `optimized` (freshly processed), `cache` (disk cache hit), `original` (no params, original bytes), `svg-passthrough`, or `passthrough` (no sharp / processing failed).

### SVG passes through

SVGs are already optimal — served untouched with `image/svg+xml`.

## Remote Images

Remote URLs work through a proxy endpoint, behind a strict **allowlist** (an SSRF guard — without it any visitor could make your server fetch internal addresses):

```ts
// tw.config.ts
export default {
  images: {
    remoteAllowHosts: ["images.example.com", "cdn.shop.example"],
  },
};
```

```tw
optImage {
  src "https://images.example.com/products/42.jpg"
  width "640"
  alt "Product 42"
}
```

The compiled URL is `/_tw/img/_remote?src=<encoded url>&w=640&q=75&f=auto`. The remote fetch is fully SSRF-guarded:

- every host must be on `remoteAllowHosts` — anything else gets a 404, no fetch attempted
- the hostname is resolved and every resolved address is checked against private/reserved ranges (loopback, `10/8`, `172.16/12`, `192.168/16`, link-local `169.254/16`, IPv6 `::1`/`fc00::/7`/`fe80::/10`, IPv4-mapped IPv6) — mitigating DNS rebinding to internal targets
- redirects are followed manually, at most 3 hops, and **every redirect target is independently allowlist- and address-checked**
- URLs with embedded credentials are rejected; only `http:`/`https:` are fetched

## Configuration

```ts
// tw.config.ts
export default {
  images: {
    quality: 75,                                     // 1-100
    formats: ["avif", "webp"],                       // best-first, for f=auto
    breakpoints: [320, 640, 768, 1024, 1280, 1920],   // srcset widths
    remoteAllowHosts: [],                             // remote proxy allowlist
    cacheMaxAge: 86400,                               // seconds
  },
};
```

Every field is optional; the values above are the defaults.

## sharp — Optional, Recommended

Actual resizing and AVIF/WebP encoding use [`sharp`](https://sharp.pixelplumbing.com/), loaded automatically **when installed**:

```bash
bun add sharp        # or: npm install sharp
```

Without sharp (or if any processing step fails), the engine never breaks the page: the **original bytes are served** with the correct content type and full caching, and a one-time hint is logged. Be aware: **without sharp the optimization parameters are ignored and the original asset may be significantly larger** — a `?w=320` request can still serve the full multi-megabyte original. Install sharp on any host where the full server runs (Docker, VPS, Railway, Render, Fly).

## Failure And Security Guarantees

| Situation | Result |
|-----------|--------|
| sharp not installed | original bytes served, one-time hint logged |
| corrupt image / processing error | original bytes served — never a 500 |
| path traversal (`../`) | 404 |
| remote host not allowlisted | 404 — no fetch happens |
| missing file | 404 |
| `w`/`h` out of range | clamped to 10000px |
| `quality` out of range | clamped to 1-100 |

## Where It Runs

The compile-time attributes work in every render mode (the output is plain HTML). The `/_tw/img` engine runs wherever the full server runs: `tw dev`, `tw serve`, and the Bun/Docker adapters. Static-only hosts (GitHub Pages, S3 static) serve the build output as-is — pair them with pre-optimized sources.

## Quick Reference

```tw
import optImage from "@tw/optImage"

optImage { src "/a.jpg" width 800 height 600 alt "A" }
optImage.hero-img { src "/hero.jpg" width "1920" priority }
img { src "/b.jpg" optimize width "400" alt "B" }
```

```
URL:      /_tw/img/<source>?w=&h=&q=&f=auto
Cache:    .tw/img/cache/ (source-path + mtime keyed)
ETag:     per variant, 304 revalidation
Remote:   allowlist only (tw.config.ts images.remoteAllowHosts)
Fallback: original bytes — the page never breaks
```

## Related

- [Assets And Images](./guide-assets-images.md) — where files live and how public/ works
- [Performance](./guide-performance.md) — the wider optimization playbook
- [Configuration](./configuration.md) — the `images` field
- [Deployment](./deployment-adapters.md) — which adapters run the full server
- [RouterLink](./RouterLink.md) — the RouterLink component
