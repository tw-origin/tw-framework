# TW Framework — Route Groups

This document covers one thing completely: `(name)` folders — grouping routes without changing their URLs.

---

## The (group) Folder

A folder wrapped in parentheses is invisible in the URL. It exists only to organize the tree:

```text
home/
├── (marketing)/
│   ├── page.tw               # /
│   └── about/page.tw         # /about
└── (shop)/
    ├── products/page.tw      # /products
    └── cart/page.tw           # /cart
```

| File | URL |
|------|-----|
| `home/(marketing)/page.tw` | `/` |
| `home/(marketing)/about/page.tw` | `/about` |
| `home/(shop)/products/page.tw` | `/products` |

No `(marketing)` in any URL.

## What Groups Are For

- **Organization** — keep marketing, shop and account trees apart in the same project.
- **Shared chrome** — a `layout.tw` inside a group wraps only that group's pages. `(shop)/layout.tw` gives the shop its own header without touching marketing pages.
- **Independent domains of change** — one team edits `(shop)`, another `(marketing)`; nothing overlaps.

## Group with Its Own Layout

```text
home/
└── (shop)/
    ├── layout.tw             # shop chrome
    ├── products/page.tw      # /products (shop chrome)
    └── cart/page.tw          # /cart (shop chrome)
```

Pages in `(shop)` render inside `(shop)/layout.tw`, which itself renders inside the root `layout.tw` if one exists.

## Rules

- A group name is for humans — it never reaches the browser.
- Two groups must not contain the same route (`(a)/about/page.tw` and `(b)/about/page.tw` both claim `/about`).
- A group with no `page.tw` adds no route of its own.

## Related

- [Layouts](./layouts.md)
- [Dynamic Routes](./dynamic-routes.md)
