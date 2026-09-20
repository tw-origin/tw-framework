# TW Framework

Full-stack web framework for building sites and apps with `.tw` pages, `.twm` server modules and `.tss` styles — compiled by the TW Compiler, hydrated by TW VDOM 1, served anywhere.

## Install

```bash
bun add -d tw-framework
```

The CLI runs on Node 18+ for `tw create`, `tw build`, `tw test` and `tw adapter`. `tw dev` and `tw serve` use the Bun runtime.

## Quickstart

```bash
# scaffold an app
npx create-tw-framework@latest my-site
cd my-site

# develop (http://localhost:3000)
bunx tw-framework dev

# production build -> .tw/
bunx tw-framework build

# production server (Bun)
bunx tw-framework serve
```

## Commands

| Command | What it does |
| --- | --- |
| `tw create <name>` | Scaffold a new app (pages, API routes, layout, config) |
| `tw dev` | Dev server with on-demand compilation |
| `tw build` | Production build to `.tw/` (pages, client chunks, route-split CSS) |
| `tw serve` | Production server (Bun) — pages, `.twm` APIs, middleware |
| `tw test` | Run the app test suite (Bun and Node) |
| `tw check` | Diagnostics for the current project |
| `tw ship` | Generate deployment configs (Vercel, Netlify, Cloudflare, Docker) |
| `tw adapter <name>` | Deployment adapters: `node`, `bun`, `docker`, `vercel` |
| `tw plugin` | Manage project plugins |

## Deployment adapters

```bash
# zero-dependency Node server for the build output (static sites)
bunx tw-framework adapter node && node server.mjs

# full server (pages + APIs) on Bun
bunx tw-framework adapter bun && bun server.ts

# Docker (full + static Dockerfiles, compose file)
bunx tw-framework adapter docker

# Vercel
bunx tw-framework adapter vercel
```

## Learn more

- [Full documentation](https://github.com/tw-origin/tw-framework/blob/main/docs/framework-overview.md) — 183 guides and references
- [Setup guide](https://github.com/tw-origin/tw-framework/blob/main/docs/setup-guide.md) — templates, editors, first app
- [Deployment guides](https://github.com/tw-origin/tw-framework/blob/main/docs/guide-vercel.md) — Vercel, Netlify, Docker, AWS and more
- [Repository](https://github.com/tw-origin/tw-framework)

MIT licensed.
