# TW Framework — Plugins

This document covers one thing completely: the plugin system — writing a plugin, enabling it, the hooks it can use, and the failure guarantees.

---

## What a Plugin Is

A plugin is a single `.ts` file in your project's `plugins/` directory. It registers hooks (code that runs at framework moments) and routes (endpoints the plugin serves itself):

```ts
// plugins/hit-counter.ts
import type { TWPlugin } from "@tw/plugins";

let hits = 0;

const hitCounter: TWPlugin = {
  name: "hit-counter",
  version: "1.0.0",
  description: "Counts requests and exposes /__stats",

  setup(api) {
    api.on("onRequest", (ctx) => { hits++; });
    api.registerRoute("GET", "/__stats", () => ({ status: 200, json: { hits } }));
  },
};

export default hitCounter;
```

That is the whole shape: an object with a `name`, and a `setup(api)` that wires behaviour.

---

## Where Plugins Live and How They Turn On

| Place | What |
|-------|------|
| `plugins/<name>.ts` | the plugin file — your project, your code |
| `tw.config.ts` → `plugins: [...]` | the switch — **a listed plugin runs, an unlisted one does not** |

```ts
// tw.config.ts
export default {
  plugins: [
    "hit-counter",                                     // simple
    { name: "rate-shield", options: { max: 100 } },   // with options
  ],
};
```

If `tw.config.ts` has **no** `plugins` field at all and a `plugins/` directory exists, every `.ts` file in it loads (zero-config mode). The moment you add a `plugins` field, it becomes the authority.

## The CLI

```bash
tw plugin create hit-counter   # scaffold plugins/hit-counter.ts + enable it
tw plugin list                 # every file, its enabled state
tw plugin add hit-counter      # enable (add to tw.config.ts)
tw plugin remove hit-counter   # disable (remove from tw.config.ts)
```

---

## The Request Hooks

The serve-side hooks fire on every request, in priority order:

| Hook | Context | Can it intercept? |
|------|---------|--------------------|
| `onRequest` | `{ request, url }` | Yes — return a `Response` to short-circuit |
| `onResponse` | `{ request, response }` | Yes — return a `Response` to replace it |
| `onError` | `{ request, error }` | No — runs for logging/telemetry |

```ts
setup(api) {
  // A maintenance-mode plugin: intercept everything.
  api.on("onRequest", (ctx) => {
    if (maintenanceUntil > Date.now() && ctx.url.pathname !== "/admin") {
      return new Response("Maintenance", { status: 503 });
    }
  });

  // Add a header to every response.
  api.on("onResponse", (ctx) => {
    ctx.response.headers.set("X-Powered-By", "my-plugin");
  });

  // Log every server error.
  api.on("onError", (ctx) => {
    console.error("[plugin]", ctx.error);
  });
}
```

## Plugin Routes

A plugin can own its own endpoints — matched before site routing:

```ts
api.registerRoute("GET", "/__stats", () => ({ status: 200, json: { hits } }));
```

Return shapes: a `Response` directly, or `{ status, json }`, or `{ status, text, headers }`.

## Options from Config

```ts
// tw.config.ts: { name: "rate-shield", options: { max: 100 } }
setup(api) {
  const opts = api.getConfig()?.plugins?.find((p) => p.name === "rate-shield")?.options ?? {};
}
```

## Priority

Hooks run in priority order — lower runs first, default `50`:

```ts
const plugin: TWPlugin = {
  name: "runs-early",
  priority: 10,          // before default-priority plugins
  ...
};
```

---

## Failure Guarantees

1. **A broken plugin never breaks the site.** A plugin whose hook throws is disabled with a logged warning — the request continues, the rest of the plugins keep running:

```
Plugin disabled after error [broken.onRequest]: this plugin is broken
```

2. **A file that fails to load is skipped** — bad syntax, missing export, whatever — with a warning, never a crash.

3. **A listed-but-missing plugin is skipped** with `Plugin not found, skipped: <name>`.

4. **No plugins = zero overhead.** With no plugins enabled, no manager is attached to the server.

---

## Full Plugin Surface

```ts
import type { TWPlugin } from "@tw/plugins";

const plugin: TWPlugin = {
  name: "my-plugin",
  version: "1.0.0",
  description: "What it does",
  priority: 50,                       // hook order (lower = earlier)
  options: {},                        // filled from tw.config.ts entries

  setup(api) {
    api.on("onRequest", (ctx) => { });
    api.on("onResponse", (ctx) => { });
    api.on("onError", (ctx) => { });
    api.registerRoute("GET", "/path", handler);
    api.registerCommand("cmd", (args) => { });
    api.registerMiddleware(async (ctx, next) => { await next(); });
    api.getConfig();
    api.getLogger();
  },

  teardown() { /* cleanup when the server stops */ },
};
```

## Runtime Requirement

Plugins load as TypeScript modules at serve time — run the server with Bun (`tw serve`, `tw adapter bun`).

---

## Quick Reference

```bash
tw plugin create <name>     # scaffold + enable
tw plugin add <name>        # enable
tw plugin remove <name>     # disable
tw plugin list               # see the state
```

```ts
// plugins/<name>.ts
import type { TWPlugin } from "@tw/plugins";
const plugin: TWPlugin = { name: "<name>", version: "1.0.0", setup(api) { } };
export default plugin;
```

## Related

- [Middleware](./middleware.md) — declarative request rules (auth, rate limits)
- [API Routes](./api-routes.md) — app endpoints
- [Configuration](./configuration.md) — the `plugins` field
- [Commands Reference](./commands-reference.md) — `tw plugin`
