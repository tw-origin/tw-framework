# TW Framework v2.0.1

A patch release on top of 2.0.0: bug fixes only. Nothing in the public API
changed, so 2.0.1 is a drop-in replacement -- upgrade and your project builds and
runs as before.

## Install

```bash
npm install tw-framework@2.0.1
# or
bun add tw-framework@2.0.1
```

New project:

```bash
npm create tw-framework@2.0.1 my-app
```

## What was fixed

**Expressions and interpolation.** Grouped and nested expressions, string
concatenation, method calls, unary operators, `&&` (which now yields its operand
rather than a boolean) and `.length` on a string all evaluate as the docs say. A
call to a helper the page imports now works. An unknown callee no longer renders
its own argument, and a `}` inside an expression no longer ends it early.

**Conditions and loops.** A parenthesised `if` condition takes the right branch.
A loop over a computed collection -- `.filter`, `.map`, `.slice`, `.concat`,
`.reverse` -- renders its items instead of an empty list.

**Components and props.** A dynamic prop (`prop={expr}`) binds its value, a prop
written in the block form reaches the component, two or more classes with an
`on:` binding no longer merge into one class name, a nested component no longer
trips the circular check, and `{page.description}` resolves with the description
meta emitted once.

**Diagnostics.** An interpolation the build cannot evaluate now raises a warning
(`TW098`) instead of quietly rendering its own source text.

**Server.** Request-time render modes (`ssr`, `stream`) no longer 404 when a page
has no `cache` block. An unmatched path gets the nearest `not-found.tw` and the
right status code. `error.tw` is rendered when a render fails. A named slot is
filled after the layout chain is applied. A static resource answers only the
methods that apply to it. `tw dev` runs a page's server blocks and shows the dev
error page when one fails.

**Runtime.** Store getters and actions follow the documented forms, `subscribe`
receives the new value, catch-all routes match multiple segments, derived values
propagate in a consistent order, and two helpers no longer throw on edge-case
input.

**Plugins.** A hook returns the first interception result instead of the last, so
one plugin no longer disables another's `onRequest`. A command registered by a
plugin is dispatched.

**Tooling and docs.** `tw --help` reports the real version, the image, link and
head helpers produce the documented output, and several documentation
corrections.

**Security hardening** across token lifetime, upload validation, content-type
checks, the crypto helpers and the link helpers. The specifics are deliberately
not listed here; if you are on 2.0.0, upgrade.

## Compatibility

- No breaking changes, no configuration changes, no migration steps.
- Test suite: 3,914 tests, all passing.

## Assets

| File | What it is |
|------|------------|
| `tw-framework-2.0.1.tgz` | the packed CLI package (same artifact published to npm) |
| `SHA256SUMS` | checksums for the tarball |
