# TW Framework v2.0.0

The server-blocks release. A `.tw` page can now read the request, call `fetch`,
read the session and guard a route — server-side, before it renders — with no
client round trip and no separate API file. It is on by default, and the whole
toolchain (compiler, server, CLI, deploy adapters) has been hardened against it.

```tw
page { title "Dashboard" render ssr }

server {
  const user = await requireUser()
  const stats = await fetch("/api/stats").then(r => r.json())
}

h1 { "Welcome, {user.name}" }
p { "{stats.open} open tasks" }
```

## Highlights

- **Server blocks** — `server { … }` runs on the server before the page renders;
  names it declares are usable in the markup. On by default; opt out with
  `server: { blocks: false }`. → [docs/server-data.md](docs/server-data.md)
- **Server-only boundary** — `*.server.ts` and the `server-only` package keep
  secrets off the client; importing one into a client module is a build error
  (`TW1007`).
- **Per-fetch cache and page cache** — `fetch` inside a block is instrumented
  (timeout, per-request dedupe, opt-in cache with a size cap); a page's
  `cache { }` block adds `revalidate`, `expire`, `tag` and `vary`.
- **Session wiring on the page path** — `server.use(...)` middleware runs for
  page and `.twm` requests; `asMiddleware()` adapts express-style middleware so
  `getSession()` / `requireUser()` work without per-request wiring.
- **`server:defer { }`** — the shell is flushed first with a `<tw-defer>`
  placeholder per deferred value, and the values stream in afterwards.
- **Diagnostics `TW099`–`TW119`** — block syntax, static/cached-page scope rules,
  serialization, the payload cap, and the SQL/SSRF lints.
  → [docs/error-reference.md](docs/error-reference.md)
- **Build-aware deploy adapters** — `tw adapter vercel` / `tw ship vercel` read
  the build summary and emit the serverless config (functions + rewrites +
  `api/tw-server.ts`) for an SSR/API app, or the static config for a static
  build — and warn instead of letting an empty site deploy.
- **Bun and Node are equal** — the server no longer calls `Bun.file` /
  `Bun.gzipSync` unguarded, so SSR, the router and static serving behave the
  same on both runtimes.

## Breaking changes

- **Server blocks are on by default.** `experimental.serverBlocks` is gone from
  the config surface; set `server: { blocks: false }` to turn the feature off.
  The old key is still read as a deprecated alias, so existing configs keep
  working.
- Error-code ranges are now an explicit allocation map at the top of
  `packages/compiler/tw/diagnostics/codes.ts`: server blocks own `TW099`–`TW119`,
  the reserved routing band moved to `TW120+`.

See [UPGRADING.md](UPGRADING.md) for the 1.x → 2.0 steps.

## Fixes

- Deploy: one shared Vercel generator for `tw adapter` / `tw ship` / `tw init`,
  build-aware instead of always static.
- `tw check` seeds the component registry like `tw build`, so imported components
  are no longer reported as unknown; components imported by path from outside
  `components/` now resolve too.
- `tw dev` returns a route's own response headers (including `Set-Cookie`) on
  JSON responses, matching `tw serve`.
- Compiler: component attribute props (`Card title="x" { }` / `title={expr}`),
  the interpolated-value evaluator (`obj["k"]`, `obj[var]`, `arr[1+1]`),
  dotted `for … in {obj.list}` iterables, URL-attribute sanitisation, TSS block
  comments and shorthands, and the `TW003`/`TW006` allow-list.
- Server/runtime: real `sha256` on Node (no 32-bit fallback in cache keys),
  `renderToStream` no longer returns a locked stream, percent-encoded path
  guards, middleware fail-closed on a rule parse error, default CORS headers,
  SWR under load, `[...slug]` catch-alls, `bodyParse` on a native `Request`,
  Range requests + content ETags.
- CLI: `tw serve` no longer swallows startup errors, `tw create`'s config
  type-checks, `build.outputDir` is honoured by `tw serve`, `build.target` is
  applied, `tw ship docker` writes a working Dockerfile, build emits a 404 page
  and loads `.env`, and `tw dev` matches `tw serve` for multipart, rewrites and
  the `__TW_SIGNALS__` manifest.

## Install

```sh
npm install tw-framework@2.0.0
# or
bun add tw-framework@2.0.0
# or scaffold a new app
npm create tw-framework@2.0.0 my-app
```

## Assets

| File | SHA-256 |
| --- | --- |
| `tw-framework-2.0.0.tgz` | `10b572d9052be170154b6b5b6adcd44644ddec5f3f305308f2f1c36b2f282a2d` |

Verify with `sha256sum -c SHA256SUMS`.

## Docs

- [Getting started](GETTING-STARTED.md)
- [Server data](docs/server-data.md) · [Configuration](docs/configuration.md) ·
  [Error reference](docs/error-reference.md) · [What's new](docs/whats-new.md)
- Full list of changes: [CHANGELOG.md](CHANGELOG.md)
