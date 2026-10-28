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

**Store getters over array state.** The documented cart pattern — a getter
`count: (state) => state.items.length` with an action
`add(item) { this.items.push(item) }` — returned a stale count. Pushing into an
array keeps the same identity, so nothing downstream was notified. The state
proxy now reports in-place mutation (`push`, `pop`, `splice`, `sort`, …) back to
its reactive value, so the getter recomputes.

**`VirtualList.getFirstVisibleIndex()`.** It clamped to the item count instead of
the last index, so a `scrollTop` past the content returned `100` for a 100-item
list instead of `99`.

**The live-list template.** A loop on an interactive page carries its template in
an attribute, which is decoded once when the page is parsed and parsed again by
the runtime. Only the quotes were escaped, so an expression inside the template
lost its value at the first quote and evaluated to a truncated expression. The
template now survives that first decode intact.

**`TW098`.** The warning fired on a call to an imported helper, which the build
resolves and renders correctly. Names from the page's own imports are now
treated as evaluable, so only a genuinely unknown callee is flagged.

**`@tw/plugin-sitemap`.** An unconfigured `siteUrl` answered `/sitemap.xml` with
`500`, which reads as a server fault. It answers `503` now.

**The server-only boundary.** Importing a server module into a page the
documented way — `import { query } from "../../lib/db"` — was not rejected. The
check only recognised the `lib/`-prefixed and `.server.ts` spellings, so a
relative path into `lib/` was treated as an ordinary local module: the build
succeeded and the value rendered into the page. Such an import now fails the
build with `TW1007`, and a `.server` module is recognised with or without its
extension. `lib/` is also copied into the output directory only after that check
passes, so a rejected build leaves no server source behind.

**The SSRF lint (`TW117`).** It only matched a request-derived name written
directly inside `fetch(...)`, so the ordinary shape — `const url = query.u;
await fetch(url)` — passed silently. Assignments are now followed, so a
request-derived value stays request-derived through them.

## Known issue

A conditional inside a live list (`for` + `if` on a page that ships a runtime)
still shows the wrong branch per item. The template now reaches the runtime
intact, but the per-item toggle is not applying — that needs its own pass.

## Compatibility

- No breaking changes, no configuration changes, no migration steps.
- Test suite: 3,914 tests, all passing.
