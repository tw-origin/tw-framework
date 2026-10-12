# TW Framework — Server Data

This document covers one thing completely: fetching data on the server inside a
page, with a `server { }` block — how it runs, what it can read, what crosses to
the client, and how it is cached and secured.

Server blocks are gated behind `experimental.serverBlocks` in `tw.config.ts`.
With the flag off, a `server { }` block is ordinary page content and nothing on
this page applies.

---

## What a server block is

A `server { }` block is a run of TypeScript that runs on the server — at build
time for a `render static` page, once per request for `render ssr` — and whose
declared values become template state.

```tw
page { title "Posts" render ssr }

server {
  const posts = await fetch("https://example.com/api/posts").then((r) => r.json())
}

ul {
  for post in posts {
    li "{post.title}"
  }
}
```

The block's body never reaches the browser: it is stripped before the page is
compiled, and its imports are never added to the client bundle.

### Scope rules

- Blocks run in source order and **share one scope**; a later block sees the
  names an earlier block declared, never the reverse.
- Only the block's top-level `const`/`let`/`var`, function and class names cross
  to the template. Imports and nested-scope names do not.
- A name declared in both `server { }` and `state { }` — or matching a route
  param — is a compile error (`TW102`).

## The request context

Inside a block these names are in scope. They are read-only.

| Name | What it is | Trust |
|---|---|---|
| `params` | Route params, e.g. `params.slug` | Safe — from the route pattern |
| `query` | Parsed query string | Untrusted |
| `headers` | Request headers | Untrusted |
| `cookies` | Parsed cookies | Untrusted |
| `env` | `process.env` | Secrets — never send to the client (see the env guard) |
| `fetch` | The instrumented fetch (timeout, dedupe, cache) | — |

`getSession()`, `requireUser()`, `redirect()` and `notFound()` are also
available — see the next section.

Treat `query`, `headers` and `cookies` as attacker-controlled: never interpolate
them into markup without escaping, never build a URL or a SQL string from them
(the `TW116`/`TW117` lints warn when you do).

## Sessions and control flow

```tw
server {
  const me = requireUser()          // 302 to server.loginPath when anonymous
  const mine = postsByAuthor(me.id)
}
```

| Helper | Behaviour |
|---|---|
| `getSession()` | The sanitized session (`{ id, ...data }`) or `null` |
| `requireUser()` | The same, or `redirect(loginPath)` when there is no user |
| `redirect(target)` | 302 to a **same-origin** internal path (`TW109` otherwise) |
| `notFound()` | Renders the app's 404 |

These throw; a `try/catch` around them does not swallow the intent — the runner
still performs the redirect or 404 after the block finishes. None of them are
available in a **static** page's block (`TW107`/`TW108`).

### Wiring the session

`getSession()` and `requireUser()` read the request's session, which the server
populates from a session middleware registered with `server.use(...)`. The
framework's `sessionMiddleware` is express-shaped `(req, res, next)`; wrap it
with `asMiddleware` so the server runs it on the page path too:

```ts
import { TWServer, asMiddleware, sessionMiddleware } from "@tw/server";

const server = new TWServer({ rootDir, config });
server.use(asMiddleware(sessionMiddleware({ secret: process.env.TW_SESSION_SECRET, store })));

Bun.serve({ port, fetch: (r) => server.handleRequest(r) });
```

The middleware runs for page and `.twm` route requests — the paths the built-in
pipeline does not cover — so `request.session` is set before the block runs. A
`Set-Cookie` the middleware writes is delivered on the page response. Any
express-style middleware works through `asMiddleware`; one that sets `res.status`
/ `res.body` short-circuits the page instead of rendering it.

For a custom or shared store, or JWT sessions, use `createSessionManager` from
`@tw/security` (see [sessions](./sessions.md)) and expose the same shape as
`request.session`.

## Caching

### Per-fetch cache

`fetch` inside a block is instrumented: a default timeout, per-request dedupe of
identical GETs, and an opt-in cache.

```tw
server {
  const res = await fetch("https://example.com/posts", { cache: { revalidate: 60, tag: "posts" } })
  const posts = await res.json()
}
```

- Key = `method + URL + body + canonical(author-set headers) + build id`. Only
  GET/HEAD, only 2xx, never a `Set-Cookie` response, and only under
  `server.fetchCacheMaxBytes`.
- `revalidateTag("posts")` invalidates every cached fetch with that tag.
- A **cached** fetch must not set `Authorization`, `Proxy-Authorization` or
  `Cookie` — a literal header is `TW110` at build, a computed one throws at run
  time.

### Page cache and `vary`

A `server { }` block plus `page { cache { } }` makes a **cached page** (ssr only):

```tw
page {
  title "Posts"
  render ssr
  cache { revalidate: 60, vary: ["page"] }
}

server {
  const page = query.page ?? "1"     // only `vary` keys are visible
  const posts = await fetch(origin + "/api/posts?page=" + page).then((r) => r.json())
}
```

- The key is `pathname + canonical vary-query + params + nav + build id`. Only
  the `vary` keys are visible to the block; every other query key reads
  `undefined`, and an unknown query key never creates a new entry.
- `vary` on a **static** page is `TW112`.

### The cached-page context trap

A cached page must not depend on the visitor. Its block sees only `params`, the
`vary` query and `env`; `headers`, `cookies`, `getSession()` and `requireUser()`
are throwing stand-ins (`TW111`). This is a runtime property, so an alias
(`const c = cookies`) or a helper call is caught too — a cached page cannot
accidentally cache one user's data for another. A trap failure is a 500 and is
never cached.

## The server-only boundary

`.server.ts` (by name), `lib/…`, relative `.js`/`.ts` modules and `@tw/*` are
**server-only**. Importing one from a page, layout or client component fails the
build with `TW1007`, naming the chain that led there. The boundary has four
layers:

1. Node built-ins.
2. A deny-list of server packages.
3. A `@tw/server-only` marker, followed transitively through local re-exports.
4. The `.server.ts` filename convention.

`tw dev` runs the same walk, non-fatally — a violation is logged, never fatal.

## Serialization — what crosses to the client

Only **referenced** declared names cross (a name used in `{expr}`, a `for`
iterable or an `if` condition). Each value is checked:

- **Allowed:** string, finite number, boolean, `null`, `undefined`, plain
  objects, arrays, and `Date` (converted to an **ISO string** — the client
  receives a string, not a `Date`).
- **Rejected** with a named error (`file`, variable, path, kind — never the
  value): function, symbol, bigint, `NaN`/`Infinity`, `Map`, `Set`, `WeakMap`,
  `Promise`, class instances (map a `Prisma.Decimal` to a plain object), buffers
  and typed arrays, cycles, and depth over 20.

A rejected value is a build failure for `static` and a generic 500 for `ssr`
(`TW113`). The total payload is capped by `server.maxPayloadBytes` (`TW114`).

## The env guard

`env` is available to a block, but a referenced value that **reads** `env` is a
build error (`TW115`) — it would cross into markup. A runtime backstop also
scans crossing strings for any `env` value whose **name** matches
`/KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|DATABASE_URL|DSN/i` and
whose value is at least 8 characters. Only the variable **name** appears in the
message, never the value.

Limits: the name-pattern heuristic can miss a secret with an unusual name, and
the backstop scans strings only — a secret used as an object key is not detected.

## Lints (heuristics, not guarantees)

- `TW116` — a SQL-looking template literal interpolating request data.
- `TW117` — `fetch()` with a URL built from request data (suggest an allow-list).

Both are warnings.

## Configuration reference

Every `server.*` option, with its default:

| Option | Default | Meaning |
|---|---|---|
| `loginPath` | `"/login"` | Target of `requireUser()`'s redirect |
| `fetchTimeoutMs` | `10000` | Per-fetch timeout |
| `fetchCacheMaxBytes` | `1000000` | Skip caching a response larger than this |
| `cacheInDev` | `false` | Enable the cache in `tw dev` |
| `pageCacheMaxEntries` | `500` | LRU size of the page cache |
| `maxPayloadBytes` | `131072` (128 KB) | Cap on the serialized block payload |
| `onlyPackages` | `[]` | Extra package names treated as server-only |

## Migrating from a route + client fetch

Before, a page fetched its data from a `.twm` route in the browser: the first
paint had no data, and the round-trip was visible.

```twm
// home/api/posts/route.twm
fn get(request) {
  return { status: 200, json: { posts: allPosts() } }
}
```

```tw
// home/posts/page.tw
page { title "Posts" render ssr }

state { posts = [] }

div { p "Loading..." }   // client JS fetches /api/posts and fills `posts`
```

After, the data is fetched on the server before the page renders — no
round-trip, no loading state, and the data source never reaches the browser:

```tw
// home/posts/page.tw
page { title "Posts" render ssr }

server {
  import { allPosts } from "../../lib/db.server.ts"
  const posts = allPosts()
}

div {
  for post in posts {
    article { h2 "{post.title}" }
  }
}
```

The `.twm` route can be deleted (or kept if other clients still call it). Turn
on `experimental.serverBlocks`, move the data read into the block, and the same
page now renders with data in its first response.

## Known limitations

- A block timeout **stops waiting**; it does not cancel the running block.
- The server-only boundary walk does not enter bare packages.
- The cache is per-process, in memory — a multi-process deployment does not
  share it.
- There is no type-checker layer; the serialization guard is syntactic plus
  runtime.
- Server blocks in **layouts** are not supported yet (`TW105`).
- `redirect()`/`notFound()`/`requireUser()` are not allowed in a static page.

## Security checklist

```
□ query/headers/cookies escaped before interpolation, never trusted
□ no env value referenced into markup (the guard fails the build)
□ cached pages read only params + vary + env (the context trap enforces it)
□ cached fetches never set Authorization/Cookie
□ secrets live in env; only the value's NAME appears in errors
□ the SSRF/SQL lints are treated as hints, not guarantees
```

## Error codes

| Code | Meaning |
|---|---|
| TW099–TW101 | Block syntax (unknown modifier, expected `{`, unclosed) |
| TW102 | Name collision with `state { }` / a route param |
| TW103–TW108 | A static page's block read request data or a helper |
| TW109 | `redirect()` target is not a same-origin path |
| TW110 | A cached fetch set a credential header |
| TW111 | A cached page's block read a per-request value |
| TW112 | `vary` on a static page |
| TW113–TW117 | Serialization, size cap, env guard, SQL/SSRF lints |

Full text: [Error Reference](./error-reference.md).

## Related

- [Caching](./cache.md)
- [API Routes](./api-routes.md)
- [Client Modules](./client-modules.md) — the server-only boundary
- [Authentication](./guide-auth.md)
- [Error Reference](./error-reference.md)
