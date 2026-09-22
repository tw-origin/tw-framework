# Testing Guide (core) -- Writing Tests That Lock Behavior

This document covers one thing completely: how tests are written in the
TW Framework -- the structure of the suite, the parameterization
conventions, the e2e pattern, and the workflow that turns bugs into
regression tests.

## Running

```sh
bun test                             # everything: 2702 tests, 49 files, ~11s
bun test tests/unit-css-matrix.test.ts  # one suite
bun test -t "cache"                  # by name
```

## What the suite IS

49 files in tests/. The units of organization:

- **Table matrices** (unit-html-elements, unit-html-attributes, unit-events,
  unit-aria, unit-css-matrix, unit-web-tables): the `it.each` pattern --
  every entry of a shared table gets a real behavioral assertion. These
  files are the automated bug-hunt, frozen: they exist because iterating
  the real tables found four missing ARIA attributes and a missing role
  that no hand-written test ever would.
- **Directive grammar** (unit-router-directives): the `page { }` surface --
  render modes, legacy revalidate, the cache block, the TW090-TW093 edges.
- **Integration e2e** (e2e-isolated-app): a complete fixture app, built
  and served for real, asserted over HTTP.

## Writing a test

```ts
import { describe, expect, test } from "bun:test";
import { compileSync } from "../packages/compiler/tw/index.ts";
import { CSS_PROPERTIES } from "../packages/shared/tw/index.ts";

describe("my surface", () => {
  for (const prop of CSS_PROPERTIES) {
    test(`${prop} compiles in TSS`, () => {
      const css = compileTSS(`.x { ${prop}: inherit }`);
      expect(css).toContain(`${prop}: inherit`);
    });
  }
});
```

The rules that make this suite worth trusting:

1. **Parameterize over the REAL tables.** Never copy-paste variants of a
   test; loop the constant. A table entry without coverage is a hole a
   hunt will find later.
2. **Assert real output.** Compiled HTML, compiled CSS, resolved values,
   HTTP status and headers. Never internal state or "did not throw".
3. **One behavior per test.** If the name needs "and", it is two tests.
4. **Deterministic inputs.** No Date.now, no Math.random, no temp paths
   that depend on the runner. The parse cache is keyed by filePath+hash
   -- use distinct fileNames per case when compilation caching matters.
5. **Negative tests are as important as positive ones.** Every diagnostic
   needs a case where it fires AND a case where the same construct in
   valid form compiles silently.

## The e2e pattern

The environment has teeth; the pattern exists because of them:

- A fixture app is written to a mkdtemp directory (NOT /tmp proper -- it
  is small; use /scratch).
- `tw build` and `tw serve --port N` run via Bun.spawn with a port in
  8300-8700 (collision-safe).
- Readiness is polled with node:http, NOT fetch -- the bunfig.toml
  happy-dom preload CORS-blocks global fetch against localhost.
- Server + curl assertions happen in ONE execution context (background
  servers die between shell invocations).
- afterAll kills the server; the test never leaves processes behind.

Copy the shape from tests/e2e-isolated-app.test.ts verbatim -- it encodes
every one of these constraints.

## When a test finds a bug

1. Reproduce it in isolation (the smallest input that still fails).
2. Fix the framework.
3. The failing input becomes a NEW test in this session -- a bug that
   found a test and did not keep it will be found again, expensively.
4. If the behavior turns out to be correct-but-surprising: it is a quirk;
   document it in AGENTS.md section 11 and close the loop.

## What NOT to do

- Do not test under happy-dom what only holds without it (quirk 8:
  diagnostics differ under the preload). Test at compileSync/resolveCache.
- Do not weaken an assertion to make a suite green -- that is a bug
  survivor escaping.
- Do not add a test whose expected value came from reading the code
  instead of observing the behavior (tautologies pass forever).
