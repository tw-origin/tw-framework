# TW Framework — Gzip Compression

This document covers one thing completely: when the server compresses responses, and how to verify it.

---

## The Rule

A text response is compressed with gzip when all three hold:

1. the client sent `Accept-Encoding: gzip`
2. the content type is compressible — `text/*`, `application/javascript`, `application/json`, `application/xml`, `image/svg+xml`
3. the body is larger than 1 KB

```bash
curl -s -D - -o /dev/null -H "Accept-Encoding: gzip" localhost:8123/ | grep -i content-encoding
# content-encoding: gzip
```

Responses at or under 1 KB skip compression — the gzip header would cost more than it saves.

## What Gets Compressed

| Response | Compressed |
|----------|-----------|
| HTML pages (static and server-rendered) | yes, when over 1 KB |
| CSS and JavaScript | yes |
| JSON from route handlers | yes |
| images (JPEG, PNG, WebP, AVIF) | no — already compressed |
| `application/octet-stream` | no |

## Vary

Compressed responses carry `Vary: Accept-Encoding` so caches store the compressed and plain variants separately.

## Verifying

```bash
# compressed
curl -s -H "Accept-Encoding: gzip" -o /dev/null -w "%{size_download}\n" localhost:8123/

# uncompressed for comparison
curl -s -o /dev/null -w "%{size_download}\n" localhost:8123/
```

The first number should be clearly smaller for a real page.

## With Proxies

A reverse proxy in front of the app may compress too. Compress once — either the app or the proxy — and make sure the proxy passes `Accept-Encoding` through unmodified if you let the app do it.

## Related

- [Static Assets](./static-assets-public.md)
- [Performance Guide](./guide-performance.md)
