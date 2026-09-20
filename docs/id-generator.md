# TW Framework — ID Generation

This document covers one thing completely: the id utilities exported by `@tw/runtime` — `uuid`, `nanoId`, `ulid`, `snowflake`, `sequentialId`, `uniqueId`, and the registration helpers.

---

## One-Shot Generators

```twm
import { uuid, nanoId, ulid, snowflake, sequentialId, uniqueId } from "@tw/runtime"

uuid()                  // "9f2c1a4e-...." — crypto-backed random UUID
nanoId()                // "V1StGXR8_Z5jdHi6B-myT" (21 chars)
nanoId(10, "abcdef")    // custom size and alphabet
ulid()                  // "01ARZ3NDEKTSV4RRFFQ69G5FAV" — sortable by time
snowflake()             // 64-bit numeric id with embedded worker/time
sequentialId()          // "1", "2", "3" — process-local counter
uniqueId("row")         // "row-42" — labeled unique ids
```

| Generator | Best for |
|-----------|----------|
| `uuid()` | Keys shared with external systems |
| `nanoId(size?, alphabet?)` | Short, URL-safe ids |
| `ulid()` | Ids that sort chronologically as strings |
| `snowflake()` | High-volume, time-ordered numeric ids across workers |
| `sequentialId()` | Stable per-process ordering (tests, SSR lists) |
| `uniqueId(prefix)` | DOM-friendly labeled ids |

`uuid()` uses `crypto.randomUUID()` when available with a safe fallback.

## Distributed Snowflakes

Multi-process deployments must not mint colliding snowflakes:

```twm
import { setSnowflakeWorkerId } from "@tw/runtime"

setSnowflakeWorkerId(process.env.WORKER_ID ?? 0)   // unique per process/machine
```

## Reclaimable Ids

For long-running pages that churn ids (drag-drop keys, portal ids), register and release instead of generating forever:

```twm
import { registerId, releaseId, isIdUsed, clearRegisteredIds } from "@tw/runtime"

registerId("tooltip-1")
isIdUsed("tooltip-1")      // true
releaseId("tooltip-1")      // frees the name for reuse
clearRegisteredIds()        // test teardown
```

## Compact Hash Ids

Convert numbers to short strings and back:

```twm
import { encodeHashId, decodeHashId } from "@tw/runtime"

const code = encodeHashId(12345)     // short alphanumeric form
decodeHashId(code)                    // 12345
```

Useful for URL slugs backed by numeric database ids.

## Custom Generators

```twm
import { createIdGenerator } from "@tw/runtime"

const pageIds = createIdGenerator({ prefix: "p", size: 12 })
pageIds.next()            // "p-...."
```

## Choosing

- Deterministic, readable, per-render list keys → `sequentialId()` / `uniqueId(prefix)`
- Persisted entities → `uuid()` or `ulid()` (sortable)
- Very high rate generation → `snowflake()` with per-worker ids
- Anything user-visible in a URL → `nanoId()` or `encodeHashId`
