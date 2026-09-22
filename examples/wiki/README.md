# Wiki -- Dynamic Slug Routes and Search

A tiny wiki: articles at /[slug] via dynamic segments, plus a search API
that filters by query. Dynamic routes make every article one file.

## What it teaches

- Dynamic [slug] page routes (one page.tw, infinite articles)
- A search API reading request.query.q
- Static + dynamic siblings in one build

```sh
tw build && (tw serve --port 8123 & sleep 2
curl -s http://127.0.0.1:8123/cache | grep -o "<h1>.*</h1>"
curl -s "http://127.0.0.1:8123/api/search?q=ca" ; kill %1)
```
