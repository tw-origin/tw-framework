# TW Framework — Template Engine

This document covers one thing completely: the `TemplateEngine` class from `@tw/server` — compiling and rendering `{{mustache}}`-style templates with escaping by default, blocks, partials, and helpers.

---

## Quick Render

```twm
import { createTemplateEngine } from "@tw/server"

const engine = createTemplateEngine()
const html = engine.render("Hello {{name}}!", { name: "Asha & Co" })
// "Hello Asha & Co" — values are HTML-escaped by default
```

## The Engine

```twm
const engine = createTemplateEngine({
  escape: true,      // HTML-escape every {{value}} unless {{&value}} is used
})
```

| Method | Purpose |
|--------|---------|
| `compile(source, name?)` | Parse once into a cached `CompileResult` |
| `render(source, data)` | Compile (or reuse cache) + render with `data` |
| `registerHelper(name, fn)` | Custom `{{helper arg}}` functions |

## Syntax

| Form | Result |
|------|-------|
| `{{name}}` | Value, HTML-escaped (`& < > " ' /` encoded) |
| `{{&name}}` | Value, raw — trusted HTML only |
| `{{user.city}}` | Dot-path into nested objects |
| `{{!comment}}` | Renders nothing |
| `{{>partial}}` | Include a registered partial |
| `{{helper arg}}` | Helper call |

### Blocks

| Block | Behavior |
|-------|----------|
| `{{#if user}}…{{/if}}` | Renders children when truthy; `{{else}}` supported |
| `{{#unless locked}}…{{/unless}}` | Renders children when falsy |
| `{{#each items}}…{{/each}}` | Repeats children per array item |
| `{{#with user}}…{{/with}}` | Merges the object's fields into scope |

Inside `each`, the current item is `{{this}}`, and `{{index}}`, `{{first}}`, `{{last}}` are available:

```twm
engine.render(
  "{{#each items}}<li>{{index}}. {{this}}</li>{{/each}}",
  { items: ["One", "Two"] },
)
// "<li>0. One</li><li>1. Two</li>"
```

## Built-in Helpers

The engine ships with: `upper`, `lower`, `capitalize`, `trim`, `repeat`, `truncate`, `default`, `join`, `split`, `length`, `startsWith`.

```twm
engine.render("{{upper name}}", { name: "asha" })            // "ASHA"
engine.render("{{truncate bio 20}}", { bio: longBio })          // first 20 chars + "..."
engine.render("{{default nickname \"Guest\"}}", {})             // "Guest"
```

Add your own:

```twm
engine.registerHelper("money", (v: unknown) => "₹" + Number(v).toFixed(2))
engine.render("{{money price}}", { price: 42.5 })               // "₹42.50"
```

## Escaping Discipline

- `{{name}}` escapes `&`, `<`, `>`, `"`, `'`, `/` — safe in text and attribute positions.
- `{{&name}}` bypasses escaping — only for values you generated or sanitized yourself.
- Unknown variables render as empty strings; malformed templates raise a `TemplateError` from `compile` with line information.

## Compile-Once Pattern

`compile(source, name)` caches the parse tree by name — hot loops reuse it:

```twm
engine.compile("<tr><td>{{sku}}</td><td>{{qty}}</td></tr>", "row")
for (const line of lines) rows += engine.render("row", line)
```

## Where It Runs

The engine powers server-rendered email templates, API text bodies, and any string templating outside `.tw` pages. Page rendering itself uses the TW compiler — this engine is for everything else.
