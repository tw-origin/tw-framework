# The Eval Harness -- Four Levels of Proof

This document covers one thing completely: what the TW Framework eval
harness measures, how each level differs from the unit suite, how to run
it, how to author cases for it, and how to extend it -- including the fuzz
corpus and the agent task rubrics.

## Run it

```sh
bun evals/run.ts       # 322 cases, ~2.3s, 100% required, exit 1 otherwise
node run-evals.js      # the same, as a CI wrapper
bun run evals          # package script form
```

## Why evals exist when there are already 2702 tests

The unit suite locks BEHAVIOR of internals (functions, tables, transforms).
The eval harness locks OUTCOMES, SCALE, LAWS, and ROBUSTNESS -- properties
that cut across internals and that no single unit test can express:

| Level | Count | Question it answers | Example |
|---|---|---|---|
| 1. Outcome | 12 | does this golden input produce exactly this result? | `revalidate -5` -> precisely TW090, nothing else |
| 2. Scale | 6 | does the whole table hold when everything is used AT ONCE? | all 188 usable elements in one page; all 328 CSS properties in one stylesheet; 500-deep nesting; 2000 nodes |
| 3. Invariant | 4 | does the semantic law hold everywhere? | stale <= revalidate <= expire for EVERY builtin profile; custom profiles merge from tw.config.ts |
| 4. Fuzz | 300 | can ANY mutation of valid input crash the compiler? | seeded truncations, injections of braces/quotes/unicode/emoji/nul |

The harness earns its keep: on its very first run it caught a real quirk
(void elements reject closing tags -- `<hr>x</hr>` is TW001) that forced the
scale case to the correct bare `<hr>` form, and it keeps every fuzzed input
reproducible (mulberry32, seed 20260922).

## Layout

```
evals/
├── run.ts             the runner (levels 1-4 live here)
├── cases/             level 1 golden cases as JSON
│   ├── compiler.json  compile-layer expectations
│   └── cache.json     cache resolution expectations
└── agents/            agent task briefs with rubrics
    ├── add-an-example-app.md
    ├── add-a-diagnostic.md
    └── cut-a-release.md
```

## Authoring a level-1 case

Add to evals/cases/*.json:

```json
{ "name": "your case", "layer": "compile",
  "src": "page { title "x" }\ndiv { "y" }\n",
  "expect": { "errors": [] } }
```

Expectation fields: `errors` (exact set of error codes -- use [] for clean
compiles), `htmlNotContains` (compiled HTML must not contain each
substring), `directive` (null for no cache block), and for the cache layer
`revalidate` / `stale` / `expire` / `tag` resolved values.

Rules for cases:

1. Expectations must come from RUNNING the framework, not from intuition.
   (The original author guessed "minutes" = 60s revalidate; the framework
   said 300s. The eval caught the guess. Let it catch yours too.)
2. One case = one question.
3. Never test the same thing twice at the same level -- that is what the
   unit suite is for.

## The fuzz corpus

Four seed pages (a static page, a cached interactive page, an image+text
page, a deliberately broken page) pass through 1-4 random mutations each:
splice a chaos token (braces, quotes, backslashes, NUL, emoji, CJK,
`<script>`, `page {`, U+FFFF), truncate, or chop the head. compileSync must
return -- diagnostics are fine, exceptions are not.

To change the corpus: edit CORPUS or CHAOS in run.ts. The seed is fixed
so a crash is reproducible; if you change the seed, note it in the PR.

## Agent task rubrics

The three briefs in evals/agents/ describe tasks an AI agent must be able
to complete against this repo (add an example, add a diagnostic, cut a
release), each with pass criteria that encode the repo's hard rules. They
are scored by a reviewer against the rubric -- the rubric IS the
specification, so keep it in sync with AGENTS.md when the rules change.

## What NOT to do

1. Do not add a case whose expectation you have not seen the framework
   produce at least once.
2. Do not weaken a failing case to make the harness green -- if the
   framework changed, prove the new behavior is correct first.
3. Do not move unit-test material into evals because it is easier to write;
   levels must stay distinct.
