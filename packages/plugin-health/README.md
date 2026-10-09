# @tw/plugin-health

Official TW Framework plugin — health and readiness endpoints for load
balancers, container orchestrators and uptime monitors.

```
GET /health   liveness  — the process is up (always cheap)
GET /readyz   readiness — every check passes; 503 when one does not
```

## Install

```bash
tw plugin install @tw/plugin-health
```

```ts
// tw.config.ts
export default {
  plugins: [
    {
      name: "@tw/plugin-health",
      options: {
        version: "2.0.0",
        checks: [
          { name: "db", run: async () => { await db.ping(); } },
        ],
      },
    },
  ],
};
```

## What you get

`GET /health`

```json
{ "status": "ok", "uptime": 42, "checks": [], "details": { "pid": 8123, "memory": 58, "node": "v22.4.0" } }
```

`GET /readyz` — runs every check:

```json
{
  "status": "ok",
  "uptime": 42,
  "checks": [ { "name": "db", "ok": true, "ms": 3 } ],
  "details": { "pid": 8123, "memory": 58, "node": "v22.4.0" }
}
```

When a check throws, the status is `error` and the response is **503**, so an
orchestrator stops sending traffic:

```json
{ "status": "error", "checks": [ { "name": "db", "ok": false, "ms": 2001, "error": "timed out after 2000ms" } ] }
```

## Options

| Option | Default | Meaning |
|--------|---------|---------|
| `path` | `"/health"` | Liveness path. |
| `readyPath` | `"/readyz"` | Readiness path. |
| `aliases` | `[]` | Extra liveness paths, e.g. `["/healthz"]`. |
| `checks` | `[]` | Readiness checks — `{ name, run, timeoutMs? }`. |
| `details` | `true` | Include pid, memory and node version. |
| `version` | — | A `version` field in the body. |

### Writing a check

A check is `{ name, run }`. `run` may be sync or async; **throw** to fail it.

```ts
checks: [
  { name: "db",    run: async () => { await db.ping(); } },
  { name: "cache", run: () => { if (!cache.ready) throw new Error("cache down"); }, timeoutMs: 500 },
]
```

A check that never settles is failed at `timeoutMs` (default 2000), so a hung
dependency cannot hang the health endpoint.

## Why liveness is separate

Liveness must stay cheap — an orchestrator polls it often, and a liveness probe
that depends on the database would restart a healthy instance whenever the
database blips. `/health` therefore reports the process only; `/readyz` runs the
real checks.

## License

MIT
