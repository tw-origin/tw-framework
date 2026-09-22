# CLAUDE.md

Read [AGENTS.md](./AGENTS.md) FIRST -- it is the complete operating
manual for this repository: commands, package map, language reference
tables (every HTML element, CSS property, event, ARIA role), the cache
semantics, the quirks, the hard rules, and the decision log.

## The absolute minimum

```sh
bun install    # setup (~2s)
bun test       # 2702 tests, ~11s -- all must pass before ANY change
bun run verify # the master gate before claiming anything works
```

## The rules that get agents in trouble here

1. **Never claim without running.** "Should work" is a defect.
2. **Never break legacy syntax** -- `page { revalidate N }` is
   byte-identical to v1.0.5 forever.
3. **A feature without a docs/ page does not exist.**
4. **The zip must be fresh-verified** (unzip -> install -> test) before
   any release claim.
5. **The quirks list is real** (AGENTS.md section 11): attribute syntax
   is `name "value"`, keyword-colliding attributes need HTML form, void
   tags reject closing tags, TSS shorthands are `bg-c`/`pt` style. Filing
   these as bugs wastes a round trip.

## Where everything is

| Need | Go to |
|---|---|
| Command reference, repo map, reference tables | AGENTS.md |
| Test conventions | contributing/core-testing.md |
| Review bar | contributing/code-review.md |
| Release steps | contributing/release-process.md |
| Triage/classification | contributing/issue-triage.md |
| Packaged procedures (add example, release, diagnostic, docs, bug-hunt) | skills/ |
| Slash commands | .claude/commands/ |
| Eval harness (322 cases) | evals/README.md |
| Benchmarks + gate | bench/README.md |
| Error registry (93 codes) | errors/README.md + errors.json |
| Runnable apps (14) | examples/README.md |

## Proof tiers (cite the tier, not a feeling)

tests (2702) -> evals (322) -> bench gate (6 metrics) -> fresh-verified
artifact. Which tier a claim needs depends on the claim; "it ships" is
always the top tier.
