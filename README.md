<p align="center">
  <img src="assets/logo.jpg" alt="TW Framework" width="140" />
</p>

<h1 align="center">TW Framework</h1>

<p align="center">
  <strong>A full-stack web framework for the Bun runtime — one language for markup, styling, state and server.</strong>
</p>

<p align="center">
  <a href="https://github.com/tw-origin/tw-framework/actions/workflows/ci.yml"><img src="https://github.com/tw-origin/tw-framework/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/version-1.0.0-22c55e" alt="version 1.0.0" />
  <img src="https://img.shields.io/badge/runtime-Bun%20%7C%20Node-22c55e" alt="Bun and Node runtimes" />
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="TypeScript" />
</p>

---

## What is TW?

TW Framework is a complete web platform built from the ground up in TypeScript. It runs on **Bun** (recommended, fastest) and **Node.js 18+** — the same commands, the same projects, both runtimes. It ships its own
template language (`.tw`), its own styling language (`.tss`), its own compiler (TW Compiler), its own VDOM engine (TW VDOM 1)
and its own production server — so every layer of the stack is designed to work together instead
of being glued together.

Write your UI in one syntax:

```tw
html {
  head { title "{page.title}" }
  body {
    div.counter {
      h1 "Clicked {count} times"
      button on:click "count = count + 1" { "Increment" }
    }
  }
}
```

Pages are compiled to static HTML at build time. When a page declares `render interactive`,
TW Compiler marks the live regions and the ~5KB client runtime makes them reactive in the
browser — state, conditionals, lists, two-way inputs and client-side navigation.

## Core Features

- **TW Compiler** — compiles `.tw` templates to HTML, with live-region marking for interactivity
- **TW VDOM 1** — on-demand virtual DOM for interactive islands, lean static output everywhere else
- **TW Runtime** — ~5KB client runtime: reactive state, live lists, conditionals, two-way binding
- **SPA navigation** — internal links swap pages without reloads (history, popstate, hover prefetch)
- **TW Styles (`.tss`)** — CSS-first styling compiled at build time, component and global scopes
- **File-system routing** — `home/page.tw` becomes `/`, dynamic routes, catch-alls, parallel slots
- **API routes** — `.twm` handlers with middleware, params, pagination and JSON responses
- **Render modes** — static, SSR, island, edge, client-side rendering, streaming, partial prerendering and signal streaming per page
- **Signal streaming** — server-pushed live updates: `render signalStream` + `publicSignal()`/`privateSignal()`, batched delivery, resume after disconnect
- **Security built in** — CSP, sanitization, auth middleware, rate limiting
- **Production server** — gzip, ETag/304 caching, redirects, custom headers, structured logging
- **Full toolchain** — `tw create`, `tw dev`, `tw build`, `tw serve`, `tw test`, `tw check`, `tw adapter`, `tw plugin`, `tw lsp`, `tw ship`
- **TW LSP** — editor support for `.tw` files

## The Render System

Every page picks its own render mode — eight of them, one syntax, mixed freely in one project:

| Mode | Rendering happens | For |
|------|------------------|-----|
| `static` | Build time | Content pages, marketing |
| `ssr` | Every request | Per-user data |
| `island` | Build + client | Content with widgets |
| `edge` | Build time | Edge-CDN serving |
| `csr` | In the browser | Apps behind a login |
| `stream` | Request, chunked | Fast shell, data follows |
| `ppr` | Build + request holes | Instant paint, fresh data |
| `signalStream` | Build + live push | Tickers, dashboards, notifications |

The headline: **Signal Streaming**. Server-side signal changes push straight into every connected browser — the page updates in place, no reload, no polling, no socket library, no client code:

```tw
page { title "Live Prices" render signalStream }

state {
  price = publicSignal(150.25)          # broadcast to every client
  qty = 2
  cart = privateSignal([])              # per-user, session-scoped
  total = derivedSignal("price * qty")  # recomputed live on every update
}

div.live { h2 "Price: {price}" }
```

```twm
import { setSignal } from "tw";

fn post(request) {
  setSignal("price", 151.2);
  return { status: 200, json: { ok: true } };
}
```

That is the whole feature — the framework handles the transport, batching, resume and permissions.

Full showcase with code for every mode: **[RENDER-SYSTEM.md](RENDER-SYSTEM.md)** · Reference: [docs/render-modes.md](docs/render-modes.md) · Protocol: [docs/signal-streaming.md](docs/signal-streaming.md)

## Quick Start

New to TW? **[GETTING-STARTED.md](GETTING-STARTED.md)** walks the full journey — terminal and no-terminal, zero to deployed.

```bash
# Create a new app — scaffold, git init and install in one command
npx create-tw-app@latest my-app
cd my-app

# Start the dev server
npm run dev

# Build for production, then serve it
npm run build
npm start
```

Prefer the framework package directly? `npx tw-framework create my-app` does the same — `bunx`, `yarn` and `pnpm create tw-app` work too.

## Project Structure

```
my-app/
├── home/            # pages (file-system routing)
│   ├── layout.tw   # auto-composed layout
│   ├── page.tw     # -> /
│   ├── about/      # -> /about
│   └── api/        # API routes (.twm)
├── components/      # shared .tw components
├── style/           # global .tss styles
├── lib/             # server modules (db, validation, helpers)
├── public/          # static assets
└── tw.config.ts     # project config
```

## Commands

| Command | What it does |
|---------|--------------|
| `tw create <name>` | Scaffold a new project |
| `tw dev` | Dev server with hot reload |
| `tw build` | Compile pages, APIs and assets to `.tw/` |
| `tw serve` | Production server (gzip, caching, rate limiting) |
| `tw test` | Run the project test suite |
| `tw check` | Validate project structure and config |
| `tw adapter` | Generate deployment adapter files (node, bun, docker, vercel) |
| `tw plugin` | Manage project plugins (list, add, remove, create) |
| `tw lsp` | Language server for editors (completion, hover, diagnostics) |
| `tw ship` | Prepare deployment (Vercel / Netlify / Cloudflare) |

## Packages

| Package | Role |
|---------|------|
| `@tw/compiler` | TW Compiler — parser, TW VDOM 1, HTML codegen |
| `@tw/runtime` | TW Runtime — client reactivity and SPA router |
| `@tw/server` | Production server, routing, middleware, security |
| `@tw/security` | CSP, sanitization, auth primitives |
| `@tw/lsp` | Editor tooling for `.tw` |
| `@tw/plugins` | Plugin interfaces |
| `@tw/sdk` | Framework SDK |
| `@tw/shared` | Shared types and utilities |

## Documentation

Full documentation lives in [`docs/`](./docs):

- [Framework overview](./docs/framework-overview.md)
- [Project structure](./docs/project-tree.md)
- [Setup guide](./docs/setup-guide.md)
- [Syntax overview](./docs/syntax-guide.md) — with a deep dive per feature:
  [imports](./docs/syntax-imports.md), [page config](./docs/syntax-page-config.md),
  [state](./docs/syntax-state.md), [markup](./docs/syntax-markup.md),
  [interpolation](./docs/syntax-interpolation.md), [attributes](./docs/syntax-attributes.md),
  [events](./docs/syntax-events.md), [bindings](./docs/syntax-bindings.md),
  [conditionals](./docs/syntax-conditionals.md), [loops](./docs/syntax-loops.md),
  [components](./docs/syntax-components.md), [slots](./docs/syntax-slots.md),
  [head block](./docs/syntax-head-block.md)
- [Layouts](./docs/layouts.md) · [Render modes](./docs/render-modes.md)
- [Styling](./docs/styling-guide.md) — [TSS syntax](./docs/tss-syntax.md),
  [SCSS](./docs/scss-guide.md), [scoped styles](./docs/scoped-styles.md),
  [plain CSS](./docs/plain-css.md), [production CSS](./docs/production-css.md)
- [API routes](./docs/api-routes.md) · [Middleware](./docs/middleware.md)
- [Client modules & dependency graph](./docs/client-modules.md) ·
  [Client runtime](./docs/client-runtime.md)
- [Security](./docs/security.md) · [Testing](./docs/testing.md) ·
  [Configuration](./docs/configuration.md)
- [Core system](./docs/core-system.md) · [Error reference](./docs/error-reference.md)
- [Commands reference](./docs/commands-reference.md) ·
  [Deployment adapters](./docs/deployment-adapters.md) ·
  [No-terminal guide](./docs/no-terminal-guide.md)

Guides: [choose a platform](./docs/guide-deployment-choose.md),
per-platform deploy guides ([Vercel](./docs/guide-vercel.md),
[Netlify](./docs/guide-netlify.md), [Cloudflare](./docs/guide-cloudflare.md),
[AWS](./docs/guide-aws.md), [DigitalOcean](./docs/guide-digitalocean.md),
[Render](./docs/guide-render.md), [Railway](./docs/guide-railway.md),
[Fly](./docs/guide-fly.md), [GitHub Pages](./docs/guide-github-pages.md),
[Firebase](./docs/guide-firebase.md), [self-hosted](./docs/guide-self-hosted.md)),
and feature guides — [forms](./docs/guide-forms.md),
[auth](./docs/guide-auth.md), [data fetching](./docs/guide-data-fetching.md),
[blog](./docs/guide-blog.md), [dashboard](./docs/guide-dashboard.md),
[storefront](./docs/guide-ecommerce-catalog.md), [SEO](./docs/guide-seo.md),
[performance](./docs/guide-performance.md), [assets](./docs/guide-assets-images.md),
[testing/CI](./docs/guide-testing-ci.md), [environments](./docs/guide-environments.md),
[troubleshooting](./docs/guide-troubleshooting.md),
and the [plugin system](./docs/plugins.md) with an [end-to-end plugin guide](./docs/guide-plugins.md),
the [image system](./docs/optImage.md) with its `optImage` component, and [RouterLink](./docs/RouterLink.md) for SPA navigation.

Reference — one topic per document:
[routing](./docs/dynamic-routes.md) ([dynamic](./docs/dynamic-routes.md),
[catch-all](./docs/catch-all-routes.md), [groups](./docs/route-groups.md),
[parallel](./docs/parallel-routes.md), [intercepting](./docs/intercepting-routes.md),
[not-found](./docs/not-found-pages.md));
the server side — [query params](./docs/query-params.md), [cookies](./docs/cookies.md),
[rate limiting](./docs/rate-limiting.md), [CORS](./docs/cors.md),
[error handling](./docs/error-handling-routes.md), [body limits](./docs/body-limits.md),
[lib/ modules](./docs/lib-modules.md), [hot reload](./docs/hot-reload.md),
[validation](./docs/request-validation.md), [webhooks](./docs/webhooks.md),
[the request object](./docs/request-object.md) and
[response shapes](./docs/response-shapes.md);
HTTP details — [static assets](./docs/static-assets-public.md), [gzip](./docs/gzip.md),
[health checks](./docs/health-checks.md), [range requests](./docs/range-requests.md);
the runtime — [signals](./docs/signals.md), [stores](./docs/stores.md),
[suspense](./docs/suspense.md), [async components](./docs/async-components.md),
[error boundaries](./docs/error-boundaries.md), [streaming](./docs/streaming.md),
[the scheduler](./docs/scheduler.md), [transitions](./docs/transitions.md);
UI utilities — [form validators](./docs/form-validators.md),
[two-way binding](./docs/two-way-binding.md), [virtual list](./docs/virtual-list.md),
[drag and drop](./docs/drag-drop.md), [clipboard](./docs/clipboard.md),
[keyboard shortcuts](./docs/keyboard-shortcuts.md), [focus trap](./docs/focus-trap.md),
[i18n](./docs/i18n.md), [dark mode](./docs/dark-mode.md);
the build — [LSP](./docs/lsp.md), [source maps](./docs/sourcemaps.md),
[minification](./docs/minification.md), [code splitting](./docs/code-splitting.md),
[tree shaking](./docs/tree-shaking.md), [the build profiler](./docs/build-profiler.md),
[optimization passes](./docs/optimization-passes.md);
and security internals — [CSP nonces](./docs/csp-nonce.md), [CSRF](./docs/csrf.md);
the runtime API — [animation](./docs/animation.md), [modals](./docs/modal-dialog.md),
[toasts](./docs/toast-notifications.md), [portals](./docs/portal.md),
[keep-alive](./docs/keep-alive.md), [gestures](./docs/gesture-recognition.md),
[directives](./docs/directives-api.md), [DOM utilities](./docs/dom-utilities.md),
[event bus](./docs/event-bus.md), [event delegation](./docs/event-delegation.md),
[components](./docs/component-api.md), [context](./docs/context-api.md),
[error recovery](./docs/error-recovery.md), [debug utilities](./docs/debug-utilities.md),
[devtools](./docs/devtools.md), [id generation](./docs/id-generator.md),
[caching](./docs/cache-manager.md), [watchers](./docs/watch-api.md),
[global state](./docs/global-state.md), [theming](./docs/theme-manager.md),
[the HTTP client](./docs/http-client.md), [WebSockets](./docs/websocket-client.md),
[web workers](./docs/web-workers.md), [worker pools](./docs/worker-pool.md),
[image optimization](./docs/image-optimizer-client.md), and [form state](./docs/form-state.md);
the server API — [edge runtime](./docs/edge-runtime.md), [fonts](./docs/fonts.md),
[compression](./docs/compression-api.md), [security headers](./docs/security-headers-api.md),
[the template engine](./docs/template-engine.md), [the image handler](./docs/image-handler.md),
[the WebSocket server](./docs/websocket-server.md), [route testing](./docs/testing-utilities.md);
configuration and ops — [redirects](./docs/redirects-config.md),
[custom headers](./docs/headers-config.md), [web vitals](./docs/web-vitals.md),
[load testing](./docs/load-testing.md), [browser E2E](./docs/browser-e2e.md),
[CI](./docs/ci-workflow.md), [multipart forms](./docs/multipart-forms.md),
[images config](./docs/images-config.md), and
[the request lifecycle](./docs/request-lifecycle.md);
and security APIs — [password hashing](./docs/password-hashing.md),
[sessions](./docs/sessions.md), [ETags](./docs/etags.md),
[cookie manager](./docs/cookie-manager-api.md),
[timing protector](./docs/timing-protector-api.md), [sanitizer](./docs/sanitizer-api.md),
[crypto utilities](./docs/crypto-utilities.md), [JWT](./docs/jwt-manager-api.md),
[path traversal](./docs/path-traversal-api.md), [SSRF](./docs/ssrf-protector-api.md),
and [CSRF](./docs/csrf-api.md).

The complete index of all 182 documents lives in the
[framework overview](./docs/framework-overview.md).

## The Team

**Lead Developer — Kanishk Kumar**

Developers: Aslam Alam · Rohit Kumar · Badal Kumar · TW Mlkraj

TW Framework has been in development for 8–12 months, from the first line of the parser to the
1.0.0 release — compiler, VDOM, styling engine, server and toolchain all built in-house.

Debugging support during development: Indus (Sarvam AI), Claude Max, ChatGPT Terra 4, DeepSeek v4 Coder.

## Security

Found something that looks like a security issue? See **[SECURITY.md](SECURITY.md)** — the built-in protections, reporting contact and scope.

## Contact

- **Email:** mlkraj290@gmail.com
- **Instagram:** [@tw____official](https://instagram.com/tw____official)

## License

MIT
