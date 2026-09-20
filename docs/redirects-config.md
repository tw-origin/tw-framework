# TW Framework — Redirects Configuration

This document covers one thing completely: `redirects` in `tw.config.ts` — both accepted forms, matching, and status codes. Applied by `tw dev` and `tw serve` before any routing.

---

## Both Forms

Object form (concise):

```twm
export default {
  redirects: {
    "/old": "/new",
    "/blog/post": "/blog",
  },
}
```

Array form (full control):

```twm
export default {
  redirects: [
    { from: "/old", to: "/new" },
    { from: "/shop/legacy-item", to: "/shop/item", status: 301 },
    { from: "/docs", to: "/documentation", status: 302 },
  ],
}
```

Both forms are accepted everywhere — they normalize to the same internal list. Use the object form for bulk simple redirects, the array form when you need per-redirect status codes.

## Entry Fields

| Field | Meaning |
|------|---------|
| `from` | Source path |
| `to` | Destination path (or absolute URL) |
| `status` | HTTP status — `301` permanent, `302` temporary (default `301`) |

## Matching

- Redirects are checked BEFORE route matching — a redirect always wins over a page, API route, or static file with the same path.
- Matching is on the path exactly as written; use trailing-slash-free paths on both sides.
- The first matching entry applies; order matters when one source prefixes another.

```twm
redirects: [
  { from: "/help", to: "/support" },         // exact
  { from: "/help/old", to: "/support" },       // put longer paths first
]
```

## When to Reach for Each Status

| Status | Use |
|--------|-----|
| `301` | Permanent moves — search engines transfer ranking to the target |
| `302` | Temporary relocations, campaign URLs, A/B experiments |

## Verified Behavior

```bash
$ curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/old
301 http://localhost:3000/new
```

- Redirects apply in dev and serve identically — test them locally, they ship the same.
- A redirect to an external URL works too: `to: "https://example.com/moved"`.

## Common Setup

```twm
export default {
  redirects: [
    // SEO migrations after a restructure
    { from: "/2019/05/first-post", to: "/blog/first-post" },
    { from: "/2019/05/first-post/", to: "/blog/first-post" },

    // legacy aliases
    { from: "/pricing-v1", to: "/pricing" },

    // short links for campaigns (temporary)
    { from: "/launch", to: "/blog/tw-1-0", status: 302 },
  ],
}
```

Redirect loops are not detected at startup — a `from`/`to` that eventually points back to itself will bounce until the browser gives up, so keep the list acyclic.
