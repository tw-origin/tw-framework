# TW Framework — Rate Limiting

This document covers one thing completely: capping how often a client may make requests — per path in middleware rules, and per server instance in configuration.

---

## Per-Path Limits in Middleware

The `rate_limit` condition counts requests in a fixed window. When the count crosses the limit, the rule's response is sent instead of the route:

```twm
rule "api-limit" {
  match "/api/**"
  rate_limit { requests 60, window 60, identity "path" }
  response { status 429, json { error "Too many requests" } }
}
```

| Field | Meaning |
|-------|---------|
| `requests` | allowed requests per window (default 60) |
| `window` | window length in seconds (default 60) |
| `identity` | what the counter keys on — `"path"` (default) counts per route path, `"ip"` counts per client (`x-forwarded-for`) |

Counters are in-memory fixed windows. The window starts with the first request; after it expires, the count resets.

## Instance-Wide Limits in Configuration

`tw.config.ts` applies one limit to every request, independent of middleware rules:

```ts
export default {
  rateLimit: { max: 100, windowMs: 60_000 }, // 100 requests per minute per IP
};
```

Over the limit, `tw serve` answers `429 Too Many Requests` with a `Retry-After` header (seconds until the window resets) instead of running the route.

## Choosing Where to Limit

| Need | Use |
|-----|-----|
| Protect one API family | middleware `rate_limit` rule with `match "/api/**"` |
| Protect the whole instance | `rateLimit` in `tw.config.ts` |
| Shared limit across instances | a rate-limiting proxy in front — see [Scaling](./guide-self-hosted.md) |

## Verifying Behaviour

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0" localhost:8123/api
done
# 200 ... 200, then 429 once the limit is crossed
```

## Related

- [Middleware](./middleware.md)
- [Configuration](./configuration.md)
