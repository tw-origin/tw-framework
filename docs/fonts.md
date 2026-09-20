# TW Framework — Font Optimization

This document covers one thing completely: `optimizeFont`, `generateFontPreload`, and `generateFontCSS` — self-hosted, build-time font optimization with CLS-free fallbacks.

---

## optimizeFont

```twm
import { optimizeFont } from "@tw/server"

const font = optimizeFont({
  family: "Inter",
  weights: [400, 700],
  styles: ["normal"],                    // "normal" | "italic"
  subsets: ["latin", "devanagari"],
  display: "swap",                      // auto | block | swap | fallback | optional
  preload: true,
  fallback: ["system-ui", "sans-serif"],
  sizeAdjust: 100,
})
```

Returns an `OptimizedFont`:

| Field | Meaning |
|-------|---------|
| `family` | Family name |
| `css` | Generated `@font-face` CSS (inline it in `<head>`) |
| `preload` | Whether a preload hint should be emitted |
| `files` | One `FontFile` per weight/style/subset — `{ url, weight, style, subset, format, size }` |
| `fallbackMetrics` | Adjusted-metrics data for the fallback stack |

## generateFontPreload

```twm
import { generateFontPreload } from "@tw/server"

const linkTag = generateFontPreload(font)
// <link rel="preload" href="..." as="font" type="font/woff2" crossorigin>
```

Emit for the weights needed above the fold.

## generateFontCSS

```twm
import { generateFontCSS } from "@tw/server"

const css = generateFontCSS(font)
// the @font-face rules — usually already on font.css; use this to inline them
```

## How It Prevents Layout Shift

Text renders immediately in the fallback stack while the webfont loads. `fallbackMetrics` (`FontMetrics`: ascent, descent, lineGap, unitsPerEm, capHeight, xHeight) plus `sizeAdjust` tune the fallback so the swap does not move a single line — the same technique used by the build pipeline for `.tw/fonts` output.

## FontConfig Reference

| Option | Meaning |
|--------|---------|
| `family` | Family name (required) |
| `weights` | Numeric weights (required) |
| `styles` | `normal` / `italic` variants |
| `subsets` | Subsets to fetch/store |
| `display` | `font-display` strategy — `swap` for interactivity, `optional` for zero-reflow |
| `preload` | Emit preload tags for the first weight |
| `fallback` | CSS fallback stack |
| `sizeAdjust` | Percentage scale for the fallback |

## Build-Time Integration

`tw build` runs the same optimization for fonts declared in configuration and stores them under `.tw/fonts`, inlining the `@font-face` CSS into the built pages — no runtime loading script and no extra CSS request. Call the three functions directly only when composing custom HTML (an adapter, a legacy page, an email template).

## Complete Example

```twm
const font = optimizeFont({
  family: "Satoshi",
  weights: [400, 500, 700],
  subsets: ["latin"],
  display: "swap",
  fallback: ["helvetica", "arial"],
})

head.innerHTML = generateFontPreload(font)
styleBlock.textContent = generateFontCSS(font)
```
