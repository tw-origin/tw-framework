# Changelog

Notable changes to TW Framework. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project uses
[Semantic Versioning](https://semver.org/).

## [2.0.1]

A patch release: bug fixes only. No new features, no breaking changes, and no
public API changes -- 2.0.1 is a drop-in replacement for 2.0.0.

### Fixed

- **Compiler -- expressions.** Grouped and nested expressions, string
  concatenation, method calls, unary operators, `&&` (now yields its operand),
  and `.length` on a string all evaluate the way the docs describe. A call to a
  helper the page imports now works; an unknown callee no longer renders its own
  argument; a `}` inside an expression no longer ends it early.
- **Compiler -- conditions and loops.** A parenthesised `if` condition takes the
  right branch, and a loop over a computed collection (`.filter`, `.map`,
  `.slice`, `.concat`, `.reverse`) renders its items instead of an empty list.
- **Compiler -- components and props.** A dynamic prop (`prop={expr}`) binds its
  value; a prop written in the block form reaches the component; two or more
  classes with an `on:` binding no longer merge into one class name; a nested
  component no longer trips the circular check; `{page.description}` resolves and
  the description meta is emitted once.
- **Compiler -- diagnostics.** An interpolation the build cannot evaluate raises
  a warning (`TW098`) instead of silently rendering its source text.
- **Server.** Request-time render modes (`ssr`, `stream`) no longer 404 without a
  `cache` block; an unmatched path is answered with the nearest `not-found.tw`
  and the right status code; `error.tw` is rendered when a render fails; a named
  slot is filled after the layout chain is applied; a static resource answers
  only the methods that apply to it; `tw dev` runs a page's server blocks and
  shows the dev error page when one fails.
- **Runtime.** Store getters and actions follow the documented forms, `subscribe`
  receives the new value, catch-all routes match multiple segments, derived
  values propagate in a consistent order, and two helpers no longer throw on
  edge-case input.
- **Plugins.** A hook returns the first interception result rather than the last,
  so one plugin no longer disables another's `onRequest`; a command registered by
  a plugin is dispatched.
- **Tooling and docs.** `tw --help` reports the real version; the image, link and
  head helpers produce the documented output; several documentation corrections.
- **Security hardening** across token lifetime, upload validation, content-type
  checks, the crypto helpers and the link helpers. The details are intentionally
  not enumerated here -- upgrade if you are on 2.0.0.

## [2.0.0]

### Added

- **Server blocks** — a top-level `server { ... }` block on a `.tw` page runs
  server-side before the page renders, so a page can read request data, call
  `fetch`, read the session and guard a route without a client round trip. Names
  declared in the block are usable in the markup. On by default; opt out with
  `server: { blocks: false }`. See
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
- **`server:defer { }`** — a deferred server block: the shell goes out with a
  `<tw-defer>` placeholder for each deferred value, and the values stream in
  afterwards with a patcher that fills them. See
  [docs/whats-new.md](docs/whats-new.md).

### Changed

- **Server blocks are on by default.** The `experimental.serverBlocks` flag is
  gone from the config surface: set `server: { blocks: false }` to turn the
  feature off. The old `experimental.serverBlocks` key is still read as a
  deprecated alias, so existing configs keep working.
- The error-code ranges are now an explicit allocation map at the top of
  `packages/compiler/tw/diagnostics/codes.ts`; server blocks own `TW099`–`TW119`,
  and the reserved routing band moved to `TW120+`.

## Earlier releases

Releases before `2.0.0` (the `1.0.x` line) predate this changelog; see the git
tags and the release notes on GitHub.
