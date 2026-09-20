# TW Framework — Query Parameters

This document covers one thing completely: reading query parameters (`?key=value`) on the server — in route handlers and middleware rules.

---

## Reading Query Parameters in a Route Handler

Every handler receives the request object with a parsed `query` field:

```twm
fn get(request) {
  const page = request.query.page ?? "1"
  const search = request.query.q ?? ""

  return {
    status: 200,
    json: { page: page, search: search }
  }
}
```

A request to `/api/search?q=tw&page=3` gives:

```json
{ "page": "3", "search": "tw" }
```

Query values are always strings. Parse numbers explicitly:

```twm
fn get(request) {
  const page = Number(request.query.page ?? 1) || 1
  const size = Number(request.query.size ?? 20) || 20
  return { status: 200, json: { page: page, size: size } }
}
```

## Query Keys with No Value

`/api/flags?fast` produces an empty string for `fast`. Check for presence with `in`:

```twm
fn get(request) {
  const hasFlag = "fast" in request.query
  return { status: 200, json: { fast: hasFlag } }
}
```

## Repeated Keys

When a key repeats (`?tag=a&tag=b`), the last value wins in the parsed object. Treat multi-value filters as a single value or encode a list in one parameter (`?tags=a,b`) and split it:

```twm
fn get(request) {
  const tags = (request.query.tags ?? "").split(",").filter(t => t !== "")
  return { status: 200, json: { tags: tags } }
}
```

## Query Parameters in Redirects

`redirects` in `tw.config.ts` match on the path; the query string is carried over automatically. `/old?tab=2` configured as `{ from: "/old", to: "/new" }` lands on `/new?tab=2`.

## Validation

Query input is external input. Validate shape and range before use — see [Request Validation](./request-validation.md).

## Related

- [The Request Object](./request-object.md)
- [API Routes](./api-routes.md)
