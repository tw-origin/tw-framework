# TW Framework — Browser E2E Suite

This document covers one thing completely: `scripts/browser-e2e.mjs` — the end-to-end suite that boots a real app and drives it in a real Chromium browser.

---

## Running

```bash
bun scripts/browser-e2e.mjs
```

Environment overrides:

| Variable | Purpose |
|----------|---------|
| `TW_BIN` | CLI entry to test (default `apps/cli/tw/bin.ts`) |
| `BUN_BIN` | Runtime binary (default `bun`) |

The suite needs `playwright-core` and a headless Chromium build available to it (see the repo README for the pinned browser revision).

## What It Verifies

The script builds a fixture app, serves it with the real CLI, then drives the page in Chromium:

1. **SSR content present** — the initial HTML carries real markup, not a blank shell.
2. **Hydration works** — clicking the counter button updates the DOM through the hydrated client runtime.
3. **No page errors after hydration** — the console stays clean once the client bundle takes over.
4. **SPA navigation renders** — client-side routing moves to another page and paints its content.
5. **No full reload during SPA nav** — navigation happens without a new document (a marker survives the transition).

Output ends with `BROWSER E2E: ALL GREEN` when every check passes.

## Why It Exists

The unit suite (doc 39) covers functions; this suite proves the composition: compile → serve → hydrate → interact → navigate, in a real browser with real paint. It is the safety net for changes to the compiler, hydration runtime, and client bundle — the layers where a regression can pass every unit test and still ship a broken page.

## Interpreting Failures

| Failure | Likely layer |
|---------|--------------|
| SSR content missing | build/compiler output |
| Hydration click does nothing | client bundle or hydration runtime |
| Page errors after hydration | runtime mismatch with server markup |
| SPA nav renders wrong page | client router |
| Full reload during nav | link interception / directive wiring |

Run `bun test` first when this suite fails — a red unit suite usually explains the browser failure faster than the browser log.

## In CI

The suite is designed to run headless with no display; in containerized CI add a memory-unlimited ulimit if the runtime warns about its wasm allocator. The full CI pipeline wiring is documented in doc 163.
