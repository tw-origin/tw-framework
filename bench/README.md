# The Benchmark Suite -- Metrics, Methodology, and the Regression Gate

This document covers one thing completely: how the TW Framework measures
its hot paths, how to read the numbers, how the regression gate decides
pass/fail, and how to change a benchmark without destroying the historical
record.

## Quick start

```sh
bun bench/run.ts             # run all 4 benches -> bench/results/results.json
bun bench/run.ts --record    # also (re)write bench/baselines.json
bun bench/run.ts --check     # FAIL (exit 1) if any metric drops >25% below baseline
bun bench/compile.bench.ts   # one bench, custom iterations:
bun bench/render.bench.ts 5000
bun run bench:check           # package script form
```

## The six metrics

| Metric | Bench | Baseline | What it measures |
|---|---|---|---|
| compile.pages_per_sec | compile.bench.ts | ~350 | compileSync throughput on a representative page (directives, state, interpolation, events, nesting) |
| render.miss_per_sec | render.bench.ts | ~365 | the FULL pipeline with unique cache keys per render -- every one a true MISS: match, key, render, store |
| render.hit_per_sec | render.bench.ts | ~98,700 | render() served from cache -- the payoff number (~270x MISS) |
| routes.matches_per_sec | routes.bench.ts | ~30,400 | matchRoute over a generated 1000-route tree (exact + dynamic [id] + catch-all [...rest]) |
| cache.resolve_per_sec | cache.bench.ts | ~616,600 | extractCacheDirective + resolveCache with profiles hoisted (the build-time hot path) |
| cache.inval_sweep_per_sec | cache.bench.ts | ~527,300 | revalidateTag sweeps over a populated render cache |

Every bench prints human lines plus machine lines:

```
compile: 2000 pages in 5604ms -> 357 pages/sec
RESULT compile.pages_per_sec 357
```

`run.ts` parses the `RESULT <metric> <value>` lines -- that is the entire
protocol. A bench without a RESULT line does not gate anything.

## Methodology

- **Isolation**: each bench builds its own fixture (mkdtemp; a 1000-route
  tree; a populated cache) and never touches shared state.
- **True-MISS honesty**: the render bench passes unique stateVars per
  iteration so every render has a unique canonical key. An earlier version
  labeled warm-cache renders as "MISS" -- that bug is fixed and documented
  here precisely because an honest bench is the whole point.
- **Hoisted setup**: cache.bench reads profiles ONCE (readCacheProfilesSync
  outside the loop). The first version re-read per iteration and measured
  ~4.4k ops/sec of filesystem, not the resolve path -- the fixed version
  measures 616k ops/sec. Lesson recorded: measure the path, not the setup.
- **Determinism**: benches avoid `bun test` entirely (the bunfig happy-dom
  preload changes timing and behavior); they are plain `bun file.ts` runs.

## The regression gate

`--check` loads bench/baselines.json and fails when any metric falls below
`baseline x 0.75`. The 25% tolerance is empirical: pod-to-pod noise across
five recorded runs stayed well inside it, while real regressions (the
profiles-per-iteration bug) blew far past it.

The gate runs in CI (`.github/workflows/ci.yml`, "Bench regression gate")
and in the master gate (`bun run verify`, step 5/6). It was proven live:
inflating a baseline to an impossible value produced exactly
`render.hit_per_sec FAIL ... 1 regression(s)` and exit 1.

### Changing baselines intentionally

Performance work that legitimately moves a number re-records in the SAME
change and says so in the description:

```sh
bun bench/run.ts --record   # after the change
```

A silent baseline bump is a review blocker (contributing/code-review.md).

## Interpreting results

- **compile ~350 pages/sec** sounds low and is fine: compile is build-time
  work, not request work. A site with 500 pages builds in ~90 seconds
  single-threaded, faster with the build's parallelism.
- **render HIT ~99k/sec** is the number that matters in production: one
  pod serves ~99k cached pages/sec -- horizontal scale starts where that
  is not enough.
- **MISS ~365/sec** is dominated by the full pipeline (compile+render+store
  with a cold key); it is the ceiling of a cold cache, not steady state.
- Comparisons across machines are meaningless; only compare against the
  baselines recorded on the same machine.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "no bench/baselines.json" | never recorded on this checkout | `bun bench/run.ts --record` once, commit it |
| A metric FAILs but code seems fine | pod noise near the tolerance, or a slow neighbor | re-run; if it fails twice, treat as real |
| A bench exits non-zero | fixture creation failed (disk, tmp) | check /scratch free space; /tmp is small (~64MB) on this pod |
| Numbers differ wildly between runs | something else is compiling | close other bun processes; benches are CPU-bound |
