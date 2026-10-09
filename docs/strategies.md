# Strategies — every subsystem offers all of its options

TW never replaces one option with another. Both live side by side, and you
pick per project in `tw.config.ts` (or per command with a flag). Omitted
fields keep the default, so adding this section can never break an existing
project.

## The twelve families

| Field | Options | Default | Status |
|-------|---------|---------|--------|
| `signals.transport` | `sse` · `ws` · `long-poll` | `sse` | **live** — all three transports ship |
| `hydration.mode` | `auto` · `full` · `islands` · `none` | `auto` | **live** — honoured by `tw build` and request-time rendering |
| `css.engine` | `tss` · `tailwind` · `css` · `scss` | `tss` | `tss`/`css`/`scss` live; `tailwind` first-class **landing** |
| `render.engine` | `tw-vdom` · `react` · `preact` · `none` | `tw-vdom` | `tw-vdom` live; `react`/`preact` **landing** |
| `runtime.server` | `auto` · `bun` · `node` · `deno` · `edge` | `auto` | `auto`/`bun`/`node` live; `deno`/`edge` **landing** |
| `api.runtime` | `node` · `edge` | `node` | **live** — `edge` handlers are checked at build time *and* run with the Node globals removed (see below) |
| `state.model` | `signals` · `hooks` · `store` | `signals` | **live** — `hooks` runs in a component `setup`/`render` and re-renders on state change |
| `data.layer` | `routes` · `graphql` · `trpc` | `routes` | **live** — a GraphQL executor and a tRPC router ship in `@tw/server` |
| `cache.mode` | `isr` · `swr` · `none` · `cdn` | `isr` | **live** — each mode governs the served `Cache-Control`; `none` also drops the server cache |
| `auth.model` | `session` · `jwt` · `oauth` | `session` | **live** — one `createAuth()` entry point for all three |
| `db.adapter` | `sql` · `kv` · `vector` | `sql` | **live** — real SQL (bun:sqlite), KV and vector stores |
| `packages.manager` | `auto` · `npm` · `pnpm` · `yarn` · `bun` | `auto` | **landing** (detection) |

"Live" means the option is wired end to end and tested. "Landing" means the
field is defined, validated, reported by `tw doctor` and covered by the
compatibility rules — the engine behind it is still being built, so
selecting it does not change behaviour yet. Every row reaches **live** before
2.0.0 ships; this column is the honest status until then.

## Setting them

```ts
// tw.config.ts
export default {
  strategies: {
    signals: { transport: "ws" },
    css: { engine: "tailwind" },
    hydration: { mode: "islands" },
  },
};
```

Or per command, without touching the config:

```bash
tw build --signals=ws --css=tailwind --hydration=islands
tw doctor --signals=long-poll
```

## What each one changes

**`signals.transport`** — how live updates reach the browser. `sse` is one
long HTTP stream (works through every proxy); `ws` is a WebSocket (needs
Bun's WebSocket server); `long-poll` repeats `/_tw/poll` where streaming is
blocked. Same frame protocol in all three, so app code never changes. The
choice is baked into each streamed page's `__TW_SIGNALS__` manifest.

**`hydration.mode`** — how much JS ships. `none` ships zero client JS (a
pure-HTML site), `islands` hydrates only pages carrying island markers,
`full` hydrates every interactive page, `auto` (default) decides per page
from its own markers.

**`css.engine`, `render.engine`, `state.model`, `data.layer`, `cache.mode`,
`runtime.server`, `api.runtime`, `packages.manager`** — selected the same
way; see the individual guides for each engine.

## Runtime behaviour

Selecting an option is not only a config check — each one has a runtime entry
point, so the choice actually changes how the project behaves:

| Option | Runtime entry point | What it does |
|--------|--------------------|--------------|
| `cache.mode` | (automatic) | the server stamps the served `Cache-Control` per mode; `none` bypasses the page cache |
| `auth.model` | `createAuth()` from `@tw/server` | `login` / `user` / `requireUser` / `logout`, plus an OAuth client |
| `data.layer=graphql` | `createGraphQL({ Query, Mutation })` | parse + execute a query, variables, aliases, errors |
| `data.layer=trpc` | `createTrpcRouter({ name: { query, mutation } })` | `handle(request)` dispatches `/api/trpc/<name>` |
| `state.model=hooks` | `useState`/`useEffect`/… in a component `setup` | state change re-renders the component |
| `api.runtime=edge` | (automatic) | the handler runs with `process`/`require`/`Buffer`/… removed, plus a timeout and a response cap |
| `db.adapter` | `createDb({ adapter })` | real SQL / KV / vector stores behind one surface |

All of these are importable from `@tw/server` (and, for hooks, `@tw/runtime`),
so a `.twm` handler or a component uses them directly:

```twm
import { createAuth } from "@tw/server"
fn get(request) {
  const auth = createAuth()
  return auth.user(request).then(u => u ? { json: { user: u } } : { status: 401, json: {} })
}
```

## Image loader, i18n and plugins

Three subsystems ship a runtime entry point of their own:

| Entry point | What it does |
|-------------|--------------|
| `createImageLoader(config)` | builds real transform URLs for `default` · `imgix` · `cloudinary` · `vercel` · `cloudflare` · `custom`, plus `srcset` and a preload link; remote hosts are gated by `images.remoteAllowHosts` |
| `createI18n(config)` | per-request locale state, `detect(request)` from cookie/Accept-Language, and a client snippet (`clientScript()`) that switches locale in the browser |
| `createPluginHost()` | register plugins, run `setup`/`teardown`, and dispatch `onRequest`/`onResponse`/`onError`/`onBuild` with isolation and a `dev` flag |

```twm
import { createImageLoader, createI18n } from "@tw/server"
```

## Validation and visibility

A wrong value is a **hard error** at config load, with the allowed list and
the closest match:

```
css.engine -- Invalid css.engine: "taiwind". Allowed: tss, tailwind, css, scss
              (did you mean "tailwind"?) -- tss | tailwind | css | scss
```

`tw doctor` prints every family, its current value, what changed from the
default, and whether the selected option is actually available in this
project (is `tailwindcss` installed? is `react`? is `ws` needed?):

```bash
tw doctor
tw doctor --css=tailwind --signals=ws
```

## Compatibility — combinations, not just fields

Single-field validation catches typos. Real breakage comes from *pairs*:
a WebSocket transport on a runtime with no WebSocket server, ISR on a
runtime with no writable cache, "zero JS" next to a client-side state model.
Those are checked at config load, and `tw doctor` lists them with a fix.

### Tiers

| Tier | Meaning |
|------|---------|
| **supported** | tested in CI (see `SUPPORTED_MATRIX` in the code); every entry is conflict-free by construction |
| **best-effort** | allowed, not guaranteed — printed as a warning, never blocks |
| **unsupported** | a hard error with a fix suggestion |

### Unsupported combinations (hard errors)

| Combination | Why | Fix |
|-------------|-----|-----|
| `signals.transport=ws` + `runtime.server=node\|deno\|edge` | the WebSocket server is Bun's; the others have none | switch runtime to `bun`, or use `--signals=sse` / `--signals=long-poll` |
| `render.engine=none` + `hydration.mode=full\|islands` | no renderer, nothing to hydrate | set `hydration.mode=none`, or pick a render engine |
| `hydration.mode=none` + `state.model=hooks` or `render.engine=react\|preact` | zero client JS contradicts a client-side model | set `hydration.mode=auto`, or move state server-side |
| `api.runtime=python\|wasm` + `runtime.server=edge` | an isolate has no process to host a bridge | switch runtime to `bun`/`node`, or `api.runtime=edge` |
| `cache.mode=isr` + `runtime.server=edge` | ISR needs a writable cache | `--cache=cdn` / `--cache=swr`, or a `bun`/`node` runtime |
| `state.model=hooks` + `render.engine=tw-vdom\|none` | hooks need a React-compatible renderer | `render.engine=react\|preact`, or keep `state.model=signals` |
| `state.model=store` + `hydration.mode=none` | a client store cannot run with zero JS | `hydration.mode=auto`, or `state.model=signals` |

### Best-effort warnings

| Combination | Why it warns |
|-------------|--------------|
| `signals.transport=sse` + `runtime.server=edge` | edge platforms cap how long one response may stay open — a long-lived SSE stream may be cut |
| `signals.transport=ws` + `runtime.server=edge` | same cap applies to WebSocket connections |
| `data.layer=graphql\|trpc` + `runtime.server=edge` | fine only if the endpoint is stateless |

On edge platforms, **`long-poll` is the safest transport**: every request is
short, so no platform timeout applies. All three transports carry the same
frame protocol, so switching is a config change, not a code change.

### What happens with `ws` on Node

It is an **unsupported combination** (exit code 2, config error) rather than a
silent fallback — a transport that silently degrades is worse than one that
refuses. Choose one of:

```bash
tw build --signals=sse         # works everywhere
tw build --signals=long-poll   # works everywhere, safest on edge
tw build --signals=ws          # Bun runtime only
```

`tw doctor` says the same thing, with the fix, before you build.

### Exit codes (`tw doctor`)

| Code | Meaning |
|------|---------|
| 0 | everything fine |
| 1 | an invalid value (typo / unknown option) |
| 2 | an unsupported combination |
| 3 | a selected option is unavailable here (e.g. `tailwindcss` not installed) |

`tw doctor --json` prints the whole report (strategies, changed fields,
conflicts with fixes, availability) as one JSON object and uses the same
codes — ready for CI.
