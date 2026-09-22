# Code Review Guide -- The Bar Every PR Clears

This document covers one thing completely: what a TW Framework change
must demonstrate before it merges -- the checklist, the review lenses,
and the failure patterns that get a PR sent back.

## The reviewer runs ALL of this

So does the author, before opening:

```sh
bun run lint             # 0 errors, 11 packages
bun test                 # 2702 green, 49 files
bun evals/run.ts         # 322 at 100%
bun bench/run.ts --check  # no metric below baseline x 0.75 (hot paths)
bun run verify           # everything above + all 30 example builds
```

A PR description states what changed, why, and the verification evidence:
commands and their summary lines, pasted -- not summarized from memory.

## Must-haves

- [ ] Verification commands AND output in the description
- [ ] New behavior has tests; new diagnostics have registry + reference
- [ ] Docs updated -- a feature without a docs/ page does not exist
- [ ] No breaking change; legacy `page { revalidate N }` byte-identical
- [ ] No new dependency without a written justification
- [ ] No secrets, no test secrets, no "temporary" secrets
- [ ] Bench re-recorded IN THE SAME PR if performance moved intentionally
- [ ] errors.json regenerated if codes.ts changed (CI checks the sync)

## The review lenses

**Correctness.** Does the change hold for unicode routes, empty inputs,
duplicate attributes, extreme nesting, and -- always -- the legacy
syntaxes? The legacy path is the regression the framework cannot afford.

**Cache semantics.** Anything touching the render cache must preserve
the HIT/STALE/MISS contract: age windows, x-tw-cache-age, Cache-Control
derivation, canonical key equality (query order independence), and tag
invalidation scope. The e2e suite locks these; extend it if the surface
changed.

**Security.** Changes to middleware, sessions, headers, or the .twm
loader get the security checklist: fail-closed guards, secrets from env
only, no per-request data across cached handlers (TW091 exists for a
reason), and no secrets in error messages.

**Performance.** Hot paths (render, matchRoute, compileSync, resolveCache)
have benches. If the change touches one, the PR shows before/after from
`bun bench/run.ts --check`. A silent baseline bump is a blocker -- the
history of that gate is the only thing that makes it meaningful.

**Docs and teaching.** The compiler teaches; the docs are the curriculum.
A new error message that does not teach is a defect. A new feature
without its page does not exist.

## Failure patterns (all real, all rejected)

1. "It works on my machine" -- no commands in the PR.
2. A subtle change to legacy revalidate behavior "for consistency".
3. A test weakened to green instead of a bug fixed.
4. A baseline re-recorded without a word about why.
5. A new dependency for what the standard library already does.
6. Docs examples that were never run.

## Reviewer etiquette

Review the change, not the person. Quote the line, name the lens, state
the fix. If you cannot say WHY something is wrong, it is a preference,
not a defect -- say so and let the author decide.
