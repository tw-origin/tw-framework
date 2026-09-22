# Todo App -- Islands, State, and Event Expressions

An interactive client-hydrated todo counter: the smallest complete islands app, no server round-trips.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It demonstrates `render island`, the `state { }` block, and `on:event` handlers -- the whole client-side story in one file.

## Quick start

```sh
cd examples/todo-app
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

- `render island` -- ship static HTML, hydrate only the interactive subtree
- `state { count = 0, label: "tasks left" }` -- reactive client state
- `button on:click "count++"` -- event handlers are expressions on state
- Guards inside expressions: `count = count > 0 ? count - 1 : 0`

## The files, one by one

### `home/page.tw`

```tw
import "./../style/global.tss"

page { title "Todos -- TW Islands" render island }

state {
  count = 0
  label = "tasks left"
  filter = "all"
  user = "you"
}

div.app {
  header.head {
    h1 "Today"
    p.meta "for {user} -- {count} {label}"
  }

  section.counter {
    span.num "{count}"
    div.controls {
      button on:click "count = count + 1" { "Add task" }
      button on:click "count = count > 0 ? count - 1 : 0" { "Complete one" }
      button on:click "count = 0" { "Clear all" }
    }
    p.hint "Clicking mutates state in place -- the island re-renders, the server never hears about it."
  }

  section.filters {
    p "Filter:"
    button on:click "filter = 'all'" { "All" }
    button on:click "filter = 'done'" { "Done" }
    button on:click "filter = 'open'" { "Open" }
    p.active "current filter: {filter}"
  }

  section.listing {
    h2 "The plan"
    ol.tasks {
      li { input type "checkbox" { } span "Review the cache design doc" }
      li { input type "checkbox" { } span "Run the master gate" }
      li { input type "checkbox" { } span "Ship the release zip" }
      li { input type "checkbox" { } span "Fresh-verify from the artifact" }
      li { input type "checkbox" { } span "Write the UPGRADING note" }
    }
  }

  footer.foot {
    p "Everything on this page is one island: static HTML ships first, then the runtime hydrates this subtree only. Check the network tab -- zero requests after load."
  }
}
```

### `home/style.tss`

```tss
.head { mb 20px }
.head h1 { fs 28px }
.meta { c #667; fs 14px }
.counter { bg #f6f7f9; br 14px; p 22px; mb 20px; d flex; ai center; gap 24px }
.num { fs 48px; fw 800; min-w 72px; ta center }
.controls { d flex; gap 10px }
.controls button { p 10px 14px; br 10px; bg #111; c #fff; fw 600; c-inherit none }
.filters { d flex; ai center; gap 8px; mb 20px; fs 14px }
.filters button { p 6px 10px; br 8px; bg #eef1f5 }
.active { c #16a34a; fw 600 }
.tasks li { d flex; ai center; gap 10px; pb 10px; border-bottom 1px solid #eef; fs 15px }
.foot { mt 28px; pt 14px; border-top 1px solid #eef; fs 12px; c #889 }
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
```

## How it works under the hood

The build emits the page HTML plus a JS bundle scoped to the
island. At runtime the island hydrates onto its markup, the state block
becomes a reactive store, and each `on:click` compiles to a store mutation.
Because the expression is plain JavaScript over state names, ternaries and
arithmetic are the templating language -- no separate handler API to learn.
The rest of the page stays static: only the island pays the hydration cost.

## Try it -- ten exercises

1. Run `tw dev`, click Add/Done -- the count moves with zero network traffic (check the devtools network tab).
2. Add a reset button: `button on:click "count = 0" { "Reset" }`.
3. Add a task title input next to the counter.
4. Make the label reactive: swap it for a computed ternary on count.
5. Move the page to `render ssr` and observe the island still hydrates (SSR + islands compose).
6. Add a second, independent state variable and a button that mutates only it.
7. Deliberately typo an event name (`on:clik`) and read the diagnostic.
8. Add a list: `state { items = ["a","b"] }` and render `{items}`.
9. Bind a second island on the same page and verify they hydrate independently.
10. Rebuild and confirm the master gate passes.

## FAQ

**Is this React?** No -- there is no virtual DOM library to import; the
runtime is the framework own client runtime, and handlers are expressions,
not functions. It feels like templating because it is.

**Why not plain `render ssr`?** SSR renders on the server; interactivity
still needs the client bundle. `render island` makes that scope explicit:
only the interactive subtree ships JS.

**Can an island talk to APIs?** Yes -- call an API from a handler
expression, or move the logic to an action (see examples/api-server).
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

