# Docs Site -- Static Documentation with Sidebar Navigation

A multi-page static documentation site: sidebar navigation, nested topic
routes, and zero request-time work. Every page is frozen at build time.

## What it teaches

- Multi-level static routing (`/guide`, `/guide/syntax`, `/api/pages`)
- Sidebar navigation across siblings
- `render static` as the default for content that never changes per request

## Try it

```sh
tw build && (tw serve --port 8123 & sleep 2; curl -s http://127.0.0.1:8123/guide | grep -o "<title>.*</title>"; kill %1)
```

Ten exercises, FAQ, and the full file walkthrough live in the file listing
below. Part of the TW example matrix (examples/README.md).
