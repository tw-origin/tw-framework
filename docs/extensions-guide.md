# TW Framework — Extensions Guide

TW Framework uses 4 primary extensions plus 5 style variants. This document explains every extension, when to use it, and what the compiler does with each.

---

## Extension Hierarchy

```
.tw   = King — full UI component (markup + state + events + styles)
.tss  = Style — standalone stylesheets (CSS + shorthands)
.twm  = Server — server-side modules (API routes, middleware)
.ts   = Logic — pure TypeScript (utils, config, helpers)
```

---

## 1. `.tw` — UI Component

**What it is:** A full TW language file containing markup, state, events, and inline styles.

**What the compiler does:**
1. Parse TW syntax (tags, attributes, directives)
2. Transform (hoist directives, mark VDOM, SSR attributes)
3. Optimize (dead code elimination, constant folding)
4. Generate HTML + CSS + JS output

**When to use:**
- Pages (`page.tw`)
- Layouts (`layout.tw`)
- Templates (`template.tw`)
- Loading UI (`loading.tw`)
- Error boundaries (`error.tw`)
- Not-found pages (`not-found.tw`)
- Global error (`global-error.tw`)
- Head content (`head.tw`)
- Parallel defaults (`default.tw`)
- Reusable components (`Button.tw`, `Header.tw`)

**Example:**

```tw
import Header from "@./components/Header.tw"
import "@./style/home.tss"

page {
  title "Home"
  render ssr
}

state {
  count = 0
}

div.container {
  Header { }
  h1 "Hello World"
  button.btn on:click "count++" {
    "Clicked {count} times"
  }
}
```

**Can contain:**
- `page { }` config block
- `import` statements
- `state { }` block
- Markup with `tag.class attrs { children }`
- `{interpolation}`
- `on:event "handler"` event bindings
- `:prop "expr"` property bindings
- `if/for/while/switch/try` control flow
- `<style>` blocks (inline TSS)
- `slot { }` (in layouts)

**Cannot contain:**
- `fn get(request)` (that is `.twm`)
- `rule "name"` (that is `middleware.twm`)

---

## 2. `.twm` — Server Module

**What it is:** A server-side file containing JavaScript functions. It runs on the server, not in the browser.

**What the compiler does:**
1. Parse the function definitions
2. Execute the appropriate function based on HTTP method
3. Return the result as JSON (or HTML/text)

**When to use:**
- API routes (`route.twm`)
- Middleware (`middleware.twm`)

**Example — API route (`home/api/users/route.twm`):**

```twm
fn get(request) {
  const users = [
    { id: 1, name: "Aarav", email: "aarav@example.com" },
    { id: 2, name: "Sara", email: "sara@example.com" }
  ]

  const role = String(request.query?.role || "").toLowerCase()
  if (role) {
    return { status: 200, json: { data: users.filter(u => u.role === role) } }
  }

  return { status: 200, json: { data: users, count: users.length } }
}

fn post(request) {
  const body = request.body || {}
  if (!body.name || !body.email) {
    return { status: 400, json: { error: "Name and email required" } }
  }
  return { status: 201, json: { ok: true, data: { id: 99, ...body } } }
}

fn delete(request) {
  const id = request.params.id
  return { status: 200, json: { ok: true, deleted: id } }
}
```

**Example — Middleware (`middleware.twm`):**

```twm
rule "blocked-bots" {
  match "/**"
  user_agent {
    allow ["googlebot", "bingbot", "gptbot"]
    block ["curl/", "wget/", "python-requests", "scrapy"]
    empty_is_blocked false
  }
  response {
    status 403
    html "<h1>403 Forbidden</h1>"
  }
}

rule "api-rate-limit" {
  match "/api/**"
  rate_limit { requests 60, window 60, identity "path" }
  response { status 429, json { error "Too many requests" } }
}
```

**HTTP methods supported in route.twm:**
- `fn get(request)` → GET
- `fn post(request)` → POST
- `fn put(request)` → PUT
- `fn patch(request)` → PATCH
- `fn delete(request)` → DELETE

**Request object properties:**
- `request.query` — URL query parameters
- `request.params` — Route parameters (e.g., `[id]` → `request.params.id`)
- `request.body` — Parsed request body (JSON)
- `request.headers` — Request headers
- `request.method` — HTTP method
- `request.path` — URL path

**Response format:**
```twm
return { status: 200, json: { key: "value" } }    // JSON response
return { status: 200, html: "<h1>Hello</h1>" }     // HTML response
return { status: 200, text: "Hello" }              // Plain text
return { status: 301, redirect: "/new-url" }       // Redirect
```

---

## 3. `.tss` — TW Style Sheets

**What it is:** A standalone stylesheet using CSS syntax with optional TW shorthands.

**What the compiler does:**
1. Parse CSS/TSS syntax
2. Expand shorthands (`bg` → `background`, `p` → `padding`, etc.)
3. Output standard CSS

**When to use:**
- Global styles (`globals.tss`)
- Section styles (`blog.tss`, `dashboard.tss`)
- Theme definitions (`themes.tss`)
- Variables (`variables.tss`)
- Animations (`animations.tss`)

**Example:**

```tss
$primary: #2563eb
$radius: 8px

.hero {
  text-align center
  padding 80px 20px

  h1 {
    font-size 48px
    font-weight 700
  }
}

.btn {
  bg $primary
  br $radius
  color white
  p 10px 18px

  &:hover {
    bg #1d4ed8
  }
}

@media (max-width: 768px) {
  .hero { padding 40px 16px }
}
```

**Key feature:** Plain CSS also works in `.tss` files. Shorthands are optional.

```tss
/* This is valid in a .tss file: */
.box {
  background: #fff;      /* plain CSS — works */
  padding: 20px;          /* plain CSS — works */
  bg #fff                 /* TSS shorthand — also works */
  p 20px                  /* TSS shorthand — also works */
}
```

---

## 4. `.ts` — TypeScript

**What it is:** Pure TypeScript file for logic, utilities, and configuration.

**What the compiler does:**
1. Compile TypeScript to JavaScript
2. Bundle as needed

**When to use:**
- Config (`tw.config.ts`)
- Utility functions (`lib/utils.ts`)
- API helpers (`lib/api.ts`)
- Database logic (`lib/db.ts`)
- Type definitions

**Example:**

```typescript
// lib/utils.ts

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, "-");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
```

**Why not `.tw`?** `.tw` files are compiled through the TW parser (markup + state + events). `.ts` files are compiled through the TypeScript compiler directly. Logic files have no markup, so `.ts` is correct.

---

## Style File Variants

In addition to `.tss`, TW Framework supports 4 more style file types:

### `.module.tss` — Scoped TSS

```tss
/* Button.module.tss */
.btn {
  bg #2563eb
  color white
  p 10px 18px
  br 8px
}
```

Class names are automatically scoped (hashed) so they only affect the component they belong to. No style leakage.

### `.css` — Plain Global CSS

```css
/* globals.css */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; }
```

Standard CSS. No shorthands. Use for third-party overrides, resets, and legacy CSS.

**IMPORTANT:** If you write TSS shorthands (like `bg`, `p`, `m`) in a `.css` file, the compiler will throw an error:

```
Error: TSS shorthand "bg" is not valid in a .css file.

  → File: components/Card.module.css:12:3
  → Written: bg: #f00;
  → Problem: "bg" is a TSS shorthand, not a CSS property.

  Fix:
    1. Use full CSS property:  background: #f00;
    2. Rename file to .tss:    Card.module.tss (shorthands allowed)
```

### `.module.css` — Scoped Plain CSS

```css
/* Card.module.css */
.card {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
}
```

Same as `.css` but class names are scoped. Use when you want CSS Modules without shorthands.

### `.scss` — SCSS/Sass

```scss
/* themes.scss */
$primary: #2563eb;
$dark-bg: #0d1117;

@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.dashboard {
  background: $dark-bg;

  .sidebar {
    width: 240px;

    a {
      color: lighten($primary, 20%);
      padding: 8px 12px;

      &:hover {
        color: $primary;
      }
    }
  }

  .main-content {
    @include flex-center;
    flex-direction: column;
  }
}
```

Full SCSS/Sass support: nesting, mixins, `$variables`, `@include`, `@each`, `@if`, functions, etc.

---

## Complete Extension Summary

| Extension | Language | Purpose | Output | Where |
|-----------|----------|---------|--------|-------|
| `.tw` | TW syntax | UI components (markup + state + events) | HTML + CSS + JS | `home/`, `components/` |
| `.twm` | JS functions | API routes, middleware | JSON / HTML / Text | `home/api/`, root |
| `.tss` | CSS + shorthands | Standalone styles | CSS | `style/`, co-located |
| `.module.tss` | CSS + shorthands (scoped) | Component styles | Scoped CSS | Co-located with component |
| `.css` | Plain CSS | Global styles, resets | CSS | `style/`, `public/css/` |
| `.module.css` | Plain CSS (scoped) | Component styles (no shorthands) | Scoped CSS | Co-located with component |
| `.scss` | SCSS/Sass | Complex styles with mixins/variables | CSS | `style/` |
| `.ts` | TypeScript | Logic, config, utils | JS | `lib/`, root |

---

## When to Use Each — Decision Tree

```
Do you need UI (markup, state, events)?
  ├─ YES → Is it a route page? → .tw (page.tw)
  │       Is it a layout? → .tw (layout.tw)
  │       Is it a component? → .tw (Button.tw)
  │       Is it loading/error UI? → .tw (loading.tw, error.tw)
  │
  └─ NO → Do you need an API endpoint? → .twm (route.twm)
          Do you need middleware? → .twm (middleware.twm)
          Do you need styles only?
          ├─ With shorthands? → .tss
          ├─ With shorthands + scoped? → .module.tss
          ├─ Plain CSS? → .css
          ├─ Plain CSS + scoped? → .module.css
          └─ SCSS with mixins? → .scss
          Do you need pure logic? → .ts
```

---

## Naming Conventions

### Component files
```
Button.tw              ← Component
Button.module.tss      ← Scoped styles for Button
Button.module.css      ← Scoped plain CSS alternative
```

### Page files
```
home/page.tw           ← Home route (/)
home/about/page.tw     ← About route (/about)
home/blog/page.tw      ← Blog index (/blog)
```

### API files
```
home/api/route.twm           ← /api
home/api/users/route.twm     ← /api/users
home/api/users/[id]/route.twm ← /api/users/:id
```

### Style files
```
style/globals.tss      ← Global styles (reset, base)
style/themes.tss       ← Theme definitions
style/variables.tss    ← Variables (colors, spacing)
```

---

## Import Syntax

### Import a component
```tw
import Header from "@./components/Header.tw"
```

### Import a style (side-effect import)
```tw
import "@./style/global.tss"
```

### Import a scoped style
```tw
import styles from "@./components/Button.module.tss"
```

### Import TypeScript utilities
```tw
import { formatDate } from "@./lib/utils.ts"
```

### Import in .twm (API routes)
```twm
fn get(request) {
  const { slugify } = require("./lib/utils.ts")
  // ...
}
```

---

## Common Mistakes

| Mistake | Correct | Why |
|---------|---------|-----|
| `home/loading.twm` | `home/loading.tw` | All UI special files use `.tw` |
| `home/route.tw` | `home/api/route.twm` | API routes use `.twm` |
| `home/middleware.tw` | `middleware.twm` (root) | Middleware is at root, uses `.twm` |
| Writing `bg: #fff` in `.css` file | Use `.tss` or write `background: #fff` | Shorthands only work in `.tss` |
| Writing `fn get()` in `.tw` | Use `.twm` for API functions | `.tw` is for UI, `.twm` is for server |
| Writing markup in `.twm` | Use `.tw` for markup | `.twm` is for server-side functions |
