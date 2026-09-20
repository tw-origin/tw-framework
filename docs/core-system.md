# TW Framework — Core System

This document explains the internal architecture of TW Framework — every system, what it does, when it runs, and how to use it.

---

## Architecture Overview

The pipeline is powered by the **TW Compiler** (parser, transforms, HTML codegen) and **TW VDOM 1** (the on-demand virtual DOM engine for interactive islands).

```
Developer writes .tw / .tss / .twm / .ts files
           │
           ▼
    ┌─── ROUTE SCANNER ───┐
    │ Scans home/ directory │
    │ Builds route tree      │
    └────────┬─────────────┘
             │
             ▼
    ┌─── ROUTE MATCHER ───┐
    │ Matches URL to route  │
    │ Extracts params       │
    └────────┬─────────────┘
             │
             ▼
    ┌─── LAYOUT CHAIN ────┐
    │ Resolves layouts     │
    │ root → leaf          │
    │ Finds loading/error  │
    └────────┬─────────────┘
             │
             ▼
    ┌─── RENDER PIPELINE ─┐
    │ Reads .tw files      │
    │ Calls compileSync()  │
    │ Wraps in layouts     │
    │ Assembles full HTML  │
    └────────┬─────────────┘
             │
             ▼
    ┌─── COMPILER ────────┐
    │ Lexer → Parser       │
    │ Transform → Optimize │
    │ Codegen → Output     │
    └────────┬─────────────┘
             │
             ▼
    Complete HTML + CSS + JS
    served to browser
```

---

## 1. Route Scanner

**What it does:** Walks the `home/` directory recursively and builds a tree of all routes.

**When it runs:** At startup, and whenever files change (HMR / file watcher).

**Where it lives:** `packages/server/tw/routing/scanner.ts`

**What it produces:** A `RouteNode` tree containing:
- Every directory as a node
- Every special file (page.tw, layout.tw, loading.tw, etc.) attached to its node
- Route groups, parallel slots, intercepting routes, dynamic segments all resolved

**How to use it:**
```typescript
import { scanRouteTree, printRouteTree } from "@tw/server";

const tree = scanRouteTree({
  homeDir: "/path/to/home",
  rootDir: "/path/to/project",
});

// Print the route tree for debugging
console.log(printRouteTree(tree));
```

**Output example:**
```
home/
├── [layout.tw, page.tw, loading.tw, error.tw, not-found.tw]
├── about/
│   └── [page.tw]
├── blog/
│   ├── [layout.tw, page.tw]
│   └── [slug]/
│       └── [page.tw]
├── (marketing)/
│   ├── [layout.tw]
│   ├── about/
│   │   └── [page.tw]
│   └── pricing/
│       └── [page.tw]
└── api/
    └── [route.twm]
```

**Key rules:**
- Only `page.tw` and `index.tw` are route entries
- `about.tw` is NOT a route — it is ignored
- Private folders (`_components`) are skipped
- Route groups `(name)` are transparent to the URL
- Both `.tw` and `.twm` files are scanned

---

## 2. Route Matcher

**What it does:** Takes a URL pathname and finds the matching route node in the tree.

**When it runs:** On every incoming HTTP request.

**Where it lives:** `packages/server/tw/routing/scanner.ts` (the `matchRoute` function)

**Matching priority (highest to lowest):**
1. **Static match** — `/about` matches `about/` exactly
2. **Dynamic segment** — `/blog/hello` matches `[slug]/` with `slug = "hello"`
3. **Optional catch-all** — `/shop` matches `[[...category]]/` with empty category
4. **Catch-all** — `/docs/a/b/c` matches `[...rest]/` with `rest = "a/b/c"`
5. **Route groups** — transparent, tries children
6. **Intercepting routes** — matches at current level for modal interception
7. **Parallel routes** — transparent for URL matching

**How to use it:**
```typescript
import { matchRoute } from "@tw/server";

const match = matchRoute(tree, "/blog/hello-world");
// match = { node, chain, params: { slug: "hello-world" } }
```

**Result includes:**
- `node` — the matched route node (has page.tw)
- `chain` — all nodes from root to matched node (for layout resolution)
- `params` — extracted URL parameters

---

## 3. Layout Chain Resolver

**What it does:** Takes a matched route and resolves the full rendering context — all layouts, loading, error, not-found, head, and template files.

**When it runs:** After route matching, before compilation.

**Where it lives:** `packages/server/tw/routing/layout-chain.ts`

**What it collects:**

| File type | Collection order | Purpose |
|-----------|------------------|---------|
| `layout.tw` | Root → leaf | Wraps page content (outermost first) |
| `template.tw` | Root → leaf | Like layout but re-renders on navigation |
| `loading.tw` | Leaf → root (nearest) | Loading skeleton UI |
| `error.tw` | Leaf → root (nearest) | Error boundary |
| `not-found.tw` | Leaf → root (nearest) | 404 UI |
| `head.tw` | Leaf → root (nearest) | Per-route `<head>` content |

**Layout chain example for `/dashboard/settings`:**
```
home/layout.tw        ← Root layout (outermost)
  └─ dashboard/layout.tw  ← Dashboard layout
       └─ settings/page.tw  ← Page content (innermost)
```

**How wrapping works:**
1. Compile `settings/page.tw` → get HTML
2. Compile `dashboard/layout.tw` → get HTML with `slot { }`
3. Replace `slot { }` in dashboard layout with page HTML
4. Compile `home/layout.tw` → get HTML with `slot { }`
5. Replace `slot { }` in root layout with the result from step 3

**Slot replacement patterns recognized:**
- `slot { }` — TW syntax
- `<slot />` — HTML syntax
- `<slot></slot>` — HTML syntax
- `{{children}}` — template syntax
- `{{slot}}` — template syntax

---

## 4. Compiler

**What it does:** Takes TW source code (`.tw` file content) and produces HTML + CSS + JS.

**When it runs:** During rendering, called by the render pipeline.

**Where it lives:** `packages/compiler/tw/index.ts`

**Compiler pipeline:**
```
Source code (.tw)
    │
    ├── 1. LEXER — tokenize source into tokens
    │   ├── HTML mode — tags, attributes
    │   ├── CSS mode — inside <style> blocks
    │   ├── JS mode — inside <script> blocks
    │   ├── TSS mode — TSS shorthands
    │   ├── EXPR mode — inside {interpolation}
    │   └── DIRECTIVE mode — inside @directive { }
    │
    ├── 2. PARSER — build AST from tokens
    │   ├── Elements → ElementNode
    │   ├── Components → ComponentNode
    │   ├── Directives → DirectiveNode (page, state, etc.)
    │   ├── Control flow → IfNode, ForNode, WhileNode, SwitchNode, TryNode
    │   ├── Text → TextNode
    │   ├── Interpolation → InterpolationNode
    │   ├── Events → EventBinding
    │   ├── Bindings → PropertyBinding
    │   └── Scripts/Styles → ScriptBlock, StyleBlock
    │
    ├── 3. TRANSFORM — modify AST
    │   ├── Hoist directives (move @page, @state to top)
    │   ├── Mark TW VDOM 1 nodes (identify interactive elements)
    │   └── SSR attribute transform (add data attributes for hydration)
    │
    ├── 4. OPTIMIZE — improve AST
    │   ├── Dead code elimination (remove unused branches)
    │   ├── Constant folding (evaluate constant expressions)
    │   ├── Function inlining (inline small functions)
    │   └── AST transforms (simplify structure)
    │
    └── 5. CODEGEN — generate output
        ├── HTML generator → produce HTML string
        ├── CSS extractor → extract and expand TSS to CSS
        └── JS bundler → generate client-side JS for interactivity
```

**API:**
```typescript
import { compileSync, compile } from "@tw/compiler";

// Synchronous (faster, for production)
const result = compileSync(source, {
  filePath: "/path/to/page.tw",
  optimize: true,
  diagnostics: false,
  transforms: true,
});

// Asynchronous (for streaming / parallel compilation)
const result = await compile(source, opts);
```

**CompileResult:**
```typescript
{
  ast: Program,           // Full AST
  html: string,           // Generated HTML
  css: string,            // Generated CSS (from <style> blocks)
  js: string,             // Generated JS (for client-side interactivity)
  hasVdom: boolean,       // Does this component use TW VDOM 1?
  hasInteractivity: boolean, // Does this component have state/events?
  diagnostics: Diagnostic[], // Any warnings/errors
  metadata: {
    parseTime: number,    // Time spent parsing (ms)
    codegenTime: number,  // Time spent generating (ms)
    totalTime: number,    // Total compile time (ms)
    fromCache: boolean,   // Was this from cache?
    nodeCount: number,    // Number of AST nodes
  },
}
```

---

## 5. Render Pipeline

**What it does:** End-to-end: file read → compile → wrap in layouts → full HTML response.

**When it runs:** On every request (or cached).

**Where it lives:** `packages/server/tw/routing/render-pipeline.ts`

**Full flow:**
```
1. Get route tree (scan if needed)
2. Match URL → get route node + chain + params
3. Resolve layout chain → get layouts, loading, error, head, page
4. For the page file:
   a. Read source from disk
   b. Call compileSync(source) → { html, css, js }
5. For each layout (leaf → root):
   a. Read source from disk
   b. Call compileSync(source) → { html, css, js }
   c. Replace slot { } with current HTML
   d. Merge CSS and JS
6. If loading.tw exists:
   a. Compile → get loading HTML
   b. Wrap content in loading boundary div
7. If error.tw exists:
   a. Compile → get error HTML
   b. Wrap content in error boundary div
8. If head.tw exists:
   a. Compile → get head HTML
   b. Inject into <head> section
9. Extract page title from page { } config
10. Assemble complete HTML document:
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>{page title}</title>
      {head content}
      <style>{all CSS}</style>
    </head>
    <body>
      {rendered body HTML}
      <script type="module">{all JS}</script>
    </body>
    </html>
11. Cache the result (if enabled)
12. Return as HTTP Response
```

**Caching:**
- Compiled files are cached (source path → compiled result)
- Full render results are cached (URL → HTML) with TTL
- Cache is invalidated on file change (HMR) or manual `clearCache()`

**How to use it:**
```typescript
import { createRenderPipeline } from "@tw/server";

const pipeline = createRenderPipeline({
  rootDir: process.cwd(),
  homeDir: join(process.cwd(), "home"),
  enableCache: true,
  cacheTTL: 60000, // 1 minute
  dev: false,
});

const result = pipeline.render("/blog/hello-world");
// result.html → complete HTML document
// result.status → 200
// result.headers → { "Content-Type": "text/html; charset=utf-8" }
```

---

## 6. Render Modes

Each page declares its render mode in the `page { }` block.

### `render static` — Static Site Generation (SSG)

```
Build time: Page is pre-rendered to static HTML.
Runtime: Static HTML is served, no server computation.
Interactivity: NONE. State and on:click are NOT allowed.
```

Use for: Blogs, documentation, landing pages, marketing sites.

```tw
page {
  title "About Us"
  render static
}

div {
  h1 "About"
  p "This is a static page."
}
```

**Compiler check:** If `render static` + `state { }` + `on:click` → Error TW200.

### `render ssr` — Server-Side Rendering

```
Build time: Page is compiled but not pre-rendered.
Runtime: Server renders HTML on each request.
Interactivity: Full. State, events, hydration all work.
```

Use for: Dashboards, dynamic pages, personalized content, e-commerce.

```tw
page {
  title "Dashboard"
  render ssr
}

state {
  user = { name: "Mlkraj" }
}

div {
  h1 "Hello {user.name}"
  button on:click "refresh()" { "Refresh" }
}
```

### `render island` — Partial Hydration (Islands Architecture)

```
Build time: Static HTML is pre-rendered.
Runtime: Only interactive components ("islands") hydrate on the client.
Interactivity: Only in islands. Rest of the page is static HTML.
```

Use for: Content-heavy pages with some interactive parts (forms, widgets).

```tw
page {
  title "Blog Post"
  render island
}

article {
  h1 "{post.title}"
  p "{post.body}"
  // This form is an "island" — it hydrates on the client
  form on:submit "addComment()" {
    input type "text" placeholder "Comment"
    button "Add Comment"
  }
}
```

### `render edge` — Edge Rendering

```
Runtime: Page is rendered at the CDN edge (Cloudflare, Vercel Edge).
Latency: Ultra-low (milliseconds).
Interactivity: Same as SSR.
```

Use for: Global apps, real-time content, geo-personalized pages.

```tw
page {
  title "Live Data"
  render edge
}

state {
  timezone = "auto-detected at edge"
}

div {
  p "Your timezone: {timezone}"
}
```

### Render mode comparison

| Feature | static | ssr | island | edge |
|---------|--------|-----|--------|------|
| Pre-rendered at build | Yes | No | Partially | No |
| Server renders per request | No | Yes | No | Yes (at edge) |
| State allowed | No | Yes | In islands only | Yes |
| Events allowed | No | Yes | In islands only | Yes |
| Best for | Blogs, docs | Dashboards | Content + widgets | Global apps |
| Speed | Fastest | Fast | Fast | Ultra-fast |
| SEO | Excellent | Excellent | Good | Good |

---

## 7. Middleware System

**What it does:** Runs rules before every request — auth, rate-limiting, bot blocking, CORS, path scanning.

**When it runs:** Before route matching, on EVERY request.

**Where it lives:** `middleware.twm` at project root.

**Rule structure:**
```
rule "rule-name" {
  match "/path/pattern/**"
  // condition blocks...
  response { status XXX, json/html/text { ... } }
}
```

**Condition blocks:**

| Block | Purpose | Fields |
|-------|---------|--------|
| `user_agent` | Filter by browser/bot | `allow`, `block`, `empty_is_blocked` |
| `path` | Filter by URL path | `prefixes`, `contains`, `extensions`, `deny_traversal`, `deny_null_bytes` |
| `auth` | Require authentication | `cookie`, `jwt_secret_env` |
| `rate_limit` | Limit request rate | `requests`, `window`, `identity` |
| `origin` | CORS control | `allow`, `require`, `allow_referer` |
| `methods` | HTTP method filter | `["GET", "POST", ...]` |

See `syntax-guide.md` for full middleware examples.

---

## 8. CSS/TSS Processing

**What it does:** Processes `.tss`, `.css`, `.scss`, `.module.tss`, `.module.css` files.

**Processing pipeline:**

```
.tss file → Tokenize CSS → Expand shorthands → Output CSS
.css file → Tokenize CSS → Output CSS (no expansion)
.scss file → Sass compiler → Output CSS
.module.tss → Tokenize + Expand + Scope class names → Output scoped CSS
.module.css → Tokenize + Scope class names → Output scoped CSS
```

**TSS shorthand expansion:**
| Shorthand | Expands to |
|-----------|------------|
| `bg` | `background` |
| `p` | `padding` |
| `m` | `margin` |
| `br` | `border-radius` |
| `fs` | `font-size` |
| `fw` | `font-weight` |
| `d` | `display` |
| `c` | `color` |
| `bd` | `border` |
| `tr` | `transition` |
| `tf` | `transform` |

Full list in `styling-guide.md`.

**Error on shorthand in .css:**
If you write `bg: #fff` in a `.css` file, the compiler throws Error TW301.

---

## 9. HMR (Hot Module Replacement)

**What it does:** When you save a file, the browser updates instantly without full reload.

**When it runs:** In dev mode only (`tw dev`).

**What it watches:**
- `home/**` — all routing files
- `components/**` — all components
- `style/**` — all stylesheets
- `layouts/**` — shared layouts
- `assets/**` — assets

**What happens on file change:**
1. File watcher detects change
2. Route tree is rebuilt (if routing file changed)
3. Changed file is recompiled
4. HMR patch is sent to browser via WebSocket
5. Browser applies patch (swaps changed module, preserves state)

**HMR client:** Automatically injected in dev mode via `<script type="module" src="/__tw_hmr">`.

---

## 10. Build System

**What it does:** Produces optimized production output.

**When it runs:** `tw build` command.

**Build steps:**
1. Scan route tree
2. Compile every `.tw` file → HTML + CSS + JS
3. Compile every `.tss` file → CSS
4. Compile every `.twm` file → server functions
5. Bundle JS with code splitting (per-route chunks)
6. Minify HTML, CSS, JS
7. Generate source maps (if enabled)
8. Copy `public/` assets to output
9. Generate route manifest
10. Write to `.tw/`

**Output:**
```
.tw/
├── index.html              ← / route
├── about/
│   └── index.html          ← /about route
├── blog/
│   └── [slug]/
│       └── index.html      ← /blog/:slug (pre-rendered if static)
├── _assets/
│   ├── css/
│   │   ├── global.css
│   │   └── home.css
│   ├── js/
│   │   ├── main.js
│   │   └── chunks/
│   │       ├── blog-[hash].js
│   │       └── dashboard-[hash].js
│   └── img/
└── manifest.json           ← route manifest
```

---

## System Summary

| System | Location | When | Purpose |
|--------|----------|------|---------|
| Route Scanner | `server/routing/scanner.ts` | Startup + file change | Build route tree from home/ |
| Route Matcher | `server/routing/scanner.ts` | Every request | Match URL to route |
| Layout Chain | `server/routing/layout-chain.ts` | After match | Resolve layouts, loading, error |
| Compiler | `compiler/tw/index.ts` | During render | Compile .tw → HTML+CSS+JS |
| Render Pipeline | `server/routing/render-pipeline.ts` | Every request | End-to-end render |
| Middleware | `middleware.twm` (root) | Before routes | Auth, rate-limit, security |
| HMR | `dev-server/tw/hmr/` | Dev mode only | Hot reload |
| Build | `builder/tw/` | `tw build` | Production output |
| CSS/TSS | `compiler/tw/codegen/css-extract.ts` | During compile | Style processing |

---

## Deep Dives Per System

Each system described above has a dedicated document:

| System | Deep dive |
|--------|-----------|
| Layouts and slot resolution | [Layouts](./layouts.md), [Slots](./syntax-slots.md) |
| Render modes | [Render Modes](./render-modes.md) |
| Middleware rules | [Middleware](./middleware.md) |
| CSS/TSS processing | [TSS Syntax](./tss-syntax.md), [Production CSS](./production-css.md) |
| HMR and the dev loop | [Dev Server](./dev-server.md) |
| Build and `.tw/` output | [Build Output](./build-output.md) |
| API route execution | [API Routes](./api-routes.md) |
| Request protections and caching | [Server Features](./server-features.md) |
| Hydration and reactivity | [Client Runtime](./client-runtime.md) |

## Related

- [Framework Overview](./framework-overview.md)
- [Error Reference](./error-reference.md)
