# TW Framework — Metadata API

This document covers one thing completely: the page frontmatter fields that become `<meta>` tags automatically — description, keywords, and the Open Graph / Twitter Card set — in both the static build and server rendering.

---

## Frontmatter Fields

Everything lives in the `page { }` block a page already declares:

```tw
page {
  title "Veridian — Project Management"
  description "Plan, track and ship work with your team."
  keywords "project management, teams, planning"
  og_title "Veridian"
  og_description "Plan, track and ship work with your team."
  og_image "/social/veridian-card.png"
  render static
}

div.hero {
  h1 "Veridian"
}
```

| Field | Output |
|-------|--------|
| `title` | `<title>` (existing behavior) |
| `description` | `<meta name="description" content="...">` |
| `keywords` | `<meta name="keywords" content="...">` |
| `og_title` | `<meta property="og:title" content="...">` |
| `og_description` | `<meta property="og:description" content="...">` |
| `og_image` | `<meta property="og:image" content="...">` |

When any `og_*` field is present, the compiler also emits `<meta property="og:type" content="website">` and a `twitter:card` — `summary_large_image` when an image is set, `summary` otherwise.

## Rendered Output

The tags from the page above, as written into `.tw/index.html` by `tw build`:

```html
<meta name="description" content="Plan, track and ship work with your team.">
<meta name="keywords" content="project management, teams, planning">
<meta property="og:title" content="Veridian">
<meta property="og:description" content="Plan, track and ship work with your team.">
<meta property="og:image" content="/social/veridian-card.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```

The same tags are produced by server rendering (`render ssr` through the render pipeline), so a page renders identically whether pre-built or served on demand.

## Ordering

Metadata tags are injected at the top of `<head>`, before `head.tw` content. A page with a sibling `head.tw` can add anything the frontmatter does not cover — canonical URLs, JSON-LD, extra platform tags — and both sources combine:

```
frontmatter meta tags
global home/head.tw content
per-route head.tw content
```

## Escaping

Values are attribute-escaped (`&`, `"`, `<`) before emission, so a description containing quotes or ampersands cannot break out of the attribute.

## Per-Route Over Custom

Every page controls its own metadata — fields absent from the frontmatter simply produce no tag. A layout does not inherit fields down; the page is the single source of truth.

## Testing

```ts
const pipeline = new RenderPipeline({ rootDir, homeDir, enableCache: true });
const out = pipeline.render("/");
expect(out.html).toContain('<meta name="description" content="...">');
```

## Reference

- docs/syntax-page-config.md — the full `page { }` frontmatter
- docs/project-tree.md — `home/head.tw` global head content
- docs/isr.md — `revalidate`, which lives in the same block
