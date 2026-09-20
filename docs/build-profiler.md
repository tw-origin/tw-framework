# TW Framework — Build Profiler

This document covers one thing completely: the build profiler — timing each phase of `tw build`.

---

## Running It

```bash
tw build --profile
```

After the build summary, a stage-by-stage report is printed:

```text
+- TW Build Report -----------------------------+
| Total: 152.8ms
|
| Stages:
|   styles                    0.5ms
|   scan                     45.0ms ??????
|   compile                  80.9ms ???????????
|   emit                     17.6ms ??
|   css                       8.8ms ?
```

| Stage | Work |
|-------|------|
| styles | loading global `.tss` / SCSS sources |
| scan | walking the tree, scanning components |
| compile | `.tw` pages to HTML + client chunks |
| emit | copying routes, `lib/`, `public/`, middleware |
| css | route-split CSS assets and page linking |

A build that suddenly doubled in time points at the stage that grew. Run it without `--profile` and no report is printed — production builds stay clean.

## Using It

1. Run the build with profiling on.
2. Read the phase table.
3. Attack the slowest phase:

| Slow phase | Usual fix |
|------------|-----------|
| scan | fewer files in the tree, drop unused public assets |
| compile | large pages — split into components |
| styles | oversized `.tss` imports, remove dead rules |
| chunks | many distinct npm imports — share or trim |

## In CI

Profiling in CI gives you a time series of build performance — a regression shows up as a step change in the phase timings, not as a vague "the build feels slower".

## Related

- [Build Output](./build-output.md)
- [Performance Guide](./guide-performance.md)
