# TW Framework — Guide: SEO

This guide covers one thing completely: making TW pages rank — titles, meta, Open Graph, clean URLs, sitemap and redirects.

---

## The Three Pillars

1. **Server-rendered HTML** — pages arrive fully readable by crawlers (static and SSR modes both)
2. **Per-page metadata** — unique title, description, canonical for every route
3. **Crawlable structure** — clean URLs, a sitemap, working redirects

---

## Unique Titles and Descriptions

Every page sets its own `page { }` — the fallback chain means a missing title inherits the layout's:

```tw
// home/blog/[slug]/page.tw
page {
  title "Q3 Report — MyBlog"
  description "How the quarter went, in numbers and lessons"
}
```

```tw
// home/blog/page.tw
page {
  title "Blog — MyBlog"
  description "Essays on building products"
}
```

## Open Graph and Twitter Cards

```tw
page { title "Product — MyStore" }

head {
  meta property "og:title" content "Widget — MyStore"
  meta property "og:description" content "The widget does everything you need"
  meta property "og:image" content "/img/widget-og.jpg"
  meta property "og:url" content "https://mystore.com/shop/widget"
  meta name "twitter:card" content="summary_large_image"
}
```

Use absolute URLs (with the domain) for `og:image` and `og:url`.

## Canonical URLs

```tw
head {
  link rel "canonical" href "https://myblog.com/blog/q3-report"
}
```

One canonical per page — pick the trailing-slash or non-slash form and stay consistent.

## Clean URLs — Automatic

The servers serve `/about` and `/about/` for the same page, and hashed assets are the same everywhere. The generated platform configs (Netlify, Cloudflare, Firebase, nginx) keep clean URLs working at the edge. No `.html` extensions anywhere.

## Sitemap

Static sites: generate a `sitemap.xml` at build time and commit it to `public/`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://myblog.com/</loc></url>
  <url><loc>https://myblog.com/blog</loc></url>
  <url><loc>https://myblog.com/blog/q3-report</loc></url>
</urlset>
```

`public/` is copied verbatim into `.tw/` — it lands at `/sitemap.xml`.

## robots.txt

`public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /admin/

Sitemap: https://myblog.com/sitemap.xml
```

## Redirects When URLs Change

```toml
# netlify.toml
[[redirects]]
  from = "/blog/old-slug"
  to = "/blog/new-slug"
  status = 301
```

Platform equivalents: `_redirects` (Cloudflare), `redirects` in `tw.config.ts` for `tw serve`. Permanent (301), not temporary.

## Render Mode and Crawlers

| Mode | Crawler sees |
|------|--------------|
| static | complete pre-rendered HTML |
| ssr | fully rendered HTML per request |
| island | complete static shell (content renders; islands hydrate after) |

Content lives in the markup, not behind client-only fetching — crawlers read it on first response.

## Checklist

```
□ Unique title + description per page
□ og:title / og:description / og:image on shareable pages
□ canonical URL on every page
□ sitemap.xml + robots.txt in public/
□ 301 redirects for every moved URL
□ One trailing-slash convention
```

## Related

- [Page Config](./syntax-page-config.md) · [Head Block](./syntax-head-block.md)
- [Render Modes](./render-modes.md) · [Project Structure](./project-tree.md)
