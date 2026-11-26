# Changelog

Notable changes to TW Framework. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project uses
[Semantic Versioning](https://semver.org/).

## [2.0.5]

A patch release on top of 2.0.4. Two features that were blocked by bugs, and a
run of stylesheet fixes.

### Added

- **Page-level imports reach `server { }` blocks.** A page may now import from
  `lib/` and use the binding inside a server block:

  ```tw
  import { getApps } from "lib/data"
  server { const apps = await getApps() }
  ```

  The import is resolved only when a block actually references it, and
  block-local imports keep precedence. Use the same name in markup and it is
  still `TW1007`, because that would have to reach the browser.
- **`@tw/client-safe`.** A module inside `lib/` opts out of the server-only
  default with `import "@tw/client-safe"`. `@tw/server-only` marks a module
  anywhere. A client-safe module that pulls in a server-only dependency still
  fails, with the whole import chain in the message.
- **`TW125`** reports an import whose local name is also a server-block
  built-in (`query`, `params`, `fetch`, …). Those bindings were silently
  replaced by the built-in, so the block ran against the wrong value.
- **`notFound()` in a static block.** The build skips that page and the host
  serves a real 404, instead of a 200 with a "not found" body that crawlers
  index.

### Fixed

- **TSS multi-line blocks.** A nested `@media`, `@container`, `@keyframes` or
  `@layer` produced invalid CSS — a selector-less rule, or one copy of the
  at-rule per inner rule so `@keyframes` lost frames. Custom properties
  (`--main`) and vendor prefixes (`-webkit-transform`) written on their own
  line were pasted into the previous declaration's value.
- **TSS strings.** A `;` or `}` inside a quoted string split the declaration and
  broke the block.
- **TSS statement at-rules.** `@import`, `@charset` and `@layer a, b;` came out
  as `* { @import: url(...) }` — the stylesheet imported nothing.
- **TSS shorthands.** Nine documented shorthands (`br-tl`, `br-tr`, `br-bl`,
  `br-br`, `fl`, `cl`, `dir`, `ww`, `va`) were never implemented, so
  `br-tl 4px` emitted the literal property `br-tl` and the corner stayed square.
- **TSS output shape.** A multi-line value printed across several lines; a
  property with no value swallowed the next declaration; empty blocks emitted
  empty rules.
- **Documentation.** `TW108` and `docs/client-modules.md` still described the
  old rules for `notFound()` and for importing `lib/` into a page.

### Notes

- `TW124` was already documented for a private-folder check, so the new
  collision diagnostic is `TW125`.
- Applying this needs `bun install`: `packages/client-safe` is a new workspace
  package.

## [2.0.4]

A patch release on top of 2.0.3. Bug fixes plus one deliberate behaviour change
(raw HTML in a `.tw` file is now an error, see below).

### Fixed

- **`tw dev` runs `server { }` blocks.** It called the compiler without
  `experimental.serverBlocks`, so `collectServerBlocks()` always came back empty
  and the block never executed: a page whose content came from `server { }`
  rendered with empty lists. The values are also merged the way the serve path
  does (`params` as a key, through `encodeServerValues`), which is what actually
  gets them into the markup.
- **`tw dev` sets `Content-Type` for `public/` files.** `new Response(Bun.file())`
  does not carry the file's type, so every `.svg`, `.css` and `.json` arrived
  without one and images showed as broken icons.
- **`state { }` in `layout.tw`.** Only the page's state was seeded into the vars
  the layout's markup is generated from, so a layout holding state for its own
  chrome rendered empty. Layouts are seeded first, so the page still wins a name
  clash.
- **`TW003` on valid inline tags.** `HTML_ELEMENTS` was missing `b`, `i`, `em`,
  `strong`, `small`, `u`, `s`, `ins`, `del`, `sub`, `sup`, `nobr`, `big`, `tt`
  and the SVG children (`circle`, `path`, `rect`, `g`, `defs`, `use`, …), which
  produced a warning per tag on markup that renders fine and buried the real
  findings.
- **`tw serve` answered 200 for an unknown dynamic param.** A route with a
  `params.twm` enumerates its slugs, and the static build only writes those — but
  the server matched `[slug]` for anything and rendered the fallback branch with
  200, so search engines indexed those as real pages. An unenumerated param is a
  404 now, through the normal not-found path.
- **`headers` config ignored an unknown key.** `{ path, headers }` — the natural
  guess, docs say `{ source, headers }` — was accepted silently and did nothing,
  so a CSP or X-Frame-Options set there never reached the response. The server
  names the unknown key at startup.
- **`tw adapter` notice counts SSR pages too.** It reported only `.twm` API
  routes; pages with `render ssr`, `stream`, `csr` or `ppr` cannot be served by a
  static adapter either and are counted now.

### Changed

- **Raw HTML in a `.tw` file is a build error (`TW123`).** It was never a
  supported form, but it parsed and then had its text rewritten by the class
  shorthand — `one two.` became `<two>`, `mid. sentence` became
  `<mid class="sentence">` — with no diagnostic. Write the element in TW syntax
  (`p { ... }`) instead. `<if>`, `<for>`, `<while>`, `<switch>` and components are
  unaffected.

### Docs

- `docs/syntax-interpolation.md` documents printing a literal brace (`\{` and
  `\}`), which already worked but was not written down.

## [2.0.3]

A patch release: bug fixes only, no breaking changes, no public API changes.

### Fixed

- **Runtime -- hydration no longer discards server-rendered values.** A value
  that comes from a page's `server { }` block is never serialised into
  `__tw_state`, so the client runtime saw it as missing: a `for` loop over such a
  value was emptied, an interpolation reading one was blanked, and an `if`
  testing one was hidden -- after the server had already rendered them correctly.
  An expression that evaluates to `undefined` is now treated as "not client
  state" and the server's markup is left alone. Real client state stays reactive.
- **`tw dev` -- `strategies.hydration.mode: "none"` is honoured.** The dev server
  injected the hydration runtime unconditionally, so there was no way to look at
  a page without hydration while building it.
- **CLI -- the `tw-framework` bin alias.** The package declared only a `tw` bin,
  so `bunx tw-framework dev` and a `"build": "tw-framework build"` script both
  failed with "not found" even though the README documents that form. Both names
  resolve to the same entry point now.

## [2.0.2]

A patch release: bug fixes only. No new features, no breaking changes, and no
public API changes -- 2.0.2 is a drop-in replacement for 2.0.1.

### Fixed

- **Runtime -- store getters over array state.** The documented cart pattern
  (`getters: { count: (state) => state.items.length }` with
  `add(item) { this.items.push(item) }`) returned a stale count: mutating an
  array in place keeps the same identity, so nothing downstream was notified.
  The state proxy now reports in-place mutation (`push`, `pop`, `splice`, `sort`,
  and so on) back to its reactive value, so a getter over it recomputes.
- **Runtime -- `VirtualList.getFirstVisibleIndex()`.** It was clamped to the item
  count rather than the last index, so a `scrollTop` past the content returned
  `100` for a 100-item list instead of `99`.
- **Compiler -- the live-list template.** A loop rendered on an interactive page
  carries its template in an attribute, which is decoded once when the page is
  parsed and parsed again by the runtime. Only the quotes were escaped, so an
  expression inside the template (`data-tw-if="it == &quot;b&quot;"`) lost its
  value at the first quote and evaluated to `it == `. The template now survives
  that first decode intact.
- **Compiler -- `TW098`.** The warning fired on a call to an imported helper,
  which the build does resolve and render correctly. Names from the page's own
  imports are now treated as evaluable, so only a genuinely unknown callee is
  flagged.
- **Runtime -- a conditional inside a live list.** The page-wide conditional
  pass re-evaluated `data-tw-if` / `data-tw-not` inside a live list with the loop
  variable out of scope, overwriting the per-item result and hiding the right
  branch for every item. Elements owned by a list are skipped now; the list
  itself still evaluates them with the variable bound.
- **Plugins -- `@tw/plugin-sitemap`.** An unconfigured `siteUrl` answered
  `/sitemap.xml` with `500`, which reads as a server fault. It answers `503`
  ("not configured") now; the message is unchanged.

- **Build — the server-only boundary.** Importing a server module into a page the
  documented way (`import { query } from "../../lib/db"`) was never rejected: the
  walker only recognised the `lib/`-prefixed and `.server.ts` forms, so a
  relative path into `lib/` was treated as an ordinary local module. Such an
  import now fails the build with `TW1007`, and a `.server` module is recognised
  with or without its extension. `lib/` is also copied into the output directory
  only after that check passes, so a rejected build no longer leaves the server
  source there.
- **Diagnostics — the SSRF lint (`TW117`).** It only matched a request-derived
  name written directly inside `fetch(...)`, so the ordinary shape
  (`const url = query.u; await fetch(url)`) passed silently. Assignments are now
  followed, so a request-derived value stays request-derived through them.

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
