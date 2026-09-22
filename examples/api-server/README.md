# API Server -- JSON Routes, Cached Handlers, and Tag Invalidation

A pure JSON API: plain GET/POST handlers, a `fn cached` endpoint with a hard expire, and an action that bumps its tag.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It is the server-side counterpart to the page-level cache: the canonical handler cache with SWR windows on JSON.

## Quick start

```sh
cd examples/api-server
bun install
tw dev            # development server
# or the long way, from the repo root:
bun ../../apps/cli/tw/bin.ts dev
```

Production build and serve:

```sh
tw build
tw serve --port 8123
```

Check it:

```sh
curl -s http://127.0.0.1:8123/ | head -20
```

## What this example teaches

- `fn get` / `fn post` handlers returning `{ status, json }`
- `fn cached get` with `cache { revalidate 10, expire 60, tag "items" }`
- The purity contract: params/query are cacheable; cookies/headers/body are not (TW091)
- `revalidateTag` in an action result -- the updateTag flow

## The files, one by one

### `.tw/api/echo/route.twm`

```twm
fn post(request) {
  return { status: 200, json: { you_sent: request.body } }
}
```

### `.tw/api/hello/route.twm`

```twm
fn get(request) {
  return { status: 200, json: { hello: "world" } }
}
```

### `.tw/api/items/route.twm`

```twm
import { next } from "counter"

fn cached get(request) {
  cache { revalidate 10, expire 60, tag "items" }
  return { status: 200, json: { n: next() } }
}

fn actionRefresh(request) {
  return { status: 200, json: { ok: true }, revalidateTag: "items" }
}
```

### `.tw/lib/counter.ts`

```ts
let n = 0
export function next() { n += 1; return n }
```

### `home/api/echo/route.twm`

```twm
fn post(request) {
  return { status: 200, json: { you_sent: request.body } }
}
```

### `home/api/hello/route.twm`

```twm
fn get(request) {
  return { status: 200, json: { hello: "world" } }
}
```

### `home/api/items/route.twm`

```twm
import { next } from "counter"

fn cached get(request) {
  cache { revalidate 10, expire 60, tag "items" }
  return { status: 200, json: { n: next() } }
}

fn actionRefresh(request) {
  return { status: 200, json: { ok: true }, revalidateTag: "items" }
}
```

### `home/page.tw`

```tw
import "./../style/global.tss"

page { title "API -- TW JSON Server" render static }

div.api {
  header.head {
    h1 "JSON API"
    p "This page is a landing card; the real surface is the routes below. Every endpoint is listed with its cache behavior."
  }

  section.routes {
    h2 "Endpoints"

    div.route {
      span.method get
      span.path "/api/hello"
      span.cache uncached
      p "A plain handler. Every request runs the function; nothing stored."
      code "curl http://127.0.0.1:8123/api/hello"
    }

    div.route {
      span.method get
      span.path "/api/items"
      span.cache "fn cached -- revalidate 10s, expire 60s, tag items"
      p "The cached endpoint. The counter freezes between computes: call twice, the same n comes back; wait past the windows, it moves."
      code "curl http://127.0.0.1:8123/api/items"
    }

    div.route {
      span.method post
      span.path "/api/items"
      span.cache "action -- bumps the items tag"
      p "The invalidation route. It returns revalidateTag in the result, so the next GET recomputes immediately."
      code "curl -X POST http://127.0.0.1:8123/api/items"
    }

    div.route {
      span.method post
      span.path "/api/echo"
      span.cache uncached
      p "Echoes the request body back. POST bodies can never be cached -- reading request.body in a fn cached handler fails the build (TW091)."
      code 'curl -X POST -d "{\'hi\':1}" http://127.0.0.1:8123/api/echo'
    }
  }

  section.behavior {
    h2 "The windows, as you will observe them"
    ol.timeline {
      li { strong "t=0" span " first GET -- MISS, computes, n=1, stores" }
      li { strong "t=1s" span " second GET -- HIT, replays n=1" }
      li { strong "t=11s" span " third GET -- STALE, returns n=1, refresh queued in background" }
      li { strong "t=61s" span " fourth GET -- MISS, n=2" }
      li { strong "any time" span " POST the action -- tag bumped, next GET is a MISS" }
    }
  }

  footer.foot {
    p "Cache key: sha256(method + path + canonicalQuery + JSON(params)) -- query order never matters."
  }
}
```

### `home/style.tss`

```tss
.head { mb 24px }
.routes { d flex; fd column; gap 14px; mb 28px }
.route { bg #f6f7f9; br 12px; p 16px }
.method { bg #111; c #fff; br 6px; p 2px 8px; fs 11px; fw 700; mr 8px }
.path { fw 700; fs 15px }
.cache { d block; fs 12px; c #16a34a; mt 4px }
.route p { fs 13px; c #556; mt 6px }
.route code { d block; mt 8px; bg #111; c #0f0; p 8px; br 8px; fs 12px }
.timeline li { pb 8px }
.foot { mt 28px; pt 14px; border-top 1px solid #eef; fs 12px; c #889 }
```

### `lib/counter.ts`

```ts
let n = 0
export function next() { n += 1; return n }
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px; c #223 }
```

## How it works under the hood

`fn cached` handlers are transformed at load time: the cache block is
hoisted to metadata, the body is purity-scanned, and the handler is wrapped
in the canonical cache keyed by
`sha256(method + path + canonicalQuery + JSON(params))`. Between 10s and
60s of age the endpoint answers from cache and refreshes in the background;
after 60s it recomputes inline. The counter module (`lib/counter.ts`)
makes the windows visible: the number only moves when a real compute
happens -- cached responses replay the same number.

## Try it -- ten exercises

1. `curl http://127.0.0.1:8123/api/items` twice -- the `n` is frozen on the second call (cached).
2. Wait 11s, call again: STALE -- old number returned, refresh queued.
3. Wait past 60s total: MISS -- new number.
4. POST to the action route -- then GET: new number immediately.
5. Add `/api/items?q=1` and `?q=2` -- different keys, different cache entries.
6. Call with `?b=2&a=1` then `?a=1&b=2` -- SAME entry (canonicalization).
7. Break purity on purpose: read `request.headers` in the cached handler -- TW091 fails the build.
8. Add `Date.now()` to the cached body -- TW093 warns (frozen clock).
9. Add a plain `fn get` (uncached) route and compare behavior.
10. Run the evals -- the cache.json cases encode these exact windows.

## FAQ

**Why is the same number returned twice?** That IS the cache. The
counter increments only on real computation; a replayed entry replays the
old result. This example uses a counter precisely so the windows are
visible without a clock.

**What exactly is in the cache key?** Method, handler path, the CANONICAL
(sorted) query string, and JSON(params). Anything else (cookies, headers)
must NOT enter a cached handler -- the build enforces it.

**How do I cache per-user data?** Do not cache per-user JSON with fn
cached; render it per request, or key it through params (a
`/api/user/[id]/...` route puts the user in params, therefore in the key).
## How the build sees this app

`tw build` walks `home/` looking for the file conventions (`page.tw`,
`layout.tw`, `error.tw`, `loading.tw`, `not-found.tw`, `api/*/route.twm`),
compiles each `.tw` page (template -> HTML + VDOM + JS bundle), compiles
each linked `.tss` stylesheet, resolves cache profiles from `tw.config.ts`
(when present), runs the TW090-TW093 build gates, and emits everything to
`.tw/` with a `routes.json` manifest.

Route naming follows directories: `home/blog/page.tw` serves at `/blog`,
and `home/blog/[id]/page.tw` serves at `/blog/<anything>`. The trailing
`page.tw` segment IS the route (a `home/secret/page.tw` serves at
`/secret`, not `/secret/page`).

## Deploying this example

`tw ship` writes a complete deployment for 15 targets:

node, bun, docker (full + static), vercel, netlify, cloudflare, aws,
digitalocean, render, railway, fly, github-pages, firebase, nginx, caddy --
each with the config files that platform expects and next-step instructions.
Static pages ship as pure files; SSR/cache pages ship with the runtime.

## Verify it yourself (the honest checklist)

```sh
tw build                        # 1. must compile clean
tw serve --port 8123 &          # 2. in ONE shell (background servers
curl -sI http://127.0.0.1:8123/ | head -12   #    die between calls)
curl -s  http://127.0.0.1:8123/ | grep -c "<" # 3. markup present
kill %1
```

## Where to go next

- Full language reference and every table: AGENTS.md (the operating manual)
- Cache semantics deep-dive: docs/cache-tags.md
- Render modes: RENDER-SYSTEM.md and docs/render-modes.md
- Testing conventions: docs/testing.md + contributing/core-testing.md
- The complete example matrix: examples/README.md

