---
name: add-diagnostic
description: Add a new TW0xx compiler diagnostic with registry, docs, and tests
version: 1.0.6
---

# Skill: add-diagnostic

Diagnostics are the framework teaching. A TW0xx code is a permanent
piece of vocabulary -- it will appear in error messages, editor squiggles,
search results, andStack Overflow posts. Ship it like a product.

## 1. The code

Next free number in `packages/compiler/tw/diagnostics/codes.ts`
(TW001-TW093 are taken). Allocation map: TW001-019 syntax, TW020-049
structure/attributes, TW050-069 semantics, TW070-089 server/build,
TW090-093 cache gates. Pick the band that matches the failure origin.

## 2. The message

One line that a tired developer at 2am can act on. Test: give the message
to someone who has never seen this error -- can they fix the code?

- Bad: "Invalid value"
- Good: "cache { } requires a revalidate window or a life profile"

Severity: error (build fails) vs warning (advisory -- use for things
that compile but will surprise later, like the TW093 frozen-clock).

## 3. The rule

Implement in `packages/compiler/tw/diagnostics/rules.ts` (structural and
semantic checks) or emit from the parser at the failure point (parse
stage). Attach source location -- line and column of the exact token,
never the end of file.

## 4. The registry

```sh
bun scripts/generate-errors-json.ts
```

Count rises by exactly one. errors/README.md documents the consumers
(CLI decoding, LSP, docs, the CI sync check).

## 5. The reference doc

`docs/error-reference.md` entry, same shape as every other entry: what
it means, why it exists, the fix -- with a correct code sample. This is
the page a search engine will rank for the code; write it for that
reader.

## 6. The tests

- Positive: the construct that should fire it, asserting the exact code
  and nothing else (no extra diagnostics).
- Negative: the corrected construct compiles with zero errors.
- Table-parameterized when a family is involved (the unit-* matrix suites
  are the pattern).

## 7. The gate

`bun test && bun run lint`. If it touches the cache layer: `bun evals/run.ts`
too (cache.json encodes the TW090-TW093 semantics).

## Historical note

The v1.0.6 ARIA bugfix added four missing attributes and the missing
`table` role BECAUSE the test matrix demanded them -- tables and tests
grow together here. Expect your diagnostic to find bugs you did not know
existed; that is it working.
