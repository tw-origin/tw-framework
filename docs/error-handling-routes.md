# TW Framework — Error Handling in Routes

This document covers one thing completely: what happens when a route handler fails, and how to return deliberate error responses.

---

## A Throwing Handler

When a handler throws — sync or async — the server answers:

```json
HTTP/1.1 500 Internal Server Error

{ "ok": false, "error": "Internal Server Error" }
```

The error details (message, stack) are written to the server log only. They are never included in the response — an exception mentioning a secret, a token or a file path cannot leak to the client.

```twm
fn get(request) {
  throw new Error("database password is hunter2")  // logged, not sent
}
```

The server keeps running; only that request gets the 500.

## Deliberate Error Responses

Return the status and body you want. The envelope has three slots:

```twm
fn get(request) {
  const user = findUser(request.params.id)

  if (!user) {
    return {
      status: 404,
      json: { ok: false, error: "User not found" }
    }
  }

  return { status: 200, json: { ok: true, user: user } }
}
```

| Field | Meaning |
|-------|---------|
| `status` | HTTP status code (number). Missing → 200 |
| `json` / `html` / `text` | the response body, one of them |
| `headers` | extra response headers |

A handler that returns nothing also answers 500 — a missing return is never a silent success.

## Validation Errors

Input problems are 4xx, not 5xx:

```twm
fn post(request) {
  const body = request.body ?? {}

  if (!body.email) {
    return { status: 400, json: { ok: false, error: "email is required" } }
  }
  if (body.email.indexOf("@") === -1) {
    return { status: 422, json: { ok: false, error: "email is invalid" } }
  }

  return { status: 201, json: { ok: true } }
}
```

## Body Size Errors

Request bodies over 10 MB are answered `413 Payload too large` before any handler runs — see [Request Body Limits](./body-limits.md).

## Related

- [Response Shapes](./response-shapes.md)
- [The Request Object](./request-object.md)
