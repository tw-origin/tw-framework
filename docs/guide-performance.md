# TW Framework — Guide: Performance

This guide covers one thing completely: making a TW app fast — render-mode choices, caching, asset weight, and what to measure.

---

## The Four Levers

| Lever | Effect | Where |
|-------|--------|-------|
| Render mode per page | less or no per-request work | [Render Modes](./render-modes.md) |
| Asset pipeline | hashed, cache-forever, never re-downloaded | automatic — [Production CSS](./production-css.md) |
| Client imports | smaller pages, shared chunks | [Client Modules](./client-modules.md) |
| Caching headers | repeat visits served from cache | [Server Features](./server-features.md) |

---

## Pick the Cheapest Render Mode Per Page

```
static > island > ssr (per-request work: none → islands only → full)
```

- Marketing, docs, blog posts → `render static`
- Content + a form → `render island`
- Personalized, per-request data → `render ssr`

Static pages are pre-rendered at build time — serving them is a file read, not a render. This is the single biggest lever.

## Let the Asset Pipeline Do Its Job

The build already gives you:

- **Route-split CSS** — a page loads only its own + shared styles
- **Content-hashed filenames** — unchanged assets keep their cache across deploys
- **Immutable caching** — hashed assets are served cache-forever
- **Critical CSS inlining** — tiny stylesheets inline instead of a request
- **Tree-shaken, minified client chunks** — one shared chunk per unique import

Do not fight this with manual `<link>` tags or CDN copies of assets — import from the project and let the pipeline emit them.

## Keep Client Imports Lean

```tw
// the whole package enters the chunk only if imported
import dayjs from "dayjs"
```

- Import in the **page** that uses it, not the root layout (unless truly global)
- A package nobody imports ships nothing — check `.tw/js/` after a build to see exactly what each page loads

Verify:

```bash
tw build
ls -la .tw/js/          # one shared chunk per unique import
grep -o '<script[^>]*src="[^"]*"' .tw/shop/index.html
```

## Images

```tw
img src "/img/hero.jpg" alt "Hero" width "1600" height "900"
```

- Serve images from `public/` (root-absolute paths)
- Set `width`/`height` so the browser reserves layout space — no reflow on load
- Prefer modern formats (`.webp` / `.avif`) — they are served as static bytes, nothing to configure

Details in [Assets and Images](./guide-assets-images.md).

## Caching Headers

```ts
// tw.config.ts
export default {
  headers: {
    "/assets/**": { "Cache-Control": "public, max-age=31536000, immutable" },
  },
};
```

The generated platform configs set the same rule on Netlify, Cloudflare, Firebase, nginx and Caddy — commit them and you are done.

## Measure Before Optimizing

```bash
tw build
du -sh .tw/                     # total output size
ls .tw/js/ | wc -l              # number of client chunks
curl -sI localhost:8000/ | grep -i cache
curl -sI localhost:8000/assets/$(ls .tw/assets | head -1) | grep -i etag
```

Then in the browser: devtools → Network → check what the first and repeat visits load. Repeat visits should be almost entirely `304`/`memory cache`.

## Checklist

```
□ Every changeable page on the cheapest render mode
□ No manual asset tags — imports only
□ Root-layout imports limited to truly global packages
□ Images sized + modern format
□ Platform config committed (immutable headers)
□ .tw/ output checked after build — no surprise chunks
```

## Related

- [Render Modes](./render-modes.md) · [Production CSS](./production-css.md)
- [Client Modules](./client-modules.md) · [Server Features](./server-features.md)
