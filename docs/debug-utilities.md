# TW Framework — Debug Utilities

This document covers one thing completely: the logging, measuring, and environment helpers exported by `@tw/runtime` — `debugLog`/`infoLog`/`warnLog`/`errorLog`, `measureTime`, `inspectObject`, and the `isDev`/`isProd` checks.

---

## Environment Checks

```twm
import { isDev, isProd } from "@tw/runtime"

if (isDev()) enableVerbosePanels()
if (isProd()) stripAnalyticsDoubleLoad()
```

Both also exist as getters on the debugger instance.

## Logging

Module-level helpers take a message and any number of data values:

```twm
import { debugLog, infoLog, warnLog, errorLog } from "@tw/runtime"

debugLog("cache revalidated", { key })   // dev-level detail
infoLog("server connected")
warnLog("slow response", { ms: 850 })
errorLog("render failed", err)
```

Each call is `(message, ...data)`. For scoped logging, get the debugger and tag it:

```twm
import { getDebugger } from "@tw/runtime"

const log = getDebugger().tag("payments")
log.info("charge settled", { id })
log.warn("retrying webhook", attempt)
```

## The Debugger

```twm
import { getDebugger } from "@tw/runtime"

const dbg = getDebugger()
```

| Member | Purpose |
|--------|---------|
| `trace/debug/info/warn/error/fatal(message, ...data)` | Leveled logging |
| `tag(name)` | A logger pre-scoped to one subsystem |
| `assert(condition, message?)` | Throws when the condition is falsy |
| `assertError(condition, error)` | Throws the given error object |
| `setFilter(string \| RegExp)` | Only log messages matching the filter |
| `inspect(obj, depth?)` | Structural dump, cycle-safe |
| `getMemoryUsage()` | Process memory when available |
| `isDev` / `isProd` (getters) | Environment checks |

Logs route through the debugger's output pipeline rather than printing unconditionally — production stays quiet while the level is set high.

## Measuring

```twm
import { measureTime, measureTimeAsync } from "@tw/runtime"

const syncResult = measureTime("sort-rows", () => rows.sort(compare))

const asyncResult = await measureTimeAsync("fetch-feed", async () => {
  return await fetchFeed()
})

console.log(syncResult.durationMs, asyncResult.durationMs)
```

Both return the function's result and record the duration (exposed on the measurement records the debugger keeps).

## assertCondition

```twm
import { assertCondition } from "@tw/runtime"

assertCondition(user != null, "user must be logged in")
```

Cheap invariant checks that stay readable — throws when the condition fails.

## inspectObject

```twm
import { inspectObject } from "@tw/runtime"

inspectObject(signalLike)    // readable structural dump — safe on cyclic refs
```

For debugging reactivity internals without `console.log` noise from getters.

## When to Use What

| Tool | Use |
|------|-----|
| `debugLog`/`infoLog`/`warnLog`/`errorLog` | Quick leveled messages |
| `getDebugger().tag("scope")` | Subsystem-scoped logging |
| `measureTime` / `measureTimeAsync` | Bottleneck hunting |
| `assertCondition` / `assert` | Invariants in setup paths |
| `inspectObject` / `inspect` | Safe structural dumps |
