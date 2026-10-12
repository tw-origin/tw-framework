# Changelog

Notable changes to TW Framework. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project uses
[Semantic Versioning](https://semver.org/).

## [2.0.0]

### Added

- **Server blocks** — a top-level `server { ... }` block on a `.tw` page runs
  server-side before the page renders, so a page can read request data, call
  `fetch`, read the session and guard a route without a client round trip. Names
  declared in the block are usable in the markup. Gated behind
  `experimental.serverBlocks` in `tw.config.ts`. See
  [docs/server-data.md](docs/server-data.md).
- **The server-only boundary** — `*.server.ts` modules and the `server-only`
  package keep secrets off the client. Importing a server-only module into a
  client module is a build error (`TW1007`).
- **Per-fetch cache and page cache** — `fetch` inside a block is instrumented
  (timeout, per-request dedupe, opt-in cache with a size cap), and a page's
  `cache { }` block adds `revalidate`, `expire`, `tag` and `vary`. A cached
  page's server block cannot read request-scoped data (`TW111`).
- **Session wiring on the page path** — `server.use(...)` middleware now runs
  for page and `.twm` route requests, and `asMiddleware()` adapts express-style
  middleware (`sessionMiddleware`, `csrfProtection`, …) so `getSession()` and
  `requireUser()` work without manual per-request wiring. A middleware's
  `Set-Cookie` is delivered on the page response. See
  [docs/server-data.md](docs/server-data.md).
- **Diagnostics** — `TW099`–`TW117` cover server blocks: block syntax, static
  and cached-page scope rules, serialization, the payload cap, and the SQL/SSRF
  lints. See [docs/error-reference.md](docs/error-reference.md).
- **`server:defer { }`** — a deferred server block. See
  [docs/whats-new.md](docs/whats-new.md).

### Changed

- The error-code ranges are now an explicit allocation map at the top of
  `packages/compiler/tw/diagnostics/codes.ts`; server blocks own `TW099`–`TW119`,
  and the reserved routing band moved to `TW120+`.

## Earlier releases

Releases before `2.0.0` (the `1.0.x` line) predate this changelog; see the git
tags and the release notes on GitHub.
