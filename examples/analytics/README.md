# Event Analytics -- Write-Driven Invalidation

A counter API and a cached board: every POST bumps the stats tag, so the board is exactly as fresh as the last write.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It is the write-side counterpart to time-window caching: invalidation on write instead of expiry on time.

## Quick start

```sh
cd examples/analytics
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

- The board: `cache { revalidate 5, tag "stats" }`
- The write: an action returning `revalidateTag: "stats"` in its result
- The visible loop: GET (HIT) -> POST (bump) -> GET (MISS, fresh)
- Why write-driven invalidation beats shorter windows

## The files, one by one

### `home/api/event/route.twm`

```twm
import { next } from "counter"

fn post(request) {
  const kind = String(request.body?.kind ?? "view")
  const n = next()
  return { status: 200, json: { kind, total: n }, revalidateTag: "stats" }
}

fn get(request) {
  return { status: 200, json: { total: 0 } }
}
```

### `home/page.tw`

```tw
import "./../style/global.tss"

page {
  title "Events -- TW Analytics"
  render ssr
  cache { revalidate 5, tag "stats" }
}

div.board {
  header.head {
    h1 "Events"
    p "The board refreshes through revalidateTag after each POST. No waiting for a window to elapse -- writes invalidate immediately."
  }

  section.flow {
    h2 "The loop, end to end"
    ol {
      li "GET / -- rendered and stored under the stats tag"
      li "GET / again -- served from cache (watch x-tw-cache-age)"
      li "POST /api/event with a kind -- the counter increments"
      li "The action returns revalidateTag: stats -- the board is dropped"
      li "GET / -- MISS, re-rendered with the new total"
    }
  }

  section.route-card {
    h2 "The endpoint"
    div.route {
      span.method post
      span.path "/api/event"
      p "Returns the kind and the new total, plus the revalidateTag instruction in the same result."
      code 'curl -X POST -d "{\'kind\':\'signup\'}" http://127.0.0.1:8123/api/event'
    }
  }

  section.why {
    h2 "Why this beats polling windows"
    p "A pure time window trades freshness for render cost: either users see stale numbers or the server re-renders constantly. Tags invert the trade -- the number is as fresh as the last write, and the render count equals the write count. For a 5-second window on a busy board, that is the difference between re-rendering every 5 seconds and re-rendering only when something actually happened."
  }

  footer.foot {
    p "Part of the TW example matrix: examples/analytics. Compare with examples/dashboard to see time-window caching without a write path."
  }
}
```

### `home/style.tss`

```tss
.head { mb 24px }
.head h1 { fs 28px; mb 8px }
.head p { c #445; maxw 560px }
.flow { mb 28px }
.flow h2, .route-card h2, .why h2 { fs 18px; mb 10px }
.flow ol { pl 18px }
.flow li { pb 6px; fs 14px }
.route { bg #f6f7f9; br 12px; p 16px; mb 24px }
.method { bg #111; c #fff; br 6px; p 2px 8px; fs 11px; fw 700; mr 8px }
.path { fw 700 }
.route p { fs 13px; c #556; mt 6px }
.route code { d block; bg #111; c #0f0; p 8px; br 8px; fs 12px; mt 8px }
.why { mb 28px; maxw 580px }
.why p { c #445; fs 14px }
.foot { mt 28px; pt 14px; border-top 1px solid #eef; fs 12px; c #889 }
```

### `lib/counter.ts`

```ts
let n = 0
export function next() { n += 1; return n }
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
```

## How it works under the hood

A pure time window trades freshness against render cost: shrink the
window and the server re-renders more; widen it and users see older data.
Tags invert the trade -- the render count equals the write count. The
board caches under stats; each POST increments the counter and returns
revalidateTag: stats, dropping the board; the next GET re-renders with the
new total. Nothing polls, nothing expires early, and nothing is stale for
longer than one request after an actual event.

## Try it -- ten exercises

1. GET / twice -- the second is a HIT (check x-tw-cache-age).
2. POST an event -- the response confirms the new total.
3. GET / again -- MISS, and the board reflects the new total.
4. POST five events quickly, then GET once -- one render, five events.
5. Change the window to revalidate 60 and note writes still invalidate instantly.
6. Add a second board page sharing the stats tag.
7. Add a GET variant of the endpoint (uncached) for raw reads.
8. Break it: cache the POST handler (fn cached) and read why the build objects.
9. Add a new event kind and render a breakdown.
10. Run the master gate.

## FAQ

**What does revalidate 5 mean if writes invalidate anyway?** It is
the ceiling: if no write happens, the board still refreshes at most 5
seconds late. Writes make it instant; the window catches everything
writes do not cover.

**Can the action fail after bumping the tag?** The bump is part of the
result processing -- the tag drop and the response are consistent from the
caller perspective.

**How is this different from the ecommerce example?** Same mechanism,
different lens: ecommerce shows publish-on-admin-write; this shows every
user event flowing through the same tag.

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

