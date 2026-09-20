# TW Framework — Guide: Plugins End-to-End

This guide covers one thing completely: using the plugin system in practice — writing your first plugin, enabling it with the terminal and without one, complete copy-paste examples, the security rules, and fixing what breaks. The hook-by-hook API reference lives in [Plugins](./plugins.md).

---

## The One Idea

A plugin is **one `.ts` file** in your project that the server loads and calls at defined moments. There is no package to install, no build step to configure:

```text
meri-website/
├── home/                 ← your pages
├── plugins/              ← your plugins
│   └── hit-counter.ts
└── tw.config.ts          ← the on/off switch
```

Because a plugin is just project files, **everything in this guide works with or without a terminal** — the only difference is who edits the files: you, or the CLI.

---

## Your First Plugin — Annotated

```ts
// plugins/hit-counter.ts
import type { TWPlugin } from "@tw/plugins";

let hits = 0;                          // plugin state lives in the module

const hitCounter: TWPlugin = {
  name: "hit-counter",                 // unique name — required
  version: "1.0.0",                    // required
  description: "Counts requests, serves /__stats",

  setup(api) {
    // Runs on every request BEFORE the site handles it.
    api.on("onRequest", (ctx) => {
      hits++;
      // ctx.request — the incoming request
      // ctx.url     — the parsed URL
      // Return a Response here to intercept (see examples below)
    });

    // Runs on every response AFTER the site handled it.
    api.on("onResponse", (ctx) => {
      // ctx.response — mutate headers, read the status
    });

    // Runs when the site errors.
    api.on("onError", (ctx) => {
      // ctx.error — log it somewhere
    });

    // The plugin's own endpoint — served before site routing.
    api.registerRoute("GET", "/__stats", () => ({
      status: 200,
      json: { hits },
    }));
  },

  teardown() {                          // optional — runs when the server stops
    console.log("hit-counter final count:", hits);
  },
};

export default hitCounter;             // default export — required
```

The three required pieces: `name`, `version`, and `export default`. Everything else is optional.

---

## Workflow A — With the Terminal

```bash
# 1. Scaffold a working plugin AND enable it
tw plugin create hit-counter
#    -> creates plugins/hit-counter.ts with a starter template
#    -> adds "hit-counter" to plugins: [...] in tw.config.ts

# 2. Edit plugins/hit-counter.ts (the template has the shape ready)

# 3. Run it
tw build
tw serve                       # plugins load at startup
```

The plugin commands:

| Command | What it does |
|---------|--------------|
| `tw plugin create <name>` | scaffold `plugins/<name>.ts` + enable in config |
| `tw plugin list` | every file in `plugins/` + whether it is enabled |
| `tw plugin add <name>` | enable (add to `tw.config.ts`) |
| `tw plugin remove <name>` | disable (remove from `tw.config.ts`) |

### Verifying it works

```bash
curl -s localhost:8000/__stats
# {"hits":3}
```

And watch the server console — every plugin prints on load:

```
Plugin registered: hit-counter v1.0.0
```

---

## Workflow B — Without a Terminal

Everything a plugin needs is plain files, so the whole system works from any editor (VS Code, GitHub's web editor, a file manager):

### Step 1 — Create the folder and file

```text
plugins/hit-counter.ts
```

Write the plugin (copy the first plugin above).

### Step 2 — Turn it on

Open `tw.config.ts` and add the plugin's name to the `plugins` array. If there is no array yet, add one:

```ts
export default {
  // ...your existing config...
  plugins: ["hit-counter"],
};
```

### Step 3 — Deploy

Commit both files (`plugins/hit-counter.ts` and `tw.config.ts`) and push. Your platform (Vercel, Netlify, Cloudflare — see [No-Terminal Guide](./no-terminal-guide.md)) rebuilds and restarts with the plugin live. The adapter files are committed once by anyone — after that every deploy picks up plugin changes from the repo.

### Auditing without a terminal

The `plugins: [...]` list in `tw.config.ts` **is** the source of truth — open it and read it. Every name there runs; nothing else does. Files in `plugins/` that are not listed do not run.

### One rule for no-terminal deploys

`tw serve` needs the Bun runtime — platforms running the static output do not execute plugins at all. If your plugin must run, deploy with the full-server path: the Docker adapter on Railway/Render/Fly, or a VPS with `tw serve`. See [Choosing a Platform](./guide-deployment-choose.md).

---

## What a Plugin Can Do — With Examples

All of these are complete, copy-paste-ready plugins.

### Example 1 — Maintenance mode

Intercept every request while a flag is on:

```ts
// plugins/maintenance.ts
import type { TWPlugin } from "@tw/plugins";

const maintenance: TWPlugin = {
  name: "maintenance",
  version: "1.0.0",

  setup(api) {
    api.on("onRequest", (ctx) => {
      const until = Date.parse("2026-10-01T00:00:00Z");
      if (Date.now() < until && !ctx.url.pathname.startsWith("/admin")) {
        return new Response(
          "<h1>We'll be right back</h1><p>Upgrading the site.</p>",
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
      // no return -> the site handles the request normally
    });
  },
};
export default maintenance;
```

Returning a `Response` from `onRequest` short-circuits — the site never sees the request.

### Example 2 — A header on every response

```ts
// plugins/site-info.ts
import type { TWPlugin } from "@tw/plugins";

const siteInfo: TWPlugin = {
  name: "site-info",
  version: "1.0.0",
  setup(api) {
    api.on("onResponse", (ctx) => {
      ctx.response.headers.set("X-Site", "my-store");
      ctx.response.headers.set("X-Powered-By", "TW Framework");
    });
  },
};
export default siteInfo;
```

### Example 3 — Simple analytics

Count requests per path, expose the totals:

```ts
// plugins/simple-analytics.ts
import type { TWPlugin } from "@tw/plugins";

const counts = new Map<string, number>();

const simpleAnalytics: TWPlugin = {
  name: "simple-analytics",
  version: "1.0.0",
  setup(api) {
    api.on("onRequest", (ctx) => {
      const p = ctx.url.pathname;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    });
    api.registerRoute("GET", "/__analytics", () => ({
      status: 200,
      json: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])),
    }));
  },
};
export default simpleAnalytics;
```

Protect the totals endpoint in `middleware.twm` so only you can read it:

```twm
rule "analytics-private" {
  match "/__analytics"
  auth { cookie "admin_token" jwt_secret_env "JWT_SECRET" }
  response { status 401 text "Unauthorized" }
}
```

### Example 4 — Options from config

```ts
// plugins/rate-shield.ts
import type { TWPlugin } from "@tw/plugins";

const rateShield: TWPlugin = {
  name: "rate-shield",
  version: "1.0.0",
  setup(api) {
    api.on("onRequest", (ctx) => {
      // options come from tw.config.ts (see below)
      const max = rateShield.options?.max ?? 100;
      // ...your limiting logic...
    });
  },
};
export default rateShield;
```

```ts
// tw.config.ts
export default {
  plugins: [
    { name: "rate-shield", options: { max: 50 } },
  ],
};
```

### Priority — who runs first

```ts
const first: TWPlugin  = { name: "first",  priority: 10, ... };  // runs early
const normal: TWPlugin = { name: "normal", priority: 50, ... };  // default
const last: TWPlugin   = { name: "last",   priority: 90, ... };  // runs late
```

Lower number runs first. Same priority runs in registration order.

---

## The Failure Guarantee

A plugin that throws is **disabled automatically** — one logged line, request continues, site stays up:

```
Plugin disabled after error [broken.onRequest]: this plugin is broken
```

What this means in practice:

| Situation | Result |
|-----------|--------|
| Plugin code has a runtime error | that plugin stops, others keep running, page serves normally |
| Plugin file has broken syntax | skipped at load with a warning |
| Plugin name listed but file missing | skipped with `Plugin not found` |
| No plugins enabled | no plugin code runs at all — zero overhead |

---

## Security Rules

A plugin runs as **full server code** — filesystem, network, and every environment secret (`process.env.JWT_SECRET` and friends). Treat it exactly like server code:

1. **Read a plugin before you add it.** The file is small — a two-minute read. Never run a plugin whose code you have not seen, whoever shared it.
2. **`tw plugin list` (or the config array) is the audit.** Check periodically that only plugins you know about are listed.
3. **Plugin routes are public.** Anything `registerRoute` serves is on the internet. Use the `/__` prefix for internal endpoints and guard them in `middleware.twm`.
4. **A bad plugin can bypass guards.** `onRequest` can intercept or skip any path — including `/admin`. Crash-isolation protects you from bugs, not from malice; only trust decides what runs.
5. **Plugin source is never served.** `.ts` files answer 404 from the static layer — your plugin's code (and any secrets in it) does not leak through the server.

Checklist before shipping a site with plugins:

```
□ Every enabled plugin's code read and understood
□ No secret hardcoded in any plugin file (use process.env)
□ Plugin routes guarded if they expose data
□ tw.config.ts plugins list reviewed before deploy
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Plugin never runs | not in `tw.config.ts` `plugins: []` | add the name, or `tw plugin add <name>` |
| `Plugin not found, skipped` | file missing or named differently | the list entry must match `plugins/<name>.ts` |
| `Plugin skipped (no name export)` | file has no default export with a `name` | end with `export default { name: ..., setup(api) {...} }` |
| `Plugin disabled after error` | it threw — by design | read the error message; fix or remove the plugin |
| Works locally, nothing on the platform | platform serves static output only | plugins need `tw serve` (Bun) — Docker/VPS platform, see [Choosing a Platform](./guide-deployment-choose.md) |
| `Plugin already registered` | two files with the same `name` | rename one |

---

## Quick Reference

```
File:      plugins/<name>.ts          (TypeScript, default export)
Switch:    tw.config.ts -> plugins: ["<name>"]
CLI:       tw plugin create / add / remove / list
Hooks:     onRequest (interceptable) · onResponse · onError
Routes:    api.registerRoute("GET", "/path", () => ({ status, json }))
Options:   { name: "x", options: {...} } in the plugins array
Order:     priority (lower = earlier, default 50)
Safety:    throwing plugin = auto-disabled, site stays up
Runtime:   tw serve (Bun)
```

## Related

- [Plugins](./plugins.md) — the full API reference
- [Middleware](./middleware.md) — declarative rules (auth, rate limits) — often the better tool for guarding
- [API Routes](./api-routes.md) — app endpoints
- [No-Terminal Guide](./no-terminal-guide.md) — the editor-only workflow for everything
- [Security](./security.md)
