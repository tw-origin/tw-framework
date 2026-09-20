# TW Framework — Project Tree & File-Based Routing

This document explains the complete directory structure and file-based routing system of TW Framework. After reading this, you will understand exactly where to place every file and how the routing system works.

---

## Core Routing Principle

> **The file system IS the routing configuration.**

You do not register routes manually. You do not import layouts manually. The TW compiler scans your `home/` directory and generates the route graph automatically.

---

## The `home/` Directory

The `home/` directory is the root routing directory. It is NOT included in the URL.

```
my-app/
└── home/
    └── page.tw
```

**Result:** `home/page.tw` serves at `/`

---

## Complete Project Structure

```
my-app/
│
├── home/                           ← Root routing directory (NOT in URL)
│   │
│   │ ─── Special Files (root level) ───────────────────────
│   ├── layout.tw                   ← Root layout (wraps EVERY page)
│   ├── page.tw                     ← Home page → /
│   ├── loading.tw                  ← Global loading UI (suspense skeleton)
│   ├── error.tw                    ← Global error boundary
│   ├── not-found.tw                ← Global 404 page
│   ├── global-error.tw             ← Catches root-level errors (replaces root layout)
│   ├── template.tw                 ← Root template (re-renders on every navigation)
│   ├── head.tw                     ← Global <head> content (meta, OG, fonts)
│   │
│   │ ─── Normal Routes ────────────────────────────────────
│   ├── about/
│   │   └── page.tw                 → /about
│   ├── pricing/
│   │   └── page.tw                 → /pricing
│   ├── contact/
│   │   └── page.tw                 → /contact
│   │
│   │ ─── Nested Routes ─────────────────────────────────────
│   ├── blog/
│   │   ├── layout.tw               ← Blog section layout (wraps all blog/* pages)
│   │   ├── page.tw                 → /blog
│   │   ├── loading.tw              ← Blog loading skeleton
│   │   ├── error.tw                ← Blog error boundary
│   │   ├── [slug]/
│   │   │   └── page.tw             → /blog/hello-world
│   │   ├── category/
│   │   │   └── [...slug]/
│   │   │       └── page.tw         → /blog/category/tech/web
│   │   └── tag/
│   │       └── [[...tags]]/
│   │           └── page.tw         → /blog/tag  OR  /blog/tag/js,css
│   │
│   │ ─── Route Groups ──────────────────────────────────────
│   ├── (marketing)/                ← Route group (NOT in URL)
│   │   ├── layout.tw               ← Marketing section layout
│   │   ├── about/
│   │   │   └── page.tw             → /about (NOT /marketing/about)
│   │   ├── pricing/
│   │   │   └── page.tw             → /pricing
│   │   ├── contact/
│   │   │   └── page.tw             → /contact
│   │   └── _components/            ← Private folder (excluded from routing)
│   │       ├── Hero.tw
│   │       └── PricingCard.tw
│   │
│   │ ─── Parallel Routes ───────────────────────────────────
│   ├── dashboard/
│   │   ├── layout.tw               ← Dashboard shell (sidebar + main)
│   │   ├── page.tw                 → /dashboard
│   │   ├── loading.tw
│   │   ├── @analytics/             ← Parallel route slot 1
│   │   │   ├── default.tw          ← Fallback when slot has no match
│   │   │   ├── page.tw             → /dashboard (analytics slot content)
│   │   │   └── [range]/
│   │   │       └── page.tw         → /dashboard/7d (analytics for range)
│   │   ├── @team/                  ← Parallel route slot 2
│   │   │   ├── default.tw
│   │   │   └── page.tw
│   │   ├── settings/
│   │   │   ├── page.tw             → /dashboard/settings
│   │   │   └── head.tw             ← Per-route SEO for settings page
│   │   └── users/
│   │       ├── page.tw             → /dashboard/users
│   │       └── [id]/
│   │           ├── page.tw         → /dashboard/users/42
│   │           ├── loading.tw
│   │           └── (..)photo/      ← Intercepting route (modal!)
│   │               └── [photoId]/
│   │                   └── page.tw → intercepts /dashboard/users/42/photo/1
│   │
│   │ ─── Shop with Optional Catch-All ──────────────────────
│   ├── shop/
│   │   ├── layout.tw
│   │   ├── page.tw                 → /shop
│   │   ├── product/
│   │   │   └── [handle]/
│   │   │       ├── page.tw         → /shop/product/nike-air-max
│   │   │       ├── loading.tw
│   │   │       └── head.tw         ← Product OG image + price meta
│   │   └── [[...category]]/        ← Optional catch-all category
│   │       └── page.tw             → /shop  OR  /shop/electronics/phones
│   │
│   │ ─── API Routes ────────────────────────────────────────
│   ├── api/                        ← API routes (return JSON, not HTML)
│   │   ├── route.twm               → GET /api, POST /api
│   │   ├── users/
│   │   │   ├── route.twm           → GET /api/users, POST /api/users
│   │   │   └── [id]/
│   │   │       └── route.twm       → GET /api/users/42
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.twm       → /api/auth/signin, /api/auth/callback
│   │
│   │ ─── Docs with Catch-All ───────────────────────────────
│   └── docs/
│       ├── layout.tw
│       ├── page.tw                 → /docs
│       └── [...rest]/
│           └── page.tw             → /docs/getting-started/installation
│
├── components/                     ← Global reusable components
│   ├── Button.tw
│   ├── Card.tw
│   ├── Nav.tw
│   ├── Footer.tw
│   └── Header.tw
│
├── style/                          ← Global standalone styles
│   ├── globals.tss                 ← Global TSS (reset, base styles)
│   ├── themes.tss                  ← Theme definitions (light/dark)
│   ├── variables.tss               ← TSS variables (colors, spacing)
│   └── animations.tss              ← Shared animations
│
├── lib/                            ← Utility functions, helpers (pure TypeScript)
│   ├── utils.ts
│   ├── api.ts
│   └── db.ts
│
├── public/                         ← Static assets (served as-is, no processing)
│   ├── favicon.ico
│   ├── css/
│   ├── js/
│   ├── img/
│   │   ├── logo.png
│   │   └── og-default.png
│   └── robots.txt
│
├── middleware.twm                  ← ROOT middleware (runs before ALL routes)
│
├── tw.config.ts                    ← Framework configuration
├── package.json
├── tsconfig.json
├── .gitignore
├── vercel.json
└── README.md
```

---

## Routing Patterns — Complete Reference

### 1. Root Route

The root of your application. `home/page.tw` serves at `/`.

```
home/
└── page.tw         → /
```

### 2. Normal Routes

Every URL segment is a directory. Every route entry is `page.tw` inside that directory.

```
home/
├── about/
│   └── page.tw     → /about
├── pricing/
│   └── page.tw     → /pricing
└── contact/
    └── page.tw     → /contact
```

**IMPORTANT:** Do NOT use `about.tw` directly. Always use `about/page.tw`. This keeps routing predictable and makes every route follow the same structure.

### 3. Nested Routes

Directories can be nested arbitrarily deep.

```
home/
└── blog/
    ├── page.tw          → /blog
    └── posts/
        └── page.tw      → /blog/posts
```

### 4. Dynamic Routes

Square brackets `[param]` create dynamic URL parameters.

```
home/
└── blog/
    └── [slug]/
        └── page.tw
```

| URL | Matches |
|-----|---------|
| `/blog/hello-world` | Yes — `slug = "hello-world"` |
| `/blog/tw-framework` | Yes — `slug = "tw-framework"` |
| `/blog/my-post` | Yes — `slug = "my-post"` |

The value is available as `params.slug` in your page.

### 5. Catch-All Routes

`[...param]` matches one or more URL segments.

```
home/
└── docs/
    └── [...slug]/
        └── page.tw
```

| URL | Matches |
|-----|---------|
| `/docs/a` | Yes — `slug = "a"` |
| `/docs/a/b` | Yes — `slug = "a/b"` |
| `/docs/a/b/c` | Yes — `slug = "a/b/c"` |
| `/docs` | No — catch-all requires at least 1 segment |

### 6. Optional Catch-All

`[[...param]]` matches zero or more URL segments.

```
home/
└── shop/
    └── [[...category]]/
        └── page.tw
```

| URL | Matches |
|-----|---------|
| `/shop` | Yes — `category = ""` (empty) |
| `/shop/phones` | Yes — `category = "phones"` |
| `/shop/phones/android` | Yes — `category = "phones/android"` |

### 7. Route Groups

Parentheses `(name)` create a route group. The group name does NOT appear in the URL.

```
home/
└── (marketing)/
    ├── layout.tw
    ├── about/
    │   └── page.tw     → /about (NOT /marketing/about)
    └── pricing/
        └── page.tw     → /pricing
```

Route groups are useful for:
- Organizing routes without affecting the URL
- Applying a shared layout to a group of routes
- Separating sections (marketing, admin, auth) in the file system

### 8. Parallel Routes / Slots

`@name` represents a parallel route slot. Multiple routes render simultaneously in the same layout.

```
home/
└── dashboard/
    ├── layout.tw           ← Uses slot { } placeholders
    ├── page.tw             → /dashboard
    ├── @analytics/         ← Slot 1
    │   ├── default.tw      ← Fallback when no match
    │   └── page.tw
    └── @team/              ← Slot 2
        ├── default.tw
        └── page.tw
```

The `@analytics` and `@team` names are slot identifiers. They do NOT appear in the URL. The layout uses `slot name "analytics" { }` to render the slot content.

### 9. Intercepting Routes

`(..)name` intercepts navigation to show content in a modal instead of a full page.

```
home/
└ dashboard/
    └ users/
        └ [id]/
            ├── page.tw              → /dashboard/users/42 (full page)
            └ (..)photo/             ← Intercepts /dashboard/users/42/photo/1
                └ [photoId]/
                    └── page.tw      → Shows photo in modal
```

Intercepting levels:
- `(.)photo` — same level
- `(..)photo` — one level up
- `(...)photo` — root level

### 10. Private Folders

Folders starting with `_` are excluded from routing.

```
home/
└── (marketing)/
    ├── about/
    │   └── page.tw         → /about
    └── _components/        ← Excluded from routing
        ├── Hero.tw
        └── PricingCard.tw
```

Use private folders for:
- Co-locating components with routes
- Storing test files
- Keeping utilities near their routes

---

## Special Files — Complete Reference

### UI Special Files (use `.tw` extension)

| File | Purpose | Behavior |
|------|---------|----------|
| `page.tw` | Route page — renders HTML | Terminal route entry. Each directory must have this to be a route. |
| `layout.tw` | Wraps all children | Persists across navigations. Renders once, children swap inside `slot { }`. |
| `template.tw` | Like layout but re-renders | Re-mounts on every navigation. Use for analytics resets, animation triggers. |
| `loading.tw` | Loading/suspense UI | Shown while async data is being fetched. Automatically wrapped. |
| `error.tw` | Error boundary | Catches uncaught errors in the subtree. Shows fallback UI. |
| `not-found.tw` | 404 UI | Shown when a child route does not match any URL. |
| `global-error.tw` | Root error catcher | Replaces the root layout when a root-level error occurs. Global safety net. |
| `head.tw` | Per-route `<head>` content | Meta tags, Open Graph, Twitter cards, fonts. Injected into `<head>`. |
| `default.tw` | Parallel slot fallback | Shown when a parallel route slot has no matching content. |

### Server Special Files (use `.twm` extension)

| File | Purpose | Behavior |
|------|---------|----------|
| `route.twm` | API endpoint | Returns JSON (or HTML/text). Contains `fn get()`, `fn post()`, etc. |
| `middleware.twm` | Root middleware | Runs before all routes. Rules for auth, rate-limiting, bot blocking, CORS. |

### Middleware — Root Level Only

```
my-app/
├── home/
│   └── ...
└── middleware.twm           ← HERE, at project root
```

Middleware is placed at the project root (NOT inside `home/`). It runs before every request.

---

## Layout Chain — Automatic Resolution

Layouts are resolved automatically from the file-system hierarchy. No manual imports needed.

```
home/
├── layout.tw              ← Root layout (wraps everything)
├── page.tw                → / (wrapped by root layout)
│
├── blog/
│   ├── layout.tw          ← Blog layout (wraps all blog/* pages)
│   ├── page.tw            → /blog (wrapped by root + blog layout)
│   └── [slug]/
│       └── page.tw        → /blog/hello (wrapped by root + blog layout)
│
└── dashboard/
    ├── layout.tw          ← Dashboard layout (wraps all dashboard/* pages)
    ├── page.tw            → /dashboard (wrapped by root + dashboard layout)
    └── settings/
        ├── layout.tw      ← Settings layout (wraps settings/* pages)
        └── page.tw        → /dashboard/settings
                             (wrapped by root + dashboard + settings layout)
```

### Rendering hierarchy for `/dashboard/settings`:

```
home/layout.tw          ← Outermost (html, head, body)
  └─ dashboard/layout.tw  ← Sidebar, nav
       └─ settings/layout.tw  ← Settings header
            └─ settings/page.tw  ← Actual page content
```

The compiler determines the chain from the directory nesting. `slot { }` in each layout is replaced by the child content.

---

## Complete Route Summary Table

| File Pattern | URL | Type |
|--------------|-----|------|
| `home/page.tw` | `/` | Static |
| `home/about/page.tw` | `/about` | Static |
| `home/blog/page.tw` | `/blog` | Static (section index) |
| `home/blog/[slug]/page.tw` | `/blog/hello-world` | Dynamic |
| `home/blog/category/[...slug]/page.tw` | `/blog/category/tech/web` | Catch-all |
| `home/blog/tag/[[...tags]]/page.tw` | `/blog/tag` or `/blog/tag/js` | Optional catch-all |
| `home/(marketing)/about/page.tw` | `/about` | Route group (hidden) |
| `home/dashboard/@analytics/page.tw` | `/dashboard` (slot) | Parallel route |
| `home/dashboard/users/[id]/(..)photo/[photoId]/page.tw` | Modal intercept | Intercepting route |
| `home/api/route.twm` | `/api` | API endpoint |
| `home/api/users/[id]/route.twm` | `/api/users/42` | Dynamic API |
| `home/api/auth/[...nextauth]/route.twm` | `/api/auth/signin` | Catch-all API |

---

## What NOT to Do

| Wrong | Right | Why |
|-------|-------|-----|
| `home/about.tw` | `home/about/page.tw` | Every route must be a directory with `page.tw` |
| `home/loading.twm` | `home/loading.tw` | All UI special files use `.tw` |
| `home/error.twm` | `home/error.tw` | All UI special files use `.tw` |
| `home/not-found.twm` | `home/not-found.tw` | All UI special files use `.tw` |
| `home/route.tw` | `home/api/route.twm` | API routes use `.twm` |
| `home/middleware.tw` | `middleware.twm` (root level) | Middleware is at project root, uses `.twm` |
| `home/layout "main"` in page | (automatic) | Layout is resolved from directory, not declared in page config |
| `home/_components/page.tw` | (no page.tw in _folders) | Private folders are excluded from routing |

---

## Quick Reference Card

```
Directory         → URL segment
page.tw           → Route entry point
layout.tw         → Automatic parent wrapper
[slug]/           → Dynamic route
[...rest]/        → Catch-all (1+ segments)
[[...optional]]/  → Optional catch-all (0+ segments)
(group)/          → Route group (hidden from URL)
@slot/            → Parallel route slot
(..)name/         → Intercepting route
_folder/          → Private folder (excluded)
route.twm         → Server/API endpoint
middleware.twm    → Root middleware
```

The file system is the routing configuration. The developer should never need to manually register a page or manually import a layout.

---

## Static Assets — public/

Files in `public/` are copied to the build output and served from the site root:

```text
public/
├── favicon.ico        →  /favicon.ico
├── logo.jpg            →  /logo.jpg
└── docs/handbook.pdf   →  /docs/handbook.pdf
```

Reference them with root-absolute paths in markup:

```tw
img src "/logo.jpg" alt "Logo"
a "Handbook" { href "/docs/handbook.pdf" }
```

Anything referenced from CSS (background images, fonts) resolves relative to the emitted CSS file — use root-absolute paths there too (`/img/bg.jpg`).

## Route Groups vs Private Folders — The Difference

| Pattern | URL | Route scanner | Use for |
|---------|-----|---------------|---------|
| `(marketing)/about/page.tw` | `/about` | scans inside | organizing routes without changing URLs |
| `_components/Card.tw` | none | skipped entirely | shared parts that must never be a URL |

A route group is transparent to the URL but its `layout.tw` still applies. A private folder is invisible to routing altogether — put components, helpers and partials there.

## Worked URL Resolution Examples

| File on disk | URL | Notes |
|--------------|-----|-------|
| `home/page.tw` | `/` | root route |
| `home/about/page.tw` | `/about` | normal route |
| `home/blog/[slug]/page.tw` | `/blog/hello-world` | `params.slug == "hello-world"` |
| `home/docs/[...rest]/page.tw` | `/docs/a/b/c` | `params.rest == "a/b/c"` |
| `home/shop/[[...category]]/page.tw` | `/shop` and `/shop/electronics` | optional catch-all |
| `home/(marketing)/pricing/page.tw` | `/pricing` | group is invisible |
| `home/api/users/[id]/route.twm` | `POST /api/users/7` | API route with `request.params.id == "7"` |

## Related

- [Layouts](./layouts.md) — how the layout chain wraps each of these routes
- [API Routes](./api-routes.md) — `.twm` route modules
- [Error Reference](./error-reference.md) — routing errors TW100–TW120
