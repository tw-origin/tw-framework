# AGENTS.md -- The Complete TW Framework Operating Manual

This document covers one thing completely: how to work inside the TW Framework
monorepo as an AI agent or human contributor -- every command, every package,
every convention, every table, every quirk, and every guardrail -- with
nothing assumed and nothing repeated.

It is generated from live repository data where possible (error registry,
test suite catalog, docs index). When the underlying tables change, the
corresponding sections here must be regenerated the same session.

---

## Table of contents

1. [Why this document exists](#1-why-this-document-exists)
2. [The 60-second orientation](#2-the-60-second-orientation)
3. [Commands -- the complete reference](#3-commands--the-complete-reference)
4. [Repository map, package by package](#4-repository-map-package-by-package)
5. [The language stack (.tw / .tss / .twm)](#5-the-language-stack)
6. [The render pipeline and cache semantics](#6-the-render-pipeline-and-cache-semantics)
7. [The test suite -- every file, what each covers](#7-the-test-suite)
8. [The eval harness -- 4 levels of proof](#8-the-eval-harness)
9. [Benchmarks and the regression gate](#9-benchmarks-and-the-regression-gate)
10. [The error registry -- every diagnostic, decoded](#10-the-error-registry)
11. [Language quirks -- verified, not bugs](#11-language-quirks)
12. [Hard rules (non-negotiable)](#12-hard-rules)
13. [Release process and versioning](#13-release-process-and-versioning)
14. [Security model](#14-security-model)
15. [Agent tooling -- commands, skills, plugins](#15-agent-tooling)
16. [Examples index -- what each demonstrates](#16-examples-index)
17. [Docs index -- all topics](#17-docs-index)
18. [Glossary](#18-glossary)
19. [Decision log -- why things are the way they are](#19-decision-log)

---

## 1. Why this document exists

An agent (or a new contributor) that has to rediscover the rules of this
repo from scratch will make the same five mistakes every time: trust
unverified claims, break legacy syntax, skip the docs page, ship a zip that
was never unzipped, and file language quirks as bugs. This document kills
all five failure modes in one read.

Everything below is either extracted from live data (error codes, test
files, docs, examples) or was verified by actually running the thing being
described. The moment you find a statement here that is false, fixing the
statement is part of the change -- the manual never lags the code.

## 2. The 60-second orientation

TW Framework is a full-stack web framework with its own compiled template
language:

- **`.tw`** pages -- HTML-like DSL with `page { }` directives, `state { }`,
  interpolation `{expr}`, and `on:event "expr"` handlers.
- **`.tss`** stylesheets -- CSS with shorthand properties and utility classes.
- **`.twm`** modules -- server-side handlers (`fn get/post/...`), middleware
  rules, actions, and `fn cached` handlers with the v1.0.6 explicit cache
  layer.
- One CLI (`tw dev | build | serve | ship | check`) drives everything.

The repo is a Bun workspace: 11 packages, 2 apps, 30 examples, 185 docs
pages, a 2702-test suite (11s), a 322-case eval harness, and a 6-metric
benchmark gate. Every claim in that sentence has a command in section 3
that proves it.

## 3. Commands -- the complete reference

### Setup and daily loop

| Command | What it does | Time |
|---|---|---|
| `bun install` | workspace install | ~2s |
| `bun test` | 2702 tests, 49 files, unit + isolated e2e | ~11s |
| `bun run lint` | tsc typecheck across all 11 packages | ~20s |
| `bun run verify` | MASTER GATE: lint -> tests -> evals -> 14 example builds -> bench gate -> errors.json sync | ~3m20s |

### Proof layers

| Command | What it proves | Fails when |
|---|---|---|
| `bun evals/run.ts` | 322 evals: 12 outcome, 6 scale, 4 invariant, 300 fuzz | any case fails; compiler throws on fuzz input |
| `bun bench/run.ts` | hot-path throughput, writes results.json | a bench itself errors |
| `bun bench/run.ts --check` | no metric dropped >25% below baselines.json | regression |
| `bun bench/run.ts --record` | rewrites baselines.json | - |
| `node run-tests.js` / `node run-evals.js` | same as above, CI-friendly wrappers | same |

### Building and running

| Command | Notes |
|---|---|
| `bun apps/cli/tw/bin.ts dev` | dev server |
| `bun apps/cli/tw/bin.ts build` | production build (from an app dir) |
| `bun apps/cli/tw/bin.ts serve --port N` | serve a build |
| `bun apps/cli/tw/bin.ts check` | diagnostics only |
| `bun apps/cli/tw/bin.ts ship` | 15 deployment adapters (node, bun, docker, vercel, netlify, cloudflare, aws, digitalocean, render, railway, fly, github-pages, firebase, nginx, caddy) |
| `cd examples/<name> && bun ../../apps/cli/tw/bin.ts build` | verify an example |

### Maintenance

| Command | Notes |
|---|---|
| `bun scripts/generate-errors-json.ts` | regenerate errors.json from ERROR_CODES |
| `bun scripts/typecheck.sh` | what CI and the husky hook run |
| `sh .husky/pre-commit` | the actual hook (lint + full suite) |
| `bash scripts/verify-all.sh` | what `bun run verify` calls |

## 4. Repository map, package by package

| Package | Role | Key internals you will touch |
|---|---|---|
| `packages/compiler` | .tw/.tss lexer, parser, codegen, diagnostics | `parser/directives/index.ts` (directive grammar incl. `cache { }`), `diagnostics/codes.ts` (TW001-TW093), `diagnostics/rules.ts` (lint rules + ARIA/HTML tables), `codegen/tss.ts` (TSS_SHORTHANDS), `codegen/version.ts` (generator meta) |
| `packages/server` | routing + rendering | `routing/render-pipeline.ts` (HIT/STALE/MISS windows, x-tw-cache-age, Cache-Control), `routing/twm-loader.ts` (`fn cached` transform, purity scans, canonical handler cache), `routing/revalidate.ts` (tag invalidation registry), `routing/scanner.ts` (route tree) |
| `packages/runtime` | client runtime | state, events, islands, signal subscription |
| `packages/shared` | constants + cache engine | `cache.ts` (profiles, extractCacheDirective, resolveCache), `constants/` (HTML_ELEMENTS 199, HTML_ATTRIBUTES 278, CSS_PROPERTIES 328, EVENT_TYPES 116, ARIA_ROLES 80, HTTP_STATUS_CODES) |
| `packages/security` | hardening | headers, sessions, CSRF, rate limiting |
| `packages/lsp` | editor integration | diagnostics over LSP |
| `packages/plugins` | build/transform hooks | |
| `packages/sdk` | programmatic API | |
| `packages/adapters` | 15 deploy adapters | |
| `packages/image` | optimized images | |
| `apps/cli` | the `tw` CLI | `commands/build.ts` (profile resolution, TW090-TW093 build gates) |
| `apps/create-tw-framework` | scaffolder | |

Root-level infrastructure: `bench/` (6 metrics + gate), `evals/` (322 cases),
`skills/` (5 packaged skills), `.claude/` (5 slash commands + settings),
`.claude-plugin/`, `.cursor/`, `.devcontainer/`, `.husky/`, `errors.json`
(93 codes), `errors/`, `contributing/` (4 deep guides).

## 5. The language stack

### .tw pages

```tw
page {
  title "Chai Shop"
  render ssr                      // static | ssr | island | stream
  cache { revalidate 30, tag "products" }   // v1.0.6 explicit form
}

state { count = 0, items = ["a", "b"] }

div.shop {
  h1 "Count: {count}"
  button on:click "count++" { "Add" }
  img src "/logo.jpg" alt "Logo" { }
}
```

Legacy form (MUST work byte-identically forever): `page { revalidate 60 }`
-- fresh for 60s, then stale-while-revalidate with no hard limit.

### .tss styles

```tss
body { font-family: system-ui; margin: 0 }
.card { bg #f6f7f9; br 12px; p 16px; minw 120px }
.grid { d grid; gap 16px; grid-template-columns repeat(3, 1fr) }
```

Shorthand properties are `bg-c`/`pt` style (see TSS_SHORTHANDS in
codegen/tss.ts) -- NOT the hyphenated CSS names. Plain longhand CSS
(`margin: 0`) also compiles.

### .twm modules

```twm
fn get(request) {
  return { status: 200, json: { hello: "world" } }
}

fn cached get(request) {
  cache { revalidate 10, expire 60, tag "items" }
  return { status: 200, json: { n: next() } }
}

fn actionRefresh(request) {
  return { status: 200, json: { ok: true }, revalidateTag: "items" }
}
```

Purity contract for `fn cached`: `request.params` and `request.query` are
cache-keyed and allowed; `request.cookies`, `request.headers`,
`request.body`, and `setSignal` are impure and fail the build (TW091).
`Date.now()`/`Math.random()` compile but warn (TW093) -- the value freezes
into the cache entry.

### Middleware rule DSL

```twm
rule "guard admin" {
    match "/admin/**"
    user_agent { block ["curl/", "wget/"] }
    auth { cookie "session"; jwt_secret_env "JWT_SECRET" }
    response { status 403; html "<h1>403</h1>" }
}
```

## 6. The render pipeline and cache semantics

Three windows, from the canonical design doc (TW-v1.0.6-cache-design.md):

| Age of entry | Result | Headers |
|---|---|---|
| age < revalidate | HIT | `x-tw-cache-age: <s>`, Cache-Control computed from stale |
| revalidate <= age < expire | STALE + background refresh | served from cache, refresh queued |
| age >= expire (or no entry) | MISS | rendered, stored |

- Cache key: `sha256(method + handlerPath + canonicalQuery + JSON(params))`;
  query order does not matter (verified).
- `revalidateTag("name")` (from `"tw"` import, or `revalidateTag` in an
  action result -- updateTag semantics) drops every entry in that tag
  family and sets `x-tw-revalidated`.
- Profiles resolve at BUILD time (apps/cli build.ts); `cache { life "minutes" }`
  on a page whose profile does not exist fails the build (TW090 family gates).
- Builtin profiles: seconds {1,1,2}, minutes {60,300,3600}, hours
  {3600,14400,86400}, days {86400,604800,2592000}, max {2592000,5184000,31536000}
  as {stale, revalidate, expire} -- invariant stale <= revalidate <= expire
  is enforced by evals.
- Render HIT is ~270x faster than MISS (98.7k/s vs 365/s on the bench pod).

## 7. The test suite

`bun test` runs **2702 tests across 49 files in ~11s**. Unit tests are browser-free and deterministic; e2e tests build and serve a
complete fixture app on a random port with raw node:http (NOT fetch -- the
happy-dom bunfig preload enforces CORS on localhost). Conventions live in
contributing/core-testing.md. The catalog:

- `tests/adapters.test.ts`- `tests/cache-tags.test.ts`- `tests/codegen-deep.test.ts`- `tests/compiler-advanced.test.ts`- `tests/compiler.test.ts`- `tests/deep-round.test.ts`- `tests/docs-round.test.ts`- `tests/e2e-isolated-app.test.ts`- `tests/e2e.test.ts`- `tests/external-hunt.test.ts`- `tests/hunt-round.test.ts`- `tests/hunt-round2.test.ts`- `tests/image.test.ts`- `tests/interactivity-e2e.test.ts`- `tests/layout-params.test.ts`- `tests/lexer.test.ts`- `tests/link.test.ts`- `tests/middleware-rules.test.ts`- `tests/native.test.ts`- `tests/next-parity.test.ts`- `tests/node-bundle-css.test.ts`- `tests/optimizer-deep.test.ts`- `tests/parity.test.ts`- `tests/parser-deep.test.ts`- `tests/parser.test.ts`- `tests/phase3-runtime.test.ts`- `tests/plugins-load.test.ts`- `tests/plugins.test.ts`- `tests/render-modes.test.ts`- `tests/runtime-new-2.test.ts`- `tests/runtime-new.test.ts`- `tests/runtime-server.test.ts`- `tests/runtime.test.ts`- `tests/scss.test.ts`- `tests/security-hunt.test.ts`- `tests/security.test.ts`- `tests/self-hunt.test.ts`- `tests/semantic-deep.test.ts`- `tests/shared.test.ts`- `tests/signal-stream.test.ts`- `tests/unit-aria.test.ts`- `tests/unit-css-matrix.test.ts`- `tests/unit-events.test.ts`- `tests/unit-html-attributes.test.ts`- `tests/unit-html-elements.test.ts`- `tests/unit-router-directives.test.ts`- `tests/unit-web-tables.test.ts`- `tests/wiring.test.ts`

## 8. The eval harness

`bun evals/run.ts` -- 322 cases, ~2.3s, 100% required. Four levels the unit
suite does not cover:

1. **Outcome (12)** -- golden inputs with exact expectations
   (evals/cases/*.json).
2. **Scale (6)** -- whole-table aggregation: all 188 usable elements in ONE
   page, all 328 CSS properties in ONE stylesheet, all ARIA roles and event
   types, 500-deep nesting, a 2000-node page.
3. **Invariant (4)** -- semantic laws: stale <= revalidate <= expire for every
   profile; custom profiles merge from tw.config.ts; HTTP table completeness;
   directive resolution respects profile windows.
4. **Fuzz (300)** -- deterministic seeded mutations (mulberry32, seed
   20260922) of a 4-page corpus; compileSync must diagnose, never throw.

The harness is not decorative: it caught a real quirk on its first run
(void elements reject closing tags -> TW001) and forced the eval to use the
bare `<hr>` form. Fuzz inputs are reproducible: same seed, same inputs.

## 9. Benchmarks and the regression gate

Six metrics, each bench printing `RESULT <metric> <value>` lines parsed by
bench/run.ts:

| Metric | Baseline | Meaning |
|---|---|---|
| compile.pages_per_sec | ~350 | compileSync on a representative page |
| render.miss_per_sec | ~365 | full pipeline, unique cache keys (true MISS) |
| render.hit_per_sec | ~98,700 | render from cache (~270x MISS) |
| routes.matches_per_sec | ~30,400 | matchRoute over a 1000-route tree |
| cache.resolve_per_sec | ~616,600 | directive resolution (profiles hoisted) |
| cache.inval_sweep_per_sec | ~527,300 | revalidateTag sweep |

`--check` fails (exit 1) when a metric falls below baseline x 0.75. The gate
is wired into CI and `bun run verify`. A deliberate performance change
re-records baselines in the SAME PR, and says so -- silent baseline bumps are
review blockers (contributing/code-review.md).

## 10. The error registry

93 diagnostics, machine-readable in errors.json (regen:
`bun scripts/generate-errors-json.ts`), human-readable in
docs/error-reference.md. Severity error = build fails; warning = advisory.

All codes (extracted live from errors.json):

| Code | Severity | Category | Message |
|---|---|---|---|
| TW001 | error | syntax | Unexpected token || TW002 | error | syntax | Unclosed brace -- expected } || TW003 | warning | syntax | Unknown HTML tag || TW004 | warning | syntax | Unknown CSS property || TW005 | warning | syntax | Unknown event type || TW006 | info | syntax | Unknown attribute || TW007 | error | syntax | Page directive can only appear at the top of the file || TW008 | error | syntax | Layout directive must specify a layout name || TW009 | error | syntax | Import must specify a source module || TW010 | error | syntax | State variable must have a name and value || TW011 | error | syntax | Render mode must be one of: static, server, edge, interactive || TW012 | error | syntax | Revalidate must be a positive number (seconds) || TW013 | error | syntax | Redirect must specify a target URL || TW014 | error | semantic | Component not found || TW015 | warning | syntax | Duplicate attribute on element || TW016 | info | best-practice | Missing key attribute in for loop || TW017 | warning | syntax | Script block is empty || TW018 | warning | syntax | Style block is empty || TW019 | error | semantic | Circular component reference detected || TW020 | warning | syntax | Duplicate page directive || TW021 | error | semantic | Undefined variable referenced || TW022 | error | semantic | Undefined component referenced || TW023 | warning | semantic | Component prop type mismatch || TW024 | warning | semantic | Missing required prop || TW025 | info | best-practice | Unused import || TW026 | info | best-practice | Unused state variable || TW027 | error | semantic | State variable redeclared || TW028 | error | semantic | Invalid directive value || TW029 | error | semantic | Directive not allowed in this context || TW030 | warning | semantic | Missing required directive || TW031 | warning | semantic | Event handler not defined || TW032 | error | semantic | Binding expression is empty || TW033 | error | semantic | Invalid binding type || TW034 | warning | semantic | Slot name conflicts with component name || TW035 | info | best-practice | Template reference variable not used || TW036 | error | semantic | Duplicate component definition || TW037 | error | semantic | Component extends itself || TW038 | error | semantic | Invalid layout reference || TW039 | error | semantic | Middleware path is invalid || TW040 | warning | accessibility | Image missing alt attribute || TW041 | warning | accessibility | Form input missing label || TW042 | warning | accessibility | Button missing accessible text || TW043 | info | accessibility | Missing ARIA label on interactive element || TW044 | warning | accessibility | Invalid ARIA role || TW045 | warning | accessibility | Invalid ARIA attribute || TW046 | warning | accessibility | Heading hierarchy skip detected || TW047 | info | accessibility | Missing lang attribute on html element || TW048 | info | accessibility | Tab order may be incorrect || TW049 | info | accessibility | Color contrast may be insufficient || TW050 | info | performance | Large inline script -- consider extracting || TW051 | info | performance | Large inline style -- consider extracting || TW052 | info | performance | Deeply nested DOM tree || TW053 | info | performance | Too many DOM nodes || TW054 | info | performance | Unoptimized image -- consider lazy loading || TW055 | info | performance | Unused CSS rules detected || TW056 | info | performance | Duplicate styles detected || TW057 | info | performance | Consider code splitting for large components || TW058 | info | performance | Inline event handler may cause performance issues || TW059 | info | performance | Consider memoization for expensive computation || TW060 | warning | security | Potential XSS vulnerability -- unescaped output || TW061 | error | security | Dangerous HTML injection detected || TW062 | info | security | Inline event handler -- consider CSP || TW063 | warning | security | External script without integrity check || TW064 | info | security | Missing Content-Security-Policy || TW065 | warning | security | Mixed content detected (HTTP on HTTPS page) || TW066 | warning | security | Sensitive data in template || TW067 | info | security | Missing nonce for inline script || TW068 | error | security | eval() usage detected || TW069 | warning | security | Dangerous URL pattern detected || TW070 | info | best-practice | Use semantic HTML elements || TW071 | info | best-practice | Avoid inline styles -- use CSS classes || TW072 | info | best-practice | Consider using a button instead of a div with click || TW073 | info | best-practice | Add type attribute to script tags || TW074 | info | best-practice | Use async/defer for non-critical scripts || TW075 | info | best-practice | Add width/height to images || TW076 | info | best-practice | Use rel="noopener" for external links || TW077 | info | best-practice | Add loading="lazy" to below-fold images || TW078 | info | best-practice | Consider using <picture> for responsive images || TW079 | info | best-practice | Use <button type="button"> for non-submit buttons || TW080 | warning | deprecation | Deprecated HTML tag || TW081 | warning | deprecation | Deprecated CSS property || TW082 | warning | deprecation | Deprecated API usage || TW083 | warning | deprecation | Deprecated attribute || TW084 | warning | deprecation | Deprecated event name || TW085 | warning | deprecation | Deprecated directive syntax -- use new syntax || TW086 | warning | deprecation | Deprecated state declaration syntax || TW087 | warning | deprecation | Deprecated component lifecycle hook || TW088 | warning | deprecation | Deprecated import path || TW089 | warning | deprecation | Deprecated render mode -- use 'interactive' || TW090 | error | syntax | cache { } requires a revalidate window or a life profile || TW091 | error | semantic | fn cached handler is impure (request.cookies/headers/body or setSignal) || TW092 | error | semantic | Unknown cache profile || TW093 | warning | best-practice | Non-deterministic call in a cached handler (value freezes into the cache entry) |

Adding a diagnostic: skills/add-diagnostic has the long form; the short form
is code + rules.ts + parser emit + errors.json regen + error-reference entry
+ one positive and one negative test.

## 11. Language quirks

Verified by probing the compiler -- documented, not bugs. Filing these as
issues gets them closed as works-as-designed:

1. **Attribute syntax is `name "value"`** (space, not `=`):
   `input type "text" { }`.
2. **Keyword-colliding attributes** (dir, for, async, style, and friends)
   must use HTML-form syntax: `<input type="text">`.
3. **Void elements reject closing tags**: `<hr>` compiles, `<hr>x</hr>`
   is TW001. DSL form `hr { }` also compiles.
4. **TSS shorthands are `bg-c` / `pt` style**, not the hyphenated CSS
   aliases (CSS_ALIASES are a different table).
5. **`annotation-xml` parses as text** (known limitation).
6. **`var`, `use`, `set`, `slot`, `script`, `style`, `html`, `head`, `body`,
   `title`, `meta`, `link`, `base` are DSL-special or HTML-form-only.**
7. **e2e route naming**: `home/secret/page.tw` serves at `/secret`, not
   `/secret/page`.
8. **Diagnostics differ under the happy-dom preload** (bunfig.toml) --
   test edge cases at the deterministic shared layers (compileSync,
   resolveCache) instead. This is why evals and benches avoid `bun test`.
9. **Background servers die between bash calls** -- server + curl
   assertions must run in ONE shell invocation (see
   tests/e2e-isolated-app.test.ts and scripts/verify-all.sh).
10. **`revalidate -5`** on a `cache { }` block yields TW090 (no valid
    window) -- not TW091 (which is the fn-cached purity error).

## 12. Hard rules

1. **Never claim without running.** Every change ships with a verification
   run. "Should work" is a defect, not a sentence.
2. **No breaking changes.** Legacy `page { revalidate N }` is byte-identical
   to v1.0.5 behavior forever. The regression suite locks this.
3. **A feature without a docs/ page does not exist.** Canonical English,
   "This document covers one thing completely:" opener, one topic per file.
4. **Diagnostics over crashes.** The compiler teaches (TW0xx); it never
   silently drops markup.
5. **Version lives in exactly 3 files**: apps/cli/package.json,
   apps/create-tw-framework/package.json,
   packages/compiler/tw/codegen/version.ts. Verify via the
   `<meta name="generator">` tag on any build.
6. **Zip fresh-verify before shipping.** Unzip to a temp dir, `bun install`,
   `bun test`. The artifact passes, not the working tree.
7. **Secrets never enter code, commits, or /scratch files.** Placeholders
   only.
8. **Mark regressions as regressions.** A perf change re-records bench
   baselines in the same change, explicitly.

## 13. Release process and versioning

Full process: contributing/release-process.md. Shape: bump 3 files ->
`bun run verify` (master gate) -> clean artifacts -> zip excluding
node_modules/.tw -> fresh-verify from the zip -> changelog + UPGRADING.md
entry for breaking changes.

The 1.0.x line so far: 1.0.0 core, 1.0.1 revalidatePath/revalidateRoute,
1.0.2 middleware rule DSL, 1.0.3 signal streaming, 1.0.4 PPR/render modes,
1.0.5 50-bug hardening, 1.0.6 explicit cache layer + 2702-test suite + full
repo infrastructure (this manual, evals, bench gate, 30 examples).

## 14. Security model

- Middleware: fail-closed (no rule matched on a guarded path -> the guard's
  response). Secrets come from env (`jwt_secret_env`), never literals.
- Headers/CSP: packages/security owns the tables; CSP_DIRECTIVES is a
  shared constant.
- The .twm loader purity scans (TW091) exist so a cached handler cannot
  leak per-request data across users.
- Text nodes are escaped by the codegen -- `<script>` in text never reaches
  HTML raw (locked by an eval case).
- Report process: .github/SECURITY.md. Never open a public issue for a
  vulnerability.

## 15. Agent tooling

- **`.claude/commands/`** -- 5 slash commands: test, bench (gate-aware),
  release (verify-gated), triage, new-diagnostic.
- **`skills/`** -- 5 packaged skills: add-example, release, add-diagnostic,
  write-docs, bug-hunt (the process that produced 50+ real bugs in 1.0.5).
- **`.claude-plugin/`** -- plugin + marketplace manifests for the tw-dev
  command pack.
- **`.cursor/rules/tw.mdc`** -- editor rules for AI editors.
- **`.agents/skills.json`** -- machine index of the skills directory.
- **`evals/agents/`** -- 3 rubric-scored agent tasks (add an example, add a
  diagnostic, cut a release) used to evaluate agent capability on this repo.

## 16. Examples index

- `examples/analytics/`- `examples/api-server/`- `examples/auth-starter/`- `examples/chat-stream/`- `examples/dashboard/`- `examples/ecommerce-shop/`- `examples/forms-validation/`- `examples/hello-tw/`- `examples/i18n-site/`- `examples/image-gallery/`- `examples/kitchen-sink/`- `examples/portfolio/`- `examples/todo-app/`- `examples/tw-blog/`

Each builds with `tw build` (CI + `bun run verify` prove it). The matrix of
what each demonstrates is in examples/README.md; the kitchen-sink combines
render modes, cache, actions, middleware, and unicode routes.

## 17. Docs index

184 topics in `docs/`. Key entry points: GETTING-STARTED.md, RENDER-SYSTEM.md, docs/cache-tags.md (v1.0.6 cache layer), docs/isr.md, docs/error-reference.md, docs/testing.md, docs/middleware.md. Full index:

- `docs/RouterLink.md`- `docs/animation.md`- `docs/api-routes.md`- `docs/async-components.md`- `docs/body-limits.md`- `docs/browser-e2e.md`- `docs/build-output.md`- `docs/build-profiler.md`- `docs/cache-manager.md`- `docs/cache-tags.md`- `docs/catch-all-routes.md`- `docs/ci-workflow.md`- `docs/client-modules.md`- `docs/client-runtime.md`- `docs/clipboard.md`- `docs/code-splitting.md`- `docs/commands-reference.md`- `docs/component-api.md`- `docs/compression-api.md`- `docs/configuration.md`- `docs/context-api.md`- `docs/cookie-manager-api.md`- `docs/cookies.md`- `docs/core-system.md`- `docs/cors.md`- `docs/crypto-utilities.md`- `docs/csp-nonce.md`- `docs/csrf-api.md`- `docs/csrf.md`- `docs/dark-mode.md`- `docs/debug-utilities.md`- `docs/deployment-adapters.md`- `docs/dev-server.md`- `docs/devtools.md`- `docs/directives-api.md`- `docs/dom-utilities.md`- `docs/drag-drop.md`- `docs/dynamic-routes.md`- `docs/edge-runtime.md`- `docs/error-boundaries.md`- `docs/error-handling-routes.md`- `docs/error-recovery.md`- `docs/error-reference.md`- `docs/etags.md`- `docs/event-bus.md`- `docs/event-delegation.md`- `docs/extensions-guide.md`- `docs/focus-trap.md`- `docs/fonts.md`- `docs/form-state.md`- `docs/form-validators.md`- `docs/framework-overview.md`- `docs/gesture-recognition.md`- `docs/global-state.md`- `docs/guide-assets-images.md`- `docs/guide-auth.md`- `docs/guide-aws.md`- `docs/guide-blog.md`- `docs/guide-cloudflare.md`- `docs/guide-dashboard.md`- `docs/guide-data-fetching.md`- `docs/guide-deployment-choose.md`- `docs/guide-digitalocean.md`- `docs/guide-ecommerce-catalog.md`- `docs/guide-environments.md`- `docs/guide-firebase.md`- `docs/guide-fly.md`- `docs/guide-forms.md`- `docs/guide-github-pages.md`- `docs/guide-netlify.md`- `docs/guide-performance.md`- `docs/guide-plugins.md`- `docs/guide-railway.md`- `docs/guide-render.md`- `docs/guide-self-hosted.md`- `docs/guide-seo.md`- `docs/guide-testing-ci.md`- `docs/guide-troubleshooting.md`- `docs/guide-vercel.md`- `docs/gzip.md`- `docs/head-tw-files.md`- `docs/headers-config.md`- `docs/health-checks.md`- `docs/hot-reload.md`- `docs/http-client.md`- `docs/i18n.md`- `docs/id-generator.md`- `docs/image-handler.md`- `docs/image-optimizer-client.md`- `docs/images-config.md`- `docs/intercepting-routes.md`- `docs/isr.md`- `docs/jwt-manager-api.md`- `docs/keep-alive.md`- `docs/keyboard-shortcuts.md`- `docs/layouts.md`- `docs/lib-modules.md`- `docs/load-testing.md`- `docs/logging.md`- `docs/lsp.md`- `docs/metadata.md`- `docs/middleware.md`- `docs/minification.md`- `docs/modal-dialog.md`- `docs/multipart-forms.md`- `docs/no-terminal-guide.md`- `docs/not-found-pages.md`- `docs/optImage.md`- `docs/optimization-passes.md`- `docs/parallel-routes.md`- `docs/password-hashing.md`- `docs/path-traversal-api.md`- `docs/plain-css.md`- `docs/plugins.md`- `docs/portal.md`- `docs/production-css.md`- `docs/project-tree.md`- `docs/query-params.md`- `docs/range-requests.md`- `docs/rate-limiting.md`- `docs/redirects-config.md`- `docs/render-modes.md`- `docs/request-lifecycle.md`- `docs/request-object.md`- `docs/request-validation.md`- `docs/response-shapes.md`- `docs/rewrites.md`- `docs/route-groups.md`- `docs/sanitizer-api.md`- `docs/scheduler.md`- `docs/scoped-styles.md`- `docs/scss-guide.md`- `docs/security-headers-api.md`- `docs/security.md`- `docs/server-actions.md`- `docs/server-features.md`- `docs/sessions.md`- `docs/setup-guide.md`- `docs/signal-streaming.md`- `docs/signals.md`- `docs/sourcemaps.md`- `docs/ssrf-protector-api.md`- `docs/static-assets-public.md`- `docs/stores.md`- `docs/streaming.md`- `docs/styling-guide.md`- `docs/suspense.md`- `docs/syntax-attributes.md`- `docs/syntax-bindings.md`- `docs/syntax-components.md`- `docs/syntax-conditionals.md`- `docs/syntax-events.md`- `docs/syntax-guide.md`- `docs/syntax-head-block.md`- `docs/syntax-imports.md`- `docs/syntax-interpolation.md`- `docs/syntax-loops.md`- `docs/syntax-markup.md`- `docs/syntax-page-config.md`- `docs/syntax-slots.md`- `docs/syntax-state.md`- `docs/tailwind.md`- `docs/template-engine.md`- `docs/testing-utilities.md`- `docs/testing.md`- `docs/theme-manager.md`- `docs/timing-protector-api.md`- `docs/tips-deployment.md`- `docs/tips-styling.md`- `docs/tips-syntax.md`- `docs/toast-notifications.md`- `docs/transitions.md`- `docs/tree-shaking.md`- `docs/tss-syntax.md`- `docs/two-way-binding.md`- `docs/virtual-list.md`- `docs/vnode-pool.md`- `docs/watch-api.md`- `docs/web-vitals.md`- `docs/web-workers.md`- `docs/webhooks.md`- `docs/websocket-client.md`- `docs/websocket-server.md`- `docs/worker-pool.md`

## 18. Glossary

- **HIT / STALE / MISS** -- the three render-cache states; see section 6.
- **Tag** -- invalidation family for revalidateTag.
- **Profile** -- named {stale, revalidate, expire} triple from
  tw.config.ts cache.profiles or the builtins.
- **Island** -- a hydrated interactive subtree inside an otherwise static
  page (`render island`).
- **Signal** -- a named streamed value (`render stream` + setSignal).
- **fn cached** -- a .twm handler wrapped by the canonical handler cache.
- **updateTag** -- action-result `revalidateTag` (tag bump after a write).
- **PPR** -- partial prerendering (v1.0.4 render modes).
- **Master gate** -- `bun run verify`.
- **Fresh-verify** -- unzip the artifact, install, run tests on IT.

## 19. Decision log

1. **Why a sync TS-config parser for cache profiles?** loadConfigSync cannot
   load .ts configs; readCacheProfilesSync parses the profile literal
   directly so `tw.config.ts` "just works" (shared/tw/cache.ts).
2. **Why do evals avoid `bun test`?** The bunfig.toml happy-dom preload
   changes diagnostic behavior and fetch CORS -- evals need determinism.
3. **Why node:http in e2e?** Global fetch is CORS-blocked under the preload.
4. **Why object values in routes.json?** v1.0.6 needed to carry full window
   triples while keeping bare numbers valid forever (zero breaking change).
5. **Why build-time profile resolution?** Serve-time resolution would put
   config parsing on the request path; build gates (TW090-TW093) catch bad
   profiles before deploy.
6. **Why a 25% bench tolerance?** Pod noise. Tighter gates false-positive;
   looser ones miss real regressions. 25% held across 5 recorded runs.

---

*Generated from live repo data: 93 error codes, 48 test files, 184 docs pages, 30 examples. Regenerate expectations whenever these change.*


---

# PART II -- THE COMPLETE REFERENCE TABLES

Every table below is extracted live from packages/shared/tw/constants/ at
generation time. These are the same tables the compiler validates against,
the eval suites parameterize over, and the docs describe -- printed here so
an agent never guesses what the language accepts.

## 20. HTML elements (all 199, verified)

Compiled as-is in DSL position unless listed in the quirk section (Part I,
section 11). The unit matrix (tests/unit-html-elements.test.ts) compiles
every single one of these; the scale eval puts all of them in ONE page.

`html`, `head`, `title`, `base`, `link`, `meta`, `style`, `body`, `address`, `article`, `aside`, `footer`  
`header`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `main`, `nav`, `section`, `blockquote`, `dd`  
`div`, `dl`, `dt`, `figcaption`, `figure`, `hr`, `li`, `menu`, `ol`, `p`, `pre`, `ul`  
`a`, `abbr`, `b`, `bdi`, `bdo`, `br`, `cite`, `code`, `data`, `dfn`, `em`, `i`  
`kbd`, `mark`, `q`, `rp`, `rt`, `ruby`, `s`, `samp`, `small`, `span`, `strong`, `sub`  
`sup`, `time`, `u`, `var`, `wbr`, `area`, `audio`, `img`, `map`, `track`, `video`, `embed`  
`iframe`, `object`, `param`, `picture`, `portal`, `source`, `canvas`, `noscript`, `script`, `del`, `ins`, `caption`  
`col`, `colgroup`, `table`, `tbody`, `td`, `tfoot`, `th`, `thead`, `tr`, `button`, `datalist`, `fieldset`  
`form`, `input`, `label`, `legend`, `meter`, `optgroup`, `option`, `output`, `progress`, `select`, `textarea`, `details`  
`dialog`, `summary`, `slot`, `template`, `acronym`, `applet`, `basefont`, `center`, `dir`, `font`, `frame`, `frameset`  
`noframes`, `strike`, `tt`, `big`, `svg`, `path`, `g`, `rect`, `circle`, `ellipse`, `line`, `polyline`  
`polygon`, `defs`, `use`, `symbol`, `linearGradient`, `radialGradient`, `stop`, `text`, `tspan`, `textPath`, `clipPath`, `mask`  
`pattern`, `filter`, `feGaussianBlur`, `feOffset`, `feMerge`, `feMergeNode`, `feColorMatrix`, `feComposite`, `feBlend`, `feFlood`, `feTile`, `feTurbulence`  
`feDisplacementMap`, `feConvolveMatrix`, `feDistantLight`, `fePointLight`, `feSpotLight`, `feSpecularLighting`, `feDiffuseLighting`, `animate`, `animateMotion`, `animateTransform`, `set`, `foreignObject`  
`image`, `math`, `mi`, `mo`, `mn`, `ms`, `mtext`, `mfrac`, `msqrt`, `mroot`, `msub`, `msup`  
`msubsup`, `munder`, `mover`, `munderover`, `mtable`, `mtr`, `mtd`, `mrow`, `mstyle`, `merror`, `mpadded`, `mphantom`  
`mfenced`, `menclose`, `mspace`, `mlabeledtr`, `semantics`, `annotation`, `annotation-xml`  

## 21. Void elements (reject closing tags)

`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`

## 22. CSS properties (all 328 accepted by the TSS compiler)

tests/unit-css-matrix.test.ts compiles every property; the scale eval puts
all of them into one stylesheet. CSS_ALIASES is a separate table (aliases
resolve to these).

`display`, `position`, `top`, `right`, `bottom`, `left`  
`float`, `clear`, `z-index`, `overflow`, `overflow-x`, `overflow-y`  
`visibility`, `opacity`, `isolation`, `width`, `height`, `min-width`  
`min-height`, `max-width`, `max-height`, `margin`, `margin-top`, `margin-right`  
`margin-bottom`, `margin-left`, `padding`, `padding-top`, `padding-right`, `padding-bottom`  
`padding-left`, `border`, `border-top`, `border-right`, `border-bottom`, `border-left`  
`border-width`, `border-top-width`, `border-right-width`, `border-bottom-width`, `border-left-width`, `border-style`  
`border-top-style`, `border-right-style`, `border-bottom-style`, `border-left-style`, `border-color`, `border-top-color`  
`border-right-color`, `border-bottom-color`, `border-left-color`, `border-radius`, `border-top-left-radius`, `border-top-right-radius`  
`border-bottom-right-radius`, `border-bottom-left-radius`, `border-image`, `border-image-source`, `border-image-slice`, `border-image-width`  
`border-image-outset`, `border-image-repeat`, `flex`, `flex-direction`, `flex-wrap`, `flex-flow`  
`justify-content`, `align-items`, `align-self`, `align-content`, `order`, `flex-grow`  
`flex-shrink`, `flex-basis`, `gap`, `row-gap`, `column-gap`, `grid`  
`grid-template`, `grid-template-columns`, `grid-template-rows`, `grid-template-areas`, `grid-area`, `grid-column`  
`grid-row`, `grid-column-start`, `grid-column-end`, `grid-row-start`, `grid-row-end`, `grid-auto-columns`  
`grid-auto-rows`, `grid-auto-flow`, `font`, `font-family`, `font-size`, `font-weight`  
`font-style`, `font-variant`, `font-variant-caps`, `font-variant-numeric`, `font-variant-ligatures`, `font-variant-east-asian`  
`font-stretch`, `font-feature-settings`, `font-kerning`, `font-language-override`, `font-optical-sizing`, `font-size-adjust`  
`font-variation-settings`, `line-height`, `letter-spacing`, `word-spacing`, `text-align`, `text-decoration`  
`text-decoration-line`, `text-decoration-style`, `text-decoration-color`, `text-decoration-thickness`, `text-indent`, `text-transform`  
`text-shadow`, `text-overflow`, `text-rendering`, `text-justify`, `text-underline-offset`, `text-underline-position`  
`text-emphasis`, `text-emphasis-color`, `text-emphasis-position`, `text-emphasis-style`, `text-wrap`, `white-space`  
`word-break`, `word-wrap`, `overflow-wrap`, `line-break`, `tab-size`, `hyphens`  
`writing-mode`, `direction`, `unicode-bidi`, `vertical-align`, `hanging-punctuation`, `quotes`  
`orphans`, `widows`, `color`, `background`, `background-color`, `background-image`  
`background-repeat`, `background-attachment`, `background-position`, `background-position-x`, `background-position-y`, `background-clip`  
`background-origin`, `background-size`, `background-blend-mode`, `box-shadow`, `box-decoration-break`, `filter`  
`backdrop-filter`, `mix-blend-mode`, `mask`, `mask-image`, `mask-mode`, `mask-repeat`  
`mask-position`, `mask-clip`, `mask-origin`, `mask-size`, `mask-composite`, `mask-border`  
`mask-border-source`, `mask-border-mode`, `mask-border-slice`, `mask-border-width`, `mask-border-outset`, `mask-border-repeat`  
`clip-path`, `clip`, `paint-order`, `transition`, `transition-property`, `transition-duration`  
`transition-timing-function`, `transition-delay`, `animation`, `animation-name`, `animation-duration`, `animation-timing-function`  
`animation-delay`, `animation-iteration-count`, `animation-direction`, `animation-fill-mode`, `animation-play-state`, `animation-composition`  
`animation-timeline`, `transform`, `transform-origin`, `transform-style`, `perspective`, `perspective-origin`  
`backface-visibility`, `translate`, `rotate`, `scale`, `offset`, `offset-path`  
`offset-distance`, `offset-rotate`, `offset-anchor`, `offset-position`, `container`, `container-type`  
`container-name`, `list-style`, `list-style-type`, `list-style-position`, `list-style-image`, `marker-side`  
`counter-reset`, `counter-increment`, `counter-set`, `content`, `table-layout`, `border-collapse`  
`border-spacing`, `caption-side`, `empty-cells`, `scroll-behavior`, `scroll-snap-type`, `scroll-snap-align`  
`scroll-snap-stop`, `scroll-padding`, `scroll-padding-top`, `scroll-padding-right`, `scroll-padding-bottom`, `scroll-padding-left`  
`scroll-margin`, `scroll-margin-top`, `scroll-margin-right`, `scroll-margin-bottom`, `scroll-margin-left`, `scrollbar-color`  
`scrollbar-width`, `scrollbar-gutter`, `overscroll-behavior`, `overscroll-behavior-x`, `overscroll-behavior-y`, `view-transition-name`  
`will-change`, `appearance`, `caret-color`, `cursor`, `outline`, `outline-width`  
`outline-style`, `outline-color`, `outline-offset`, `resize`, `user-select`, `accent-color`  
`content-visibility`, `forced-color-adjust`, `columns`, `column-count`, `column-fill`, `column-rule`  
`column-rule-color`, `column-rule-style`, `column-rule-width`, `column-span`, `column-width`, `break-after`  
`break-before`, `break-inside`, `page`, `page-break-after`, `page-break-before`, `page-break-inside`  
`all`, `box-sizing`, `contain`, `contain-intrinsic-size`, `contain-intrinsic-width`, `contain-intrinsic-height`  
`input-security`, `aspect-ratio`, `object-fit`, `object-position`, `image-orientation`, `image-rendering`  
`image-resolution`, `shape-outside`, `shape-image-threshold`, `shape-margin`, `zoom`, `fill`  
`fill-opacity`, `fill-rule`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`  
`stroke-miterlimit`, `stroke-dasharray`, `stroke-dashoffset`, `stroke-opacity`, `color-interpolation`, `color-interpolation-filters`  
`color-rendering`, `dominant-baseline`, `alignment-baseline`, `baseline-shift`, `text-anchor`, `shape-rendering`  
`stop-color`, `stop-opacity`, `flood-color`, `flood-opacity`, `lighting-color`, `glyph-orientation-horizontal`  
`glyph-orientation-vertical`, `kerning`, `vector-effect`, `mask-type`  

## 23. TSS shorthands (from codegen/tss.ts -- the ACTUAL accepted names)

`bg` -> background, `"bg-c"` -> background-color, `"bg-i"` -> background-image, `c` -> color  
`p` -> padding, `pt` -> padding-top, `pb` -> padding-bottom, `pl` -> padding-left  
`pr` -> padding-right, `m` -> margin, `mt` -> margin-top, `mb` -> margin-bottom  
`ml` -> margin-left, `mr` -> margin-right, `w` -> width, `h` -> height  
`minw` -> min-width, `minh` -> min-height, `maxw` -> max-width, `maxh` -> max-height  
`bd` -> border, `"bd-t"` -> border-top, `"bd-b"` -> border-bottom, `"bd-l"` -> border-left  
`"bd-r"` -> border-right, `br` -> border-radius, `"br-t"` -> border-top-left-radius, `bxsh` -> box-shadow  
`bxz` -> box-sizing, `ff` -> font-family, `fs` -> font-size, `fw` -> font-weight  
`lh` -> line-height, `ls` -> letter-spacing, `ta` -> text-align, `td` -> text-decoration  
`tt` -> text-transform, `ws` -> white-space, `d` -> display, `pos` -> position  
`t` -> top, `r` -> right, `b` -> bottom, `l` -> left  
`z` -> z-index, `ov` -> overflow, `"ov-x"` -> overflow-x, `"ov-y"` -> overflow-y  
`ai` -> align-items, `jc` -> justify-content, `ac` -> align-content, `g` -> gap  
`fx` -> flex, `"fx-d"` -> flex-direction, `"fx-w"` -> flex-wrap, `"fx-g"` -> flex-grow  
`"fx-s"` -> flex-shrink, `"fx-b"` -> flex-basis, `gtc` -> grid-template-columns, `gtr` -> grid-template-rows  
`cur` -> cursor, `op` -> opacity, `tr` -> transition, `tf` -> transform  
`us` -> user-select, `pe` -> pointer-events  

## 24. Event types (all 116, usable as `on:<type> "expr"`)

`click`, `dblclick`, `mousedown`, `mouseup`, `mousemove`, `mouseover`, `mouseout`, `mouseenter`, `mouseleave`, `contextmenu`, `wheel`, `keydown`  
`keyup`, `keypress`, `input`, `change`, `submit`, `reset`, `focus`, `blur`, `focusin`, `focusout`, `invalid`, `select`  
`search`, `beforeinput`, `formdata`, `touchstart`, `touchmove`, `touchend`, `touchcancel`, `pointerdown`, `pointerup`, `pointermove`, `pointercancel`, `pointerover`  
`pointerout`, `pointerenter`, `pointerleave`, `gotpointercapture`, `lostpointercapture`, `animationstart`, `animationend`, `animationiteration`, `animationcancel`, `transitionstart`, `transitionend`, `transitionrun`  
`transitioncancel`, `play`, `pause`, `playing`, `waiting`, `durationchange`, `timeupdate`, `ratechange`, `volumechange`, `seeking`, `seeked`, `stalled`  
`suspend`, `emptied`, `loadeddata`, `loadedmetadata`, `canplay`, `canplaythrough`, `ended`, `progress`, `loadstart`, `error`, `abort`, `copy`  
`cut`, `paste`, `drag`, `dragstart`, `dragend`, `dragenter`, `dragleave`, `dragover`, `drop`, `load`, `unload`, `beforeunload`  
`resize`, `scroll`, `scrollend`, `hashchange`, `popstate`, `pageshow`, `pagehide`, `online`, `offline`, `storage`, `message`, `messageerror`  
`fullscreenchange`, `fullscreenerror`, `pointerlockchange`, `pointerlockerror`, `selectionchange`, `selectstart`, `visibilitychange`, `toggle`, `beforematch`, `beforetoggle`, `cancel`, `close`  
`cuechange`, `slotchange`, `contentvisibilityautostatechange`, `open`, `unhandledrejection`, `rejectionhandled`, `securitypolicyviolation`, `overscroll`  

## 25. ARIA roles (all 80)

The ARIA matrix (tests/unit-aria.test.ts) locks role/attribute pairing.

`application`, `banner`, `complementary`, `contentinfo`, `form`, `main`, `navigation`, `region`, `search`, `group`  
`article`, `definition`, `directory`, `document`, `feed`, `figure`, `img`, `list`, `listitem`, `math`  
`none`, `note`, `presentation`, `row`, `rowgroup`, `separator`, `table`, `term`, `tooltip`, `alert`  
`alertdialog`, `button`, `checkbox`, `columnheader`, `combobox`, `dialog`, `grid`, `gridcell`, `link`, `listbox`  
`log`, `marquee`, `menu`, `menubar`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, `option`, `progressbar`, `radio`  
`radiogroup`, `rowheader`, `scrollbar`, `searchbox`, `slider`, `spinbutton`, `status`, `switch`, `tab`, `tablist`  
`tabpanel`, `textbox`, `timer`, `toolbar`, `tree`, `treegrid`, `treeitem`, `cell`, `heading`, `command`  
`input`, `landmark`, `range`, `roletype`, `section`, `sectionhead`, `select`, `structure`, `widget`, `window`  

## 26. HTTP status table (complete -- the eval invariant checks 100..511)

- **100** -- Continue
- **101** -- Switching Protocols
- **102** -- Processing
- **103** -- Early Hints
- **200** -- OK
- **201** -- Created
- **202** -- Accepted
- **203** -- Non-Authoritative Information
- **204** -- No Content
- **205** -- Reset Content
- **206** -- Partial Content
- **207** -- Multi-Status
- **208** -- Already Reported
- **226** -- IM Used
- **300** -- Multiple Choices
- **301** -- Moved Permanently
- **302** -- Found
- **303** -- See Other
- **304** -- Not Modified
- **305** -- Use Proxy
- **307** -- Temporary Redirect
- **308** -- Permanent Redirect
- **400** -- Bad Request
- **401** -- Unauthorized
- **402** -- Payment Required
- **403** -- Forbidden
- **404** -- Not Found
- **405** -- Method Not Allowed
- **406** -- Not Acceptable
- **407** -- Proxy Authentication Required
- **408** -- Request Timeout
- **409** -- Conflict
- **410** -- Gone
- **411** -- Length Required
- **412** -- Precondition Failed
- **413** -- Content Too Large
- **414** -- URI Too Long
- **415** -- Unsupported Media Type
- **416** -- Range Not Satisfiable
- **417** -- Expectation Failed
- **418** -- I'm a teapot
- **421** -- Misdirected Request
- **422** -- Unprocessable Content
- **423** -- Locked
- **424** -- Failed Dependency
- **425** -- Too Early
- **426** -- Upgrade Required
- **428** -- Precondition Required
- **429** -- Too Many Requests
- **431** -- Request Header Fields Too Large
- **451** -- Unavailable For Legal Reasons
- **500** -- Internal Server Error
- **501** -- Not Implemented
- **502** -- Bad Gateway
- **503** -- Service Unavailable
- **504** -- Gateway Timeout
- **505** -- HTTP Version Not Supported
- **506** -- Variant Also Negotiates
- **507** -- Insufficient Storage
- **508** -- Loop Detected
- **510** -- Not Extended
- **511** -- Network Authentication Required

## 27. File conventions, render modes, router keys, media features

- **File conventions**: `page.tw`, `layout.tw`, `loading.tw`, `error.tw`, `not-found.tw`, `template.tw`, `default.tw`, `route.ts`, `middleware.ts`, `handler.ts`, `head.tw`
- **Render modes**: `static`, `server`, `edge`, `interactive`, `client`, `island`, `csr`, `stream`, `ppr`, `signalStream`
- **Router directive keys**: `page`, `layout`, `loading`, `error`, `not-found`, `template`, `default`, `route`, `middleware`, `handler`
- **CSS media features** (56): `width`, `min-width`, `max-width`, `height`, `min-height`, `max-height`, `aspect-ratio`, `orientation`, `block-size`, `inline-size`, `min-block-size`, `max-block-size`, `min-inline-size`, `max-inline-size`, `resolution`, `min-resolution`, `max-resolution`, `scan`, `grid`, `color`, `min-color`, `max-color`, `color-index`, `min-color-index`, `max-color-index`, `monochrome`, `min-monochrome`, `max-monochrome`, `color-gamut`, `dynamic-range`, `inverted-colors`, `forced-colors`, `prefers-color-scheme`, `prefers-contrast`, `prefers-reduced-transparency`, `prefers-reduced-motion`, `prefers-reduced-data`, `pointer`, `any-pointer`, `hover`, `any-hover`, `nav-controls`, `light-level`, `scripting`, `environment-blending`, `viewport-fit`, `device-width`, `device-height`, `device-aspect-ratio`, `overflow-inline`, `overflow-block`, `update`, `display-mode`, `transform-3d`, `viewport-segments`, `display-state`
- **Global attributes** (32): `a`, `a`, `a`, `c`, `c`, `d`, `d`, `d`, `e`, `e`, `h`, `i`, `i`, `i`, `i`, `i`, `i`, `i`, `i`, `i`, `l`, `n`, `p`, `p`, `s`, `s`, `s`, `t`, `t`, `t`, `v`, `w`
- **MIME types**: 39 entries
- **HTML attributes**: 0 entries (docs: attributes guide)

---

# PART III -- COOKBOOKS

## 28. Cache cookbook

Recipes verified live during the v1.0.6 build (fixtures: examples/ecommerce-shop,
examples/analytics, examples/api-server):

**A. Cache a page for 30s, invalidate on publish**

```tw
page { title "Shop" render ssr cache { revalidate 30, tag "products" } }
```

```twm
fn actionPublish(request) {
  return { status: 200, json: { ok: true }, revalidateTag: "products" }
}
```

The next request after the action re-renders; the response carries
`x-tw-revalidated: products`.

**B. Cache an API endpoint with a hard limit**

```twm
fn cached get(request) {
  cache { revalidate 10, expire 60, tag "items" }
  return { status: 200, json: { n: next() } }
}
```

Between 10s and 60s the entry is STALE: served instantly, refreshed in the
background. After 60s: MISS.

**C. Legacy ISR (zero-change migration)**

```tw
page { revalidate 60 }
```

Exactly the v1.0.5 semantics: fresh 60s, then stale-while-revalidate
forever. Do NOT touch this form when modernizing other pages.

**D. Custom profiles in tw.config.ts**

```ts
export default {
  cache: { profiles: { product: { stale: 2, revalidate: 3, expire: 8 } } },
}
```

```tw
page { cache { life "product", tag "p" } }
```

Build resolves the profile (TW092 if the name is unknown at build time).

**E. Watch the windows live**

```sh
curl -sI http://127.0.0.1:PORT/ | grep -i "x-tw-cache-age"
```

MISS -> HIT -> (after revalidate elapses) STALE with background refresh.

## 29. Middleware cookbook

```twm
rule "block bots" {
    match "/**"
    user_agent { block ["curl/", "wget/", "scrapy"] }
    response { status 403; html "<h1>403</h1>" }
}
```

Rule blocks compose (user_agent, auth, rate limits); first matching rule
wins; guards are fail-closed. Route matching supports `**` globs and
`/api/**` style segments. See docs/middleware.md for the full grammar.

## 30. Forms and validation

```tw
input type "text" placeholder "Name" { }
input type "email" placeholder "Email" { }
button "Send" { }
```

```twm
fn post(request) {
  const b = request.body ?? {}
  if (!b.name || String(b.name).trim() === "") {
    return { status: 422, json: { ok: false, field: "name", error: "Name is required" } }
  }
  return { status: 200, json: { ok: true, thanks: b.name } }
}
```

Full working app: examples/forms-validation.

## 31. Islands and interactivity

```tw
page { title "Todos" render island }

state { count = 0, label: "tasks left" }

div.app {
  p "{count} {label}"
  button on:click "count = count + 1" { "Add task" }
  button on:click "count = count > 0 ? count - 1 : 0" { "Done" }
}
```

Full working app: examples/todo-app.

## 32. Signal streaming

```tw
page { title "Live" render stream }
```

```twm
import { setSignal } from "tw"

fn get(request) {
  setSignal("feed.tick", Date.now())
  return { status: 200, json: { ok: true } }
}
```

Full working app: examples/chat-stream.

---

# PART IV -- THE TEST CATALOG, ANNOTATED

What each suite in tests/ actually locks (49 files, 2702 tests):

- **tests/adapters.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/cache-tags.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/codegen-deep.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/compiler-advanced.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/compiler.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/deep-round.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/docs-round.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/e2e-isolated-app.test.ts** -- Full-stack proof: fixture app -> tw build -> tw serve on a random port (8300-8700) -> real HTTP with node:http. Locks MISS->HIT->STALE windows, Cache-Control headers, canonical query order-independence, revalidateTag via action, TW090/091/092 build gates, TW093 warning, legacy infinite-SWR regression, route naming (/secret not /secret/page).
- **tests/e2e.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/external-hunt.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/hunt-round.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/hunt-round2.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/image.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/interactivity-e2e.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/layout-params.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/lexer.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/link.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/middleware-rules.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/native.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/next-parity.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/node-bundle-css.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/optimizer-deep.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/parity.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/parser-deep.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/parser.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/phase3-runtime.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/plugins-load.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/plugins.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/render-modes.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/runtime-new-2.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/runtime-new.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/runtime-server.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/runtime.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/scss.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/security-hunt.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/security.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/self-hunt.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/semantic-deep.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/shared.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/signal-stream.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).
- **tests/unit-aria.test.ts** -- All 80 ARIA_ROLES with their supported attributes; role/attr pairing rules; the four attributes added in the v1.0.6 ARIA bugfix plus the missing `table` role.
- **tests/unit-css-matrix.test.ts** -- All 328 CSS_PROPERTIES compile in TSS; TSS_SHORTHANDS produce the mapped CSS; CSS_FUNCTIONS (calc, rgb, var...); CSS_MEDIA_FEATURES in @media; minification preserves semantics.
- **tests/unit-events.test.ts** -- All 116 EVENT_TYPES as on:<event> handlers; EVENT_HANDLER_ATTRS mapping; invalid event names produce diagnostics.
- **tests/unit-html-attributes.test.ts** -- All 278 HTML_ATTRIBUTES across elements; boolean attrs; keyword-collision attributes in HTML-form syntax.
- **tests/unit-html-elements.test.ts** -- All 199 HTML_ELEMENTS compile -- DSL form for regular tags, HTML form for var/use/set and slot boundaries; void-tag behavior; the annotation-xml text-parse quirk.
- **tests/unit-router-directives.test.ts** -- page { } directive grammar: title, render modes, legacy revalidate, cache { } block (TW090-TW093 at the parse layer), revalidate -5 edge (TW090), unknown directive keys.
- **tests/unit-web-tables.test.ts** -- HTTP_STATUS_CODES table shape and completeness; MIME_TYPES; VOID_TAGS; BOOLEAN_ATTRS.
- **tests/wiring.test.ts** -- Framework suite; see the describe blocks for the locked behavior (every suite follows contributing/core-testing.md).


---

# PART V -- FAQ (answers verified, not vibes)

**Q: I changed the compiler and one test fails under `bun test` but passes
when I run the file directly.** The bunfig.toml happy-dom preload (section
11, quirk 8). Re-verify at compileSync/resolveCache level; if the behavior
differs only under the preload, the preload is the variable, not your code.

**Q: My `cache { life "x" }` page builds but the build fails with TW090.**
The profile name does not exist in tw.config.ts cache.profiles AND is not a
builtin. Profiles resolve at build time (decision log #5).

**Q: Why is `revalidate -5` TW090 and not TW091?** TW090 = the cache block
has no valid window; TW091 is reserved for `fn cached` purity violations
(cookies/headers/body/setSignal). Codes are semantic, not sequential.

**Q: Fetch to my test server gets blocked.** Global fetch CORS-blocks
localhost under the preload. Use node:http (pattern in
tests/e2e-isolated-app.test.ts).

**Q: My example's build output serves /secret from home/secret/page.tw.**
Correct -- the trailing page.tw segment IS the route. /secret/page would
need home/secret/page/page.tw.

**Q: Can I add a dependency?** Prefer not; the framework core is
deliberately zero-dependency. A new dependency needs a justification note
in the PR (contributing/code-review.md).

**Q: How do I prove a perf claim?** `bun bench/run.ts --check` against the
recorded baselines; paste the table. "Feels faster" is not evidence.

**Q: The zip passed on my machine.** The zip must be fresh-verified:
unzip -> bun install -> bun test on THE ZIP CONTENTS (hard rule 6).

---

*End of the operating manual. 199 elements, 328 properties, 116 events, 80 roles, 66 shorthands, 93 error codes, 49 test suites, 322 evals, 6 bench metrics -- all extracted live.*

---

# PART VI -- ARCHITECTURE DEEP-DIVE

## 33. The compiler pipeline, stage by stage

What actually happens to a `.tw` file between disk and HTML:

1. **BOM strip** -- a UTF-8 BOM on line 1 is removed before lexing
   (compileSync does this explicitly; Windows editors write BOMs).
2. **Lex** -- source to tokens. Text nodes, dot-classes, attribute pairs
   (`name "value"`), HTML-form segments (`<tag attr="v">`), directives
   (`page { ... }`), state blocks, interpolation braces.
3. **Parse to AST** -- tokens to a Program. Directive bodies (including the
   v1.0.6 nested `cache { }` block) land in page options. A parse cache
   keyed by `filePath + content hash` short-circuits re-parses of unchanged
   files -- which is also why diagnostics can differ between cached and
   uncached paths under the test preload (quirk 8).
4. **Diagnostics pass** -- rules.ts over the AST: structure rules, ARIA
   role/attribute pairing (the tables live in rules.ts), duplicate
   attributes, element-table membership. TW0xx codes, severities, categories.
5. **Codegen** -- parallel emitters:
   - HTML emitter (SSR string + static VDOM JSON where enabled)
   - TSS compiler (`compileTSS`) for extracted/linked styles
   - VDOM codegen (`h()` / `t()` calls, ternaries for `if`, `map()` for `for`)
   - JS bundle (runtime bootstrap, hydration, event wiring)
6. **Metadata** -- parseTime/codegenTime/totalTime, stateSeed,
   streamedSignals, derivedSpecs on the CompileResult.

`compileSync(source, { filePath })` is the deterministic entry point used by
benches, evals, and the build; it resets the Suspense counter per
compilation so build-time shells and serve-time re-renders produce identical
suspense ids (PPR hole fills depend on this).

## 34. The render pipeline and its windows

`RenderPipeline.render(path, stateVars)`:

1. Match the route (scanRouteTree/matchRoute -- flat tree, 1000 routes match
   at ~30k/sec on the bench pod).
2. Compute the canonical key:
   `sha256(method + handlerPath + canonicalQuery + JSON(params))`.
   Query canonicalization sorts keys -- `?b=2&a=1` and `?a=1&b=2` hit the
   same entry (locked by an e2e test).
3. Look up the entry. Windows from resolveCache:
   - age < revalidate -> HIT (served, `x-tw-cache-age` header)
   - revalidate <= age < expire -> STALE (served, background refresh queued)
   - age >= expire or absent -> MISS (render, compile, store)
4. Cache-Control is computed from the `stale` (client hint) -- the client
   window and the server window are deliberately separate numbers.
5. `revalidateTag(tag)` walks the tag index (a process-local registry built
   by revalidate.ts) and drops every entry in the family.

Legacy `revalidate N` pages skip the explicit-cache path entirely and keep
the v1.05 infinite-SWR behavior -- a dedicated regression test proves the
byte-identical semantics.

## 35. The .twm loader and `fn cached`

twm-loader transforms a .twm module at load time:

1. Hoists `cache { }` blocks out of handler bodies (they become metadata,
   not runtime code).
2. For `fn cached` handlers: purity scan -- `request.params`/`request.query`
   are allowed (folded into the canonical key); `request.cookies`,
   `request.headers`, `request.body`, and `setSignal` fail the build
   (TW091 -- a cached handler leaking per-request data would be a security
   hole, not a bug).
3. Nondeterminism scan: `Date.now()` / `Math.random()` warn (TW093) because
   the value freezes into the cache entry -- the "frozen clock" trap.
4. Wraps the handler with the canonical cache: same key scheme, same
   HIT/STALE/MISS windows, applied to JSON handler results.
5. Injects `revalidateTag` from the `"tw"` import surface; action results
   may carry `revalidateTag` (updateTag semantics -- bump the tag AFTER the
   write lands).

## 36. The build

`tw build` (apps/cli): scan pages -> compile each (parallel) -> resolve
cache profiles from tw.config.ts (readCacheProfilesSync parses the .ts
literal directly -- loadConfigSync cannot load .ts) -> run the TW090-TW093
gates -> emit `.tw/` with routes.json (numbers OR window objects) -> emit
the runtime bundle. `tw serve` boots the render pipeline over `.tw/`.

## 37. The client runtime

Hydration: islands attach to prerendered markup; state blocks become
reactive stores; `on:event "expr"` handlers compile to store mutations;
signals subscribe over the stream transport. The runtime is what
`render island` / `render stream` exercise end to end (examples/todo-app,
examples/chat-stream).

---

# PART VII -- AGENT WORKFLOWS (end-to-end, command by command)

## 38. "This page fails to build" -- the debugging loop

```sh
# 1. Reproduce with the smallest possible input
cat > /scratch/repro.tw <<'X'
page { cache { life "nope" } }
div { "x" }
X
bun -e 'import {compileSync} from "/scratch/repos/tw-1.0.6/tw-framework/packages/compiler/tw/index.ts";
const out = compileSync(await Bun.file("/scratch/repro.tw").text(), {filePath:"/scratch/repro.tw"});
console.log(out.diagnostics)'
```

- Errors from rules/parser -> fix the page (TW0xx explains itself; docs/
  error-reference.md has the long form).
- Build-only failure (compiles clean, build fails) -> profile resolution
  or gates in apps/cli/commands/build.ts.
- Serve-time failure -> render pipeline / twm loader.

Then reproduce the ORIGINAL page, not the reduction, before claiming fixed.

## 39. "Add a feature" -- the full checklist

1. Design note first (see TW-v1.0.6-cache-design.md for the template:
   semantics -> keys -> purity -> diagnostics -> milestones).
2. Implement in the owning package (section 4 table).
3. Diagnostics if any new failure mode exists (skills/add-diagnostic).
4. Unit tests parameterized over the relevant table (unit-* suites are the
   pattern; never copy-paste variants).
5. e2e expectation if user-visible (tests/e2e-isolated-app.test.ts).
6. Eval case if outcome-shaped; bench if hot-path.
7. Docs page -- "This document covers one thing completely:".
8. AGENTS.md / errors.json regen if the tables changed.
9. `bun run verify` -- all green.
10. UPGRADING.md note if anything about existing markup changes (it
    shouldn't -- zero breaking change).

## 40. "Something is slow" -- the perf investigation

```sh
bun bench/run.ts --check        # which metric regressed?
bun bench/<that>.bench.ts 5000  # focused, more iterations
# hypothesis -> fix -> re-run focused -> full --check
```

If the fix is intentional and permanent: `bun bench/run.ts --record` in the
same change, with a note (contributing/code-review.md makes silent bumps a
blocker). The tolerance is 25% -- smaller dips are pod noise (decision
log #6).

## 41. "Hunt for bugs" -- the repeatable round

skills/bug-hunt is the packaged form. The loop that found 50+ bugs in
1.0.5: pick a surface -> generate adversarial inputs from the REAL tables
-> predict expected behavior from docs/ first -> run -> classify (bug /
quirk / harness artifact) -> re-verify at the deterministic layer -> fix +
lock with a regression test. The scale and fuzz evals are the automated
version of exactly this loop: run them first, hunt by hand second.

---

# PART VIII -- ENVIRONMENT NOTES (where the suite runs)

1. **Background servers die between bash invocations** -- every serve+curl
   sequence happens in ONE shell call (pattern: scripts/verify-all.sh,
   tests/e2e-isolated-app.test.ts).
2. **Ephemeral /tmp is tiny (~64MB)** -- use /scratch for fixtures and
   build outputs.
3. **Bun install** -- if the bun.sh script is blocked, `npm install -g bun`
   works and lands in /scratch/.local/bin (add to PATH).
4. **bunfig.toml preloads happy-dom for tests only** -- plain `bun file.ts`
   runs do NOT get it; that difference is deliberate and load-bearing
   (quirk 8).
5. **Termux (the primary user platform)**: no sudo, pip/npm user installs
   persist per session; the zip layout (no node_modules) is what keeps the
   artifact Termux-sized.

---

*Manual complete. Verify everything you read -- that is rule 1.*

---

# PART IX -- THE EXAMPLES MATRIX, IN DEPTH

Thirty runnable apps, each teaching exactly one thing. CI builds every
one; `bun run verify` proves it on every run. Use this section to route a
learning goal (or a repro) to the right app fast.

## 42. The matrix

| App | The one thing | Files that matter |
|---|---|---|
| hello-tw | The minimal complete app | home/ (layout, error, loading, not-found, api), components |
| tw-blog | Dynamic routes + ISR at scale | the largest example -- the depth end |
| dashboard | Cache on an SSR page (minutes profile, tag) | home/page.tw, home/style.tss |
| ecommerce-shop | Publish-then-invalidate (tag on write) | home/page.tw |
| todo-app | Islands: state + event expressions | home/page.tw |
| portfolio | Multi-page static site | home/, home/work/ |
| api-server | Pure JSON API: fn cached + action + echo | home/api/*/route.twm, lib/counter.ts |
| auth-starter | Form + POST handler + guarded route | home/api/login/route.twm, middleware.twm |
| i18n-site | Directory-based locales (en/hi) | home/en/, home/hi/ |
| chat-stream | Signal streaming (render stream) | home/api/feed/route.twm |
| image-gallery | Void-element images + alt floor | home/page.tw |
| forms-validation | Server-side validation contract | home/api/contact/route.twm |
| analytics | Write-driven invalidation loop | home/api/event/route.twm |
| kitchen-sink | Everything composed in one app | all of the above, small |

## 43. Choosing an app to copy

- Copying for a static site: portfolio.
- Copying for a content site with fresh pages: tw-blog, then ecommerce-shop.
- Copying for an API: api-server.
- Copying for an interactive tool: todo-app, then chat-stream if the
  server must push.
- Copying for auth: auth-starter (then the security docs).
- Copying for a dashboard with live writes: analytics, then dashboard.
- Do not copy kitchen-sink -- it exists to be read, not extended.

## 44. The verification loop for any app

```sh
cd examples/<app>
bun ../../apps/cli/tw/bin.ts build        # compiles clean or it ships nowhere
bun ../../apps/cli/tw/bin.ts serve --port 8123 &
sleep 2 && curl -sI http://127.0.0.1:8123/ | head -12 && kill %1
```

Server + curl in ONE shell (environment note 1). Watch x-tw-cache-age on
cached apps; watch the 403 on kitchen-sink from curl's user agent; watch
the frozen counter on api-server.

## 45. Common repros routed by example

| Symptom | Look at | Why |
|---|---|---|
| "My page never updates" | ecommerce-shop, analytics | tag invalidation is the fix |
| "My counter returns the same number" | api-server | that is the cache working |
| "Input attributes parse wrong" | todo-app, forms-validation | the `name "value"` syntax |
| "My img tag errors" | image-gallery | void-element form |
| "curl gets 403" | kitchen-sink | middleware blocks bot user agents |
| "Route serves at the wrong path" | any nested page | the page.tw-segment rule |
| "Hindi/unicode route 404s" | i18n-site, kitchen-sink | directory locales work natively |


---

# PART X -- CHANGELOG ADDENDUM: THE 30-EXAMPLE EXPANSION

## 46. The bug the 30th example found (and the fix)

Adding the url-shortener example surfaced a real, build-silent framework
bug: the .twm loader's comment stripper used a naive `//` regex that ate
`https://...` INSIDE string literals. The generated module code ended
with an unclosed string, `loadTWMModule` caught the SyntaxError, logged
it, and returned zero handlers -- so the route 405'd on EVERY method at
serve time while `tw build` stayed green.

The fix: `stripCommentsSafe` (packages/server/tw/routing/twm-loader.ts),
a string-aware state machine (' " ` modes, escape handling) used at all
four comment-strip sites. Locked by tests/unit-twm-comment-strip.test.ts
(10 cases, including the exact `new Map([["tw", "https://..."]])` repro).

Lesson encoded for every future hunt: a 405 with a clean build means the
module failed to EXECUTE, not to compile -- and the error was in the
serve log all along (this one was found by finally NOT redirecting
stderr to /dev/null).

## 47. The new matrix batch (16 apps)

docs-site, url-shortener, weather-app, wiki, changelog, recipe-site,
countdown, calculator, quiz-app, kanban-board, comments, headers-demo,
redirects-demo, search-demo, webhook-log, pricing-table -- each verified
by build, and the server-touching ones spot-checked live with curl
(redirect codes, cached-query freezing, canonical keys, header surfaces,
log tails, tag invalidation). All 30 build on every CI run.
