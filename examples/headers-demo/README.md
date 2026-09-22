# Headers Demo -- What Your Responses Carry

A page and an API that make response headers visible: the security
headers the server adds by default, and the custom headers a handler
can attach.

## What it teaches

- The default security headers (inspect with curl -I)
- Custom headers from a handler result
- Where Cache-Control comes from on a cached page (the stale window)

```sh
tw build && (tw serve --port 8123 & sleep 2
curl -sI http://127.0.0.1:8123/ | head -12
curl -sI http://127.0.0.1:8123/api/info | grep -i x-tw; kill %1)
```
