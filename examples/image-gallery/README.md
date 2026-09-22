# Image Gallery -- Responsive Static Grid

A static image grid with real alt text on every image -- the a11y-correct minimal gallery.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It shows images in TW syntax (void-element form) and the accessibility floor the compiler enforces.

## Quick start

```sh
cd examples/image-gallery
bun install
tw dev            # development server
# or the long way, from the repo root:
bun ../../apps/cli/tw/bin.ts dev
```

Production build and serve:

```sh
tw build
tw serve --port 8123
```

Check it:

```sh
curl -s http://127.0.0.1:8123/ | head -20
```

## What this example teaches

- img as a void element: `img src "..." alt "..." { }`
- Meaningful alt text on every image (the ARIA/accessibility floor)
- A responsive grid in pure TSS
- render static -- the gallery is frozen files, zero request-time work

## The files, one by one

### `home/page.tw`

```tw
import "./../style/global.tss"

page { title "Gallery -- TW Image Grid" render static }

div.gallery {
  header.head {
    h1 "Gallery"
    p "A responsive image grid, compiled to static files. Every image carries alt text -- the ARIA matrix in the test suite checks that pairing on every role and attribute."
  }

  section.grid {
    img src "/logo.jpg" alt "Logo mark, deep blue circle" { }
    img src "/logo.jpg" alt "Logo mark repeated at grid position two" { }
    img src "/logo.jpg" alt "Logo mark repeated at grid position three" { }
    img src "/logo.jpg" alt "Logo mark repeated at grid position four" { }
    img src "/logo.jpg" alt "Logo mark repeated at grid position five" { }
    img src "/logo.jpg" alt "Logo mark repeated at grid position six" { }
    img src "/logo.jpg" alt "Logo mark repeated at grid position seven" { }
    img src "/logo.jpg" alt "Logo mark repeated at grid position eight" { }
    img src "/logo.jpg" alt "Logo mark repeated at grid position nine" { }
  }

  section.notes {
    h2 "Notes on images in TW"
    ul {
      li { strong "alt is not optional" span " -- the compiler diagnostics cover missing alt on meaningful images; decorative images state their decoration in the alt text itself" }
      li { strong "img is a void element" span " -- it takes attributes and an empty body: img src ... alt ... { }" }
      li { strong "Static galleries" span " -- render static freezes the grid at build; there is no per-request work at all" }
      li { strong "Optimization" span " -- the image package handles sized variants; this example keeps it plain to stay minimal" }
    }
  }

  footer.foot {
    p "Part of the TW example matrix: examples/image-gallery."
  }
}
```

### `home/style.tss`

```tss
.head { mb 24px }
.head h1 { fs 30px; mb 8px }
.head p { c #445; maxw 560px }
.grid { d grid; grid-template-columns repeat(3, 1fr); gap 16px; mb 28px }
.grid img { w 100%; br 14px; aspect-ratio 1; object-fit cover; bg #eef1f5 }
.notes h2 { fs 18px; mb 10px }
.notes ul { pl 18px }
.notes li { pb 8px; fs 14px }
.foot { mt 28px; pt 14px; border-top 1px solid #eef; fs 12px; c #889 }
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
.grid { d grid; gap 16px; grid-template-columns repeat(3, 1fr) }
```

## How it works under the hood

Images are void elements in TW: they take attributes and an empty
body. The alt attribute is the accessibility contract -- the ARIA matrix
in the test suite checks role/attribute pairings, and alt on images is the
most basic of them. The grid itself is plain TSS (display grid, three
columns, gap), compiled at build time; serving a static gallery is a file
read with no runtime involvement at all.

## Try it -- ten exercises

1. Build and serve; confirm the grid and the alt texts (view source).
2. Drop three more images into the grid.
3. Make it two columns on narrow widths with a media query in TSS.
4. Try omitting alt on an image and read the diagnostic surface.
5. Swap render static for render ssr -- what changes at request time?
6. Add a lightbox island around one image.
7. Point the images at real files in your public/ directory.
8. Compare with the image package sized-variant API (docs).
9. Ship it to github-pages with tw ship.
10. Run the master gate.

## FAQ

**Where do image files live?** Static assets sit in your app public/
directory and are served as-is; src paths are relative to it.

**Does TW optimize images automatically?** The image package handles
sized variants and formats; this example stays plain to remain a minimal
syntax reference. See the image docs for the optimized component.

**Why is alt enforced?** An image without alt text is invisible to screen
readers. The framework treats accessibility as a floor, not a feature.

## How the build sees this app

`tw build` walks `home/` looking for the file conventions (`page.tw`,
`layout.tw`, `error.tw`, `loading.tw`, `not-found.tw`, `api/*/route.twm`),
compiles each `.tw` page (template -> HTML + VDOM + JS bundle), compiles
each linked `.tss` stylesheet, resolves cache profiles from `tw.config.ts`
(when present), runs the TW090-TW093 build gates, and emits everything to
`.tw/` with a `routes.json` manifest.

Route naming follows directories: `home/blog/page.tw` serves at `/blog`,
and `home/blog/[id]/page.tw` serves at `/blog/<anything>`. The trailing
`page.tw` segment IS the route (a `home/secret/page.tw` serves at
`/secret`, not `/secret/page`).

## Deploying this example

`tw ship` writes a complete deployment for 15 targets:

node, bun, docker (full + static), vercel, netlify, cloudflare, aws,
digitalocean, render, railway, fly, github-pages, firebase, nginx, caddy --
each with the config files that platform expects and next-step instructions.
Static pages ship as pure files; SSR/cache pages ship with the runtime.

## Verify it yourself (the honest checklist)

```sh
tw build                        # 1. must compile clean
tw serve --port 8123 &          # 2. in ONE shell (background servers
curl -sI http://127.0.0.1:8123/ | head -12   #    die between calls)
curl -s  http://127.0.0.1:8123/ | grep -c "<" # 3. markup present
kill %1
```

## Where to go next

- Full language reference and every table: AGENTS.md (the operating manual)
- Cache semantics deep-dive: docs/cache-tags.md
- Render modes: RENDER-SYSTEM.md and docs/render-modes.md
- Testing conventions: docs/testing.md + contributing/core-testing.md
- The complete example matrix: examples/README.md

