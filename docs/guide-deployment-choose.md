# TW Framework — Guide: Choosing a Deployment Platform

This guide covers one thing completely: picking the right hosting for a TW app — what each platform class does well, and the one command that gets you there.

---

## The First Decision — Static or Full Server

Ask one question: **does the app serve `.twm` API routes or middleware-protected pages at runtime?**

| Answer | You need | Platforms |
|--------|----------|-----------|
| No — pages are static or pre-rendered (`render static`, `render island`) | Static hosting of the `.tw/` output | Netlify, Cloudflare Pages, GitHub Pages, Firebase, S3+CloudFront, any web server |
| Yes — `render ssr` pages, `.twm` APIs, middleware auth | A running TW server | Vercel (with config), Railway, Render, Fly, DigitalOcean, Docker anywhere, VPS with Bun |
| Mixed — static pages + a few APIs | Full server (simplest), or static + separate API host | Full server recommended |

`tw serve` runs the complete app — pages, APIs, middleware — in one process. The static adapters serve the pre-built `.tw/` directory.

---

## The Second Decision — Who Runs It

| You want | Platform class | Cost profile |
|----------|----------------|-------------|
| Push to git, everything happens by itself | PaaS / build platforms (Netlify, Vercel, Cloudflare, Render, Railway, DigitalOcean Apps) | free tier → per-usage |
| One container, anywhere | Docker (Fly, ECS, App Runner, your own host) | per-container |
| A file on a disk you control | Self-hosted (VPS + nginx/Caddy, or `server.mjs`) | flat VPS price |
| The absolute cheapest for static | GitHub Pages / Cloudflare Pages / S3 | free |

---

## Platform Cheat Sheet

| Platform | Adapter | Serves | Best for |
|----------|---------|--------|----------|
| Vercel | `tw adapter vercel` | static output | zero-ops push-to-deploy |
| Netlify | `tw adapter netlify` | static output | zero-ops push-to-deploy |
| Cloudflare Pages | `tw adapter cloudflare` | static output | global CDN, free bandwidth |
| GitHub Pages | `tw adapter github-pages` | static output | project sites, docs |
| Firebase Hosting | `tw adapter firebase` | static output | apps already on Firebase |
| AWS | `tw adapter aws` | S3 static / containers | existing AWS setup |
| DigitalOcean | `tw adapter digitalocean` | static + containers | simple PaaS, predictable price |
| Render | `tw adapter render` | static + containers | PaaS with a free static tier |
| Railway | `tw adapter railway` | containers (full server) | full server, minimal setup |
| Fly | `tw adapter fly` | containers (full server) | full server near your users |
| Docker | `tw adapter docker` | full + static images | anywhere containers run |
| Self-hosted | `tw adapter node` / `nginx` / `caddy` | static or full | a VPS you control |

Per-platform walkthroughs: [Vercel](./guide-vercel.md), [Netlify](./guide-netlify.md), [Cloudflare](./guide-cloudflare.md), [AWS](./guide-aws.md), [DigitalOcean](./guide-digitalocean.md), [Render](./guide-render.md), [Railway](./guide-railway.md), [Fly](./guide-fly.md), [GitHub Pages](./guide-github-pages.md), [Firebase](./guide-firebase.md), [self-hosted](./guide-self-hosted.md).

---

## The Workflow on Every Platform

```
1. tw build                    # produces .tw/
2. tw adapter <platform>       # generates the platform's config files
3. commit + push               # the platform builds/serves from the repo
```

The generated files are plain text — commit them. From then on, every push redeploys. `tw ship` runs build + deploy in one step and auto-detects the platform from the config files present ([Deployment Adapters](./deployment-adapters.md)).

---

## Ports, Domains and HTTPS

- Every generated server honours `PORT` — platforms inject it, the app obeys
- PaaS platforms handle TLS certificates and custom domains in their dashboard
- Self-hosted: use Caddy for automatic HTTPS, or nginx behind a TLS terminator

See [Server Features](./server-features.md) for the caching and protection the server layer provides.

---

## Quick Decision Walk

```
Static only?
├─ Want push-to-deploy + CDN?      → Cloudflare Pages / Netlify / Vercel
├─ GitHub project site?            → GitHub Pages
├─ Already on Firebase?           → Firebase Hosting
└─ Have AWS?                       → S3 + CloudFront (aws adapter)

Need the full server?
├─ Want push-to-deploy?            → Railway / Render / DigitalOcean
├─ Want containers anywhere?       → Docker / Fly / ECS / App Runner
└─ Have a VPS?                     → tw serve, or server.mjs + nginx
```

## Related

- [Deployment Adapters](./deployment-adapters.md) — every adapter, every file
- [Build Output](./build-output.md)
- [Server Features](./server-features.md)
