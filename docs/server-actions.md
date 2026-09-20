# TW Framework — Server Actions

This document covers one thing completely: calling server-side functions from a page or script — the `action` handler form in `.twm` routes, its dispatch protocol, and its same-origin security model.

---

## What a Server Action Is

A server action is a function that runs on the server and is invoked by a `POST` request, not by an HTTP verb. Any `.twm` file can declare them:

```
// home/api/posts/route.twm

fn get(request) {
  return { status: 200, json: { posts: list() } }
}

fn actionPublish(request) {
  return { status: 200, json: { published: true, title: request.body.title } }
}

fn actionDelete(request) {
  return { status: 200, json: { deleted: true, id: request.body.id } }
}
```

Three rules:

1. A function named `action` is the **default action** for the route.
2. Functions named `action<Anything>` are **named actions** — `actionPublish` is invoked as `publish`.
3. Actions are never called by a plain `GET`/`POST` — only through the dispatch protocol below.

## The Dispatch Protocol

Actions are called with `POST` plus an `_action` (or `action`) query parameter:

```bash
# default action
curl -X POST -H "Origin: http://localhost:3000" \
     -H "Content-Type: application/json" \
     -d '{"title": "Hello"}' \
     "http://localhost:3000/api/posts?_action="

# named action (actionPublish -> ?_action=publish)
curl -X POST -H "Origin: http://localhost:3000" \
     -H "Content-Type: application/json" \
     -d '{"title": "Hello"}' \
     "http://localhost:3000/api/posts?_action=publish"
```

From the browser, a page calls an action with `fetch`:

```tw
state { title: "", done: false }

div.form {
  input valueBind title
  button.btn on:click "publish()" {
    "Publish"
  }
}
```

```twm
// home/api/posts/route.twm
fn actionPublish(request) {
  return { status: 200, json: { published: true, title: request.body.title } }
}
```

The handler receives the same request object as every route handler: `method`, `url`, `params`, `headers`, `query`, `body`, `cookies` (see docs/request-lifecycle.md for the request shape). Actions respond with the standard envelope `{ status, json | body | html | text, headers }`.

## Same-Origin Enforcement

Actions are write operations reachable from pages, so the request dispatcher enforces same-origin before any action runs — fail-closed:

| Request | Result |
|---------|--------|
| `Origin` header host matches the request host | action runs |
| `Origin` mismatches | `403 Forbidden` |
| `Referer` host matches (when `Origin` is absent) | action runs |
| Neither `Origin` nor `Referer` present | `403 Forbidden` |

Browsers send `Origin` on every cross-origin and same-origin `POST`, so forms and `fetch` calls work without configuration. Scripts calling actions from a terminal must pass a matching origin explicitly:

```bash
curl -X POST -H "Origin: http://localhost:3000" -d '{}' "http://localhost:3000/api/posts?_action=publish"
```

Unknown action names answer `404` with `{"ok": false, "error": "Unknown action: ..."}`.

## Actions Without a POST Handler

A route may contain only actions — no `fn post` — and it will not answer 405: the action dispatch is recognized before method matching. Regular handlers (`get`, `post`, ...) and actions can coexist in one file.

## Testing

```ts
import { executeRouteHandler } from "@tw/server";

const out = await executeRouteHandler(routePath, "POST", {
  url: "http://localhost:3000/api/posts?_action=publish",
  method: "POST",
  headers: { origin: "http://localhost:3000" },
  json: async () => ({ title: "Hello" }),
});
expect(out.status).toBe(200);
```

## Reference

- docs/api-routes.md — route handlers and the response envelope
- docs/middleware.md — middleware that runs before actions
- docs/csrf-api.md — the CSRF layer, for form-token flows
