# TW Framework — Optimization Passes

This document covers one thing completely: the compiler's code optimization passes — what runs on your compiled code before it is emitted.

---

## The Passes

| Pass | What it does |
|------|---------------|
| constant folding | computes constant expressions at build time (`2 * 3` becomes `6`) |
| dead code elimination | removes branches that cannot run and code with no effect |
| function inliner | inlines small single-use functions at their call sites |
| tree shaking | drops unreferenced exports from module chunks |

## Constant Folding

```twm
// source
const max = 60 * 60 * 24

// emitted
const max = 86400
```

Anything computable at build time is computed at build time.

## Dead Code Elimination

```twm
const DEBUG = false

if (DEBUG) {
  console.log("verbose tracing")   // removed — cannot run
}
```

Code behind a false constant never reaches the chunk. Unused assignments and expression statements without effect are dropped the same way.

## Function Inlining

A small function called once is folded into its caller — one less call frame, and often the arguments fold too, feeding constant folding again.

## Where They Run

The passes run over compiled output before minification ([Minification](./minification.md)) — so the minifier works on already-trimmed code. Together they are why small pages compile to small chunks.

## Safety

Each pass preserves observable behaviour. A pass that cannot prove a transformation safe skips the code — optimizations never change what your program does.

## Related

- [Tree Shaking](./tree-shaking.md)
- [Build Profiler](./build-profiler.md)
