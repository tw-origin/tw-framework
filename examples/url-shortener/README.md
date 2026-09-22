# URL Shortener -- Redirects, Query Handling, Module State

A short-link API: POST creates a code, GET /api/short?code=... redirects
(302) via the verified flat-route pattern, and a landing page explains it.

## What it teaches

- Returning a 302 with a Location header from a handler
- Reading request.query (and request.params on dynamic routes)
- Module-level state in a .twm file (the link store)

## One honest quirk (verified live)

A redirect returned from a DYNAMIC [param] route serializes as a 200
JSON response; from a flat route it is a proper 302. This example uses
the flat pattern: GET /api/short?code=xyz. Do not "fix" this example by
moving the handler into a [code] directory without testing the redirect
shape first.

```sh
tw build && (tw serve --port 8123 & sleep 2
curl -sI "http://127.0.0.1:8123/api/short?code=tw" | head -3; kill %1)
```
