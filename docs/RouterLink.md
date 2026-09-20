# TW Framework — RouterLink

This document covers the `RouterLink` component completely and exactly: the syntax, every prop, the generated HTML, prefetch strategies, active-state highlighting, and how SPA navigation works under the hood.

---

## The Idea

A plain `<a href>` causes a full page reload. RouterLink gives you one component that does everything correctly:

1. **At compile time** — RouterLink becomes a plain, SEO-friendly `<a>` tag with the right attributes. Crawlers see an ordinary link; nothing from `@tw/RouterLink` is shipped to the browser.
2. **In the browser** — the TW client runtime (generated and loaded by the build system on every page, zero dependencies) intercepts same-origin link clicks and swaps the page content without a reload, prefetches pages, and keeps history working.

## Using RouterLink

The link text goes in the text slot; props go inside the braces:

```tw
import RouterLink from "@tw/RouterLink"

nav.nav {

  RouterLink "Home" {
    href "/"
    class "nav-link"
    activeClass "current"
  }

  RouterLink "About" {
    href "/about"
    class "nav-link"
    prefetch "viewport"
  }

  RouterLink "Docs" {
    href "https://example.com/docs"
  }

}
```

Conceptually it compiles to an ordinary `<a>` with the required navigation attributes. Output of the current version:

```html
<a href="/" data-tw-link data-tw-active-class="current" class="nav-link">Home</a>
<a href="/about" data-tw-link data-tw-prefetch="viewport" class="nav-link">About</a>
<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">Docs</a>
```

The class can also be written with the dot syntax, like any element: `RouterLink.nav-link "Home" { href "/" }`.

### Props

| Prop | What it does |
|------|--------------|
| `href` | destination — internal path or external URL. Required; without it the tag compiles to an HTML comment. |
| `class` / `id` | standard attributes (class also via dot syntax on the tag). |
| `activeClass` | CSS class applied while this link's route is current (see below). |
| `external` | force external handling — only useful with a relative-looking `href` you want treated as external; ordinary external URLs are detected automatically. |
| `native` | opt out of SPA navigation — plain full-page load (`data-tw-native`). |
| `prefetch` | `true` / `"viewport"` / `"hover"` / `false` / `null` — when to preload the target (see below). |
| `noPrefetch` | shorthand for `prefetch false` (kept for convenience — `prefetch false` is the primary form). |
| `target` / `rel` | explicit overrides for external links. |

## External Links — Automatic

These URL shapes are detected as external automatically (never SPA-navigated):

- web navigation: `http://`, `https://`, `//cdn.example.com/a.js` — new tab + safe rel
- browser-native: `mailto:`, `tel:`, `sms:`, `ftp:` — plain navigation, no forced target

Web URLs (`http://`, `https://`, `//`) get safe defaults: `target="_blank"` (opens in a new tab) and `rel="noopener noreferrer"` — `noopener` prevents the new page from accessing `window.opener`, `noreferrer` suppresses the HTTP `Referer` header. Browser-native schemes (`mailto:`, `tel:`, `sms:`, `ftp:`) are handed to the browser as-is — no forced new tab, no SPA. Explicit `target` / `rel` props override the defaults.

## Active-State Highlighting

```tw
RouterLink "Blog" {
  href "/blog"
  activeClass "current"
}
```

The runtime applies `current` to every link whose route matches the browser URL — on first load, after every SPA navigation, and on back/forward. The rules:

- exact match: `/blog` is active on `/blog`
- prefix match is **path-segment based, not raw string prefix**: `/blog` is active on `/blog/post-1`, but never on `/blogger`
- the home route `/` is only active on exactly `/`

This is a RouterLink feature — plain `a` tags do not get it.

## Prefetch

Prefetch loads the target page into the browser cache **before** the click, so navigation feels instant. The `prefetch` prop controls when:

| Value | When the page is fetched |
|-------|--------------------------|
| `prefetch true` | immediately on page load |
| `prefetch "viewport"` | when the link scrolls into view |
| `prefetch "hover"` (default) | when the pointer hovers the link |
| `prefetch false` | never |
| `prefetch null` / omitted | the TW default strategy — currently hover |

```tw
RouterLink "Home" {
  href "/"
  prefetch true          // hero navigation: fetch right away
}

RouterLink "Deep Report" {
  href "/report"
  prefetch "viewport"     // footer link: fetch when it appears on screen
}

RouterLink "Heavy Page" {
  href "/analytics"
  prefetch false          // never fetch ahead of the click
}
```

Details that matter:

- **The default is hover for every same-origin anchor** — including plain `a` tags, with or without RouterLink.
- `prefetch true` is compiled to the internal `always` prefetch mode (`data-tw-prefetch="always"`).
- `viewport` uses an IntersectionObserver with a 200px margin, so the page is fetched just before the link enters the screen. When IntersectionObserver is unavailable, it falls back to fetching immediately.
- Every page is fetched at most once — a hover-prefetched page is not fetched again by `viewport` or `always`.

## How SPA Navigation Works

The runtime intercepts clicks and swaps content without a reload:

1. **Which clicks** — left clicks on same-origin `a[href]`, with no modifier keys held. Links with `target="_blank"` or `data-tw-native` are left to the browser; API routes (`/api/*`) are not document navigation — the browser requests them directly.
2. **Fetch** — the target page's HTML is fetched in the background with an `X-TW-Navigate: 1` header.
3. **Swap** — a page compiled with an interactive root swaps only `[data-tw-root]`; a fully static page swaps the whole `<body>`. The page state is replaced by the incoming route's `__tw_state` seed (reinitialized, not merged), route-specific stylesheets are synced into the head, and the document title updates.
4. **History** — `history.pushState` records the navigation; back/forward triggers a re-fetch of the corresponding page.
5. **Fallbacks** — any failure falls back to a normal full-page navigation. The scroll resets to the top after each swap.

`RouterLink` adds the markers on top of this machinery — plain `a` tags already participate in SPA navigation and hover prefetch by default; RouterLink is the component API that adds explicit prefetch control, external-link safety, and active-state handling on top.

## Plain Anchors

Ordinary `a` tags work as before — the runtime already treats them as SPA links and hover-prefetches them:

```tw
a.nav-link "About" {
  href "/about"
}
```

## Programmatic Navigation

The runtime exposes a small API on every page:

The runtime exposes a small API on every page. `__tw.eval()` evaluates a TW-generated expression in the current page scope — it is not a general-purpose JavaScript eval API; never pass untrusted user input to it.

```js
__tw.navigate("/about")   // SPA navigation to a path
__tw.state                // the live page state object
__tw.refresh()            // re-render interpolations, lists, conditions
__tw.eval("count + 1")    // evaluate a TW-generated expression in page scope
```

## Quick Reference

```tw
import RouterLink from "@tw/RouterLink"

RouterLink "Home" { href "/" activeClass "current" prefetch true }
RouterLink.nav-link "About" { href "/about" }            // dot class
RouterLink "Docs" { href "https://example.com" }          // new tab, noopener
RouterLink "Full load" { href "/x" native }
RouterLink "No pf" { href "/y" prefetch false }
```

```
Markers:   data-tw-link (SPA) · data-tw-active-class · data-tw-native · data-tw-no-prefetch · data-tw-prefetch (always/viewport/hover)
External:  auto target=_blank + rel=noopener noreferrer
Runtime:   __tw.navigate(path) · __tw.state · __tw.refresh() · hover/viewport/always prefetch · popstate
```

## Related

- [Project Tree](./project-tree.md) — the route tree and file-based routing
- [optImage](./optImage.md) — the optImage component
- [Deployment](./deployment-adapters.md) — hosting targets and adapters
- [Client Runtime](./client-runtime.md) — hydration, state, and events
