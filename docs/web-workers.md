# TW Framework — Web Workers

This document covers one thing completely: `createInlineWorker` — running a function on a background thread without a separate worker file.

---

## createInlineWorker

```twm
import { createInlineWorker } from "@tw/runtime"

const worker = createInlineWorker((data) => {
  // Runs on the worker thread -- must be self-contained.
  const results = []
  for (const item of data.items) {
    results.push(heavyTransform(item))
  }
  return results
})

worker.onmessage = (e) => renderResults(e.data)
worker.postMessage({ items: bigArray })
worker.terminate()        // stop the thread
```

The function body is serialized into the worker — everything it references must be defined inside it or passed through `postMessage`:

```twm
const worker = createInlineWorker((payload) => {
  const scale = payload.scale          // values IN via the message
  return payload.values.map(v => v * scale)   // values OUT via the return
})
```

## Message Protocol

- `worker.postMessage(value)` — one argument; the worker receives it as its parameter.
- The worker's RETURN value is delivered back as `worker.onmessage`'s `event.data`.
- Errors thrown inside the worker surface through `worker.onerror`.

```twm
worker.onerror = (e) => {
  console.error("worker failed:", e.message)
}
```

## What Belongs in a Worker

| Good | Bad |
|------|-----|
| Sorting/filtering 100k rows | Touching the DOM (impossible) |
| Image pixel loops | Code that needs closures over app state |
| Parsing/validating large files | Quick operations — thread hop costs more than it saves |
| Cryptographic bulk hashing | Anything requiring the `window` object |

## Combining with the Runtime

Workers pair with the animation loop for progress reporting:

```twm
import { createInlineWorker, addAnimationTask } from "@tw/runtime"

const worker = createInlineWorker((rows) => {
  let processed = 0
  const out = []
  for (const row of rows) {
    out.push(expensive(row))
    processed++
  }
  return out
})

worker.onmessage = (e) => stopSpinner(e.data)
worker.postMessage(rows)

addAnimationTask(() => updateProgressBar())   // UI stays at 60fps meanwhile
```

## Sizing Notes

- Each `createInlineWorker` call spawns a real thread — create them once per feature, not per request.
- Transferable objects (`ArrayBuffer`, `ImageBitmap`) post by reference — pass them to move megabytes cheaply.
- For a managed pool with queuing and concurrency control, use the Worker Pool (doc 145).
