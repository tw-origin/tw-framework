# TW Framework — Guide: Building a Blog

This guide covers one thing completely: a content blog — post pages, dynamic slugs, an index page and a post template that shares its chrome.

---

## The Route Shape

```text
home/
├── layout.tw              ← site chrome: header, nav, footer
├── page.tw                ← the blog index (/)
└── blog/
    ├── layout.tw           ← blog chrome: reading width, post meta
    ├── [slug]/
    │   └── page.tw         ← one post (/blog/<slug>)
    └── page.tw             ← blog listing (/blog)
```

The dynamic `[slug]` folder serves every post with one template — `request`-free on pages, the slug arrives as the route param on the server, and the page reads it from `page { }`-level data or renders per post.

## The Post Template

```tw
// home/blog/[slug]/page.tw
page { title "Post — MyBlog" render island }

article.post {
  h1.post-title "Q3 Report"
  p.post-meta "Published 2026-09-01 · 6 min read"

  div.post-body {
    p "The body of the post..."
    h2 "Section"
    p "More content..."
    blockquote { "A quote worth pulling." }
  }

  // interactive island: the comment form hydrates on the client
  form on:submit.prevent "submitted = true" {
    input :value "comment" { type "text" placeholder "Add a comment" required }
    button "Post comment" { type "submit" }
  }
  if submitted { p "Thanks for the comment!" }
}

state { comment = "" submitted = false }
```

`render island` fits a blog exactly — content renders as static HTML, only the comment form hydrates.

## The Listing Page

```tw
// home/blog/page.tw
page { title "Blog — MyBlog" render static }

div.posts {
  for post in {POSTS} {
    article.post-row {
      h2 "{post.title}"
      p "{post.excerpt}"
      a "Read →" { href "/blog/{post.slug}" }
    }
  }
}

state {
  POSTS = [
    { title: "Q3 Report", slug: "q3-report", excerpt: "How the quarter went..." },
    { title: "Team Update", slug: "team-update", excerpt: "What changed this month..." },
    { title: "Shipping Faster", slug: "shipping-faster", excerpt: "Notes on the pipeline..." }
  ]
}
```

## Nested Layouts — Blog Gets Its Own Reading Chrome

```tw
// home/blog/layout.tw
div.blog-shell {
  nav.blog-nav {
    a "All posts" { href "/blog" }
    a "About" { href "/about" }
  }
  div.reading-width {
    slot { }
  }
}
```

The root layout still wraps everything — nav + footer on the outside, reading width inside. See [Layouts](./layouts.md).

## SEO Per Post

```tw
page { title "Q3 Report — MyBlog" description "How the quarter went" }

head {
  meta property "og:title" content "Q3 Report"
  meta property "og:type" content "article"
  link rel "canonical" href "https://myblog.com/blog/q3-report"
}
```

Full details in [SEO](./guide-seo.md).

## Deploying a Blog

Blogs are the canonical static site: `render static` on index and posts, `render island` where comments or search live.

```bash
tw build
tw adapter cloudflare     # or netlify / github-pages / vercel
```

Push — every platform serves `.tw/` from its CDN.

## Related

- [Dynamic routes](./project-tree.md) — `[slug]` patterns
- [Layouts](./layouts.md) · [Render Modes](./render-modes.md)
- [SEO](./guide-seo.md) · [Assets and Images](./guide-assets-images.md)
