# server-data

This example teaches one thing: **fetching data on the server, inside a page**,
with a `server { }` block. After reading it you can move a page's data read from
a client fetch into the server, guard a route with a session, and cache a page
per query.

Server blocks are experimental. The flag is already on in `tw.config.ts`:

```ts
experimental: { serverBlocks: true },
```

## Run it

```sh
bun ../../apps/cli/tw/bin.ts build     # static pages are baked
bun ../../apps/cli/tw/bin.ts serve     # http://localhost:8801
```

Log in with `alice` / `alice-pw` or `bob` / `bob-pw`.

## The pages

| Route | What it shows |
|---|---|
| `/posts` | `render ssr` + a page cache `{ revalidate: 60, vary: ["page"] }` + a cached fetch tagged `posts` |
| `/dashboard` | `requireUser()`; `middleware.twm` redirects anonymous visitors to `/login` |
| `/u/[id]` | route params + an ownership check (`notFound()` on someone else's id) |
| `/docs/[slug]` | `render static` + `params.twm fn generate()` — one baked page per param |

`lib/db.server.ts` holds the in-memory data. The `.server.ts` suffix makes it
server-only: importing it from a page, layout or client component fails the
build with `TW1007`.

`lib/sessions.ts` is a tiny session store. The real framework session middleware
reads `tw.sid`; the login route writes a session and sets the cookie.

## What to look at

- `home/posts/page.tw` — the block reads `query.page` (only the `vary` key is
  visible on a cached page) and fetches a local endpoint with
  `{ cache: { revalidate, tag } }`.
- `home/dashboard/page.tw` — `const me = requireUser()` and the user's own posts.
- `home/u/[id]/page.tw` — `getSession()` + `redirect("/login")` + `notFound()`.
- `middleware.twm` — a rule that guards `/dashboard` and redirects.

## Negative fixtures

`negative-fixtures/` is a separate mini-app that is **expected to fail the
build** — it holds a block that reads `env` (`TW115`), a block that returns a
function (`TW113`), and a page whose block throws at request time (a generic
500). Keeping them apart is what lets the main app build clean.

## Tests

`tests/server-data.test.ts` (in the repo root) starts this app in a subprocess
and drives it over real HTTP with real cookies: cross-user safety, the cache,
the static build output, and the failure pages.

## Learn more

- [Server Data](../../docs/server-data.md)
- [Error Reference](../../docs/error-reference.md)
