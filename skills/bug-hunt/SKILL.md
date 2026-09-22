---
name: bug-hunt
description: Systematically hunt real bugs in the framework using the tables, the docs, and adversarial inputs
version: 1.0.6
---

# Skill: bug-hunt

The process that found 50+ real bugs for v1.0.5 and four missing ARIA
attributes for v1.0.6. It is mechanical on purpose: inspiration is not a
strategy.

## 1. Pick a surface

One at a time, from three kinds:

- **A table**: HTML_ELEMENTS (199), HTML_ATTRIBUTES (278), CSS_PROPERTIES
  (328), EVENT_TYPES (116), ARIA_ROLES (80), HTTP_STATUS_CODES. The full
  inventory is AGENTS.md Part II.
- **A pipeline stage**: lexer, parser, codegen, TSS, render, cache, routes,
  the twm loader, middleware matching.
- **A seam**: where two surfaces meet -- cache x actions, middleware x
  dynamic routes, unicode x route naming, cache x the legacy revalidate
  path.

## 2. Generate adversarial inputs PROGRAMMATICALLY

Never hand-write the inputs -- the blind spots of hand-writing are where
the bugs live. Loop the real tables:

```ts
for (const tag of HTML_ELEMENTS) { /* compile tag in every legal form */ }
for (const prop of CSS_PROPERTIES) { /* .x { prop: inherit } */ }
```

Plus the chaos dimensions: empty inputs, unicode (Devanagari, CJK,
emoji, U+FFFF), extreme nesting (500-deep), duplicate attributes,
keyword-colliding names, void-tag closing forms, truncations at every
boundary.

## 3. Predict BEFORE running

From the docs, write down what SHOULD happen. Divergence is one of:
a bug (fix the code), a doc gap (fix the docs), or a quirk (document it
in AGENTS.md section 11). Without the prediction step you cannot tell
which -- you will rationalize whatever happens.

## 4. Classify honestly

- **Real bug** -- behavior contradicts documented semantics. Fix + lock
  with a regression test in the same session.
- **Documented quirk** -- behavior is intentional. AGENTS.md gets the
  entry so it stops being rediscovered.
- **Harness artifact** -- the happy-dom preload or a test-environment
  limitation. Re-verify at the deterministic layer (compileSync,
  resolveCache) before calling it anything.

## 5. Lock everything you find

Every bug becomes a test before you move to the next. The automated
versions of this loop already exist -- run them first:

```sh
bun evals/run.ts   # 322 cases: outcome, scale, invariant, 300 fuzz inputs
bun test           # the matrix suites ARE a table-driven hunt, frozen
```

Then hunt by hand where the automation does not reach: new tables, new
seams, new syntax combinations.

## Lessons from past hunts

1. The bench profiles-per-iteration bug: measuring setup instead of the
   path. When a number looks impossible, question what it measures.
2. The void-tag closing quirk: found by the scale eval putting EVERY
   element in one page. Aggregate stress finds what isolated tests do not.
3. The ARIA gaps: found because the suite iterated the actual table
   rather than a hand-picked sample. Tables do not get tired.
