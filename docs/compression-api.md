# TW Framework — Compression API

This document covers one thing completely: `compress`, `decompress`, and `negotiateEncoding` — the direct compression primitives from `@tw/server`. For response-compression middleware behavior, see doc 116.

---

## compress

```twm
import { compress } from "@tw/server"

const gz = await compress(data, "gzip", { level: 6 })
const df = await compress(data, "deflate", { level: 9 })
```

| Parameter | Values |
|-----------|--------|
| data | `Uint8Array` (or string) |
| encoding | `"gzip" \| "deflate" \| "brotli"` |
| options.level | 0–9 compression level (default 6) |

`compress` uses the runtime's fastest path: Bun's native `gzipSync`/`deflateSync` when available, Node `zlib` otherwise, and returns the input unchanged when neither can run.

## decompress

```twm
import { decompress } from "@tw/server"

const original = await decompress(gz, "gzip")
```

Accepts `"gzip" | "deflate" | "brotli"`. On failure it falls through and returns the input bytes — callers that must distinguish failure should wrap their own size/validation checks around the result.

Only decompress data from a trusted source: the routine buffers the entire output. Compressed payloads that arrive over the network belong to the request pipeline's body limits (doc 78), not this raw helper.

## negotiateEncoding

```twm
import { negotiateEncoding } from "@tw/server"

negotiateEncoding("gzip, deflate, br")     // "brotli" — preferred first
negotiateEncoding("gzip, deflate")          // "gzip"
negotiateEncoding("deflate")                // "deflate"
negotiateEncoding("identity")               // null — nothing usable
```

Parses an `Accept-Encoding` header and picks the best encoding the platform supports: **brotli > gzip > deflate**; `null` when the client accepts none of them.

| Client header | Result |
|---------------|--------|
| `*` / missing q-values | highest available |
| `gzip;q=0` (excluded) | not selected |
| unsupported names | skipped silently |

## Typical Pipeline

```twm
const encoding = negotiateEncoding(req.headers.get("accept-encoding") ?? "")
if (encoding) {
  const body = await compress(payload, encoding, { level: 6 })
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Encoding": encoding,
      "Vary": "Accept-Encoding",
    },
  })
}
return new Response(payload)
```

The `Vary: Accept-Encoding` header is required whenever the body depends on `Accept-Encoding` — caches must not reuse a compressed variant for a client that did not ask for it.
