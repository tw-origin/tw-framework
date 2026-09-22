# TW Framework Examples -- 30 Apps

Every app here builds with `tw build` and serves with `tw serve` (CI and
`bun run verify` prove all 30 on every run). Each teaches exactly ONE
thing; the matrix below routes you to the right one.

## The matrix

| Example | The one thing |
|---------|---------------|
| [hello-tw](./hello-tw) | Minimal app: pages, layout, components, an API route |
| [tw-blog](./tw-blog) | Blog: dynamic routes, layouts, ISR at depth |
| [dashboard](./dashboard) | SSR page with `cache { life }` stat cards |
| [ecommerce-shop](./ecommerce-shop) | **FULL STORE**: layout, 12-product catalog, dynamic product pages, cart, checkout APIs, 404 |
| [todo-app](./todo-app) | Islands: `on:event` expressions mutate state |
| [portfolio](./portfolio) | Multi-page static site |
| [api-server](./api-server) | Pure JSON API: cached GETs, echo POSTs, `revalidateTag` |
| [auth-starter](./auth-starter) | Login form, POST handler, middleware `auth` rule |
| [i18n-site](./i18n-site) | Bilingual routes (English / हिन्दी) |
| [chat-stream](./chat-stream) | Signal streaming (`render stream` + `setSignal`) |
| [image-gallery](./image-gallery) | Responsive image grid, the alt-text floor |
| [forms-validation](./forms-validation) | Contact form with server-side validation |
| [analytics](./analytics) | Counter API + cached board + `updateTag` flow |
| [kitchen-sink](./kitchen-sink) | Everything at once: modes, cache, actions, middleware, unicode |
| [docs-site](./docs-site) | **FULL SITE**: shared layout + sidebar, guide/reference/deploy sections, 404 |
| [url-shortener](./url-shortener) | 302 redirects, query handling, module state |
| [weather-app](./weather-app) | Cached lookups keyed by query (per-city entries) |
| [wiki](./wiki) | Dynamic [slug] pages + a search API |
| [changelog](./changelog) | Cached release timeline + publish invalidation |
| [recipe-site](./recipe-site) | **FULL SITE**: shared layout, categories, dynamic recipe routes, recipe API, 404 |
| [countdown](./countdown) | Island timer with guarded state updates |
| [calculator](./calculator) | Expressions as the templating language |
| [quiz-app](./quiz-app) | Multi-step state machine on one island |
| [kanban-board](./kanban-board) | Columns, cards, and derived counters on an island |
| [comments](./comments) | Posts cached under a tag; writes bump it |
| [headers-demo](./headers-demo) | Default security headers + custom handler headers |
| [redirects-demo](./redirects-demo) | A handler gallery: 302, 410, 418, 422 |
| [search-demo](./search-demo) | Query strings and the canonical cache key |
| [webhook-log](./webhook-log) | POST receiver + log viewer (why some handlers stay uncached) |
| [pricing-table](./pricing-table) | A production-shaped static page in pure TSS |

Run one:

```sh
cd examples/todo-app
bun install
tw dev
```

## Choosing a starting point

- Content site: portfolio, docs-site, pricing-table, then tw-blog
- API backend: api-server, url-shortener, webhook-log, redirects-demo
- Interactive client app: todo-app, calculator, countdown, quiz-app, kanban-board
- Caching focus: dashboard, weather-app, comments, changelog, search-demo, analytics
- Auth/security: auth-starter, headers-demo, kitchen-sink
- Server-push: chat-stream
- Dynamic content: wiki, recipe-site, i18n-site

Every example's README documents its files, behavior, and ten exercises.
