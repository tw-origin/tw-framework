# TW Framework — Response Shapes

This document covers one thing completely: what a route handler returns — every slot of the response envelope, and every shortcut form.

---

## The Envelope

```twm
fn get(request) {
  return {
    status: 201,
    json: { ok: true, id: 42 },
    headers: {
      "Location": "/things/42",
      "X-Rate-Limit": "59"
    }
  }
}
```

| Field | Type | Meaning | Default |
|-------|------|---------|---------|
| `status` | number | HTTP status code | `200` |
| `json` | object | body serialized as JSON | — |
| `html` | string | body sent as `text/html` | — |
| `text` | string | body sent as `text/plain` | — |
| `headers` | object | extra response headers | — |

Pick **one** body field — `json`, `html` or `text`. The content type is set from your choice.

## JSON Responses

The default for API routes:

```twm
fn get(request) {
  return { status: 200, json: { ok: true, items: [1, 2, 3] } }
}
```

## HTML and Text

```twm
fn get(request) {
  return { status: 200, html: "<h1>Report</h1><p>done</p>" }
}

fn get(request) {
  return { status: 200, text: "OK" }
}
```

## Redirects From Handlers

Set the status and the location together:

```twm
fn post(request) {
  return {
    status: 303,
    headers: { "Location": "/dashboard" },
    text: ""
  }
}
```

For path-level redirects configured once, `redirects` in `tw.config.ts` is the declarative option — see [Configuration](./configuration.md).

## Set-Cookie

Cookies are headers — see [Cookies](./cookies.md) for full patterns.

## Not a Return-Value-Free Zone

A handler that returns nothing answers `500` — the missing return is treated as a failure, not an implicit `200`. Throwing also answers `500` without leaking internals — see [Error Handling](./error-handling-routes.md).

## Related

- [The Request Object](./request-object.md)
- [Error Handling in Routes](./error-handling-routes.md)
