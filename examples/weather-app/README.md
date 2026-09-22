# Weather App -- Cached Lookups Keyed by Query

A weather display whose API is cached per city: the query string is part
of the canonical cache key, so /api/weather?city=delhi and
?city=mumbai are separate entries.

## What it teaches

- `fn cached` with the query in the key (per-city entries)
- Why `?a=1&b=2` and `?b=2&a=1` hit the SAME entry (canonicalization)
- TW093 in practice: the handler uses a derived value, not Date.now

```sh
tw build && (tw serve --port 8123 & sleep 2
curl -s "http://127.0.0.1:8123/api/weather?city=delhi"
curl -s "http://127.0.0.1:8123/api/weather?city=delhi"  # frozen -- cached
kill %1)
```
