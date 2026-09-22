# Live Stream Demo -- Signal Streaming

A stream-mode page with a setSignal endpoint: the shell renders first, named values stream in as the server sets them.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It demonstrates the v1.0.3 signal streaming surface in the smallest honest way.

## Quick start

```sh
cd examples/chat-stream
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

- `render stream` -- the page shell and the live values travel on one connection
- `import { setSignal } from "tw"` in a route.twm handler
- Named signals as the update model (state, not events)
- When stream mode is -- and is not -- the right call

## The files, one by one

### `home/api/feed/route.twm`

```twm
import { setSignal } from "tw"

fn get(request) {
  setSignal("feed.tick", Date.now())
  return { status: 200, json: { ok: true } }
}
```

### `home/page.tw`

```tw
import "./../style/global.tss"

page { title "Live -- TW Signal Streaming" render stream }

div.live {
  header.head {
    h1 "Live feed"
    p "This page renders in stream mode: the shell arrives first, signals stream in as they are set. No reload, no polling -- the connection is the transport."
  }

  section.demo {
    h2 "How signals work"
    ol {
      li "The page declares render stream"
      li "A route.twm handler imports setSignal from tw"
      li "The handler sets a named signal and returns JSON as usual"
      li "Subscribed clients receive the update over the stream"
    }
    code "import { setSignal } from \"tw\""
    code "setSignal(\"feed.tick\", Date.now())"
  }

  section.api {
    h2 "The endpoint"
    div.route {
      span.method get
      span.path "/api/feed"
      p "Triggers a signal set. Hit it from one browser tab and watch the other tab move without a reload."
      code "curl http://127.0.0.1:8123/api/feed"
    }
  }

  section.tradeoffs {
    h2 "When to use stream mode"
    ul {
      li "Live dashboards, chat, collaborative cursors -- anything where the server KNOWS the moment something changes"
      li "Not for static content -- stream mode holds connections; pair it with a cache on the shell"
      li "Signals are named values, not arbitrary events -- model them as state, not as messages"
    }
  }

  footer.foot {
    p "Part of the TW example matrix: examples/chat-stream. Pair with examples/todo-app to see islands vs streams side by side."
  }
}
```

### `home/style.tss`

```tss
.head { mb 24px }
.head h1 { fs 30px; mb 8px }
.head p { c #445; maxw 560px }
.demo { mb 28px }
.demo h2, .api h2, .tradeoffs h2 { fs 18px; mb 10px }
.demo ol { pl 18px }
.demo li { pb 6px; fs 14px }
.demo code, .route code { d block; bg #111; c #0f0; p 8px; br 8px; fs 12px; mt 8px }
.route { bg #f6f7f9; br 12px; p 16px; mb 24px }
.method { bg #111; c #fff; br 6px; p 2px 8px; fs 11px; fw 700; mr 8px }
.path { fw 700 }
.route p { fs 13px; c #556; mt 6px }
.tradeoffs ul { pl 18px }
.tradeoffs li { pb 6px; fs 14px; c #445 }
.foot { mt 28px; pt 14px; border-top 1px solid #eef; fs 12px; c #889 }
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
```

## How it works under the hood

Stream mode holds the response open after the shell is flushed;
setSignal(name, value) pushes a named update to subscribed clients. The
mental model is reactive state across the wire, not messages: the client
runtime updates any expression bound to that signal, and the page never
reloads. The demo endpoint sets a signal and ALSO returns JSON -- showing
that a streaming page can still serve ordinary API semantics alongside.

## Try it -- ten exercises

1. Open the page in two tabs; curl the /api/feed endpoint; watch both tabs move.
2. Add a second signal name and set it from the same handler.
3. Bind the signal value into the page text.
4. Compare with examples/todo-app: islands update from user input, streams from server events.
5. Add a cache block to the shell and confirm the shell caches while signals stay live.
6. Point a plain (non-stream) page at the same endpoint -- the JSON still works.
7. Watch the network tab: one connection, no polling requests.
8. Add a button that calls the endpoint via a client-side expression.
9. Check what happens when the tab disconnects and reconnects.
10. Run the master gate.

## FAQ

**Does every page need render stream for one live widget?** No --
streaming is page-granular. Put the live region on a streaming page and
link to it, or move the widget to an island with a poll-free handler if
the server does not need to push.

**Are signals authenticated?** The connection follows the page request;
guards in middleware.twm apply to it like any other route.

**What scales badly with streams?** Holding thousands of idle
connections per pod. Use tags + polling for very large audiences, streams
for dashboards and collaborative rooms.

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

