# TW Framework — Scheduler

This document covers one thing completely: the runtime scheduler — when reactive work runs, and how to queue your own work into it.

---

## The API

| Function | Purpose |
|----------|---------|
| `schedule(fn, priority?, id?)` | queue work for the next flush — returns the job id |
| `cancel(id)` | remove queued work by its id |
| `flushSync()` | run everything queued, now, in priority order |
| `nextTick(fn)` | queue at low priority — after other work |
| `getStats()` | queue statistics (counts per priority) |

## Priorities

`"high"` \| `"normal"` (default) \| `"low"` — high runs first, low last:

```twm
import { schedule, flushSync, getStats } from "@tw/runtime"

schedule(() => console.log("low priority"), "low")
schedule(() => console.log("high priority"), "high")

flushSync()
// high priority
// low priority
```

## Batching

Multiple writes inside a scheduler pass coalesce — one notification round for the whole group, not one per write:

```twm
import { signal, batch } from "@tw/runtime"

const name = signal("")
schedule(() => console.log("render with", name.value))

batch(() => {
  name.value = "a"
  name.value = "ab"
})
// one scheduled job runs — with the final value "ab"
```

## When To Use It

- DOM updates triggered by signals — let the scheduler order them
- deferring non-urgent work: `nextTick(logAnalytics)`
- flushing synchronously for tests: `flushSync()` then assert

## What Not To Use It For

The scheduler orders already-queued work. It does not create threads or timers — schedule a `setTimeout` yourself when you need wall-clock delay.

## Related

- [Signals](./signals.md)
- [Client Runtime](./client-runtime.md)
