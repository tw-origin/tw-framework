# TW Framework v2.0.3

A patch release on top of 2.0.2: bug fixes only. Nothing in the public API
changed, so 2.0.3 is a drop-in replacement.

## Install

```bash
npm install tw-framework@2.0.3
# or
bun add tw-framework@2.0.3
```

New project:

```bash
npm create tw-framework@2.0.3 my-app
```

## What was fixed

**Hydration no longer discards server-rendered values.** A value declared in a
page's `server { }` block is rendered on the server but never serialised into
`__tw_state`, so the client runtime treated it as missing. On hydration that
emptied every `for` loop whose list came from the block, blanked every
interpolation reading one, and hid every `if` testing one — after the server had
already produced the right markup. An expression that evaluates to `undefined` is
now read as "not client state" and the server output is left untouched. Real
client state still re-renders exactly as before.

**`tw dev` respects `strategies.hydration.mode: "none"`.** The runtime was
injected unconditionally, so a page could not be viewed without hydration in dev.

**The `tw-framework` command works.** The package declared only a `tw` bin, so
`bunx tw-framework dev` and a `"build": "tw-framework build"` script failed with
"not found", despite the README documenting that form. Both `tw` and
`tw-framework` resolve to the same entry point now.

## Compatibility

- No breaking changes, no configuration changes, no migration steps.
- Test suite: 3,914 tests, all passing.
