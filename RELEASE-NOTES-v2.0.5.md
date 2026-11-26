# TW Framework 2.0.5

A patch release. Two things that were blocked by bugs now work, and the
stylesheet compiler got a run of fixes.

```bash
npm install tw-framework@2.0.5
```

---

## Import your own server code from a page

`lib/` is server-only, and that has not changed. What changed is that a page may
now import from it when only a `server { }` block uses the binding:

```tw
import { getApps } from "lib/data"

page { title "Apps" render static }

server {
  const apps = await getApps()
}

div { for app in {apps} { a href "/app/{app.slug}" { "{app.name}" } } }
```

Before this, that import was a `TW1007` build error, so every page carried an
inline `await import("node:fs")` IIFE instead.

Three bugs stood in the way, all fixed:

1. A page-level import never reached the block — the name was unbound and the
   executor's stand-in was called, which surfaced as
   `query is not a function ... ProxyObject`.
2. An import whose local name matched a block built-in (`query`, `params`,
   `fetch`, …) was silently replaced by the built-in. That is `TW125` now, with
   the rename in the message.
3. Namespace (`import * as ns`) and aliased (`import { a as b }`) imports bound
   the wrong name, for block-local imports too.

### Marking modules anywhere

`lib/` is the default, not the only option:

```js
// services/payment.js
import "@tw/server-only";   // server-only, wherever it lives

// lib/dates.js
import "@tw/client-safe";   // shared, inside lib/
```

A client-safe module that pulls in a server-only dependency still fails, with
the whole chain in the message:

```
TW1007: home/leak/page.tw -> lib/leaky.js -> ./db
```

`@tw/client-safe` is a promise the build cannot verify — put it only on a module
you are certain carries no secret.

---

## A missing record is a real 404

`notFound()` in a static page's server block used to be a `TW108` build error.
The only option was to render a "not found" body with status 200 — a soft 404
that crawlers index.

```tw
server {
  const app = await getApp(params.slug)
  if (!app) notFound()
}
```

The build now skips that page, and the host serves its own 404. Nothing is
dropped silently:

```
! home/app/[slug]/page.tw  notFound() -- page skipped, the host will serve a 404
```

`redirect()` is still rejected in a static block — a static page is built before
the request, so there is no response to redirect.

---

## Stylesheets

TSS output was assembled as a flat list of strings, and every rule was wrapped in
its own copy of any enclosing at-rule. That one decision produced most of these.

**Nested at-rules.** `.card { @media (...) { p 4px } }` came out as a
selector-less rule. `@keyframes` emitted one block per frame, so the later copy
overrode the earlier one and the animation lost its start state. `@media` with
two rules repeated the wrapper twice. `@layer` and `@container` had the same
shape of problem.

**Multi-line blocks.** `--main #fff` and `-webkit-transform none` written on
their own line were pasted into the previous declaration's value, because the
"is this a declaration" test required a name starting with a letter.

**Strings.** A `;` or `}` inside a quoted string split the declaration and broke
the block: `content "a;b"` became `content: "a; b"`.

**Statement at-rules.** `@import url("a.css");` became
`* { @import: url("a.css") }` — the stylesheet imported nothing. Same for
`@charset`.

**Shorthands.** Nine documented shorthands were never implemented: `br-tl`,
`br-tr`, `br-bl`, `br-br`, `fl`, `cl`, `dir`, `ww`, `va`. `br-tl 4px` emitted the
literal property `br-tl`, which no browser understands — the corner stayed
square while the docs said it worked.

**Output shape.** A multi-line value printed across several lines; a property
with no value swallowed the next declaration; empty blocks emitted empty rules.

---

## Also

- `TW124` was already documented for a private-folder check, so the new
  collision diagnostic is `TW125`.
- `docs/error-reference.md`, `docs/client-modules.md` and `docs/server-data.md`
  described the old rules for `notFound()` and for importing `lib/` into a page.
  They are current again.
- `packages/client-safe` is a new workspace package: run `bun install` after
  updating.

---

## Checks

Full test suite 4007 passing, typecheck clean, all 31 examples build, and all
68 `.tss` files in `examples/` compile without unbalanced braces or leftover
`$vars`.
