# TW Framework — CORS

This document covers one thing completely: controlling cross-origin access with the `origin` condition — both the deny side (blocking) and the allow side (letting browsers read responses).

---

## The Origin Rule

```twm
rule "api-cors" {
  match "/api/**"
  methods ["GET", "POST", "OPTIONS"]
  origin {
    allow ["https://myapp.com", "http://localhost:3000"]
    require true
    allow_referer true
  }
  response { status 403, json { error "Access Denied" } }
}
```

| Field | Meaning |
|-------|---------|
| `allow` | the exact origins that may call this app |
| `require` | a request with no `Origin` header is blocked when `true` |
| `allow_referer` | when no `Origin` header is present, fall back to matching the `Referer` header |

## What Happens on Each Request

| Request | Result |
|---------|--------|
| `Origin` in `allow` | request runs; response carries `Access-Control-Allow-Origin` |
| `Origin` not in `allow` | the rule's response is sent (403 in the example) |
| No `Origin`, `require true` | the rule's response is sent |
| No `Origin`, `require false` | request runs (same-origin tools like curl) |

## Preflight Requests

Browsers send an `OPTIONS` request with `Access-Control-Request-Method` before cross-origin calls that need it. The server answers `204 No Content` directly — the request never reaches the route — with:

- `Access-Control-Allow-Origin` — the matched origin
- `Access-Control-Allow-Methods` — the rule's `methods` list
- `Access-Control-Allow-Headers` — what the browser asked for
- `Access-Control-Max-Age: 600`

Every allowed-origin response also carries `Vary: Origin`, so caches keep responses per origin.

## Verifying Behaviour

```bash
# allowed origin gets the header
curl -s -D - -o /dev/null -H "Origin: https://myapp.com" localhost:8123/api

# preflight is answered, not routed
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
  -H "Origin: https://myapp.com" \
  -H "Access-Control-Request-Method: POST" localhost:8123/api

# disallowed origin is blocked
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" localhost:8123/api
```

## Related

- [Middleware](./middleware.md)
- [Security Headers](./security.md)
