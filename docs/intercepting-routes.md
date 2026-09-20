# TW Framework — Intercepting Routes

This document covers one thing completely: `(.)`, `(..)` and `...` folder prefixes — showing a different page for a URL that already has one, in a specific context.

---

## The Prefixes

| Prefix | Meaning | Intercepts |
|--------|---------|------------|
| `(.)` | same level | the matching sibling route |
| `(..)` | one level up | the matching route in the parent folder |
| `(...)` | root | the matching route from anywhere |

## The Canonical Use: Modals

A product link opens a modal on the shop page, but the same URL opens the full page when visited directly:

```text
home/
└── shop/
    ├── page.tw                          # /shop
    ├── product/[id]/page.tw              # /shop/product/42 — full page
    └── product/[id]/(.)page.tw           # when opened FROM /shop — modal
```

- Visiting `/shop/product/42` directly → the full product page.
- Navigating from `/shop` via a link that targets the intercepted view → the `(.)` version renders — a modal, an inline preview, a drawer.

The URL is the same. The route shown depends on the tree you were in.

## Writing an Intercepted Page

An intercepted page is a normal page — often visually lighter:

```tw
// home/shop/product/[id]/(.)page.tw
div.modal-card {
  h2 { "Quick view — {id}" }
  p { "Full details on the product page." }
  a "Open full page" { href "/shop/product/{id}" }
}
```

## Resolution Order

Exact intercepts win over general ones: `(.)` at the same level before `(...)`. A route with no matching interceptor renders normally.

## Related

- [Route Groups](./route-groups.md)
- [Parallel Routes](./parallel-routes.md)
