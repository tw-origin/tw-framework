# TW Framework — Catch-All Routes

This document covers one thing completely: `[...slug]` folders — matching every remaining path inside one route.

---

## The [...slug] Folder

Three dots prefix the name. The folder matches the segment and everything after it — one page serves any depth:

```text
home/
└── docs/
    └── [...slug]/
        └── page.tw        # /docs/getting-started, /docs/api/pages, ...
```

| URL | Matches |
|-----|---------|
| `/docs/intro` | yes |
| `/docs/api/pages/render` | yes |
| `/docs` | no — the parent route owns it |
| `/other` | no — outside `docs/` |

## Reading the Caught Path

The caught segments arrive as the param, joined with `/`:

```tw
div.docs-page {
  h1 { "Docs: {slug}" }
}
```

A request to `/docs/api/pages` renders `Docs: api/pages`. Split it in server code when you need the parts:

```twm
fn get(request) {
  const parts = String(request.params.slug ?? "").split("/").filter(p => p !== "")
  return { status: 200, json: { parts: parts } }
}
```

## Typical Uses

- documentation sites with arbitrary depth
- " vanity" short links that rewrite to a lookup
- 404 fallbacks that suggest similar paths before giving up

## Interaction with Sibling Routes

Specific routes always win. The registry checks static and `[slug]` matches before a catch-all:

```text
home/docs/[...slug]/page.tw      # /docs/a/b (catch-all)
home/docs/api/page.tw            # /docs/api (specific — wins)
home/docs/[topic]/page.tw       # /docs/render (single — wins over catch-all)
```

## Related

- [Dynamic Routes](./dynamic-routes.md)
- [Route Groups](./route-groups.md)
