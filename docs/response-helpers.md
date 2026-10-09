# Response helpers

Route-level responses you return from a handler:

```ts
import { redirect, forbidden, unauthorized, notFound } from "tw";
```

Next splits these across `next/navigation` and asks you to keep a
`forbidden.tsx` / `unauthorized.tsx` file around. Here they are one module and
the headers are correct by default.

---

## `redirect(to, opts?)`

```ts
redirect("/login");                                    // 307
redirect("/new-home", { permanent: true });            // 308
redirect("/new", { preserveQuery: req });              // carries ?page=2 across
redirect("/docs", { hash: "setup" });                  // /docs#setup
redirect("/a", { status: 301 });                       // explicit wins
permanentRedirect("/a");                               // sugar for permanent: true
```

`preserveQuery: req` is the bit everyone hand-rolls — pass the request and the
incoming query string lands on the target. It merges with a query already in
`to`.

## `forbidden(reason?, opts?)` — 403

```ts
return forbidden("user is not an admin");
return forbidden("trial expired", { expose: true });   // send the reason too
```

The reason is for you and your logs — it is **not** sent to the client unless
you pass `expose: true`, so you never leak why something was refused.

## `unauthorized(opts?)` — 401 with a correct challenge

```ts
unauthorized();                                        // WWW-Authenticate: Bearer
unauthorized({ scheme: "Basic", realm: "admin", charset: "UTF-8" });
unauthorized({ params: { error: "invalid_token" } });
```

A 401 without a `WWW-Authenticate` header is a protocol bug, so we build it.
Next leaves that header to you.

## `notFound(opts?)` · `badRequest(msg)` · `jsonResponse(data, status)`

`notFound()` returns a 404 (the route-level one — `notFound` from
`@tw/server` is the *middleware*). `badRequest` and `jsonResponse` set the right
content type.

Every helper accepts `headers` and `contentType` if you need to override.
