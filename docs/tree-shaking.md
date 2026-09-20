# TW Framework — Tree Shaking

This document covers one thing completely: shipping only the exported functions a page actually uses, not the whole module.

---

## The Rule

Client module chunks are built per imported symbol. Import one helper from a large runtime package, and the chunk carries that helper — not the rest.

```twm
import { copyText } from "@tw/runtime"
```

The `c-` chunk for this import contains `copyText` and its private dependencies. The runtime's transitions, virtual lists, drag-and-drop, i18n — none of it is included because nothing referenced it.

## What Triggers Inclusion

| You import | Included |
|------------|----------|
| `copyText` from `@tw/runtime` | `copyText` + its internal deps |
| `{ copyText, t }` | both functions + their deps |
| a module with side effects at import time | those side effects run |

## Side Effects Limit It

A module that runs code on import cannot always be shaken — executing it is observable. Keep shared modules as pure exports; do initialization inside an explicit `init()` function the caller invokes.

## Verify

```bash
tw build
grep -c "copyText" .tw/chunks/c-*.js    # your function is there
grep -c "createVirtualList" .tw/chunks/c-*.js   # not there unless imported
```

Chunk sizes are the honest measure — see [Code Splitting](./code-splitting.md).

## Related

- [Client Modules](./client-modules.md)
- [Minification](./minification.md)
