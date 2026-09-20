# TW Framework — Image Optimizer (Client)

This document covers one thing completely: `createOptimizedImage`, `createResponsivePicture`, and `preloadImage` — the client-side image helpers exported by `@tw/runtime`. For the server-side `/_tw/img` pipeline, see doc 62 (guide) and doc 155 (handler reference).

---

## createOptimizedImage

Builds a configured `<img>` element pointing at the optimizer:

```twm
import { createOptimizedImage } from "@tw/runtime"

const img = createOptimizedImage({
  src: "/photos/hero.jpg",
  widths: [320, 640, 1024],       // srcset breakpoints
  sizes: "(max-width: 640px) 100vw, 640px",
  format: "auto",                  // "webp" | "avif" | "auto" — negotiate per browser
  quality: 75,
  lazy: true,                      // loading="lazy"
  placeholder: "blur",             // "blur" | "color" | "none"
  placeholderColor: "#e5e7eb",     // for placeholder: "color"
  aspectRatio: 16 / 9,             // reserves layout space, avoids CLS
  fallback: "/photos/hero-fallback.jpg",   // on error
  preload: false,
  onError: (err) => console.error(err),
})

container.appendChild(img)
```

`src` stays relative to the app root; the helper routes it through the `/_tw/img` URL shape (doc 62).

## createResponsivePicture

When format negotiation must happen in markup, build a `<picture>` with typed sources:

```twm
import { createResponsivePicture } from "@tw/runtime"

const picture = createResponsivePicture({
  src: "/photos/hero.jpg",
  widths: [640, 1024, 1920],
  sizes: "100vw",
  format: "auto",
  quality: 75,
})

container.appendChild(picture)
// <picture><source srcset="...avif" ...><source srcset="...webp" ...><img ...></picture>
```

The browser picks the first format it supports and the width for the current viewport/`sizes`.

## preloadImage

```twm
import { preloadImage } from "@tw/runtime"

preloadImage("/charts/q3.png")     // warms the cache before it renders
```

Call for the hero or above-the-fold images a beat before mounting their containers so the first paint already has bytes in the browser cache.

## ResponsiveImageOptions

| Option | Default | Meaning |
|--------|---------|---------|
| `src` | — | Source path (required) |
| `widths` | standard set | Breakpoints for `srcset` |
| `sizes` | `"100vw"` | `sizes` attribute hint to the browser |
| `format` | `"auto"` | Preferred delivery format |
| `quality` | `75` | Lossy quality (1–100) |
| `lazy` | `true` | Native lazy loading |
| `placeholder` | `"blur"` | Pre-load placeholder style |
| `placeholderColor` | — | Solid placeholder color |
| `aspectRatio` | — | Width/height ratio for layout reservation |
| `fallback` | — | Alternate src on load failure |
| `preload` | `false` | Add a preload link |
| `onError` | — | Load-failure callback |

## Picking One

- Simple responsive image → `createOptimizedImage`
- Full AVIF/WebP fallback chain in markup → `createResponsivePicture`
- Just warm the cache → `preloadImage`
