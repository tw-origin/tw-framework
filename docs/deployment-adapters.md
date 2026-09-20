# TW Framework — Deployment Adapters

This document covers one thing completely: deploying — `tw adapter` for platform-specific servers and configs, and `tw ship` for build-and-deploy orchestration.

---

## tw adapter

```bash
tw adapter node           # zero-dependency Node server for the static build
tw adapter bun            # full TW server on Bun
tw adapter docker         # Dockerfiles + compose file
tw adapter vercel         # vercel.json
tw adapter netlify        # netlify.toml
tw adapter cloudflare     # wrangler.toml + _headers + _redirects
tw adapter aws            # S3 + CloudFront deploy script
tw adapter digitalocean   # .do/app.yaml
tw adapter render         # render.yaml
tw adapter railway        # railway.toml
tw adapter fly            # fly.toml
tw adapter github-pages   # deploy workflow + .nojekyll
tw adapter firebase       # firebase.json
tw adapter nginx          # nginx.conf server block
tw adapter caddy          # Caddyfile
tw adapter list           # everything available
```

Each adapter writes its files into the project, ready to commit and run. Run `tw build` first — adapters serve the built output.

---

## node — Zero-Dependency Static Server

```bash
tw build
tw adapter node
node server.mjs
```

Generates `server.mjs` — a single-file Node 18+ server with no npm dependencies:

- Clean URLs
- ETag / `304 Not Modified`
- Gzip compression
- Range requests (video/audio seeking)
- SPA fallback routing
- Immutable caching for hashed assets
- The security blocklist (source files and dotfiles answer 404)

Use it for static and pre-rendered output on any host with Node — a VPS, a container platform, shared hosting with Node support.

For the **full** server (`.twm` API routes, middleware, SSR per request), use the Bun adapter or run `tw serve`.

---

## bun — Full TW Server

```bash
tw build
tw adapter bun
bun server.ts
```

Generates `server.ts` — the complete production server on the Bun runtime: pages, `.twm` APIs, middleware, everything `tw serve` runs, as a long-lived process. One host with Bun, one command.

The server honours the `PORT` environment variable, so PaaS platforms manage it directly.

---

## docker — Containers

```bash
tw build
tw adapter docker
```

Generates a full container setup:

| File | Purpose |
|------|---------|
| `Dockerfile` | full-runtime image — Bun inside, `tw serve` on boot: pages + APIs + middleware |
| `Dockerfile.static` | static image — `node:20-alpine` running the zero-dependency Node server |
| `docker-compose.yml` | one-command local run of either variant |
| `.dockerignore` | lean build context |

Build and run:

```bash
docker build -t my-app .
docker run -p 3000:3000 -e PORT=3000 my-app
```

The images honour `PORT` — the same container runs on any platform.

### Static variant

```bash
docker build -f Dockerfile.static -t my-app-static .
docker run -p 8080:8080 -e PORT=8080 my-app-static
```

---

## vercel

```bash
tw adapter vercel
```

Writes `vercel.json` wired to the TW build output — `tw build` as the build command, `.tw/` as the output, Bun as the install command:

```json
{
  "buildCommand": "tw build",
  "devCommand": "tw dev",
  "installCommand": "bun install",
  "outputDirectory": ".tw",
  "framework": null
}
```

Commit it, connect the repo on Vercel, and every push builds and deploys.

---

## tw ship — Build and Deploy in One Step

```bash
tw ship
```

Builds for production, then detects the deployment target from the project's config files:

| Detected file | Target |
|---------------|--------|
| `vercel.json` | Vercel |
| `netlify.toml` | Netlify |
| `wrangler.toml` | Cloudflare |
| `Dockerfile` | Docker |

With no platform config present, `tw ship` prints the adapter hints — which `tw adapter` command to run for each platform — so the first deploy is one command away. See [Commands Reference](./commands-reference.md).

---

## Choosing a Target

| You have | Use |
|----------|-----|
| Any host with Node | `tw adapter node` — zero dependencies |
| A host with Bun | `tw adapter bun` (full server) or plain `tw serve` |
| Docker / Kubernetes | `tw adapter docker` |
| Vercel / Netlify / Cloudflare / Firebase | `tw adapter vercel` / `netlify` / `cloudflare` / `firebase` |
| AWS | `tw adapter aws` (S3 static) or docker on App Runner / ECS |
| DigitalOcean / Render / Railway / Fly | `tw adapter digitalocean` / `render` / `railway` / `fly` |
| GitHub Pages | `tw adapter github-pages` |
| Your own server | `tw adapter nginx` / `caddy`, or `tw adapter node` |

Per-platform walkthroughs: [choose a platform](./guide-deployment-choose.md), then the guide for yours — [Vercel](./guide-vercel.md), [Netlify](./guide-netlify.md), [Cloudflare](./guide-cloudflare.md), [AWS](./guide-aws.md), [DigitalOcean](./guide-digitalocean.md), [Render](./guide-render.md), [Railway](./guide-railway.md), [Fly](./guide-fly.md), [GitHub Pages](./guide-github-pages.md), [Firebase](./guide-firebase.md), [self-hosted](./guide-self-hosted.md).

---

## Deploy Checklist

```
□ tw build succeeds with zero errors
□ tw test passes
□ tw serve smoke-tested locally (pages + APIs + middleware)
□ PORT behaviour verified if the platform injects it
□ Secrets in the environment, not in the repo
□ Middleware rules cover private areas
```

---

## Quick Reference

```bash
tw adapter list
tw adapter node && node server.mjs
tw adapter bun && bun server.ts
tw adapter docker
tw adapter netlify
tw adapter cloudflare && npx wrangler pages deploy .tw
tw adapter aws && BUCKET=b bash deploy-s3.sh
tw adapter github-pages && git push
tw ship
```

## Related

- [Build Output](./build-output.md)
- [Server Features](./server-features.md)
- [Commands Reference](./commands-reference.md)
- [No-Terminal Guide](./no-terminal-guide.md) — deploying without a CLI
