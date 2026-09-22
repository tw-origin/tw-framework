# Redirects & Status Codes -- A Handler Gallery

One endpoint per interesting status: the redirect (302), the moved-on
(410), the teapot (418), and the validation rejection (422). Every
shape is verified live.

## What it teaches

- Returning non-200 statuses with bodies and headers
- The 302 + Location combination (flat route -- verified)
- Status semantics as an API design decision

```sh
tw build && (tw serve --port 8123 & sleep 2
curl -sI http://127.0.0.1:8123/api/moved | head -3
curl -s http://127.0.0.1:8123/api/teapot; kill %1)
```
