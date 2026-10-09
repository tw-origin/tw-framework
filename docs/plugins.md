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
  version: "2.0.0",
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

## The Hook Reference

There are **25 lifecycle hooks**. All 25 fire — none is a placeholder. Which
one you get depends on the entry point: **14 fire from the CLI** (`tw build`,
`tw serve`, `tw dev`) and **11 more fire through the SDK's `AppBuilder`**
(`createApp()`), which drives the same pipeline programmatically.

Every hook is optional. A plugin that throws in one is isolated and never
takes the command down.

### Build hooks — fired by `tw build`

| Hook | When | Receives | Returns |
|------|------|----------|---------|
| `config:resolve` | after `tw.config.ts` is loaded | `{ config, rootDir }` | ignored |
| `pages:discover` | after the routes are scanned | `{ pages, rootDir }` | ignored |
| `before:build` | before compilation starts | `{ pages, rootDir, outDir }` | ignored |
| `after:build` | after the output is written | `{ rootDir, outDir, pages }` | ignored |

```ts
api.on("after:build", ({ outDir }) => {
  // write a search index, copy a file, report a number
  writeFileSync(join(outDir, "search.json"), JSON.stringify(index));
});
```

### Content hooks — fired by `tw build`

These four are **value-chaining**: the hook receives the content and may return
a replacement. Return `undefined` to leave it untouched, so a plugin can look
without changing anything. They run after the build has written the files, so
they see everything the build emitted.

| Hook | Operates on | Receives | Return to replace |
|------|-------------|----------|-------------------|
| `transform:html` | every emitted `index.html` | `(html, { route })` | a string |
| `transform:css` | every emitted `.css` | `(css, { file })` | a string |
| `transform:js` | every emitted `.js` / `.mjs` | `(js, { file })` | a string |
| `optimize:asset` | every other emitted file (images, fonts, …) | `(buffer, { file })` | a `Buffer` |

```ts
// minify HTML on the way out
api.on("transform:html", (html) => html.replace(/<!--[\s\S]*?-->/g, ""));

// append a banner to every stylesheet
api.on("transform:css", (css) => css + "\n/* built by tw */\n");

// rewrite an image asset
api.on("optimize:asset", (buf, { file }) =>
  file.endsWith(".svg") ? Buffer.from(squeeze(buf.toString())) : undefined);
```

The whole pass is skipped when no plugin registers any of the four, so a
project without plugins pays nothing for it.

### Serve hooks — fired by `tw serve` and `tw dev`

| Hook | When | Receives |
|------|------|----------|
| `onRequest` | every request, before routing | `(request, ctx)` |
| `onResponse` | before the response is sent | `(response, ctx)` |
| `onError` | a handler threw | `(error, ctx)` |
| `server:start` | the server is accepting traffic | `{ host, port, rootDir }` |
| `server:stop` | graceful shutdown (fires once) | `{ rootDir }` |

```ts
api.on("server:start", ({ port }) => console.log(`listening on ${port}`));
api.on("server:stop", () => flushMetrics());
```

### Dev-only hook

| Hook | When | Receives |
|------|------|----------|
| `hmr:update` | a watched file changed | `{ file, rootDir }` |

That is the CLI set — **14 hooks**. Everything above works in a plain
`plugins/*.ts` file with no extra setup.

### The AppBuilder hooks — 11 more

`createApp()` from the SDK runs the whole build/render/serve pipeline in
process, and fires the fine-grained stages the CLI does not reach:

| Hook | Stage |
|------|-------|
| `before:compile` / `after:compile` | each compile pass |
| `before:bundle` / `after:bundle` | each bundle pass |
| `before:render` / `after:render` | each render pass |
| `before:serve` / `after:serve` | serve start/stop at the app level |
| `route:match` | a route resolved for a request |
| `response:before-send` | the final response, before the socket write |
| `error` | an error surfaced to the app pipeline |

Register them the same way — but they only fire under `createApp()`. Under
`tw build` / `tw serve` / `tw dev` the CLI uses its own path, so a hook from
this table will not run. Use `createApp()` if you need them.

### Summary

| | Count |
|---|---|
| Total lifecycle hooks | **25** |
| Fire from the CLI (`tw build` / `serve` / `dev`) | **14** |
| Fire only via SDK `createApp()` | **11** |
| Declared but never fired | **0** |

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
  version: "2.0.0",
  description: "What it does",
  priority: 50,                       // hook order (lower = earlier)
  options: {},                        // filled from tw.config.ts entries

  setup(api) {
    api.on("onRequest", (ctx) => { });
    api.on("onResponse", (ctx) => { });
    api.on("onError", (ctx) => { });
    api.on("after:build", ({ outDir }) => { });          // build
    api.on("transform:html", (html) => html);            // content (chaining)
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
tw plugin create <name>     # scaffold + enable (local)
tw plugin add <name>        # enable
tw plugin remove <name>     # disable
tw plugin list              # see the state
tw plugin init <name>       # scaffold a publishable package
tw plugin search [term]     # find plugins on npm
tw plugin install <pkg>     # install + enable a package
```

```ts
// plugins/<name>.ts
import type { TWPlugin } from "@tw/plugins";
const plugin: TWPlugin = { name: "<name>", version: "2.0.0", setup(api) { } };
export default plugin;
```

## Sharing a plugin

A plugin can also be an npm package, installed with `tw plugin install` and
discovered by the `tw-plugin` keyword. That half — the naming convention, the
keyword, publishing and `tw plugin search` — is covered in
[Plugin Distribution](./plugin-distribution.md).

## Related

- [Plugin Distribution](./plugin-distribution.md) — sharing a plugin on npm
- [Middleware](./middleware.md) — declarative request rules (auth, rate limits)
- [API Routes](./api-routes.md) — app endpoints
- [Configuration](./configuration.md) — the `plugins` field
- [Commands Reference](./commands-reference.md) — `tw plugin`
