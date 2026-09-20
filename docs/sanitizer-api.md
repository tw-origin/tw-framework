# TW Framework — HTML Sanitizer

This document covers one thing completely: `HTMLSanitizer` from `@tw/security` — stripping dangerous tags, attributes, and markup from untrusted HTML before rendering or storing it.

---

## Basic Use

```twm
import { createSanitizer } from "@tw/security"

const sanitizer = createSanitizer()
const clean = sanitizer.sanitize(userHtml)
```

`sanitize(html)` returns the sanitized string with dangerous constructs removed.

## Configuration

```twm
const sanitizer = createSanitizer({
  allowedTags: ["div", "p", "strong", "em", "a"],
  removedTags: ["marquee"],          // additionally removed + treated as dangerous
  allowedAttributes: ["href", "title"],
})
```

| Option | Effect |
|--------|--------|
| `allowedTags` | ADDED to the built-in safe set |
| `removedTags` | REMOVED from the allowed set and treated as dangerous (works — evaluation order fixed) |
| `allowedAttributes` | ADDED to the safe global attributes |

## What Is Removed

- **Dangerous tags** — script/style/iframe-family and anything on the dangerous list — removed with their content.
- **Event handler attributes** — every `on*` attribute, always, regardless of configuration.
- **Unsafe URL schemes** — `javascript:` and similar in `href`/`src` values.
- **Malformed markup** — unclosed dangerous constructs cannot smuggle through.

## What Survives

The default allowed set covers normal content markup: paragraphs, headings, lists, tables, emphasis, links, images with safe attributes. Removed tags are dropped; harmless unknown tags are escaped.

## Pattern: Rich-Text Comment Field

```twm
const sanitizer = createSanitizer({
  allowedTags: ["b", "i", "em", "strong", "p", "br"],
  allowedAttributes: [],
})

fn post(request) {
  const body = request.body.json
  const clean = sanitizer.sanitize(String(body.comment))
  await db.comments.insert({ text: clean, user: request.session.userId })
  return { status: 201, json: { ok: true } }
}
```

Store the SANITIZED form — render-time escaping (the default in `.tw` interpolation, doc 16) still applies on top, giving two independent layers.

## Rules

- Sanitize on the SERVER — client-side sanitization is cosmetic and bypassable.
- Prefer the narrowest tag/attribute list your feature needs; you can always widen it.
- Sanitization is not validation: semantic checks (length, structure) still belong to the request validation layer (doc 88).
