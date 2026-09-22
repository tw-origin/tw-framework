---
description: Run benchmarks and check the regression gate
allowed-tools: Bash(bun bench/*), Bash(bun run bench*)
---
# /bench

Measure hot paths; prove no regression.

## Commands

| Goal | Command |
|---|---|
| Full run (all 4 benches, writes bench/results/results.json) | `bun bench/run.ts` |
| The regression gate (exit 1 if any metric < baseline x 0.75) | `bun bench/run.ts --check` |
| One bench with more iterations | `bun bench/render.bench.ts 5000` |
| Re-record baselines after an INTENTIONAL change | `bun bench/run.ts --record` |

## The six metrics

compile.pages_per_sec (~350), render.miss_per_sec (~365),
render.hit_per_sec (~98,700), routes.matches_per_sec (~30,400),
cache.resolve_per_sec (~616,600), cache.inval_sweep_per_sec (~527,300).

## How to report

Paste the gate table with deltas:

```
compile.pages_per_sec         ok    352 vs 350 (+0.6%)
render.hit_per_sec            FAIL  71012 < 74025 (-28.4%)
```

## Rules

1. Default to `--check`. A plain run is for information; the gate is for
   decisions.
2. A FAIL is real if it reproduces twice. One run can be pod noise --
   but two runs is evidence.
3. Never re-record baselines silently: the re-record belongs to the same
   change that moved the number, with a written reason (a silent baseline
   bump is a review blocker -- contributing/code-review.md).
4. Cross-machine comparisons are meaningless; compare against the recorded
   baselines only.

## Reading the numbers

- render HIT ~99k/sec is the production number (one pod, warm cache).
- MISS ~365/sec is the cold-cache ceiling, not steady state.
- compile ~350 pages/sec is build-time work -- fine for builds, irrelevant
  to requests.

## Methodology notes (so you do not mis-measure)

Benches avoid `bun test` (the happy-dom preload); they are plain bun runs.
Fixtures are per-bench and isolated. The render bench uses unique cache
keys per iteration so every render is a true MISS. Do not "optimize" a
bench by weakening what it measures.
