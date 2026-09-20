# TW Framework — Logging

This document covers one thing completely: `createLogger` — structured logs with levels, tags and context.

---

## Creating a Logger

```twm
import { createLogger } from "@tw/runtime"

const log = createLogger({ level: "info" })
```

## Logging

```twm
log.debug("cache warm", { keys: 12 })
log.info("server started", { port: 8000 })
log.warn("slow query", { ms: 890 })
log.error("route failed", { path: "/api/x", err: "timeout" })
```

Each call takes a message and an optional context object — structured fields, not interpolated strings.

## Levels

`debug` < `info` < `warn` < `error` — a logger at `info` drops `debug` lines. Run `debug` in development; ship `info` or above.

## Child Loggers

`child(tag, context)` derives a logger that adds its tag and fields to every line:

```twm
const payments = log.child("payments", { region: "in" })

payments.info("charge succeeded")   // [payments] charge succeeded {region: in}
```

One logger per subsystem — the tag tells you where a line came from.

## What to Log

| Event | Level |
|-------|-------|
| request failures (500s) | `error` — with path and error message |
| fallbacks and retries | `warn` |
| startup / shutdown / config | `info` |
| request tracing in dev | `debug` |

Log values, never secrets — tokens, cookies and keys stay out of the lines.

## Related

- [Error Handling in Routes](./error-handling-routes.md)
- [Troubleshooting Guide](./guide-troubleshooting.md)
