# TW Framework — Guide: Assets and Images

This guide covers one thing completely: static assets in a TW project — where files live, how pages reference them, and how they are served and cached.

---

## Where Assets Live

```text
my-app/
├── home/
├── public/              ← static assets, copied verbatim into .tw/
│   ├── favicon.ico
│   ├── logo.jpg
│   ├── img/
│   │   ├── hero.webp
│   │   └── products/
│   │       └── widget.webp
│   └── docs/
│       └── handbook.pdf
└── .tw/                  ← build output (generated)
```

Everything in `public/` is served from the site root:

| File on disk | URL |
|--------------|-----|
| `public/logo.jpg` | `/logo.jpg` |
| `public/img/hero.webp` | `/img/hero.webp` |
| `public/docs/handbook.pdf` | `/docs/handbook.pdf` |

Compiled assets (hashed CSS and JS chunks) are emitted by the build under `.tw/assets/` and `.tw/js/` — they are generated, never hand-placed.

## Referencing Assets

```tw
img src "/logo.jpg" alt "Logo"
a "Handbook" { href "/docs/handbook.pdf" }
img src "/img/hero.webp" alt "Hero" width "1600" height "900"
```

Use **root-absolute paths** (`/img/...`). In styles, the same paths work because the emitted CSS lives at the root:

```tss
.hero {
  bg-i url("/img/hero.webp")
  min-h 60vh
  bg-c #0d1117
}
```

## Images — The Rules That Matter

1. **Set width and height** — the browser reserves the space; no layout shift:

```tw
img src "/img/hero.webp" alt "Hero" width "1600" height "900"
```

2. **Use modern formats** — `.webp` and `.avif` cut 30–70% of the bytes; they are served as plain static files

3. **Size for the slot** — a 400px card does not need a 3000px source image

4. **Dynamic images** — bind `:src`:

```tw
for p in {products} {
  img :src "p.image" alt "p.name" width "400" height "400"
}
```

## How Assets Are Served

The production servers and every generated adapter apply:

| Rule | Why |
|------|-----|
| ETag + `304` | repeat requests cost nothing |
| Gzip | text assets compressed |
| Range requests | video/audio seeking works |
| Immutable caching for hashed files | `/assets/*`, `/js/*` cache forever |
| Dotfile + source blocklist | `.twm`, `.ts`, `.env` never served |

`public/` files get standard caching — set longer headers per path in `tw.config.ts` if an asset never changes:

```ts
export default {
  headers: { "/img/**": { "Cache-Control": "public, max-age=604800" } },
};
```

## Fonts

```text
public/
└── fonts/
    └── inter.woff2
```

```tw
// in the root layout's head, or a global stylesheet
head {
  link rel "preload" href "/fonts/inter.woff2" as "font" type "font/woff2" crossorigin
}
```

```tss
@font-face {
  font-family "Inter"
  src url("/fonts/inter.woff2") format("woff2")
  font-display swap
}

body { ff "Inter", system-ui, sans-serif }
```

`font-display swap` keeps text visible while the font loads.

## What Never Goes in public/

- Server files — `lib/`, `.twm` sources, `.env` — the blocklist already blocks them, but keep them out of any served folder anyway
- Source images — keep originals elsewhere; `public/` holds the web-sized output

## Related

- [Build Output](./build-output.md) · [Server Features](./server-features.md)
- [Performance](./guide-performance.md) · [TSS Syntax](./tss-syntax.md)
