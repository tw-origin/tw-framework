# TW Framework v2.0.2

A patch release on top of 2.0.1: bug fixes only. Nothing in the public API
changed, so 2.0.2 is a drop-in replacement.

## Install

```bash
npm install tw-framework@2.0.2
# or
bun add tw-framework@2.0.2
```

New project:

```bash
npm create tw-framework@2.0.2 my-app
```

## What was fixed

**Expressions.** Grouped and nested expressions, string concatenation, method
calls, unary operators, `&&` (which now yields its operand rather than a boolean)
and `.length` on a string all evaluate as the docs say. A call to a helper the
page imports works, an unknown callee no longer renders its own argument, and a
`}` inside an expression no longer ends it early.

**Conditions and loops.** A parenthesised `if` condition takes the right branch,
and a loop over a computed collection — `.filter`, `.map`, `.slice`, `.concat`,
`.reverse` — renders its items instead of an empty list.

**A conditional inside a live list.** On a page that ships a runtime, a `for` loop
whose body branches on the loop variable showed the wrong branch for every item.
The page-wide conditional pass re-evaluated those elements with the loop variable
out of scope and overwrote the per-item result. Elements owned by a list are
skipped now, and the list keeps evaluating them with the variable bound.

**The live-list template.** A loop's template is carried in an attribute, decoded
once by the page parse and parsed again by the runtime. Only the quotes were
escaped, so an expression inside it lost its value at the first quote; `&` is
escaped first now, so the entities survive that decode.

**Store getters over array state.** The documented cart pattern — a getter
`count: (state) => state.items.length` with an action
`add(item) { this.items.push(item) }` — returned a stale count, because pushing
into an array keeps its identity. The state proxy reports in-place mutation back
to its reactive value now, so the getter recomputes.

**`VirtualList.getFirstVisibleIndex()`.** It clamped to the item count instead of
the last index, so a `scrollTop` past the content returned `100` for a 100-item
list instead of `99`.

**`TW098`.** The warning fired on a call to an imported helper that the build
resolves and renders correctly. Names from the page's own imports are treated as
evaluable now.

**The server-only boundary.** A relative import into `lib/` — the documented way
to reach a server module — was walked as an ordinary local module, so the import
was never rejected and the value rendered into the page. It fails the build with
`TW1007` now, a `.server` module is recognised with or without its extension, and
`lib/` is copied into the output directory only after that check passes, so a
rejected build leaves no server source behind.

**The SSRF lint (`TW117`).** It only matched a request-derived name written
directly inside `fetch(...)`, so an intermediate assignment passed silently.
Assignments are followed now.

**`@tw/plugin-sitemap`.** An unconfigured `siteUrl` answered `/sitemap.xml` with
`500`, which reads as a server fault. It answers `503` now.

## Compatibility

- No breaking changes, no configuration changes, no migration steps.
- Test suite: 3,914 tests, all passing.
