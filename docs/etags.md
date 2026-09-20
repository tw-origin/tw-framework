# TW Framework — ETags and Conditional Requests

This document covers one thing completely: entity tags and conditional revalidation — how `tw serve` answers `If-None-Match` and `If-Modified-Since` with `304 Not Modified`. For byte-range requests, see doc 122.

---

## ETag Generation

Static files get a strong ETag derived from a SHA-256 of the file contents. Because the tag is content-addressed:

- A rebuilt file with identical bytes keeps its ETag — clients keep their cached copy.
- Any byte change produces a new tag — nobody keeps a stale copy.

Optimized images (doc 155) tag responses with their cache key, which includes the source's `mtime`, so replacing an image invalidates its variants in one step.

## Conditional Request Flow

```
GET /assets/app.js
If-None-Match: "a94a8fe5cc19b0b4"

HTTP/1.1 304 Not Modified
ETag: "a94a8fe5cc19b0b4"
```

1. Client sends its cached `ETag` in `If-None-Match`.
2. Server computes the current tag.
3. Match → `304 Not Modified` with the ETag header and NO body.
4. No match → full `200` response with fresh content.

The browser already has the bytes — a 304 costs one empty round trip instead of re-downloading the file.

## Last-Modified / If-Modified-Since

For clients that send `If-Modified-Since` instead, the server compares against the file's mtime; unchanged since that instant → `304`, changed → `200` with a new `Last-Modified` header.

`If-None-Match` wins when both are present — the spec's precedence rule — because content hashing is strictly stronger than timestamps.

## Cache-Control Interaction

304s only pay off when the response was cacheable in the first place:

```twm
// tw.config.ts
export default {
  headers: {
    "/assets/**": { "Cache-Control": "public, max-age=31536000, immutable" },
  },
}
```

- `max-age` fresh window: no request at all.
- After expiry: conditional request → likely 304.
- `immutable` fingerprinted assets: the browser may skip revalidation entirely.

## Verified Behavior

```bash
$ curl -s -D - -o /dev/null http://localhost:3000/assets/app.js | grep -i etag
ETag: "5d41402abc4b2a76b9719d911017c592"

$ curl -s -o /dev/null -w "%{http_code}\n" \
    -H 'If-None-Match: "5d41402abc4b2a76b9719d911017c592"' \
    http://localhost:3000/assets/app.js
304
```

## Writing Conditional Handling in Routes

For generated content in API routes, compute a tag from the entity version and answer conditional requests before serializing:

```twm
fn get(request) {
  const etag = "\"v" + getFeedVersion() + "\""
  if (request.headers.get("if-none-match") === etag) {
    return { status: 304, headers: { ETag: etag } }
  }
  return { status: 200, json: getFeed(), headers: { ETag: etag } }
}
```

Rule of thumb: hash the content (or a version monotonic with it) — never a wall-clock timestamp, which produces spurious 200s.
