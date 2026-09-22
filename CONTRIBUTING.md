# Contributing to TW Framework -- The Complete Guide

This document covers one thing completely: how a contribution to the TW
Framework goes from an idea to a shipped, verified change -- the setup, the
conventions, the proof requirements, the review bar, and the release --
with every command you will need along the way.

---

## Table of contents

1. [Prerequisites and setup](#1-prerequisites-and-setup)
2. [The first hour -- your orientation checklist](#2-the-first-hour)
3. [The proof hierarchy -- what green means here](#3-the-proof-hierarchy)
4. [Repository layout](#4-repository-layout)
5. [Writing code -- conventions by package](#5-writing-code)
6. [Writing tests](#6-writing-tests)
7. [Writing docs](#7-writing-docs)
8. [Diagnostics -- adding a TW0xx error](#8-diagnostics)
9. [Performance work](#9-performance-work)
10. [Examples -- adding or changing one](#10-examples)
11. [The PR checklist (what reviewers run)](#11-the-pr-checklist)
12. [What gets a PR rejected](#12-what-gets-a-pr-rejected)
13. [Community and conduct](#13-community-and-conduct)

---

## 1. Prerequisites and setup

- **Bun 1.4+** (the workspace runtime; `npm install -g bun` works where the
  install script is blocked, e.g. locked-down Termux or CI sandboxes).
- **Node 20** only if you also exercise the node bundle
  (`apps/cli/scripts/build-node.ts`).
- **git**, **zip** for releases.

```sh
git clone <your-fork>
cd tw-framework
bun install          # ~2s, workspace links
bun test             # 2702 tests, ~11s -- ALL must pass before you start
bun run lint         # 0 errors across 11 packages
```

If any of those three are not green on a fresh clone, stop and file an
issue -- do not build on a broken base.

## 2. The first hour

1. Read AGENTS.md sections 1-6 (orientation, commands, map, language,
   cache semantics). It is 15 minutes that saves days.
2. Run one example end to end:

   ```sh
   cd examples/todo-app
   bun ../../apps/cli/tw/bin.ts dev
   # then, in one shell session:
   #   curl -s http://127.0.0.1:8000/ | head
   ```

3. Break something small on purpose (change a page title in
   examples/todo-app/home/page.tw, rebuild) to feel the dev loop.
4. Skim one test file that matches what you want to work on
   (tests/unit-css-matrix.test.ts for compiler work,
   tests/e2e-isolated-app.test.ts for server work).

## 3. The proof hierarchy

Claims in this repo are graded. Know the tiers:

| Tier | What | Command | A claim backed only by this is |
|---|---|---|---|
| 0 | "It should work" | - | a defect |
| 1 | "It compiles" | `tw build` in an app | weak |
| 2 | "It passes its tests" | `bun test tests/<suite>.test.ts` | normal |
| 3 | "The suite is green" | `bun test` (2702) | good |
| 4 | "Evals at 100%" | `bun evals/run.ts` (322: outcome/scale/invariant/fuzz) | strong |
| 5 | "No perf regression" | `bun bench/run.ts --check` (6 metrics) | strong |
| 6 | "The artifact passes" | fresh-unzip -> install -> test on THE ZIP | shipping grade |
| 7 | "Everything" | `bun run verify` | the master gate (~3m20s) |

Never present tier-N evidence for a tier-(N+1) question. "I ran the tests"
does not answer "does it ship".

## 4. Repository layout

```
tw-framework/
├── packages/          11 packages (compiler, server, runtime, shared,
│                      security, lsp, plugins, sdk, adapters, image, ...)
├── apps/              cli (the `tw` command), create-tw-framework
├── examples/          30 runnable apps -- CI builds every one
├── tests/             48 suites, 2702 tests (unit + isolated e2e)
├── evals/             322-case harness (outcome/scale/invariant/fuzz)
├── bench/             6-metric benchmark + regression gate
├── docs/              185 canonical topic pages
├── skills/            5 packaged agent skills
├── contributing/     deep guides (testing, review, release, triage)
├── errors.json        machine-readable registry of all 93 TW0xx codes
├── AGENTS.md          THE operating manual (read this first)
└── .github/ .claude/ .claude-plugin/ .cursor/ .devcontainer/ .husky/ .vscode/
```

The full package-by-package table with the key files you will touch in
each is AGENTS.md section 4.

## 5. Writing code

**Language and style**

- TypeScript everywhere; strict mode is already on (0 errors across all
  packages -- keep it that way: `bun run lint`).
- Canonical English in all files and comments. Chat may be any language;
  code, docs, and commits are not.
- No new runtime dependencies in the core packages without a written
  justification in the PR (the core is deliberately zero-dep).

**Correctness bar**

- Zero breaking change is a release requirement, not an aspiration. If a
  change alters the behavior of any markup that compiled in 1.0.x, it is
  wrong until proven otherwise. The e2e suite includes a dedicated
  legacy-ISR regression test; extend that pattern when touching the cache.
- Compiler changes follow "diagnostics over crashes": every new failure
  mode gets a TW0xx code, a rules.ts entry, an errors.json regen, and an
  error-reference.md section. A silent drop is never acceptable.
- Server changes that touch cache windows must preserve the
  HIT/STALE/MISS contract (AGENTS.md section 6) and the purity rules
  (TW091: cookies/headers/body/setSignal are impure in `fn cached`).

**Secrets**: never in code, commits, or generated files. Env references
(`jwt_secret_env "JWT_SECRET"`) and placeholders only.

## 6. Writing tests

Full style guide: contributing/core-testing.md. The essentials:

- Parameterize over the shared tables (HTML_ELEMENTS, CSS_PROPERTIES,
  ARIA_ROLES, EVENT_TYPES...) -- the four unit-* matrix suites are the
  pattern to copy.
- Assert real output (compiled HTML/CSS, resolved values, HTTP status and
  headers), never internal state.
- e2e belongs in tests/e2e-isolated-app.test.ts's fixture-app pattern:
  build + serve on a random port (8300-8700), raw node:http (NOT fetch --
  the happy-dom preload CORS-blocks localhost), kill in afterAll.
- Every bug fix lands with the regression test that would have caught it,
  written before the fix is merged.

## 7. Writing docs

- One document, one thing, completely. Opener:
  "This document covers one thing completely: <thing>."
- Every code sample in docs must be one that was actually run. If you did
  not run it, run it or cut it.
- Structure: intro -> semantics -> syntax with examples -> edge cases ->
  error codes involved -> related pages.
- A feature without a docs page does not exist. The PR that adds the
  feature adds the page, in the same change.

## 8. Diagnostics

Short form (long form: skills/add-diagnostic):

1. Next free code in `packages/compiler/tw/diagnostics/codes.ts` (currently
   through TW093).
2. Message + severity + category in codes.ts; rule in diagnostics/rules.ts;
   parser/codegen emits it at the exact failure point.
3. `bun scripts/generate-errors-json.ts` -- errors.json count must rise by
   exactly one (CI checks registry/code consistency).
4. `docs/error-reference.md` entry: what it means, why it exists, the fix
   with correct code shown.
5. Tests: one case where it fires, one where the same construct compiles
   silently.

## 9. Performance work

- The gate is `bun bench/run.ts --check` -- 25% tolerance against
  bench/baselines.json (6 metrics; see AGENTS.md section 9).
- Any PR touching a hot path runs the focused bench before and after:
  `bun bench/render.bench.ts 5000`.
- Deliberate changes re-record baselines in the same PR and say so.
  A silent baseline bump is a review blocker.

## 10. Examples

- Follow skills/add-example; copy examples/todo-app's shape.
- Must build: `cd examples/<name> && bun ../../apps/cli/tw/bin.ts build`.
- README explains what the example teaches, not just what it contains.
- CI and `bun run verify` build every example -- a broken example fails
  the gate for everyone.

## 11. The PR checklist

Reviewers run ALL of this; so should you, before opening:

```sh
bun run lint            # 0 errors
bun test                # 2702 green
bun evals/run.ts        # 322 at 100%
bun bench/run.ts --check # no regressions (if you touched a hot path)
cd examples/* && build   # if you touched examples
bun run verify          # the master gate -- everything above, once
```

Description must state: what changed, why, how it was verified (with the
commands and their output), and what docs/tests ship with it.

## 12. What gets a PR rejected

1. "It works on my machine" with no verification commands in the PR.
2. A behavior change to legacy `page { revalidate N }` -- any change,
   however small, however good the reason.
3. A new feature with no docs page.
4. A new diagnostic without registry + reference + tests.
5. A perf change with no bench numbers, or with a silent baseline bump.
6. A new dependency without justification.
7. Secrets in code, even test secrets, even "temporary".
8. A zip or artifact that was never fresh-unzipped and tested.

## 13. Community and conduct

CODE_OF_CONDUCT.md applies everywhere -- issues, PRs, chat. The short
version: be kind, assume competence, give and take feedback gracefully,
and remember the person on the other side is building too. Enforcement
process and reporting paths are in that document.

Thank you for building TW.
