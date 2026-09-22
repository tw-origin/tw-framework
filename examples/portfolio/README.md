# Portfolio -- Multi-Page Static Site

A static multi-page personal site: layouts, cross-links, and styles -- zero JavaScript shipped, zero server rendering at request time.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It is the pure content play: everything is frozen at build time and served as files.

## Quick start

```sh
cd examples/portfolio
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

- `render static` -- pages are compiled to final HTML at build
- Multi-page routing with cross-links (`a "Home" { href "/" }`)
- A shared global stylesheet via import
- Why static is the fastest possible mode (nothing runs at request time)

## The files, one by one

### `home/page.tw`

```tw
import "./../style/global.tss"

page { title "Mlkraj -- Full-stack Developer" render static }

div.hero {
  p.eyebrow "Portfolio -- static build"
  h1 "Mlkraj"
  h2 "Full-stack developer. Frameworks, compilers, and chai."
  p.lede "I build web frameworks end to end: template languages, compilers, render pipelines, and the tooling around them. This site is one of my own -- compiled to static files, served as pure HTML."
  div.cta {
    a "See my work" { href "/work" }
    a "Read the framework" { href "https://github.com/mlkraj159" }
  }
}

section.stack {
  h3 "What I work with"
  ul.tools {
    li "TypeScript -- every day, every layer"
    li "Compilers and DSLs -- lexers, parsers, codegen"
    li "Render pipelines -- SSR, islands, streaming"
    li "Bun and Node -- runtimes and CLIs"
    li "Rust -- when the hot path needs it"
  }
}

section.now {
  h3 "Currently"
  p "Building a full-stack web framework with its own template and styling languages: 11 packages, a 2692-test suite, and zero runtime dependencies. The cache layer alone serves 98k pages per second from a warm entry."
}

section.elsewhere {
  h3 "Elsewhere"
  ul.links {
    li { a "GitHub" { href "https://github.com/mlkraj159" } }
    li { a "Writing" { href "/work" } }
  }
}

footer.foot {
  p "This page is render static -- compiled once at build time. No server code runs to show it to you."
}
```

### `home/style.tss`

```tss
.eyebrow { fs 12px; uppercase; c #99a; ls 2px; mb 10px }
.hero h1 { fs 40px; mb 6px }
.hero h2 { fs 18px; fw 500; c #556; mb 16px }
.lede { maxw 560px; c #445; mb 20px }
.cta { d flex; gap 14px; mb 40px }
.cta a { p 10px 16px; br 10px; bg #111; c #fff; td none; fw 600 }
.cta a + a { bg #fff; c #111; border 1px solid #111 }
.stack, .now, .elsewhere { mb 32px }
h3 { fs 15px; uppercase; ls 1px; c #778; mb 12px }
.tools li { pb 6px }
.now p { maxw 560px; c #445 }
.links li { pb 6px }
.links a { c #2563eb }
.foot { mt 40px; pt 16px; border-top 1px solid #eef; fs 12px; c #889 }
.work .head { mb 32px }
.project { border-left 3px solid #111; pl 18px; mb 28px }
.tagline { c #667; mb 8px }
.facts { mt 8px; pl 18px; c #556 }
.facts li { pb 4px; fs 14px }
```

### `home/work/page.tw`

```tw
import "./../../style/global.tss"

page { title "Work -- Mlkraj" render static }

div.work {
  header.head {
    p.eyebrow "Selected work"
    h1 "Things I have built"
    p.lede "A few projects that best show how I think about systems."
    a "Back home" { href "/" }
  }

  article.project {
    h3 "TW Framework"
    p.tagline "A full-stack web framework with its own languages."
    p "Template language (.tw), styling language (.tss), server modules (.twm), a compiler with 93 diagnostics, an explicit cache layer with tag invalidation, and a CLI that ships to 15 deployment targets. 11 packages, zero runtime dependencies, 2692 tests."
    ul.facts {
      li "Compiler: lexer, parser, codegen, LSP integration"
      li "Cache: HIT/STALE/MISS windows, 270x speedup warm"
      li "Testing: 2692 unit/e2e tests, 322 evals, 6 bench gates"
    }
  }

  article.project {
    h3 "Chai Shop"
    p.tagline "An e-commerce storefront for single-estate tea."
    p "Product pages cached under one invalidation tag; publishing is a single action call. Built entirely in the framework it demonstrates -- the app is the test."
    ul.facts {
      li "Static product pages with cache windows"
      li "Tag-based invalidation on publish"
    }
  }

  article.project {
    h3 "Analytics Dashboard"
    p.tagline "Server-rendered metrics, client-hydrated controls."
    p "SSR panels with a minutes-profile cache, islands for the range switcher. The page teaches the cache layer by letting you watch the age header climb."
    ul.facts {
      li "SSR + islands composition"
      li "Explicit cache profiles from config"
    }
  }

  footer.foot {
    p "Every project above ships with its own verification story -- commands, not claims."
  }
}
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
a { color: #2563eb }
```

## How it works under the hood

Static pages compile once at build; `.tw/` contains the finished
HTML plus styles, and serving them is a file read (which is why the cache
metrics do not even apply -- there is nothing to revalidate). Links are
plain anchors; navigation is full page loads, which for a two-page site is
both simpler and faster than any SPA.

## Try it -- ten exercises

1. Build and serve; confirm both `/` and `/work` answer.
2. Add a third page (home/about/page.tw) and link it from the hero.
3. Add an image and style a hero band in global.tss.
4. Add `page { title "..." }` to each page and watch the titles in the tabs.
5. Try adding `render ssr` to one page -- now that page runs at request time.
6. Add a footer shared by both pages.
7. Deliberately break a link target and see what serving returns.
8. Ship it statically: `tw ship` with the github-pages adapter.
9. Add a `.tss` file per page and compare against the shared global.
10. Run the master gate.

## FAQ

**When do I outgrow static?** The moment content must reflect server
data per-request (users, carts, search). Until then, static is king.

**Can static pages have state?** State blocks need the runtime; on a static
page use `render island` for the interactive part instead.

**How do I add a 404?** `home/not-found.tw` is the convention -- see the
file-conventions table in AGENTS.md section 27.
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

