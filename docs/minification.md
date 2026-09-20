# TW Framework — Minification

This document covers one thing completely: shrinking compiled output — what minifies, when, and how to check the result.

---

## What Is Minified

The client build pipeline minifies compiled JavaScript chunks — page chunks (`p-*.js`) and client module chunks (`c-*.js`) — before they are written into `.tw/`:

| Transformation | Effect |
|---------------|--------|
| whitespace and comments removed | smaller files |
| identifiers shortened where safe | smaller files |
| dead branches already removed by the optimizer | fewer bytes to minify |

```bash
tw build
# .tw/chunks/c-*.js — minified, content-hashed
```

## What Is Not Minified

- HTML output — served as compiled
- CSS — emitted per route, hashed, already compacted by its own pipeline
- route handler code on the server — never shipped to the browser, so its size does not affect page weight

## HTML and CSS Size

Markup size comes from what you write — see [Performance Guide](./guide-performance.md) for keeping trees small. CSS is route-split and hashed for caching; see [Production CSS](./production-css.md).

## Verifying

```bash
ls -la .tw/chunks/        # chunk sizes
curl -s -o /dev/null -w "%{size_download}\n" localhost:8123/
```

The gzip pipeline (see [Gzip](./gzip.md)) compresses text responses over 1 KB on the wire, so minified bytes stay compressed in transit too.

## Related

- [Code Splitting](./code-splitting.md)
- [Gzip](./gzip.md)
