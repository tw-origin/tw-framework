# TW Framework — Guide: Deploying to Render

This guide covers one thing completely: running a TW app on Render — a static site service, or the full server as a Docker service.

---

## What Render Runs

| Service type | Serves | Defined by |
|--------------|--------|------------|
| Static Site | `.tw/` output on Render's CDN | the generated `render.yaml` |
| Web Service (Docker) | the full TW server | `tw adapter docker` + `render.yaml` |

---

## Setup — Static

```bash
tw adapter render
```

Writes `render.yaml`:

```yaml
services:
  - type: web
    name: tw-app
    runtime: static
    buildCommand: npm install && npx tw build
    staticPublishPath: .tw
    headers:
      - path: /assets/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
```

Commit it, then in the Render dashboard: **New → Blueprint**, select the repo. Render reads the blueprint and creates the service. Every push to the branch redeploys.

## Setup — Full Server

Uncomment the docker service in `render.yaml` (the generated file includes it commented) after generating the container files:

```bash
tw adapter docker
```

```yaml
  - type: web
    name: tw-app-full
    runtime: docker
    dockerCommand: tw serve
```

Render injects `PORT` — the server honours it. Set the health check path to `/`.

## Environment Variables

Render dashboard → Service → Environment. Set secrets per service and per environment (production/preview). For the full server these reach the running process — set `JWT_SECRET` and every secret the `.twm` routes read.

## Preview Deployments

Every pull request gets a preview URL with the blueprint applied — free on static sites.

## Domains and HTTPS

Service → Settings → Custom Domains. TLS is automatic with Let's Encrypt, renewed by Render.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails with "tw: command not found" | `tw-framework` missing from `dependencies` |
| Static site serves old content | check that the deploy finished and the publish path is `.tw` |
| Docker service crash-loops | check logs — usually a missing environment variable at boot |
| Wrong port | Render expects the app to listen on `PORT`; the server does — verify nothing overrides it |

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Choosing a Platform](./guide-deployment-choose.md)
- [DigitalOcean](./guide-digitalocean.md) · [Railway](./guide-railway.md)
