# TW Framework — Health Checks

This document covers one thing completely: the `healthCheck` middleware — one URL that answers whether the process is alive.

---

## The Endpoint

`healthCheck(path)` returns a middleware that answers `200` with a JSON body on the given path — `/health` by default:

```twm
import { healthCheck } from "@tw/server"

const check = healthCheck("/health")
```

```bash
curl -s localhost:8000/health
# 200, application/json
```

## What It Is For

| Consumer | Use |
|----------|-----|
| load balancers | route traffic only to healthy instances |
| orchestrators (restart on failure) | process liveness |
| uptime monitors | external status |
| deploy pipelines | wait for the new instance before shifting traffic |

## Scope

The health check reports **process liveness** — the server is up and its loop is answering. It does not probe your database or third-party dependencies; a `503` from a dependency is a different signal from a dead process.

## Deep Checks

When you want dependency-aware status, write a route that checks what matters and reports per-dependency state — keep it separate from the liveness endpoint so a slow dependency does not cause restarts:

```twm
fn get(request) {
  const db = await pingDatabase()
  return { status: db ? 200 : 503, json: { db: db ? "up" : "down" } }
}
```

## Related

- [Self-Hosting Guide](./guide-self-hosted.md)
- [Server Features](./server-features.md)
