# TW Framework — Guide: Deploying to Railway

This guide covers one thing completely: running the full TW server on Railway.

---

## What Railway Runs

The complete server — `render ssr` pages, `.twm` API routes, middleware — as a container. Railway injects `PORT` and the production server honours it automatically.

## Setup

```bash
tw adapter docker      # generates the Dockerfile (railway deploys it)
tw adapter railway     # generates railway.toml
```

`railway.toml`:

```toml
[build]
  builder = "DOCKERFILE"
  dockerfilePath = "Dockerfile"

[deploy]
  startCommand = "tw serve"
  healthcheckPath = "/"
```

Then either:

- **Dashboard** — New Project → Deploy from GitHub repo → Railway reads the config
- **CLI** — `railway up`

Every push to the connected branch redeploys.

## Environment Variables

Service → Variables. Set `JWT_SECRET` and everything the `.twm` routes read — they reach the running container. `.env` is for local development; Railway's variables replace it in production.

## Domains

Settings → Networking → Generate Domain (free `*.up.railway.app`), or add a custom domain — TLS is automatic.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails — Dockerfile missing | run `tw adapter docker` first and commit it |
| Container crash-loops | check Deployments logs — usually a missing variable |
| Health check fails | the app must answer `/` with 200; verify `PORT` is not overridden to a busy port |

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Choosing a Platform](./guide-deployment-choose.md)
- [Render](./guide-render.md) · [Fly](./guide-fly.md)
