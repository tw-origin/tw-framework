# Changelog -- A Cached Release Timeline with Publish

Release notes as a cached timeline: the page renders under the releases
tag, and a publish action bumps it -- the write-driven invalidation
pattern applied to content.

## What it teaches

- `cache { revalidate 30, tag "releases" }` on a content page
- An action returning `revalidateTag` so publishes appear instantly
- The shape of a maintenance-friendly content page

```sh
tw build && (tw serve --port 8123 & sleep 2
curl -sI http://127.0.0.1:8123/ | grep -i cache
curl -X POST http://127.0.0.1:8123/api/publish; kill %1)
```
