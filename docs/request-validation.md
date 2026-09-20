# TW Framework — Request Validation

This document covers one thing completely: checking route input — body, query and params — before logic runs.

---

## The Contract

Handlers receive three kinds of external input:

| Source | Field | Type |
|--------|-------|------|
| JSON body | `request.body` | parsed object |
| query string | `request.query` | object of strings |
| path params | `request.params` | object of strings |

All of it is external. Validate shape first, values second.

## Schema Validation Middleware

The server ships a `validateBody(schema)` middleware factory. It inspects the parsed request body against the schema and answers `400` with the problem list when a field fails — the route never runs:

```ts
import { validateBody } from "@tw/server";

const checkUser = validateBody({
  email:    { type: "string", required: true, pattern: /@/ },
  quantity: { type: "number", min: 1, max: 100 },
});
```

| Schema field | Checks |
|--------------|--------|
| `type` | the field's expected type |
| `required` | the field must be present |
| `min` / `max` | numeric range (or length) bounds |
| `pattern` | a regular expression the value must match |

The middleware returns `(req, res, next)` — register it in the server's middleware pipeline ahead of the routes it guards (see [Middleware](./middleware.md)).

## Hand-Rolled Checks

For small handlers, direct checks are fine:

```twm
fn post(request) {
  const body = request.body ?? {}

  if (typeof body.quantity !== "number" || body.quantity < 1 || body.quantity > 100) {
    return { status: 422, json: { ok: false, error: "quantity must be 1-100" } }
  }

  return { status: 201, json: { ok: true } }
}
```

## Validation Status Codes

| Status | When |
|--------|------|
| `400` | the request cannot be parsed at all |
| `413` | the body crossed the size cap — see [Body Limits](./body-limits.md) |
| `422` | parsed, but a field failed validation |

## Keep It at the Edge

Validate at the handler boundary. Functions in `lib/` should receive data already checked — their signatures stay honest and their logic stays clean.

## Related

- [The Request Object](./request-object.md)
- [Form Validators](./form-validators.md)
