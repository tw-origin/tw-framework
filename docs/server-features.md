# TW Framework — Server Features

This document covers one thing completely: what the production server does for every request — pages, static assets, caching, compression, and the request protections that are always on.

---

## tw serve

```bash
tw build
tw serve                      # http://0.0.0.0:8000
tw serve --port 8080
tw serve --host 127.0.0.1
```

The production server (Bun) serves the built output: pages, `.twm` API routes, middleware, and static assets — one process for the whole app.

---

## Port and Host Precedence

The server picks its port in this order:

```
--port flag   >   PORT environment variable   >   tw.config.ts port   >   8000
```

`PORT` support matters for deployment — Docker (`-e PORT=3000`), Railway, Render and most PaaS platforms inject the port through the environment, and the server must honour it. The same precedence applies to `tw dev` (default 3000).

---

## What Every Request Gets

### Clean URLs

`/about` and `/about/` both serve the `about` route. Trailing slashes do not fork your SEO.

### ETag and 304 responses

Static assets are fingerprinted with an `ETag`. When the browser sends `If-None-Match` with a matching tag, the server answers `304 Not Modified` — no body, no transfer cost.

### Gzip compression

Text assets (HTML, CSS, JS, JSON) are served gzipped to clients that accept it.

### Range requests

Binary assets (video, audio, large downloads) support `Range` headers — seeking works, partial downloads work.

### Immutable asset caching

Content-hashed files (`common.a82f31.css`, `c-<hash>.js`) are served with a long-lived `immutable` cache policy. Because the filename changes when the content changes, clients never need to revalidate them.

### SPA fallback

For client-side navigation, unknown extensions fall back to the app shell so the client router can resolve the route.

### HEAD requests

`HEAD` is answered like `GET`, minus the body.

---

## Static Assets

Files in `public/` are copied to the build output and served at the site root:

```text
public/
├── favicon.ico       →  /favicon.ico
├── logo.jpg          →  /logo.jpg
└── docs/handbook.pdf →  /docs/handbook.pdf
```

The compiled CSS and JS chunks under `.tw/` are served with the caching rules above.

---

## Request Body Cap

Route handlers (`route.twm`) read request bodies as JSON. Bodies over 10 MB are rejected with `413 Payload too large` before parsing — handlers never see them.

## Always-On Request Protection

The server hardens every request, independent of your middleware rules:

| Protection | Behaviour |
|------------|-----------|
| Source file blocklist | `.twm`, `.ts`, `.tsx`, `.env` and other server-side files are never served — they answer `404`, not their contents |
| Dotfile blocking | hidden files and directories are not served |
| Path traversal rejection | `/../` sequences and encoded traversal variants are rejected |
| Null byte rejection | `%00` in paths is rejected |
| URL normalization | `//admin` and other malformed-path bypass attempts are normalized before matching, so middleware patterns apply as intended |

These are server guarantees, not configuration — they protect a project that forgot to write a middleware rule for them.

---

## Request Processing Order

```
1. Request arrives
2. Server-level protections (traversal, null bytes, normalization)
3. middleware.twm rules (auth, rate limit, ...) — first match wins
4. Static asset?  → served with cache headers
5. .twm route?    → handler executes, JSON response
6. Page route?    → render pipeline (layouts + page + assets)
7. Nothing?      → 404
```

---

## Behind a Proxy

When running behind Nginx, a CDN or a load balancer, the server is an origin. Trust the proxy's headers at the proxy level; the app needs nothing special — it binds `0.0.0.0` and honours `PORT`.

Typical Docker / PaaS setup:

```bash
PORT=3000 tw serve
```

---

## Verifying Behaviour

```bash
tw build && tw serve --port 8123

curl -I localhost:8123/                      # Content-Type, ETag
curl -I localhost:8123/assets/common.*.css   # immutable cache headers
curl -sI -H "If-None-Match: <etag>" localhost:8123/   # 304
curl -s -o /dev/null -w "%{http_code}" localhost:8123/lib/db.ts   # 404
curl -s -o /dev/null -w "%{http_code}" "localhost:8123/../etc/passwd"  # rejected
```

---

## Node Adapter — Static Serving Without Bun

`tw adapter node` generates a zero-dependency Node 18+ server with the same feature set for static output — clean URLs, ETag/304, gzip, Range, SPA fallback, immutable caching and the security blocklist. When the full server (APIs, middleware) is needed, run `tw serve` on Bun or use the Bun adapter. See [Deployment Adapters](./deployment-adapters.md).

---

## Quick Reference

```bash
tw serve --port 8080
PORT=3000 tw serve
```

```
--port > PORT env > tw.config.ts > 8000
```

## Related

- [Build Output](./build-output.md)
- [Middleware](./middleware.md)
- [Deployment Adapters](./deployment-adapters.md)
- [Commands Reference](./commands-reference.md)
