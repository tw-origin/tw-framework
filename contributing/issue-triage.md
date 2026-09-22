# Issue Triage -- From Report to Reproduction

This document covers one thing completely: how an incoming report is
classified, reproduced, and turned into either a locked regression test
or a documented quirk.

## The flow

```
report -> quirks check -> classify -> minimal reproduction
       -> failing test (if bug) -> fix -> lock
```

## Step 1: the quirks check (before anything else)

AGENTS.md section 11 is the list of verified, intentional behaviors that
generate the most reports:

- `name "value"` attribute syntax (space, not `=`)
- Keyword-colliding attributes need HTML-form syntax
- Void elements reject closing tags (`<hr>` ok, `<hr>x</hr>` is TW001)
- TSS shorthands are `bg-c`/`pt` style, not hyphenated CSS names
- `annotation-xml` parses as text
- `home/secret/page.tw` serves at `/secret`

A report matching a quirk closes as works-as-designed, with the AGENTS.md
entry cited. Kindly -- the reporter was right to ask.

## Step 2: classify

| Label | Meaning | Next step |
|---|---|---|
| bug | reproducible misbehavior | failing test FIRST |
| compiler / server / runtime / cli | surface | route to the package |
| docs | gap or wrong page | one-thing-completely rewrite |
| performance | regression | the relevant bench, before/after |
| feature | a request, not a defect | design doc round (see below) |

## Step 3: minimal reproduction

The smallest input that shows the behavior. For compiler issues, a
compileSync one-liner; for server issues, a page + route + curl in ONE
shell invocation. The reproduction in the report is a starting point,
never the end -- shrink it until removing anything makes it stop failing.

## Step 4: the failing test

A bug is not understood until it is a failing test. Write it before the
fix; watch it fail; fix; watch it pass; leave it in the suite forever.
If the test cannot be written, the report is not yet understood.

## Step 5: verify at the deterministic layer

If it fails only under `bun test` but not as a plain run (or vice
versa), the happy-dom preload is the variable (quirk 8) -- say so in the
issue and test at compileSync/resolveCache instead.

## Feature requests

Route to the design-doc pattern (see TW-v1.0.6-cache-design.md for the
template): RFC -> review round -> locked decisions -> milestone plan.
Features skip the queue-jump: a feature without a design conversation
does not start.
