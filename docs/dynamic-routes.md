# TW Framework — Dynamic Routes

This document covers one thing completely: `[slug]` folders — serving many URLs from one page, reading the param, and pre-rendering each value.

---

## The [slug] Folder

A folder wrapped in square brackets matches any single segment:

```text
home/
└── blog/
    └── [slug]/
        └── page.tw        # /blog/<anything>
```

`/blog/q3-report`, `/blog/team-update` all render this page.

## Reading the Param

Inside the page, the param is in scope under its own name:

```tw
article.post {
  h1.title { "Post: {slug}" }
}
```

`{params.slug}` also works — useful when a name collides with something else.

## Server-Side Rendering of Params

For server-rendered pages, the param arrives with the request; the page just reads it. No `params.twm` is required — any slug renders at request time.

## Pre-Rendering Every Value

Add a `params.twm` beside the page with a `generate` function to switch to static generation at build time:

```twm
// home/blog/[slug]/params.twm
export function generate() {
  return [
    { slug: "q3-report" },
    { slug: "team-update" },
    { slug: "shipping-faster" }
  ]
}
```

`tw build` renders one HTML file per returned param set. With `generate`, only the generated slugs exist; without it, every slug renders on demand.

| Setup | Behaviour |
|-------|-----------|
| no `params.twm` | every slug renders per request (SSR) |
| `fn generate()` | each returned param set becomes a static page |

## Data Per Param

Pair `generate` with data from a `lib/` module — fetch or read your content list once, map it to param objects:

```twm
import { allPosts } from "lib/posts"

export function generate() {
  return allPosts().map(function (p) { return { slug: p.slug } })
}
```

## Related

- [Catch-All Routes](./catch-all-routes.md)
- [API Routes](./api-routes.md)
