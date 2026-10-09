# TW Framework — Plugin Distribution

This document covers one thing completely: how plugins are **shared** — the
two ways a plugin can exist, the naming and keyword conventions that make a
plugin discoverable, how to publish one, and how `tw plugin` works end to end.

For writing a plugin (the hooks and routes), see [Plugins](./plugins.md) and
the [plugin guide](./guide-plugins.md). This document is about the other half:
getting a plugin from one project to another.

---

## Two kinds of plugin

A plugin is one of these, and `tw.config.ts` does not care which:

| Kind | Where it lives | How you get it |
|------|----------------|----------------|
| **Local** | `plugins/<name>.ts` in your project | you write it, or `tw plugin create <name>` |
| **Package** | an npm package in `node_modules` | `tw plugin install <package>` |

Both are listed the same way:

```ts
// tw.config.ts
export default {
  plugins: [
    "hit-counter",                 // a local file: plugins/hit-counter.ts
    "tw-plugin-analytics",         // an npm package
    { name: "@acme/tw-plugin-reports", options: { region: "in" } },  // with options
  ],
};
```

### Resolution order

For each entry, TW tries these in order, so **every existing project keeps
working unchanged**:

1. an explicit path — `./tools/audit` (`.ts` and `index.ts` fallbacks apply)
2. a local file — `plugins/<name>.ts`
3. an npm package — resolved from the project's `node_modules`

So a bare name means "my local plugin" unless there is no local file, in which
case it is looked up as a package. Nothing about a plugin's behaviour changes
between the two kinds.

---

## The conventions

Naming is how the ecosystem stays navigable. Follow these and your plugin is
findable without anyone maintaining a list.

| Tier | Name | Who maintains it |
|------|------|------------------|
| **Official** | `@tw/plugin-*` | the TW team |
| **Community** | `tw-plugin-*` | anyone — this is the one to use |
| **Third-party** | `@your-scope/tw-plugin-*` | anyone, under your own scope |
| **Local** | any name, in `plugins/` | you, privately |

### The keyword is the registry

There is no central server to submit to. Discovery works the way Astro's
integrations library works: **every published plugin carries the `tw-plugin`
keyword in its `package.json`**, and tooling finds plugins by scanning npm for
that keyword.

```json
{
  "name": "tw-plugin-analytics",
  "version": "0.1.0",
  "keywords": ["tw-plugin", "tw-framework"],
  "peerDependencies": { "tw-framework": ">=2.0.0" }
}
```

A package without the keyword still loads if you list it — TW warns once:

```
Plugin package "tw-plugin-quiet" has no "tw-plugin" keyword in package.json —
it loads, but it will not appear in plugin search. Add the keyword to publish it.
```

---

## The CLI

```bash
# Local plugins (your project)
tw plugin list                # every plugins/ file and its enabled state
tw plugin create <name>       # scaffold plugins/<name>.ts and enable it
tw plugin add <name>          # enable a local file in tw.config.ts
tw plugin remove <name>       # disable it

# Shared plugins (npm packages)
tw plugin init <name>         # scaffold a publishable tw-plugin-<name> package
tw plugin search [term]       # find plugins on npm by the tw-plugin keyword
tw plugin install <package>   # install a package and enable it
tw plugin upgrade             # upgrade official plugins to their latest
tw plugin upgrade --all       # also community and third-party plugins
tw plugin upgrade --dry-run   # report only, change nothing
```

`tw plugin search` queries the npm registry directly:

```
  tw plugin search "rate"

    tw-plugin-rate-shield@1.2.0  4.1k/wk
      Per-IP rate limiting for TW, configured from tw.config.ts
    @tw/plugin-rate-report@0.3.0 [official]
      Summarises rate-limit hits for the admin dashboard
```

---

## Publishing a plugin

`tw plugin init` writes a package that is ready for npm:

```
tw-plugin-analytics/
├── package.json      name, the "tw-plugin" keyword, a tw-framework peer dep
├── src/index.ts      the plugin
├── README.md         install + usage
└── .gitignore
```

```ts
// src/index.ts
import type { TWPlugin } from "tw-framework/plugins";

const plugin: TWPlugin = {
  name: "analytics",
  version: "0.1.0",
  description: "Request analytics for TW",
  setup(api) {
    api.on("onRequest", (ctx) => { /* count it */ });
    api.registerRoute("GET", "/__analytics", () => ({ status: 200, json: {} }));
  },
};

export default plugin;
```

Then:

```bash
cd tw-plugin-analytics
npm publish              # once the name is free and you are logged in
```

Anyone can do this. There is no approval step — the `tw-plugin` keyword is the
only gate, and it is what puts your plugin in front of other developers.

---

## Installing a shared plugin

```bash
tw plugin install tw-plugin-analytics
```

That installs the package with your project's package manager and adds it to
`plugins` in `tw.config.ts`. Start the server with Bun:

```bash
tw serve
```

If you would rather do it by hand:

```bash
npm install tw-plugin-analytics
# then add "tw-plugin-analytics" to plugins in tw.config.ts
```

---

## How a package plugin runs

A published plugin is the same object as a local one — the only difference is
where the file lives. It loads as a TypeScript/JavaScript module at serve time,
so **run the server with Bun** (`tw serve`, or `tw adapter bun`).

The failure guarantees are unchanged: a plugin whose hook throws is disabled
with a logged warning and the request continues; a package that fails to import
is skipped; a plugin that is listed but missing is skipped. A broken plugin
never takes the site down.

---

## A worked example: @tw/plugin-sitemap

The first official plugin ships in this repo. It is a normal package plugin, and
it shows the whole shape end to end.

```bash
tw plugin install @tw/plugin-sitemap
```

```ts
// tw.config.ts
plugins: [
  { name: "@tw/plugin-sitemap", options: { siteUrl: "https://example.com" } },
],
```

It serves `GET /sitemap.xml` and `GET /robots.txt`, built by walking `home/`:

- `home/page.tw` -> `/`
- `home/about/page.tw` -> `/about`
- `home/(marketing)/pricing/page.tw` -> `/pricing` (a route group is not in the URL)
- `home/blog/[slug]/page.tw` -> skipped (dynamic), so list real URLs under `routes`
- `exclude: ["/admin/**"]` drops `/admin` and everything under it

Source: `packages/plugin-sitemap/`. Options are documented in its README.

`@tw/plugin-health` is the second official plugin and shows the other common
shape — an operational endpoint rather than a content one. It serves
`GET /health` (liveness, deliberately cheap) and `GET /readyz` (readiness, which
runs the checks you give it and answers **503** when one fails), so a load
balancer or an orchestrator knows when to send traffic.

```ts
plugins: [
  { name: "@tw/plugin-health", options: {
    checks: [{ name: "db", run: async () => { await db.ping(); } }],
  } },
],
```

Source: `packages/plugin-health/`.

## Keeping plugins current

`tw plugin upgrade` keeps the plugins a project depends on up to date.

```bash
tw plugin upgrade --dry-run
  @tw/plugin-sitemap   2.0.0 -> 2.1.0   update available
  @tw/plugin-health    2.0.0            up to date
  tw-plugin-legacy     skipped (not official (use --all))
```

**Official plugins are the default target**, because those are the ones that
track the framework — that is the practical reason to prefer them. `--all`
widens the command to community and third-party packages. A local plugin is a
project file and is never touched. With no `--dry-run`, the command installs the
new versions with your project's package manager.

A plugin that is not installed, or not on npm, is reported and skipped — the
command never fails the whole run over one entry.

## Official vs community

- **`@tw/plugin-*`** — maintained by the TW team, held to the same standards as
  the framework itself.
- **`tw-plugin-*`** — community plugins. Anyone can publish; quality is judged
  by the README, the version history and adoption.
- **`@your-scope/tw-plugin-*`** — for a plugin you own but do not want in the
  shared namespace.

Prefer the community prefix for anything you intend others to find.

---

## Quick reference

```bash
tw plugin init my-thing          # publishable package: tw-plugin-my-thing/
cd tw-plugin-my-thing && npm publish

tw plugin search my-thing        # find it on npm
tw plugin install tw-plugin-my-thing
```

```json
{ "keywords": ["tw-plugin", "tw-framework"], "peerDependencies": { "tw-framework": ">=2.0.0" } }
```

## Related

- [Plugins](./plugins.md) — the hook and route API
- [Guide: Plugins](./guide-plugins.md) — writing your first plugin
- [Configuration](./configuration.md) — the `plugins` field
- [Commands Reference](./commands-reference.md) — `tw plugin`
