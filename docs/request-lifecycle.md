# TW Framework — Request Lifecycle

This document covers one thing completely: the ordered path every request takes through `tw serve` / `tw dev` — from raw URL to response bytes.

---

## The Pipeline

```
request
  │
  1. URL normalization          //admin  ->  /admin
  2. Plugins: routes + onRequest hooks
  3. tw.config redirects
  4. tw.config headers
  5. Body/middleware pipeline   (ctx-style: rate limit, compression, ...)
  6. Image handler              /_tw/img/*
  7. Static files               .tw output + public/
  8. API routes                home/api/*/route.twm
  9. middleware.twm             (site rules)
 10. Page render                home/page.tw  (layouts -> slots -> HTML)
  │
response  (+ config headers, security headers, ETag/304 handling in layers 6-7)
```

## 1. URL Normalization

The first act is a rewrite of the request URL: duplicate slashes collapse (`//admin` → `/admin`), and the rewritten URL is what every downstream layer sees. Path guards can be written as simple prefix checks without `//`-bypass worries.

## 2. Plugins

Plugin routes match exact method + path and can answer directly; `onRequest` hooks run for every request and may intercept with a Response. This is the earliest point your own code can answer.

## 3. Redirects

`tw.config.ts` redirects (doc 158) apply BEFORE routing — they beat pages, APIs, and static files. Valid statuses are 301/302/307/308 (anything else falls back to 301), and the query string is preserved onto the target unless the target carries its own.

## 4. Config Headers

Matching `headers` entries (doc 159) are collected now and stamped onto whatever response comes out at the end.

## 5. Middleware Pipeline

The ctx-style middleware chain runs: rate limiting answers 429 directly, compression negotiates encodings, the body parser (with streaming size limits, doc 78) prepares `req.body`.

## 6. Image Handler

`/_tw/img/*` requests are answered here — format negotiation, disk cache, ETag 304s, and the SSRF-guarded remote proxy (doc 155).

## 7. Static Files

Prebuilt pages and `public/` assets serve with MIME types, cache headers, and ETag/`If-Modified-Since` revalidation (doc 166). Server-only files (`.twm`, `lib/*.ts`, `middleware.twm`, `params.twm`, `.env`) are never served — a 404 regardless of existence.

## 8. API Routes

`/api/*` resolves to `home/api/**/route.twm` handlers — dynamic segments, catch-alls, and route groups all apply (docs/dynamic-routes.md, docs/catch-all-routes.md, docs/route-groups.md). Handlers may return the response envelope (status/json/html/text/headers, docs/response-shapes.md).

## 9. Site Middleware

`middleware.twm` rules (doc 32) — condition blocks like `user_agent`, `auth`, `rate_limit`, `origin`, `methods` — run against the pathname before page rendering.

## 10. Page Render

Finally the page pipeline: layout chain resolution, slot filling, and HTML emission with hydration markers. The response picks up the config headers collected in step 4 and security headers from the active profile (doc 37).

## Failure Shortcuts

| Layer | Short-circuit |
|-------|--------------|
| 2. Plugins | Hook/plugin Response |
| 3. Redirects | 301/302/307/308 + Location |
| 5. Middleware | 429 rate limit, 413 oversized body |
| 6. Images | 404/405/304 |
| 7. Static | 304 revalidation, 404 missing (with SPA fallback when enabled) |
| 8. APIs | Handler status |
| 9. Rules | Rule response (redirect/deny) |

Anything that falls through every layer answers 404 — the site's `not-found.tw` when one is defined (doc 86).
