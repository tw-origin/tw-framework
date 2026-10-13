# What's new in 2.0.0

A short, before-and-after tour of the release for people who already know the
framework. For the full reference see [server-data.md](./server-data.md),
[error-reference.md](./error-reference.md) and [CHANGELOG.md](../CHANGELOG.md).

---

## Pages can fetch on the server, without a client round trip

Before, a page that needed data either shipped an empty shell and fetched on the
client, or you wrote a `.twm` API route and fetched it back. Now a page declares
a `server` block and the data is in the first HTML byte.

```tw
page {
  title "Posts"
  render ssr
}

server {
  import { listPosts } from "../../lib/db.server.ts"
  const posts = await listPosts()
}

ul {
  for post in posts {
    li "{post.title}"
  }
}
```

The block runs once per request, before render. Values declared in it are
available in the markup. Nothing the block declares crosses to the client unless
the markup references it.

Server blocks are on by default — there is nothing to enable. To turn them off,
set `server: { blocks: false }` in `tw.config.ts`.

## The server-only boundary keeps secrets off the client

A file named `*.server.ts` (or anything importing `server-only`) can hold
database clients, API keys and secrets. Importing one into a client module is a
**build error** (`TW1007`) rather than a runtime surprise, so a stray import
fails the build instead of shipping the secret.

## Sessions and auth work on the page path

Before, `getSession()` and `requireUser()` existed but nothing populated the
request's session for a page — the wiring was manual. Now register a session
middleware the normal way and it runs for pages too:

```ts
import { TWServer, asMiddleware, sessionMiddleware } from "@tw/server";

const server = new TWServer({ rootDir, config });
server.use(asMiddleware(sessionMiddleware({ secret: process.env.TW_SESSION_SECRET, store })));
```

Then a page guards itself:

```tw
server {
  const me = requireUser()   // 302 to server.loginPath when anonymous
  const mine = postsByAuthor(me.id)
}
```

`asMiddleware` adapts any express-style `(req, res, next)` middleware; a
middleware that sets `res.status` / `res.body` short-circuits the page.

## Caching and lints

- `fetch` inside a block gets a default timeout, per-request dedupe, and an
  opt-in cache. A cached fetch must not set a credential header (`TW110`).
- A page's `cache { revalidate, expire, tag, vary }` adds a page cache. A cached
  page's block cannot read headers, cookies or the session (`TW111`), and a
  `vary` on a static page is an error (`TW112`).
- Two heuristics warn early: a SQL-looking template that interpolates request
  data (`TW116`) and a `fetch` with a request-derived URL (`TW117`, an SSRF
  hint). They are lints, not guarantees.

## Deferred server blocks

`server:defer { }` is a server block whose result is not required to render the
first byte; see the notes in [server-data.md](./server-data.md).

---

## Migrating from a route + client fetch

| Before | After |
|---|---|
| `.twm` route + `fetch` in the page's client script | a `server` block on the page |
| secret kept in a route only, hoped it stayed server-side | move it to `*.server.ts`; the build enforces it |
| manual `request.session` wiring for a page | `server.use(asMiddleware(sessionMiddleware(...)))` |
| cache headers set by hand | `cache { revalidate, tag, vary }` on the page |

The migration is additive — existing `.twm` routes, client fetches and pages
without server blocks keep working.
