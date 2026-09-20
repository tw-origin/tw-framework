# TW Framework — Request Body Limits

This document covers one thing completely: the size limits on incoming request bodies, and what happens when they are crossed.

---

## JSON Bodies: 10 MB

Route handlers read bodies as JSON. A request whose `Content-Length` is over 10 MB is answered before parsing:

```json
HTTP/1.1 413 Payload too large

{ "ok": false, "error": "Payload too large" }
```

The body is never read into memory. The handler never runs. The limit is per request.

```bash
head -c 11534336 /dev/zero | tr '\0' 'a' > /tmp/huge.txt
curl -s -o /dev/null -w "%{http_code}\n" -X POST --data-binary @/tmp/huge.txt localhost:8123/api/echo
# 413
```

## Designing Around the Cap

Route handlers are for JSON. For larger payloads, split the upload into chunks, or pre-process large files before they hit the app (upload directly to object storage from the client, then pass the URL to a route).

## Multipart Limits

The multipart body parser has its own per-part limits:

| Limit | Default |
|-------|---------|
| total body | 1 MB |
| field size | 1 KB |
| file size | 1 MB |
| number of fields | 10 |
| number of files | 5 |

## Status Codes for Size Problems

| Status | Meaning |
|--------|---------|
| `413` | the body crossed the cap — rejected before parsing |
| `400` | the body was within the cap but could not be parsed (invalid JSON) |

## Related

- [The Request Object](./request-object.md)
- [Error Handling in Routes](./error-handling-routes.md)
