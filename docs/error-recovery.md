# TW Framework — Error Recovery

This document covers one thing completely: `withErrorRecovery`, `createErrorBoundary`, and `getErrorRecovery` — automatic retries and fallback rendering for failing async work.

---

## withErrorRecovery

Wraps an async operation with per-component retry policy:

```twm
import { withErrorRecovery } from "@tw/runtime"

const data = await withErrorRecovery(
  "user-profile",                       // component id for the recovery registry
  () => fetchProfile(userId),           // the failing operation
  {
    maxRetries: 3,
    retryDelay: 500,                    // ms before the first retry
    backoffMultiplier: 2,               // 500 -> 1000 -> 2000
    onRetry: (attempt) => console.log("retry", attempt),
    onMaxRetriesExceeded: (error) => reportFatal(error),
    onError: (error, context) => logError(context.componentId, error),
  },
)
```

Each retry waits `retryDelay * backoffMultiplier^attempt` milliseconds. When retries run out, the last error is rethrown (or delivered to `onMaxRetriesExceeded` when set).

## ErrorRecoveryOptions

| Option | Default | Meaning |
|--------|---------|---------|
| `maxRetries` | `3` | Retry attempts before giving up |
| `retryDelay` | `500` | Base delay in ms |
| `backoffMultiplier` | `2` | Delay growth per attempt |
| `fallback` | `null` | VNode rendered instead of throwing |
| `onError` | — | `(error, context)` — every failure |
| `onRetry` | — | `(attempt)` — before each retry |
| `onMaxRetriesExceeded` | — | Final failure hook |
| `reportErrors` | `false` | Enable remote reporting |
| `reportUrl` | — | Where error reports are POSTed |

## createErrorBoundary

A render-time boundary that catches child render errors and swaps in a fallback:

```twm
import { createErrorBoundary, createVNode } from "@tw/runtime"

const boundary = createErrorBoundary(
  createVNode("p", { class: "error" }, ["Something broke — try refreshing."]),  // fallback VNode
  (error) => console.error("caught:", error),
)
```

`createErrorBoundary(fallback, onError?)` — `fallback` is a VNode (or `null` to render nothing) and `onError` receives every caught error.

## The Recovery Manager

`getErrorRecovery()` exposes the registry `withErrorRecovery` uses — track retry state across components:

```twm
import { getErrorRecovery } from "@tw/runtime"

const manager = getErrorRecovery()
const handle = manager.register("user-profile", { maxRetries: 5 })
// handle: RecoveryHandle — { retry(fn), reset(), release() }
```

| Method | Purpose |
|--------|---------|
| `register(componentId, options?)` | Create/reuse a `RecoveryHandle` for that id |
| `handle.retry(fn)` | Run `fn` under the handle's retry policy |
| `handle.reset()` | Clear attempt counters |
| `handle.release()` | Drop the handle from the registry |

## ErrorContext

`onError` receives an `ErrorContext` describing where and when the failure happened — including the `componentId` registered with the manager — enough to route errors to the right owner.

## Choosing the Tool

- Failing fetches, flaky storage, anything transient → `withErrorRecovery`
- Render-time errors in a subtree → `createErrorBoundary` (or the `ErrorBoundary` component; see doc 91)
- Cross-cutting retry policy and telemetry → `getErrorRecovery()` registry

All three interoperate: a boundary can catch what recovery rethrows, and the manager keeps the counters either way.
