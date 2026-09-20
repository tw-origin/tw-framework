# TW Framework — Worker Pool

This document covers one thing completely: `createWorkerPool` and `getWorkerPool` — a queued, bounded pool of worker threads with priorities, progress, retries, and timeouts.

---

## createWorkerPool

```twm
import { createWorkerPool } from "@tw/runtime"

const pool = createWorkerPool("image-jobs", {
  size: 4,                  // concurrent workers
  workerScript: "/workers/process.js",   // OR
  workerFn: () => new Worker("/workers/process.js"),
  warmup: true,             // start threads immediately, not on first task
  maxRetries: 2,             // retry a task on worker error
  taskTimeout: 30000,        // ms before a stuck task is rejected
})
```

Pools are named — `getWorkerPool("image-jobs")` retrieves the same instance from anywhere.

| Option | Default | Meaning |
|--------|---------|---------|
| `size` | `4` | Worker threads in the pool |
| `workerScript` / `workerFn` | — | How workers are created (one required) |
| `warmup` | `false` | Spawn all workers up front |
| `maxRetries` | `0` | Per-task retry attempts |
| `taskTimeout` | — | Reject tasks that run longer |

## Submitting Tasks

```twm
const result = await pool.run(imageBytes, {
  priority: 10,               // lower runs first (default 0)
  transfer: [imageBytes.buffer],   // zero-copy transfer
  onProgress: (p) => setProgress(p),   // worker-reported progress, 0..1
})
```

`pool.run(data, options?)` returns a promise for the worker's result. Tasks beyond the pool's concurrency wait in a priority queue — submission never blocks.

## Priorities

```twm
pool.run(batch, { priority: -5 })   // jumps the queue
pool.run(reports, { priority: 10 })  // background — runs last
```

Ties preserve submission order (FIFO within a priority).

## Progress Reporting

Workers that post `{ progress: 0.5 }`-shaped updates feed `onProgress` live:

```twm
await pool.run(file, {
  onProgress: (p) => progressBar.set(Math.round(p * 100)),
})
```

## Retries and Timeouts

- A worker that throws makes the task retry up to `maxRetries` times before the promise rejects.
- `taskTimeout` rejects the promise (and recycles the worker) when a task exceeds its budget — one stuck job can't stall the pool.

## Teardown

```twm
import { terminateAllPools } from "@tw/runtime"

pool.terminate()        // one pool
terminateAllPools()      // every registered pool (page teardown)
```

## Pool vs Inline Worker

- One-off computation, no file → `createInlineWorker` (doc 145)
- Continuous jobs, queueing, priorities, several files/threads → worker pool

Keep `size` near the number of CPU cores; larger pools only add contention.
