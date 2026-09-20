# TW Framework — Range Requests

This document covers one thing completely: the `Range` header — serving part of a file, for seeking and resumable downloads.

---

## The Header

A client asks for a byte range instead of the whole file:

```http
GET /videos/demo.mp4
Range: bytes=1000000-
```

The `rangeRequest()` middleware handles the header when present and passes the request through when absent:

```twm
import { rangeRequest } from "@tw/server"
```

## The Response

A ranged answer carries:

| Piece | Value |
|-------|-------|
| status | `206 Partial Content` |
| `Content-Range` | `bytes 1000000-1234567/1234568` — served range / total size |
| `Content-Length` | exactly the bytes served |

A range past the end answers `416 Range Not Satisfiable`. A request with no `Range` header is served whole with `200` and `Accept-Ranges: bytes`.

## Why It Matters

| Consumer | Behaviour without ranges |
|----------|--------------------------|
| video/audio seeking | every scrub re-downloads from byte 0 |
| download resume | a dropped connection restarts the file |
| PDF preview in browsers | slow full-file loads |

Media serving is the canonical case — seeking jumps to the requested byte window instead of waiting for the stream.

## Verifying

```bash
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" \
  -H "Range: bytes=0-99" localhost:8123/video/demo.mp4
# 206 100
```

## Related

- [Static Assets](./static-assets-public.md)
- [Server Features](./server-features.md)
