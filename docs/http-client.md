# TW Framework — HTTP Client

This document covers one thing completely: the `HttpClient` instance from `getHttpClient()` — interceptors, retries, timeouts, and the GET response cache.

---

## The Client

```twm
import { getHttpClient, setBaseURL } from "@tw/runtime"

setBaseURL("https://api.example.com")
const client = getHttpClient()          // shared singleton
```

## Requests

```twm
const res = await client.get("/users", {
  params: { page: 2, limit: 50 },       // appended as the query string
  timeout: 5000,                        // ms
  headers: { Authorization: "Bearer " + token },
})

res.data            // parsed JSON body (or text)
res.status          // 200
res.statusText      // "OK"
res.headers         // Headers
res.ok              // boolean
```

| Method | Call |
|--------|------|
| GET | `client.get(url, config?)` |
| POST | `client.post(url, body, config?)` |
| PUT | `client.put(url, body, config?)` |
| DELETE | `client.delete(url, config?)` |

## FetchOptions

Every request accepts:

| Option | Meaning |
|--------|---------|
| `params` | Query string object |
| `timeout` | Abort after N ms (default 30000) |
| `retries` | Retry attempts for network/5xx failures (default 0) |
| `retryDelay` | Base delay between retries (ms) |
| `retryOn` | Status codes worth retrying, e.g. `[502, 503]` |
| `cache` / `cacheTTL` | Enable GET caching and set its TTL |
| `dedup` | Collapse identical in-flight requests into one |
| `baseURL` | Per-request base URL override |
| `interceptors` | Skip global interceptors when `false` |

Plus every standard `RequestInit` field (`headers`, `credentials`, `signal`, ...).

## The GET Cache

GET responses can be cached client-side:

```twm
const a = await client.get("/search", { params: { q: "cats" }, cache: true, cacheTtl: 60000 })
const b = await client.get("/search", { params: { q: "cats" } })   // served from cache
```

The cache key is the FULL URL — path plus query params — so `/search?q=cats` and `/search?q=dogs` never share an entry. `clearCache()` wipes it.

## Interceptors

Attach request/response/error hooks globally:

```twm
client.use({
  request: (config) => {
    config.headers["Authorization"] = "Bearer " + getToken()
    return config
  },
  response: (response) => {
    if (response.status === 401) refreshSession()
    return response
  },
  error: (error) => {
    reportToTelemetry(error)
    return error
  },
})
```

- `request` runs before the fetch — mutate and return the config.
- `response` runs on every successful response — return (possibly transformed) response.
- `error` runs on network failures and aborted requests — return the error for the caller.

## Errors

Failures resolve into an `HttpError` carrying `status`, `code` (`"TIMEOUT"`, `"NETWORK_ERROR"`, ...), and the originating `config`:

```twm
try {
  await client.get("/orders", { retries: 2, retryOn: [503] })
} catch (err) {
  if (err.code === "TIMEOUT") toastWarning("Server is busy — try again")
}
```

## Shorthand Helpers

For code that does not need the client instance:

```twm
import { httpGet, httpPost, httpPut, httpDelete, uploadFile } from "@tw/runtime"

await httpGet("/users")
await httpPost("/users", { name: "Asha" })
await httpPut("/users/7", { name: "Asha R." })
await httpDelete("/users/7")
await uploadFile("/upload", fileInput.files[0])
```

All shorthands use the same singleton, so interceptors, retries, and `setBaseURL` apply to them too.
