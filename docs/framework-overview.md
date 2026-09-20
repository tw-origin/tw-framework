# TW Framework — Overview

This document explains what TW Framework is, why it exists, what it can do, and how it compares to other frameworks.

---

## What Is TW Framework?

TW Framework is a modern web framework that uses its own language (TW) instead of JavaScript or TypeScript for writing UI components. It features a custom compiler, a file-based routing system, and a styling language (TSS) with CSS shorthands.

The core idea: **the file system is the routing configuration, and the language is purpose-built for building web pages — not adapted from general-purpose programming languages.**

---

## Why TW Exists

### The problem with current frameworks

TW Framework is built on a simple philosophy: **one language for the entire UI layer.**

### The TW way

- **Custom UI language (`.tw`)** — a purpose-built template language for markup, state and events
- **Built-in styling (`.tss`)** — CSS-first styles compiled at build time, no extra tooling
- **File-system routing (automatic)** — drop files in, routes just work
- **Layouts auto-resolved** — `layout.tw` composes pages without imports
- **One language for UI** — markup, styling, state and events in a single syntax
- **Zero-config routing** — groups, dynamic segments, catch-alls and parallel slots out of the box

| Custom language (`.tw`) |  |
| Built-in styling (`.tss`) |  |
| File-system routing (automatic) |  |
| Layouts auto-resolved |  |
| One language for UI |  |
| Zero-config routing |  |

---

## What TW Can Do

### Full-stack web applications

- **Static sites** — blogs, documentation, landing pages (`render static`)
- **Server-rendered apps** — dashboards, e-commerce, SaaS (`render ssr`)
- **Islands architecture** — content-heavy pages with interactive widgets (`render island`)
- **Edge rendering** — global apps with ultra-low latency (`render edge`)

### API endpoints

Write API routes in `.twm` files with JavaScript functions:

```twm
fn get(request) {
  return { status: 200, json: { data: users } }
}
```

### npm packages on both sides of your app

- **Server-side** — import anything from npm inside `lib/*.ts` modules and `.twm` API routes (database clients, validators, mailers)
- **Client-side** — import browser packages directly in `page.tw` and `layout.tw` (`import dayjs from "dayjs"`) and use them in event handlers
- **Shared, hashed chunks** — each unique import becomes one content-hashed, tree-shaken, minified chunk shared across every page that needs it

### File-based routing

- Static routes: `home/about/page.tw` → `/about`
- Dynamic routes: `home/blog/[slug]/page.tw` → `/blog/:slug`
- Catch-all: `home/docs/[...rest]/page.tw` → `/docs/*`
- Optional catch-all: `home/shop/[[...cat]]/page.tw` → `/shop` or `/shop/a/b`
- Route groups: `home/(marketing)/about/page.tw` → `/about` (group hidden)
- Parallel routes: `home/dashboard/@analytics/page.tw` (slot rendering)
- Intercepting routes: `home/(..)photo/[id]/page.tw` (modal interception)

### Automatic layouts

Layouts are resolved from the file system — no manual imports:

```
home/layout.tw → wraps ALL pages
home/blog/layout.tw → wraps only blog/*
home/(marketing)/layout.tw → wraps only marketing group
```

### Middleware

Root-level middleware for auth, rate-limiting, bot blocking, CORS, path scanning:

```twm
rule "api-rate-limit" {
  match "/api/**"
  rate_limit { requests 60, window 60 }
  response { status 429, json { error "Too many requests" } }
}
```

### Styling system

- `.tss` — CSS with shorthands (`bg`, `p`, `m`, `br`)
- `.module.tss` — Scoped component styles
- `.css` — Plain CSS (for legacy/third-party)
- `.module.css` — Scoped plain CSS
- `.scss` — Full SCSS/Sass support

### Developer experience

- HMR (Hot Module Replacement) — changes appear instantly
- Error overlay — compile errors show in browser
- Route table — all routes displayed on startup
- Type checking — `tw check` runs `tsc --strict`
- Fast refresh — state preserved on file changes

### Deployment

- Vercel — auto-detect and deploy
- Netlify — auto-detect and deploy
- Cloudflare Pages — edge deployment
- Docker — production container
- GitHub Pages — static sites via GitHub Actions
- Shared hosting — FTP upload of static output

---

## TW Language Philosophy

### 1. File system is the configuration

You do not register routes. You do not import layouts. You create directories and files, and the framework figures out the rest.

### 2. Purpose-built for UI

TW is not JavaScript with HTML mixed in. It is a language designed specifically for building web pages:

```tw
section.hero {
  div.container {
    h1 "Hello {name}"
    button.btn on:click "count++" {
      "Click me"
    }
  }
}
```

### 3. Styling is native

CSS is not an afterthought. TSS is built into the framework with shorthands, nesting, and variables:

```tss
.btn {
  bg #2563eb
  p 10px 18px
  br 8px
  c white
}
```

### 4. Server-side is separate

API routes and middleware use a different file type (`.twm`) because they are server-side, not UI:

```twm
fn get(request) {
  return { status: 200, json: { ok: true } }
}
```

### 5. Progressive complexity

Simple pages are simple. Advanced features (parallel routes, intercepting routes, islands) are available when needed but do not add complexity to basic pages.

---

## Extension System

| Extension | Purpose | Compiled By |
|-----------|---------|-------------|
| `.tw` | UI components (markup + state + events) | TW compiler (full pipeline) |
| `.twm` | Server modules (API routes, middleware) | JS runtime (server-side) |
| `.tss` | Styles (CSS + shorthands) | TSS processor → CSS |
| `.ts` | Logic (utils, config, types) | TypeScript compiler |

Style variants: `.module.tss`, `.css`, `.module.css`, `.scss`

---

## Render Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `static` | Pre-rendered at build time | Blogs, docs, landing pages |
| `ssr` | Server-side rendered per request | Dashboards, dynamic pages |
| `island` | Static + interactive islands | Content + widgets |
| `edge` | Rendered at CDN edge | Global apps, real-time |

---

## What TW Is NOT

- **VDOM on demand** — TW VDOM 1 activates only for interactive islands, keeping static output lean

---

## Project Statistics

- **Language:** TypeScript (framework), TW (user-facing language)
- **Runtime:** Bun (primary), Node.js (fallback)
- **Module system:** ESM
- **Type checking:** TypeScript strict mode
- **Codebase:** 212,000+ lines across 670+ files
- **Packages:** 11 (compiler, runtime, server, builder, dev-server, shared, security, lsp, plugins, cli, sdk)

---

## Getting Started

1. Read **setup-guide.md** to install and configure
2. Read **project-tree.md** to understand routing
3. Read **syntax-guide.md** to learn the TW language
4. Read **styling-guide.md** to learn TSS
5. Start building!

```bash
tw create my-app
cd my-app
bun install
tw dev
```

---

## Documentation Index

| Document | Topic |
|----------|-------|
| project-tree.md | Project structure, routing patterns, special files |
| setup-guide.md | Installation and your first app |
| extensions-guide.md | All file extensions explained |
| syntax-guide.md | Syntax overview and quick reference |
| error-reference.md | All error codes and fixes |
| core-system.md | Internal architecture |
| commands-reference.md | Every CLI command |
| no-terminal-guide.md | Using TW without a terminal |
| styling-guide.md | Styling overview and decision guide |
| framework-overview.md | This document — what TW is and why |
| client-modules.md | Client modules, chunks and the dependency graph |
| syntax-imports.md | Imports in .tw files |
| syntax-page-config.md | The page { } block |
| syntax-state.md | Reactive state |
| syntax-markup.md | Elements, text, children, comments |
| syntax-interpolation.md | {value} interpolation |
| syntax-attributes.md | Attributes, booleans, data-* |
| syntax-events.md | on:event handlers and modifiers |
| syntax-bindings.md | :prop bindings and two-way inputs |
| syntax-conditionals.md | if / else, switch, try / catch |
| syntax-loops.md | for and while loops |
| syntax-components.md | Components and props |
| syntax-slots.md | Slots — content injection points |
| syntax-head-block.md | The head { } block and head.tw |
| layouts.md | Layouts and the layout chain |
| tss-syntax.md | TSS shorthands, nesting, variables |
| scss-guide.md | SCSS in TW projects |
| scoped-styles.md | .module.tss / .module.css scoping |
| production-css.md | Route-split, hashed CSS output |
| render-modes.md | static / ssr / island / edge |
| plain-css.md | .css and .module.css |
| middleware.md | middleware.twm rules |
| dev-server.md | The dev server and live reload |
| build-output.md | tw build and the .tw/ directory |
| api-routes.md | .twm API route modules |
| server-features.md | The production server |
| security.md | The security layer and @tw/security |
| configuration.md | tw.config.ts and environment variables |
| testing.md | tw test and testing helpers |
| client-runtime.md | TW VDOM 1 — hydration, reactivity, SPA |
| deployment-adapters.md | tw adapter and tw ship |
| guide-deployment-choose.md | Choosing a deployment platform |
| guide-vercel.md | Deploying to Vercel |
| guide-netlify.md | Deploying to Netlify |
| guide-cloudflare.md | Deploying to Cloudflare Pages |
| guide-aws.md | Deploying to AWS |
| guide-digitalocean.md | Deploying to DigitalOcean |
| guide-render.md | Deploying to Render |
| guide-railway.md | Deploying to Railway |
| guide-fly.md | Deploying to Fly.io |
| guide-github-pages.md | Deploying to GitHub Pages |
| guide-firebase.md | Deploying to Firebase Hosting |
| guide-self-hosted.md | Self-hosting on a VPS |
| guide-forms.md | Building forms |
| guide-auth.md | Authentication |
| guide-data-fetching.md | Fetching data |
| guide-blog.md | Building a blog |
| guide-dashboard.md | Building a dashboard |
| guide-ecommerce-catalog.md | Building a product catalog |
| guide-seo.md | SEO |
| guide-performance.md | Performance |
| guide-assets-images.md | Assets and images |
| guide-testing-ci.md | Testing and CI |
| guide-environments.md | Dev, staging and production |
| guide-troubleshooting.md | Troubleshooting by symptom |
| tips-syntax.md | Syntax tips |
| tips-styling.md | Styling tips |
| tips-deployment.md | Deployment tips |
| plugins.md | The plugin system — API reference |
| guide-plugins.md | Plugins end-to-end — terminal and no-terminal workflows |
| optImage.md | The optImage component — optimization, remote images |
| RouterLink.md | The RouterLink component — SPA navigation, active state, prefetch |
| query-params.md | Reading query parameters (`?key=value`) on the server — in route handlers and middlewar... |
| cookies.md | Reading and setting cookies from route handlers, and declaring cookie requirements in m... |
| rate-limiting.md | Capping how often a client may make requests — per path in middleware rules, and per se... |
| cors.md | Controlling cross-origin access with the `origin` condition — both the deny side (block... |
| error-handling-routes.md | What happens when a route handler fails, and how to return deliberate error responses |
| body-limits.md | The size limits on incoming request bodies, and what happens when they are crossed |
| lib-modules.md | The `lib/` directory — server-side TypeScript modules shared by route handlers |
| hot-reload.md | What `tw dev` picks up without a restart — pages, components, middleware and config |
| dynamic-routes.md | `[slug]` folders — serving many URLs from one page, reading the param, and pre-renderin... |
| catch-all-routes.md | `[...slug]` folders — matching every remaining path inside one route |
| route-groups.md | `(name)` folders — grouping routes without changing their URLs |
| parallel-routes.md | `@name` slot folders — rendering multiple independent route trees into one page at the ... |
| intercepting-routes.md | `(.)`, `(..)` and `...` folder prefixes — showing a different page for a URL that alrea... |
| not-found-pages.md | `not-found.tw` — the page the server shows when no route matches |
| head-tw-files.md | `head.tw` — injecting per-route and global content into the HTML `<head>` |
| request-validation.md | Checking route input — body, query and params — before logic runs |
| streaming.md | Sending the page as it renders — chunks on the wire before the whole tree is ready |
| suspense.md | `Suspense` — showing a fallback while async content loads, then swapping it in |
| error-boundaries.md | Containing render errors — one component's crash shows a fallback instead of taking the... |
| signals.md | `@tw/runtime` reactivity — creating reactive values and reacting to their changes |
| stores.md | `defineStore` — shared state with getters and actions, available to every component tha... |
| form-validators.md | The built-in validator functions for checking field values, and `createForm` for runnin... |
| two-way-binding.md | `:value` — binding an input to state so typing updates state and state updates the input |
| scheduler.md | The runtime scheduler — when reactive work runs, and how to queue your own work into it |
| transitions.md | The transition manager — animating elements when they enter, leave or change |
| virtual-list.md | `createVirtualList` — rendering long lists by mounting only the visible rows |
| drag-drop.md | `makeDraggable` and `makeSortable` — dragging elements and reordering lists |
| clipboard.md | `copyText` — writing text to the system clipboard from the browser |
| keyboard-shortcuts.md | `registerShortcut` — binding key combinations to handlers |
| focus-trap.md | `createFocusTrap` — keeping keyboard focus inside a modal or menu while it is open |
| i18n.md | `@tw/runtime` internationalization — translating strings, plurals, and locale-aware for... |
| dark-mode.md | Theme modes — reading, setting and reacting to dark mode |
| lsp.md | `tw lsp` — the language server for `.tw` files |
| sourcemaps.md | Sourcemaps — mapping compiled output back to your `.tw` source |
| minification.md | Shrinking compiled output — what minifies, when, and how to check the result |
| code-splitting.md | How compiled JavaScript is split into chunks, and how a page loads only what it uses |
| tree-shaking.md | Shipping only the exported functions a page actually uses, not the whole module |
| build-profiler.md | The build profiler — timing each phase of `tw build` |
| optimization-passes.md | The compiler's code optimization passes — what runs on your compiled code before it is ... |
| csp-nonce.md | Nonce-based Content Security Policy — allowing your scripts while blocking injected ones |
| csrf.md | The CSRF token manager — generating per-session tokens and rejecting state-changing req... |
| webhooks.md | Receiving webhooks — verifying their signature and acting on the payload |
| static-assets-public.md | The `public/` directory — serving files as-is, and what the server refuses to serve fro... |
| gzip.md | When the server compresses responses, and how to verify it |
| request-object.md | The `request` value passed to route handlers and middleware — every field on it |
| response-shapes.md | What a route handler returns — every slot of the response envelope, and every shortcut ... |
| async-components.md | `defineAsyncComponent` — loading a component's code only when it renders |
| logging.md | `createLogger` — structured logs with levels, tags and context |
| health-checks.md | The `healthCheck` middleware — one URL that answers whether the process is alive |
| range-requests.md | The `Range` header — serving part of a file, for seeking and resumable downloads |


| animation.md | The animation utilities — `animateProperty`, `tween`, the shared rAF loop, and the easing library |
| modal-dialog.md | `showModal`/`openModal`/`closeModal`/`confirmDialog`/`alertDialog` — the modal system with backdrops, focus traps and guards |
| toast-notifications.md | `toast` and its typed shortcuts — positions, priorities, actions, progress bars and dismissal |
| portal.md | `createPortal`/`teleport` — rendering content outside its DOM position for overlays and dropdowns |
| keep-alive.md | `createKeepAlive` — caching unmounted component subtrees so returning restores DOM and state instantly |
| gesture-recognition.md | Swipes, taps, double-taps, long-presses, pinch and rotate — `createGestureRecognizer` and the shortcut helpers |
| directives-api.md | `registerDirective` — the directive lifecycle, the binding shape, and every built-in directive |
| dom-utilities.md | The DOM helper layer — finding, traversal, attributes, classes, styles, events, and batched reads/writes |
| event-bus.md | The pub/sub event bus — `emit`/`emitSync`, priorities, namespaces, and custom buses per feature |
| event-delegation.md | `delegate` and the typed shortcuts — one listener for dynamic children, plus event-modifier parsing |
| component-api.md | `defineComponent` — props, state, computed values, methods, lifecycle; plus `memo`, `forwardRef`, `Fragment`, `withScope` |
| context-api.md | `createContext` — providers, `useContext`/`useContextSignal`, scoped provide, mapping and validation |
| error-recovery.md | `withErrorRecovery` and `createErrorBoundary` — retry policies with backoff and fallback rendering |
| debug-utilities.md | The debug layer — leveled scoped logging, `measureTime`, `inspectObject`, assertions, and `isDev`/`isProd` |
| devtools.md | `enableDevTools`/`getDevTools` — the runtime inspection surface: component tree snapshots for custom panels |
| id-generator.md | Every id generator — `uuid`, `nanoId`, `ulid`, `snowflake`, sequential, registered, and hash ids |
| cache-manager.md | The key/value cache — TTLs, tags, stale-while-revalidate, and hit-rate statistics |
| watch-api.md | `watchDeep`, `watchAll`, `watchOnce` — observing nested state, multiple sources, and one-time readiness |
| global-state.md | `createGlobalState` — a standalone reactive singleton for cross-cutting values, without store ceremony |
| theme-manager.md | `initTheme` and the theme system — custom themes, the full palette shape, transitions, and persistence |
| http-client.md | The `HttpClient` — params, timeouts, retries, interceptors, and the query-aware GET cache |
| websocket-client.md | Named managed connections — reconnect backoff, heartbeats, and multi-domain socket wiring |
| web-workers.md | `createInlineWorker` — running a self-contained function on a background thread, no worker file |
| worker-pool.md | `createWorkerPool` — a bounded pool with priorities, progress reporting, retries and task timeouts |
| vnode-pool.md | The virtual-node object pool — `acquireVNode`/`releaseVNode`, configuration, and manual subtree recycling |
| image-optimizer-client.md | `createOptimizedImage`/`createResponsivePicture`/`preloadImage` — the client-side image helpers |
| form-state.md | `createForm` — the typed form container: per-field signals, validation triggers, submit lifecycle, reset |
| edge-runtime.md | `createEdgeHandler` and the platform wrappers — fetch-API edge deployment for the prebuilt output |
| fonts.md | `optimizeFont` — self-hosted build-time font optimization with CLS-free fallback metrics |
| compression-api.md | `compress`/`decompress`/`negotiateEncoding` — the direct compression primitives and Accept-Encoding negotiation |
| security-headers-api.md | `generateSecurityHeaders` — CSP/HSTS/Permissions-Policy builders, nonces, and the middleware wrapper |
| template-engine.md | The `TemplateEngine` — mustache-style server templates with blocks, partials, helpers, and escaping by default |
| image-handler.md | The `/_tw/img` request engine — parameters, format negotiation, the disk cache, ETags, and the SSRF-guarded remote proxy |
| websocket-server.md | The server-side connection manager — connections, rooms, and room-targeted broadcasting |
| testing-utilities.md | `testRoute` and `testPage` — executing routes and pages directly in tests, no server needed |
| redirects-config.md | `redirects` in tw.config — both forms, matching order, status codes, and query preservation |
| headers-config.md | `headers` in tw.config — path patterns, both forms, precedence, and CRLF-safe values |
| web-vitals.md | `observeLCP`/`FID`/`CLS`/`INP`/`TTFB`/`FCP` — real-user performance metrics with ratings and thresholds |
| load-testing.md | `scripts/loadtest.ts` — flags, the reported metrics, and how to read saturation and tail latency |
| browser-e2e.md | `scripts/browser-e2e.mjs` — what the real-Chromium end-to-end suite verifies and how to debug failures |
| ci-workflow.md | The GitHub Actions pipeline — what runs on every push, and how to mirror it locally |
| password-hashing.md | `createPasswordManager` — PBKDF2 hashing, constant-time verification, strength checking, generation |
| sessions.md | `createSessionManager` — pluggable stores, sliding expiration, fingerprint hashes, and cookie hardening |
| etags.md | Content-addressed ETags and conditional requests — `If-None-Match`, `If-Modified-Since`, and 304 flow |
| multipart-forms.md | `multipart/form-data` handling — the parsed shape, part limits, and upload validation |
| images-config.md | The `images` block in tw.config — quality, formats, breakpoints, and the remote-host allowlist |
| request-lifecycle.md | The ordered path every request takes — normalization, plugins, redirects, middleware, static, API, render |
| cookie-manager-api.md | `SecureCookieManager` — HMAC-signed cookies: sign, verify, parse, and build complete Set-Cookie strings |
| timing-protector-api.md | `createTimingProtector` — padding and jittering operation and response times against timing attacks |
| sanitizer-api.md | `HTMLSanitizer` — stripping dangerous tags, attributes, and URL schemes from untrusted HTML |
| crypto-utilities.md | The `@tw/shared` crypto library — hashing, HMAC, random, encryption, TOTP, and masking helpers |
| jwt-manager-api.md | `createJWTManager` — signing and verifying JWTs with audience/issuer validation and rotation discipline |
| path-traversal-api.md | `createPathPreventer` — traversal patterns, extension rules, and boundary-aware base-directory containment |
| ssrf-protector-api.md | `createSSRFProtector` — blocked ranges, DNS-resolving safe fetch, and failing closed |
| csrf-api.md | `CSRFTokenManager`/`CSRFMiddleware` — signed double-submit tokens, rotation, and fail-closed enforcement |
| server-actions.md | Server actions — `fn action` / `action<Name>` handlers, `POST ?_action=` dispatch, fail-closed same-origin guard |
| isr.md | Incremental Static Regeneration — `revalidate N` for pages and routes, stale-while-revalidate, `x-tw-cache` headers |
| metadata.md | Metadata API — frontmatter `description`/`keywords`/`og_*` auto-rendered to `<meta>` tags |
| rewrites.md | Rewrites — `tw.config.ts` `rewrites` rules (exact, `:param`, glob), internal URL rewriting |
| tailwind.md | Tailwind CSS — utility classes in dot syntax (numbers, fractions), the generate-then-import pipeline, `@apply` for variants |
| signal-streaming.md | Signal Streaming — `render signalStream`, signal permissions (public/private/serverOnly), the `/_tw/stream` protocol, batching and resume |
