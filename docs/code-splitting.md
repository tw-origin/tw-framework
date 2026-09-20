# TW Framework — Code Splitting

This document covers one thing completely: how compiled JavaScript is split into chunks, and how a page loads only what it uses.

---

## The Chunk Kinds

| Pattern | What it is | Loaded |
|---------|-----------|--------|
| `c-*.js` | a client module chunk — one per imported npm module | pages that import that module |
| `p-*.js` | a page's own compiled script | that page only |
| `__tw_runtime.js` | the hydration runtime | pages that hydrate |

Each chunk is content-hashed — its name changes only when its content does, so unchanged chunks keep their cached URL across deploys.

## A Page Loads Its Own Slice

A page that imports nothing beyond the framework ships its page chunk plus (if it hydrates) the runtime. A page importing `chart.js` additionally pulls the `c-` chunk containing it. No page downloads another page's code.

```text
.tw/
├── __tw_runtime.js
├── chunks/
│   ├── c-abc123.js     # e.g. chart.js, tree-shaken to used exports
│   └── c-def456.js     # e.g. a date library
└── pages/
    └── p-789.js         # one page's compiled script
```

## The Runtime Chunk

The hydration runtime is a single shared file — every hydrated page references the same URL, so it is fetched once and cached. It is bundled as part of the CLI so it always matches the compiler that emitted your pages.

## Shared Imports

When two pages import the same module, they share one `c-` chunk — the module is extracted once, not duplicated per page.

## Checking Your Splits

```bash
tw build
ls .tw/chunks/ | wc -l      # how many module chunks
du -sh .tw/chunks/
```

## Related

- [Client Modules](./client-modules.md)
- [Tree Shaking](./tree-shaking.md)
