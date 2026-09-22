# Dashboard -- SSR Analytics with Cached Stat Cards

A server-rendered analytics dashboard whose stat cards are cached under the `dashboard` tag, refreshed on a minutes profile, and watchable through the age header.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It is the shortest complete demonstration of the v1.0.6 explicit cache layer on a page.

## Quick start

```sh
cd examples/dashboard
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

- The `cache { life "minutes", tag "dashboard" }` directive on an SSR page
- What the builtin `minutes` profile resolves to (stale 60s, revalidate 300s, expire 3600s)
- How `x-tw-cache-age` lets you watch the HIT/STALE/MISS windows from curl
- Why cached cards and live data can coexist on one page

## The files, one by one

### `home/page.tw`

```tw
import "./../style/global.tss"

page {
  title "Dashboard -- TW Analytics"
  render ssr
  cache { life "minutes", tag "dashboard" }
}

state { fresh = "cached", range = "7d" }

div.dashboard {
  header.topbar {
    h1 "Analytics"
    p.sub "Server-rendered. Cached under the dashboard tag, minutes profile."
    div.range {
      button on:click "range = '7d'" { "7 days" }
      button on:click "range = '30d'" { "30 days" }
      button on:click "range = '90d'" { "90 days" }
    }
  }

  section.cards {
    div.card {
      span.kpi "1,204"
      span.label "Visitors"
      span.delta "+12% vs last week"
    }
    div.card {
      span.kpi "98"
      span.label "Signups"
      span.delta "+4 this week"
    }
    div.card {
      span.kpi "12s"
      span.label "Avg session"
      span.delta "-1s vs last week"
    }
    div.card {
      span.kpi "3.2%"
      span.label "Bounce"
      span.delta "-0.4pt"
    }
  }

  section.panel {
    h2 "Traffic by channel"
    table.channels {
      thead {
        tr { th "Channel" th "Visitors" th "Share" }
      }
      tbody {
        tr { td "Organic search" td "542" td "45.0%" }
        tr { td "Direct" td "298" td "24.8%" }
        tr { td "Social" td "201" td "16.7%" }
        tr { td "Referral" td "163" td "13.5%" }
      }
    }
  }

  section.panel {
    h2 "Top pages"
    ol.top-pages {
      li { strong "/" span " -- 488 views" }
      li { strong "/pricing" span " -- 214 views" }
      li { strong "/docs/getting-started" span " -- 187 views" }
      li { strong "/blog/why-tw" span " -- 131 views" }
      li { strong "/about" span " -- 92 views" }
    }
  }

  section.panel {
    h2 "Recent events"
    ul.feed {
      li { span.who "user_291" span.what "signed up" span.when "2 min ago" }
      li { span.who "user_288" span.what "viewed /pricing" span.when "9 min ago" }
      li { span.who "user_275" span.what "started a session" span.when "23 min ago" }
      li { span.who "user_271" span.what "clicked Upgrade" span.when "41 min ago" }
      li { span.who "user_264" span.what "viewed /docs" span.when "1 h ago" }
    }
  }

  footer.foot {
    p "Render mode: SSR. Cache: explicit, minutes profile. Range: {range}. Served from: {fresh}."
    p "Watch the window: curl -sI localhost:8123/ | grep -i cache -- x-tw-cache-age climbs, then the page goes STALE then MISS."
  }
}
```

### `home/style.tss`

```tss
.topbar { d flex; jc space-between; ai baseline; mb 24px }
.range button { m 4px; p 8px 12px; br 8px; bg #eef1f5; c #334; fs 13px }
.cards { d grid; grid-template-columns repeat(4, 1fr); gap 16px; mb 24px }
.card { bg #f6f7f9; br 12px; p 16px; d flex; fd column; gap 6px }
.kpi { fs 28px; fw 700; c #111 }
.label { fs 13px; c #667 }
.delta { fs 12px; c #16a34a }
.panel { bg #fff; br 12px; p 20px; mb 24px; box-shadow 0 1px 2px rgba(0,0,0,0.05) }
.channels { w 100%; border-collapse collapse }
.channels th { text-align left; fs 12px; c #889; pb 8px }
.channels td { pb 8px; border-bottom 1px solid #eef }
.top-pages li { pb 6px }
.feed li { d flex; gap 10px; pb 6px; fs 14px }
.who { fw 600 }
.what { c #445 }
.when { c #99a; ml auto }
.foot { mt 32px; pt 16px; border-top 1px solid #eef; fs 12px; c #889 }
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
```

## How it works under the hood

The `cache { }` block resolves at BUILD time to a window triple
{stale: 60, revalidate: 300, expire: 3600} stored in routes.json. At serve
time the pipeline computes the canonical key for `/`, finds the entry, and
serves it until age crosses 300s -- after that the entry is STALE: served
instantly, refreshed in the background; after 3600s it is a MISS and the
page re-renders inline. `curl -sI` shows `x-tw-cache-age` growing between
requests -- the visible heartbeat of the cache.

## Try it -- ten exercises

1. `curl -sI http://127.0.0.1:8123/ | grep -i cache` twice; watch x-tw-cache-age climb.
2. Change `life "minutes"` to `life "seconds"` and rebuild -- the window shrinks to {1,1,2}.
3. Add a fourth stat card (a `.card` block) and rebuild.
4. Add `tag "dashboard"` to a second page and verify both drop together after a revalidateTag call from any action.
5. Replace the profile with explicit `revalidate 5, expire 30` and watch the faster cycle.
6. Break it on purpose: `revalidate -5` -- the build must fail with TW090.
7. Add a `fn cached` API endpoint under home/api/ and give it the same tag.
8. Serve, hit the API, then POST an action with `revalidateTag: "dashboard"` -- both surfaces refresh.
9. Switch the page to `render static` and observe that the cache block is then pointless (static pages are frozen at build).
10. Restore the original form and confirm the master gate still passes.

## FAQ

**Why `render ssr` and not `static`?** Static pages are frozen at build
time -- a cache window on them has nothing to revalidate. SSR pages render
on the first MISS and then live in the cache.

**Why the `dashboard` tag?** Tags group entries for invalidation. When a
write action bumps `dashboard`, every page and API sharing that tag drops
together -- you do not need to know the URLs.

**Why `life "minutes"` instead of numbers?** Profiles centralize policy:
change one number in tw.config.ts (or override the builtin) and every page
using the profile shifts. Numbers are for one-off pages.

**Can cards have different windows?** Yes -- each cache block on each
page (or fn cached handler) resolves independently. Split them across
pages or handler boundaries to vary freshness.
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

