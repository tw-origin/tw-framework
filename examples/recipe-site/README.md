# Recipe Site -- Categories, Details, and a Mixed Build

A recipe site mixing static category pages with a dynamic detail route --
and a cached API for the weekly special.

## What it teaches

- Static categories + dynamic [id] detail pages in one build
- Cache on an SSR content page (the weekly special)
- Content modeling with routes (no database needed for the shape)

```sh
tw build && (tw serve --port 8123 & sleep 2
curl -s http://127.0.0.1:8123/chai | grep -o "<h1>.*</h1>"; kill %1)
```
