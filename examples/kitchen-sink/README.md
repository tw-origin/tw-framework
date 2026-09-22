# Kitchen Sink -- Every Feature, One App

Render modes, the explicit cache, fn cached APIs, actions, middleware, and unicode routes composed into one app -- the framework integration test as an example.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It is the everything-app: if you want to see the whole framework working together, start here.

## Quick start

```sh
cd examples/kitchen-sink
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

- SSR with `cache { life "minutes", tag "sink" }` on the main page
- `fn cached` API at /api/ping sharing the sink tag
- An action (POST) that bumps the tag and invalidates page + API together
- A static page (/static) and a unicode route (/hi) in the same build
- Middleware blocking curl/wget/scrapy on every path
- Client state (tabs, counter) on the cached SSR page

## The files, one by one

### `home/api/ping/route.twm`

```twm
import { next } from "counter"

fn cached get(request) {
  cache { revalidate 5, expire 30, tag "sink" }
  return { status: 200, json: { pong: true, n: next() } }
}

fn actionReset(request) {
  return { status: 200, json: { ok: true }, revalidateTag: "sink" }
}
```

### `home/hi/page.tw`

```tw
import "./../../style/global.tss"

page { title "हिन्दी -- किचन सिंक" render ssr }

div.hi {
  h1 "यह SSR पृष्ठ है"
  p "यूनिकोड रूट पूरी तरह काम करते हैं: यह पृष्ठ home/hi/ डायरेक्टरी से /hi पर सर्व होता है।"
  a "सिंक पर लौटें" { href "/" }
}
```

### `home/page.tw`

```tw
import "./../style/global.tss"

page {
  title "Kitchen Sink -- Everything at Once"
  render ssr
  cache { life "minutes", tag "sink" }
}

state { count = 0, tab = "cache" }

div.sink {
  header.head {
    p.eyebrow "One app, every surface"
    h1 "Kitchen Sink"
    p "Render modes, the explicit cache, fn cached APIs, actions, middleware, unicode routes, islands-style state -- all on one page so you can see them compose."
    div.tabs {
      button on:click "tab = 'cache'" { "Cache" }
      button on:click "tab = 'islands'" { "Islands" }
      button on:click "tab = 'routes'" { "Routes" }
    }
    p.active "current tab: {tab}"
  }

  section.demo {
    h2 "Client state, no round-trip"
    button on:click "count++" { "clicked {count} times" }
    p "The button mutates state in place; the counter is part of this page render but hydrates for interaction."
  }

  section.demo {
    h2 "The cached surface"
    ul {
      li { strong "This page" span " -- cache { life minutes, tag sink }" }
      li { strong "/api/ping" span " -- fn cached, revalidate 5s, expire 30s, tag sink" }
      li { strong "/api/ping (POST)" span " -- actionReset, bumps the sink tag" }
    }
    p "Both surfaces share the tag: one POST invalidates the page AND the endpoint together."
  }

  section.demo {
    h2 "Unicode and routes"
    ul {
      li { a "Static page" { href "/static" } }
      li { a "हिन्दी पृष्ठ" { href "/hi" } }
      li { a "API (cached)" { href "/api/ping" } }
    }
    p "The Hindi route is a real directory with a real page -- not a translated string swap."
  }

  section.demo {
    h2 "Middleware, active right now"
    p "middleware.twm blocks curl, wget and scrapy user agents on every path. If you can read this in a browser but your curl gets a 403, that is the rule doing its job."
  }

  footer.foot {
    p "Build it, serve it, curl it (with an honest user agent), POST the action, watch the tag drop everything. One page, the whole framework."
  }
}
```

### `home/static/page.tw`

```tw
import "./../../style/global.tss"

page { title "Static -- Kitchen Sink" render static }

div.static {
  h1 "Static"
  p "Frozen at build time. This file in .tw/ is served as-is; the cache layer has nothing to do here, and that is the point -- static and cached pages coexist in one app with one build."
  a "Back to the sink" { href "/" }
}
```

### `home/style.tss`

```tss
.eyebrow { fs 12px; uppercase; ls 2px; c #99a; mb 10px }
.head h1 { fs 34px; mb 10px }
.head p { c #445; maxw 620px; mb 16px }
.tabs { d flex; gap 8px; mb 8px }
.tabs button { p 8px 12px; br 8px; bg #eef1f5; fw 600 }
.active { fs 12px; c #16a34a; fw 600; mb 20px }
.demo { bg #f6f7f9; br 12px; p 18px; mb 16px }
.demo h2 { fs 16px; mb 10px }
.demo button { p 10px 14px; br 10px; bg #111; c #fff; fw 700 }
.demo ul { pl 18px; mb 8px }
.demo li { pb 6px; fs 14px }
.demo p { fs 13px; c #556 }
.demo a { c #2563eb }
.foot { mt 24px; pt 14px; border-top 1px solid #eef; fs 12px; c #889 }
```

### `lib/counter.ts`

```ts
let n = 0
export function next() { n += 1; return n }
```

### `middleware.twm`

```twm
rule "bots" {
    match "/**"
    user_agent {
        block ["curl/", "wget/", "scrapy"]
    }
    response {
        status 403
        html "<h1>403</h1>"
    }
}
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
```

## How it works under the hood

The interesting property is composition: the cached page and the cached
API share a tag, so one POST drops both; the static page ignores the
cache entirely; the Hindi route renders as a first-class sibling; the
middleware rule applies to all of it (try curl -- you will get the 403
that browsers never see). The tab state hydrates client-side on a page
that is otherwise served from a minutes-profile cache -- interactivity
and caching are orthogonal, which is exactly the lesson this app exists
to teach.

## Try it -- ten exercises

1. Build, serve, and load / in a browser -- all sections render.
2. GET / twice; x-tw-cache-age shows the HIT.
3. GET /api/ping twice; the n freezes (cached handler).
4. POST /api/ping (the action) -- the sink tag drops.
5. GET / and /api/ping again -- both fresh again.
6. curl / with the default curl user agent -- the middleware 403.
7. curl with -A "Mozilla/..." -- the page serves.
8. Visit /static and /hi -- different render modes, one build.
9. Click the tabs and counter -- client state on a cached page.
10. Run the master gate and the evals -- this app patterns appear in both.

## FAQ

**Why does curl get blocked?** The middleware rule matches /** and
blocks curl/, wget/, scrapy user agents -- a deliberately visible demo
of the rule DSL. Browsers are unaffected.

**Why does the page cache but /static not?** Static pages are build-time
frozen; a cache window has nothing to revalidate. The mixed build shows
both modes coexisting.

**Is this the biggest example?** It is the densest -- every feature in the
smallest honest app. For scale, see tw-blog and the full matrix in
examples/README.md.

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

