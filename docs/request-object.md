# TW Framework — The Request Object

This document covers one thing completely: the `request` value passed to route handlers and middleware — every field on it.

---

## The Shape

```twm
fn get(request) {
  return { status: 200, json: { ok: true } }
}
```

| Field | Type | What it holds |
|-------|------|---------------|
| `request.method` | string | `"GET"`, `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"`, `"HEAD"`, `"OPTIONS"` |
| `request.url` | string | the full URL of the request |
| `request.headers` | object | lowercased request headers — `request.headers["content-type"]` |
| `request.query` | object | parsed query string, string values |
| `request.params` | object | route params by name — `request.params.id` |
| `request.body` | object | parsed JSON body (`null` when absent) |

## Reading Headers

Header names are lowercased:

```twm
const ua = request.headers["user-agent"] ?? ""
const auth = request.headers["authorization"] ?? ""
```

## Reading Params

For `home/user/[id]/page.tw`'s API sibling, `/user/42` gives `{ id: "42" }`. Params are strings — cast numbers explicitly:

```twm
const id = Number(request.params.id)
```

## Reading the Body

For `POST`/`PUT`/`PATCH` with a JSON content type, the parsed body arrives on `request.body`. A missing or unparsable body is `null` — read defensively:

```twm
const body = request.body ?? {}
```

## Method Dispatch

Handlers are dispatched by verb — `fn get`, `fn post`, `fn put`, `fn patch`, `fn delete` in one `route.twm`, or the exported `export function get/post/...` forms. A verb with no handler answers `405 Method Not Allowed`.

## What It Is Not

The request object is plain data. It carries no server internals and no connection handle — handlers stay testable with a literal object.

## Related

- [Response Shapes](./response-shapes.md)
- [Query Parameters](./query-params.md)
