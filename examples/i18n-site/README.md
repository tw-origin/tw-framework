# Bilingual Site -- Directory-Based Locales

English and Hindi editions of the same site as real sibling routes -- one codebase, two first-class locales, zero runtime switching.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It is the reference for locale architecture in TW: directory routes, not query parameters.

## Quick start

```sh
cd examples/i18n-site
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

- One directory per locale (home/en/, home/hi/) each rendering at its own path
- Fully local titles and content -- nothing machine-swapped at runtime
- Cross-locale links without a redirect layer
- Why URL-based locales beat a runtime switcher for caching and SEO

## The files, one by one

### `home/en/page.tw`

```tw
import "./../../style/global.tss"

page { title "Welcome -- Bilingual TW Site" render ssr }

div.page {
  header.head {
    p.eyebrow "English edition"
    h1 "Welcome"
    p "This page is in English. Its sibling at /hi is the same site in Hindi -- separate routes, separate titles, one codebase."
    a "हिन्दी में पढ़ें" { href "/hi" }
  }

  nav.steps {
    h2 "How the locale split works"
    ol {
      li "One directory per locale: home/en/ and home/hi/"
      li "Each renders at its own path: /en and /hi"
      li "Cross-links switch locales without a redirect layer"
      li "Titles, headings, and body text are fully local -- nothing is machine-swapped at runtime"
    }
  }

  section.content {
    h2 "Why routes and not a runtime switcher"
    p "Two real pages mean the framework can cache, prerender, and ship each locale independently. A runtime switcher adds a query parameter and a cache dimension; directory-based locales keep the URL as the single source of truth, which search engines and users both prefer."
  }

  footer.foot {
    p "Part of the TW example matrix: examples/i18n-site."
  }
}
```

### `home/hi/page.tw`

```tw
import "./../../style/global.tss"

page { title "स्वागत है -- द्विभाषी TW साइट" render ssr }

div.page {
  header.head {
    p.eyebrow "हिन्दी संस्करण"
    h1 "स्वागत है"
    p "यह पृष्ठ हिन्दी में है। /en पर इसी साइट का अंग्रेज़ी संस्करण है -- अलग रूट, अलग शीर्षक, एक ही कोडबेस।"
    a "Read in English" { href "/en" }
  }

  nav.steps {
    h2 "भाषा-विभाजन कैसे काम करता है"
    ol {
      li "हर भाषा का अपना डायरेक्टरी: home/en/ और home/hi/"
      li "हर एक अपने पथ पर रेंडर होता है: /en और /hi"
      li "क्रॉस-लिंक बिना रीडायरेक्ट लेयर के भाषा बदलती हैं"
      li "शीर्षक और पाठ पूरी तरह स्थानीय हैं -- रनटाइम पर कुछ भी मशीन से नहीं बदलता"
    }
  }

  section.content {
    h2 "रनटाइम स्विचर नहीं, असली रूट क्यों"
    p "दो असली पृष्ठों का मतलब है कि फ्रेमवर्क हर भाषा को अलग से कैश और प्रीरेंडर कर सकता है। रनटाइम स्विचर एक क्वेरी पैरामीटर जोड़ता है और कैश का एक नया आयाम बनाता है; डायरेक्टरी-आधारित भाषाएँ URL को सच्चा स्रोत बनाए रखती हैं, जिसे सर्च इंजन और उपयोगकर्ता दोनों पसंद करते हैं।"
  }

  footer.foot {
    p "TW उदाहरण मैट्रिक्स का हिस्सा: examples/i18n-site।"
  }
}
```

### `home/style.tss`

```tss
.eyebrow { fs 12px; uppercase; ls 2px; c #99a; mb 10px }
.head h1 { fs 34px; mb 10px }
.head p { maxw 560px; c #445; mb 16px }
.head a { c #2563eb; fw 600 }
.steps { mb 28px }
.steps h2, .content h2 { fs 18px; mb 10px }
.steps ol { pl 18px }
.steps li { pb 6px; fs 14px }
.content { mb 28px; maxw 560px }
.content p { c #445; fs 14px }
.foot { mt 32px; pt 14px; border-top 1px solid #eef; fs 12px; c #889 }
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
```

## How it works under the hood

Each locale is a real page with its own route, so the framework caches
and prerenders them independently -- /en and /hi are separate cache
entries, separate titles, separate HTML. A runtime switcher would add a
query parameter (a new cache dimension per locale) and split link equity;
directory routes keep the URL as the single source of truth, which search
engines and users both prefer. Adding a third language is adding a third
directory -- no framework configuration changes at all.

## Try it -- ten exercises

1. Build and serve; confirm /en and /hi both answer with their own titles.
2. Add a /ta (Tamil) edition: home/ta/page.tw -- it just works.
3. Add a shared layout.tw to hold header/footer across locales.
4. Give each locale a second page and cross-link within the locale.
5. Try a locale switcher that PRESERVES the path (en/about -> hi/about).
6. Add cache blocks to both pages and confirm they cache separately.
7. Serve and check the tab titles -- each locale has its own.
8. Break a cross-link and observe the 404 surface.
9. Ship the static form to github-pages via tw ship.
10. Run the master gate.

## FAQ

**How do I share layouts between locales?** layout.tw in the shared
parent applies to children; per-locale overrides win. See the file
conventions table in AGENTS.md section 27.

**Should the root / pick a locale?** Make / a small redirecting page that
reads the Accept-Language header, or a neutral landing that links both.
Keep the real content under /en, /hi, and friends.

**Do unicode URLs work?** Yes -- the kitchen-sink example serves /hi with
Devanagari content; the router and the cache handle unicode paths natively.

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

