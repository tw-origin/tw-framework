# Comments -- Posts, Writes, and Write-Driven Invalidation

A posts page cached under a tag, and a comment action whose result bumps
that tag: the write flow users actually build.

## What it teaches

- `cache { revalidate 60, tag "posts" }` on a list page
- A POST action returning `revalidateTag` -- the list refreshes on next read
- Module state as the store (with the path to a real one documented)

```sh
tw build && (tw serve --port 8123 & sleep 2
curl -sX POST -d "{'name':'mlkraj'}" http://127.0.0.1:8123/api/comment
curl -s http://127.0.0.1:8121/ | grep -c mlkraj; kill %1)
```
