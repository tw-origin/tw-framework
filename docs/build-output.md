# TW Framework — Build Output

This document covers one thing completely: `tw build` — what it does, and the `.tw/` directory it produces.

---

## Running the Build

```bash
tw build
```

Builds the whole project for production into `.tw/`. Prints a summary — pages compiled, API routes, stylesheets and chunks emitted:

```
Build complete!
Pages: 12 compiled
APIs:  4 routes
```

---

## What the Build Does

```
1.  Scan the route tree
2.  Compile every .tw file  → HTML + CSS + JS
3.  Compile every .tss / .module.tss / .css / .module.css / .scss file → CSS
4.  Compile every .twm file → server route modules
5.  Bundle client JS with code splitting (per-route chunks)
6.  Minify HTML, CSS and JS
7.  Generate source maps (when enabled)
8.  Copy public/ assets to the output
9.  Generate the route manifest
10. Write everything to .tw/
```

---

## The .tw/ Directory

```
.tw/
├── index.html                  ← / route
├── about/
│   └── index.html              ← /about route
├── blog/
│   └── [slug]/
│       └── index.html          ← /blog/:slug (pre-rendered when static)
├── _assets/
│   ├── css/
│   │   ├── common.css          ← styles shared by 2+ routes
│   │   └── dashboard.css      ← route-specific styles
│   ├── js/
│   │   ├── main.js
│   │   └── chunks/
│   │       ├── blog-<hash>.js
│   │       └── dashboard-<hash>.js
│   └── img/
├── js/                         ← client chunks (content-hashed)
│   ├── c-<hash>.js             ← shared npm-import chunks
│   └── p-<hash>.js             ← per-page symbol scopes
└── manifest.json               ← route manifest
```

Two things to note:

- **Pre-rendered pages** are complete HTML files (`render static`, and the static shell of `render island` pages)
- **Client chunks** are content-hashed: one file per unique npm import, shared across every page that uses it

---

## Route Manifest

`manifest.json` maps routes to their outputs — which HTML file serves which route, which chunks and stylesheets each route links, and the render mode of every page. `tw serve` reads it to answer requests without re-scanning `home/`.

---

## Clean Builds

`.tw/` is fully generated. To rebuild from scratch:

```bash
rm -rf .tw && tw build
```

Never edit files inside `.tw/` — the next build overwrites them. `.tw/` belongs in `.gitignore`.

---

## Serving the Output

```bash
tw serve                  # production server (Bun) — pages + APIs + middleware
tw adapter node           # generate a zero-dependency Node server for static output
tw adapter docker         # generate Dockerfiles
```

The adapters are in [Deployment Adapters](./deployment-adapters.md).

Note for external hosts pointing directly at the build output: `.tw/` starts with a dot, and some static hosts hide or block dot-directories by default — allow dotfiles explicitly, or use one of the adapters which handle it for you.

---

## Source Maps

Enabled by default — CSS and JS get linked source maps in the output. Configure in `tw.config.ts` (`none`, `linked`, `inline`, `external`):

```ts
export default {
  build: {
    sourcemap: "linked"
  }
}
```

---

## Build vs Dev

| | `tw dev` | `tw build` + `tw serve` |
|---|---|---|
| Compiles | on demand, per visited page | everything up front |
| Output | in-memory | `.tw/` on disk |
| Minified | no | yes |
| Caching | rebuilt on change | content-hashed, cache-forever |
| TW1007 violations | printed to console | build fails, exit code 1 |

---

## Verifying a Build

```bash
tw build
ls .tw/                     # routes emitted
ls .tw/js/                  # client chunks
cat .tw/manifest.json       # route manifest
grep -o '<script[^>]*>' .tw/index.html   # what the home page loads
```

Then smoke it before deploy:

```bash
tw serve --port 8000
curl -s localhost:8000/ | head
```

---

## Quick Reference

```bash
tw build                    # → .tw/
rm -rf .tw && tw build      # clean rebuild
tw serve                    # serve the output
```

## Related

- [Production CSS](./production-css.md) — how styles are split and hashed
- [Server Features](./server-features.md) — serving the output
- [Deployment Adapters](./deployment-adapters.md)
- [Commands Reference](./commands-reference.md)
