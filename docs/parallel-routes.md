# TW Framework — Parallel Routes

This document covers one thing completely: `@name` slot folders — rendering multiple independent route trees into one page at the same URL.

---

## The @slot Convention

A folder whose name starts with `@` is a parallel slot. It does not add a URL of its own; it fills a named slot in a page at the same level:

```text
home/
├── dashboard/page.tw         # /dashboard
├── dashboard/@stats/page.tw  # content for the stats slot
└── dashboard/@feed/page.tw   # content for the feed slot
```

`/dashboard` renders the page, with the `@stats` and `@feed` trees rendered into their named slots.

## Receiving the Slots

The parent page declares where each parallel tree lands with a component whose name matches the slot:

```tw
div.dash {
  div.col {
    Stats { }
  }
  div.col {
    Feed { }
  }
}
```

Each slot renders its own tree — its own layout, its own data — in parallel with the others.

## What Parallel Routes Solve

| Need | Why parallel |
|------|--------------|
| a dashboard of independent panels | each panel fails, reloads and caches on its own |
| slow widget beside a fast page | the page does not wait for the slow tree |
| independently authored sections | teams work in separate folders |

## Interaction with Layouts

Each `@name` tree resolves its own layout chain. A layout in `@stats/` wraps only the stats tree, never the feed.

## Related

- [Route Groups](./route-groups.md)
- [Layouts](./layouts.md)
