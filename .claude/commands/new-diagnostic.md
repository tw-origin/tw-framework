---
description: Add a new TW0xx compiler diagnostic end-to-end
allowed-tools: Bash(bun *), Read(**), Write(**)
---
# /new-diagnostic

A diagnostic is a feature: it ships with code, registry, docs, and tests.
The long form is skills/add-diagnostic; this is the executable checklist.

## 1. Pick the code

Next free number in `packages/compiler/tw/diagnostics/codes.ts`
(currently through TW093). Never recycle a number.

## 2. Register

In codes.ts: message (must teach -- it is the user only teacher),
severity (error fails the build; warning advises), category.

## 3. Implement

The check in `diagnostics/rules.ts` (or the parser emit point, if it is
a parse-stage failure). Emit at the exact failure site with the source
location, never a generic end-of-file error.

## 4. Regenerate the registry

```sh
bun scripts/generate-errors-json.ts
```

The count must rise by exactly one (93 -> 94). CI compares the committed
registry against the table -- a mismatch fails the build.

## 5. Document

`docs/error-reference.md`: what it means, why it exists, the fix with
correct code shown. Format follows every other entry (what/why/fix).

## 6. Test

- One positive case: the new diagnostic FIRES with exactly the expected code.
- One negative case: the same construct in valid form compiles silently.
- If a whole table is involved, parameterize (see unit-css-matrix).

## 7. Gate

`bun test && bun run lint` green. If the diagnostic affects the cache
layer, also run `bun evals/run.ts` (the cache.json cases encode the
TW090-TW093 windows).

## Quality bar

A good diagnostic names the problem, points at the line, and shows the
fix. A bad one says "unexpected token" -- we already have that one.
