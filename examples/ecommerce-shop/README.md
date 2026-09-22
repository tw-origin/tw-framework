# E-Commerce Shop -- Cached Product Pages with Tag Invalidation

A product listing cached per the `products` tag with a 30-second revalidate window -- the canonical publish-then-invalidate pattern.

This example is part of the TW Framework example matrix -- every app here
builds with `tw build` and serves with `tw serve`, and CI builds all of
them on every push. It shows the exact flow most shops need: pages cached under a tag, publishes bumping the tag, customers always seeing fresh-enough data.

## Quick start

```sh
cd examples/ecommerce-shop
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

- `cache { revalidate 30, tag "products" }` -- explicit window, named invalidation family
- The publish action returning `revalidateTag: "products"` (updateTag semantics)
- The `x-tw-revalidated` header confirming an invalidation landed
- Why customers never wait for a render after a publish

## The files, one by one

### `home/page.tw`

```tw
import "./../style/global.tss"

page {
  title "Chai Shop -- Fresh from Assam"
  render ssr
  cache { revalidate 30, tag "products" }
}

div.shop {
  header.hero {
    h1 "Our Chais"
    p "Single-estate leaves, packed weekly. Cached for 30 seconds under the products tag -- publish bumps it instantly."
  }

  nav.categories {
    a "All" { href "/" }
    a "Black" { href "/?c=black" }
    a "Green" { href "/?c=green" }
    a "Blends" { href "/?c=blends" }
  }

  section.products {
    div.product {
      h3 "Masala Chai"
      p.desc "Assam CTC with cardamom, ginger, clove. The morning classic."
      span.price "₹249"
      span.badge "bestseller"
      button "Add to cart" { }
    }
    div.product {
      h3 "Assam Gold"
      p.desc "Second-flush orthodox leaves. Malty, bright, no milk needed."
      span.price "₹429"
      span.badge "single estate"
      button "Add to cart" { }
    }
    div.product {
      h3 "Green Elaichi"
      p.desc "Pan-fired green with whole green cardamom. Clean and floral."
      span.price "₹349"
      button "Add to cart" { }
    }
    div.product {
      h3 "Tulsi Clarity"
      p.desc "Rama tulsi and lemongrass. Caffeine-light, afternoon-friendly."
      span.price "₹299"
      button "Add to cart" { }
    }
    div.product {
      h3 "Kashmiri Noon"
      p.desc "Saffron, almond, cinnamon -- the pink tea of the valley."
      span.price "₹519"
      span.badge "limited"
      button "Add to cart" { }
    }
    div.product {
      h3 "Monsoon First Flush"
      p.desc "June pluck, high grown. Delicate with a wet-earth finish."
      span.price "₹479"
      button "Add to cart" { }
    }
  }

  section.about {
    h2 "Why it tastes different"
    p "We buy directly from three gardens in Assam and Darjeeling, in lots small enough to finish in a month. Nothing sits in a warehouse."
    ul {
      li "Packed the week it is plucked"
      li "No flavouring oils -- whole spices only"
      li "Compostable pouches"
    }
  }

  footer.foot {
    p "The publish flow: an action returns revalidateTag \"products\" and the whole listing re-renders on the next request. No customer ever waits for a cold render twice."
  }
}
```

### `home/style.tss`

```tss
.hero { mb 20px }
.hero h1 { fs 32px; mb 8px }
.hero p { c #567; maxw 520px }
.categories { d flex; gap 12px; mb 24px; pb 12px; border-bottom 2px solid #111 }
.categories a { c #111; fw 600; td none; pb 8px }
.products { d grid; grid-template-columns repeat(3, 1fr); gap 18px; mb 32px }
.product { bg #fff; br 14px; p 18px; d flex; fd column; gap 8px; box-shadow 0 1px 3px rgba(0,0,0,0.06) }
.product h3 { fs 17px }
.desc { fs 13px; c #667; min-h 36px }
.price { fs 18px; fw 700 }
.badge { fs 10px; uppercase; bg #111; c #fff; br 999px; p 2px 8px; w max-content }
.product button { mt auto; p 10px; br 10px; bg #16a34a; c #fff; fw 600; c-inherit none }
.about { bg #f6f7f9; br 14px; p 20px }
.about ul { mt 8px; pl 18px }
.about li { pb 4px }
.foot { mt 28px; pt 14px; border-top 1px solid #dde; fs 12px; c #889 }
```

### `style/global.tss`

```tss
body { font-family: system-ui; margin: 0; padding: 24px }
```

## How it works under the hood

The explicit window is {revalidate: 30, expire: default, stale: derived}.
The first request renders and stores; requests inside 30s are HITs served
in microseconds. When the shop owner publishes (an action with
`revalidateTag: "products"`), the tag index drops every entry in the
family immediately -- the NEXT customer request is a MISS, re-renders with
the new catalog, and the cache is warm again. The action response carries
`x-tw-revalidated: products` so tooling can prove the bump happened.

## Try it -- ten exercises

1. Build, serve, and `curl -sI /` twice -- the second response should be a HIT.
2. Add three more products to the list; rebuild.
3. Write a `fn actionPublish` in a route.twm returning `revalidateTag: "products"` (see examples/api-server for the exact shape).
4. POST to the action, then immediately GET / -- fresh data, MISS on the age header.
5. Change the window to `revalidate 5, expire 20` and watch the faster STALE-to-MISS cycle.
6. Add a product detail page at home/product/[id]/page.tw with its own tag.
7. Add `life "minutes"` instead of numbers and compare the resolved window.
8. Break it: `cache { life "nope" }` -- the build must fail (TW092 family).
9. Split the tag into `inventory` for one page and compare invalidation scope.
10. Run the master gate to confirm nothing regressed.

## FAQ

**What happens between revalidate and expire?** STALE: the customer
gets the cached page instantly, and the refresh happens in the background.
That is the shop-never-slows-down guarantee.

**Does a publish block the customer request?** No. The action bumps the
tag and returns; the next GET re-renders. The customer who triggered the
MISS waits for one render; everyone after gets the HIT.

**One tag for the whole shop?** Start there. Split tags when parts of the
catalog change at different rates (inventory vs pricing).
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

