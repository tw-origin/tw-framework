---
description: Run the TW Framework test suite (full, one suite, or by name)
allowed-tools: Bash(bun test*), Bash(bun run*)
---
# /test

Run the TW Framework tests and report results honestly.

## What to run

- No argument: `bun test` -- the full suite: 2702 tests across 49 files,
  ~11 seconds. Report: pass/fail/skip counts, total time, failing suites.
- A suite name: `bun test tests/<name>.test.ts` -- run exactly that file.
- A substring: `bun test -t "<substring>"` -- run matching test names.

## How to report

Always report the actual numbers from the runner output, never from
memory or expectation:

```
2691 pass
1 skip
0 fail
3967 expect() calls
Ran 2702 tests across 49 files. [10.99s]
```

If anything failed: list the failing suite(s) and the assertion text,
then STOP -- do not propose a fix before reproducing the failure with the
smallest possible input. The debugging loop is in AGENTS.md section 38.

## Rules

1. Never claim a suite is green without pasting its summary line.
2. Never fix a failure you have not reproduced in isolation.
3. If a test fails only under `bun test` but passes as a plain run, read
   AGENTS.md quirk 8 (the happy-dom preload) before touching code.
4. A skipped test is not a passed test -- report skips explicitly.

## Related

- `/bench` for performance, `/triage` for classifying a report.
- Eval harness (different animal): `bun evals/run.ts` -- 322 cases.
- The suite catalog with what each file locks: AGENTS.md section 7.
