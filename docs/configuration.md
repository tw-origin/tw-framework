# TW Framework — Configuration

This document covers one thing completely: project configuration — `tw.config.ts`, environment variables and `.env`.

---

## tw.config.ts

At the project root, beside `home/`:

```ts
// tw.config.ts
export default {
  port: 3000,
  redirects: {
    "/old-path": "/new-path",
  },
  headers: {
    "/assets/**": {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  },
};
```

Loaded by `tw dev` and `tw serve` at startup. Comments and TypeScript types are allowed — it is a real `.ts` file.

---

## Fields

| Field | Purpose | Used by |
|-------|---------|---------|
| `port` | default port when no flag/env override | dev, serve |
| `redirects` | permanent path redirects, applied before routing | dev, serve |
| `headers` | response headers per path pattern | dev, serve |
| `source` | source directory (default `home/`) | build, dev |
| `build` | build options — `sourcemap`, target settings | build |
| `plugins` | plugin names (or `{ name, options }` entries) that run with `tw serve` | serve |
| `security` | `{ headers: "standard" \| "strict" \| "dev" \| "off" }` — security headers on every response. `tw serve` defaults to `standard`, `tw dev` to `dev`; `off` disables | dev, serve |
| `rateLimit` | `{ max, windowMs }` — server-level requests-per-window limit. Over the limit, responses are `429` with a `Retry-After` header | serve |
| `strategies` | which option each subsystem uses — signals transport, CSS engine, render engine, server runtime, API runtime, state model, auth model, data layer, cache mode, database adapter, package manager, hydration mode. Every field is optional; omitted fields keep the default, so adding this block never breaks a project | dev, build, serve |

### redirects

```ts
export default {
  redirects: {
    "/blog/old-slug": "/blog/new-slug",
    "/shop": "/store",
  },
};
```

Redirects are matched before route resolution — visitors and crawlers are forwarded with `301`. The query string is preserved (`/old?tab=2` → `/new?tab=2`) unless the target URL has its own query.

### rateLimit

```ts
export default {
  rateLimit: { max: 100, windowMs: 60_000 }, // 100 requests per minute per IP
};
```

Counters are per-IP, in memory. The first request after a window expires starts a new count. When the limit is exceeded, `tw serve` answers `429 Too Many Requests` with a `Retry-After` header instead of running the route.


### headers

```ts
export default {
  headers: {
    "/assets/**": {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    "/**": {
      "X-Frame-Options": "DENY",
    },
  },
};
```

### build

```ts
export default {
  build: {
    minify: true,            // false -> readable output (verified)
    sourcemap: true,         // true | false | "external" | "inline"
    publicPath: "/",         // prefix for emitted asset URLs
    target: "browser",       // browser | node | bun | edge
    // ...treeshake, codeSplitting, define, externals, metafile, incremental
  },
};
```

---

## The config groups

Every fine-grained group below is read through one resolver
(`packages/shared/tw/config/effective.ts`, exported as `resolveDevOptions`,
`resolveServerOptions`, `resolveBuildOptions`, `resolveCompilerOptions`,
`resolveCssOptions`, `resolveRouterOptions`, `resolveI18nOptions`, and the
nested `resolveCorsOptions` / `resolveSslOptions`). The rule everywhere:

- **Unset means today's behaviour.** Each field falls back to the framework
  default, so a project that sets nothing is unaffected.
- **`strategies.*` wins where the two overlap.** The strategy knobs are the
  modern surface; the flat field is their fine-grained alias. For example
  `strategies.css.engine` beats `css.engine`, and `strategies.runtime.server`
  informs `build.target`.
- **A wrong-typed value falls back to the default**, never crashes a build.

| Group | Fields | Where it is applied |
|-------|--------|---------------------|
| `dev` | 13 | `tw dev` — host/port, `hmr` (SSE live-reload channel), `hmrHost`/`hmrPort`, `openBrowser`, `https` + cert/key, `watchPaths`/`watchIgnore`, `overlay`, `fastRefresh` |
| `server` | 15 | `tw serve` → `TWServer` — host/port, `workers`/`cluster` (reusePort), `maxConnections` (in-flight request cap), `bodyLimit` (max request body), `timeout` (408), `keepAlive`/`keepAliveTimeout` (idle timeout), `staticServing`, `compression`, `trustProxy`, `ssl`, `gracefulShutdown` |
| `server.cors` | 7 | applied to **every** response (static, SSR and API): `enabled`, `origin`, `methods`, `allowedHeaders`, `exposedHeaders`, `credentials`, `maxAge`. `OPTIONS` preflight for an unmatched path answers `204`. |
| `server.ssl` | 3 | `cert`, `key`, `ca` → the server's TLS listener |
| `build` | 20 | `tw build` — `minify`, `sourcemap`, `target`, `format`, `treeshake`, `splitting`/`codeSplitting`, `define`, `externals`, `inject`, `loaders`, `chunkNames`, `assetNames`, `outputDir`, `assetsDir`, `publicPath`, `metafile`, `bundleAnalysis`, `entryPoints`, `incremental` (page cache) |
| `compiler` | 17 | the compile passes. `hoistDirectives` and `ssrAttributes` gate their transforms; `foldConstants`, `deadCode`, `treeShaking`, `removeEmptyBlocks` feed the optimizer; `scopedStyles` controls style scoping (see below); `inlineComponents` flattens component bodies into the page AST before the optimizer; `minifyHTML`/`minifyCSS`/`minifyJS` minify the emitted output (`preserveComments` keeps comments); `sourceMaps` attaches a source map to the result; `incremental`/`cacheSize` size the parser's cache; `optimization` is a preset (`none` = folding/dead-code/tree-shaking off, `aggressive` = JS minify on) that an explicit field beats; `strict: false` reports compiler errors as warnings. |
| `css` | 9 | the CSS pipeline — `engine` (strategy wins), `modules` (also gates `.module.tss` scoping), `prefix` (generated class prefix), `variables` (`:root` custom properties), `extract` (`false` = inline instead of linking files), `minify`, `autoprefixer`, `targets`, `importPaths` |
| `router` | 7 | `trailingSlash`, `caseSensitive`, `locales`, `defaultLocale`, `localePrefix`, `routes`, `apiDir` |
| `i18n` | 9 | the i18n runtime — `enabled`, `defaultLocale`, `locales`, `fallback`, `strategy` (`prefix` maps to the runtime's `subpath`), `translationDir`, `namespaces`, `loading`, `detection`. Falls back to `router.locales`/`defaultLocale` when its own are unset. |

Every field in every group above is wired — `dev`, `server`, `build`,
`compiler`, `css`, `router`, `i18n` and the nested `cors`/`ssl`.

Two notes:

- `server.trustProxy` defaults to **on** (forwarded headers honoured — the
  behaviour every deployment behind a proxy expects). `false` ignores them and
  uses the connection's own address, so a spoofed `X-Forwarded-For` cannot
  rotate a rate-limit bucket.
- `css.autoprefixer` adds a fixed set of vendor prefixes (`user-select`,
  `appearance`, `backdrop-filter`, `position: sticky`); `css.targets` decides
  whether the legacy `-ms-`/`-moz-` variants are included.

Every field in the `compiler` group is wired.

`inlineComponents` flattens a component's body into the page AST before the
optimizer runs, so the optimizer sees one tree (the codegen otherwise resolves
the component later). Default off; the rendered HTML matches either way.

`incremental` / `cacheSize` control the parser's cache: a repeat compile of an
unchanged file reuses its parsed AST. `incremental: false` or `cacheSize: 0`
turns it off. The cache stores each file's AST *and* its diagnostics, so a hit
never hides a parse error.

### Style scoping — `compiler.scopedStyles`

Two mechanisms, both under this one switch (default `true`):

- **`.module.tss` / `.module.css`** — classes are hashed per file (`.btn` →
  `.tw-btn-1ni3ly`). `scopedStyles: false` leaves them global.
- **`<style scoped>`** — the block's rules are rewritten to
  `selector[data-tw-scope="<id>"]` and every element on the page is tagged with
  the matching `data-tw-scope`, so the block applies only to that page. The id
  is derived from the file, so it is stable across builds. `scopedStyles: false`
  disables it.

A page that uses neither mechanism is byte-identical either way — the pass
returns the program untouched when there is no scoped block.

---

## Port Resolution — The Full Precedence

```
--port flag   >   PORT environment variable   >   tw.config.ts port   >   default
```

Default: `3000` for `tw dev`, `8000` for `tw serve`.

`PORT` sits above the config file so platforms that inject it (Docker, Railway, Render, Heroku) always win. If your server starts on the wrong port, check for a stray `PORT` in the environment before anything else.

---

## Environment Variables — .env

A `.env` file at the project root is loaded by `tw dev` and `tw serve` at startup:

```bash
# .env
JWT_SECRET=a-long-random-secret
DATABASE_URL=postgres://user:pass@host/db
PAYMENT_API_KEY=pk_live_...
```

Read them in server code only:

```twm
fn post(request) {
  const key = process.env.PAYMENT_API_KEY
  if (!key) {
    return { status: 500, json: { error: "Server misconfigured" } }
  }
  // ...
}
```

Rules:

- `.env` belongs in `.gitignore` — commit a `.env.example` with the keys and no values
- Environment variables are server-side. They are never exposed to pages or client chunks (the server boundary — [Client Modules](./client-modules.md))
- `.twm` routes and `lib/` code are the only places that read them

---

## tsconfig.json

A typical project keeps a `tsconfig.json` for editor support and `tw check`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["bun-types"]
  },
  "include": ["home", "components", "lib", "style"]
}
```

`tw check` runs the type check across your project — see [Commands Reference](./commands-reference.md).

---

## package.json Scripts

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tw dev",
    "build": "tw build",
    "start": "tw serve",
    "test": "tw test",
    "check": "tw check"
  }
}
```

---

## What Is NOT Configured in tw.config.ts

| Concern | Where it lives |
|---------|----------------|
| Routes | the file system — `home/` directory ([Project Structure](./project-tree.md)) |
| Middleware rules | `middleware.twm` ([Middleware](./middleware.md)) |
| Page titles and render modes | `page { }` in each file ([Page Config](./syntax-page-config.md)) |
| Styles | imports in pages and layouts ([Styling Guide](./styling-guide.md)) |
| Deployment platform | `tw adapter` / `tw ship` outputs ([Deployment Adapters](./deployment-adapters.md)) |

The file system is the configuration — `tw.config.ts` only holds what has no natural home in the tree.

---

## Common Mistakes

### Editing tw.config.ts while the server runs

Config reloads on restart. Stop and start `tw serve` / `tw dev` after changing it.

### Setting the port only in the config on a PaaS

Platforms inject `PORT` and it outranks the config — that is intended. Set the platform's port variable, not the file.

### Committing .env

Secrets in git history are leaked secrets. Keep `.env` ignored; rotate anything that was ever committed.

---

## Quick Reference

```ts
// tw.config.ts
export default {
  port: 3000,
  redirects: { "/old": "/new" },
  headers: { "/assets/**": { "Cache-Control": "immutable" } },
  build: { sourcemap: "linked", plugins: [] },
  strategies: {
    signals:   { transport: "sse" },     // "sse" | "ws" | "long-poll"
    css:       { engine: "tss" },        // "tss" | "tailwind" | "css" | "scss"
    render:    { engine: "tw-vdom" },    // "tw-vdom" | "react" | "preact" | "none"
    runtime:   { server: "auto" },       // "auto" | "bun" | "node" | "deno" | "edge"
    api:       { runtime: "node" },      // "node" | "edge"
    state:     { model: "signals" },     // "signals" | "hooks" | "store"
    auth:      { model: "session" },     // "session" | "jwt" | "oauth"
    data:      { layer: "routes" },      // "routes" | "graphql" | "trpc"
    cache:     { mode: "isr" },          // "isr" | "swr" | "none" | "cdn"
    db:        { adapter: "sql" },       // "sql" | "kv" | "vector"
    hydration: { mode: "auto" },         // "auto" | "full" | "islands" | "none"
    packages:  { manager: "auto" },      // "auto" | "npm" | "pnpm" | "yarn" | "bun"
  },
};
```

A wrong value is a hard error at config load with the allowed list and the
closest match; an impossible combination is rejected with a fix. Run
`tw doctor` to see the active option in every subsystem — full list in
[Strategies](./strategies.md).

## Related

- [Commands Reference](./commands-reference.md)
- [Strategies](./strategies.md)
- [Server Features](./server-features.md) — port precedence in production
- [Setup Guide](./setup-guide.md)

---

## The router config is small on purpose

- There is **no `pageExtensions`**. A page is markup, so its extension is
  `.tw` -- decided by the file type (`getExtensionForType()`), not by config.
  `.twm` is the server-side module extension (API routes, middleware).


Before this, both were declared in the config and read by nothing: writing them
changed no behaviour.

---

## Which extension for which file

The framework decides the extension from the file's **type**, not from a
free-form list:

| File type | Extension | Kind |
|---|---|---|
| `page`, `index`, `layout`, `template`, `loading`, `error`, `not-found`, `global-error`, `default`, `head` | **`.tw`** | markup — compiled with the full pipeline |
| `route`, `middleware` | **`.twm`** | server-side JS functions — no markup |

So `home/x/page.tw` is a page; `home/api/x/route.twm` is an API route.
**`page.twm` is not a thing** — it would ask the compiler to treat a JS module
as markup. `getExtensionForType()` is the authority.
