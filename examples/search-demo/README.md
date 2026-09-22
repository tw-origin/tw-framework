# Search Demo -- Query Strings and the Canonical Key

An island search box over a static catalog, plus a cached API that
answers the same query from cache -- and treats reordered query strings
as the SAME query.

## What it teaches

- request.query in handlers and in the cache key
- Canonical query order: ?q=chai&l=hi and ?l=hi&q=chai are one entry
- The island input pattern (client box, server answer)

```sh
tw build && (tw serve --port 8123 & sleep 2
curl -s "http://127.0.0.1:8123/api/search?q=chai"
curl -s "http://127.0.0.1:8123/api/search?q=chai"  # identical -- same key; kill %1)
```
