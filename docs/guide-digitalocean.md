# TW Framework — Guide: Deploying to DigitalOcean

This guide covers one thing completely: running a TW app on DigitalOcean App Platform — static output, or the full server in a container.

---

## What App Platform Runs

Two service types, same platform:

| Service | Serves | Created with |
|---------|--------|--------------|
| Static site | `.tw/` output on DO's CDN | the `.do/app.yaml` spec |
| Web service (docker) | the full TW server | `tw adapter docker` + the spec below |

---

## Setup — Static

```bash
tw adapter digitalocean
```

Writes `.do/app.yaml`:

```yaml
name: tw-app
static_sites:
  - name: web
    build_command: npm install && npx tw build
    output_dir: .tw
```

Commit it. Then either:

- **Control panel** — Apps → Create App → pick the repo and branch; the spec is picked up automatically
- **CLI** — `doctl apps create --spec .do/app.yaml`, then `doctl apps create-deployment <id>`

Every push to the branch redeploys.

## Setup — Full Server

Generate the container files and change the spec to a docker service:

```bash
tw adapter docker
```

```yaml
name: tw-app
services:
  - name: web
    dockerfile_path: Dockerfile
    instance_size_slug: basic-xxxs
    http_port: 8000
```

App Platform injects `PORT` — the container listens on it (default 8000). Set the health check to `/`.

## Environment Variables

App → Settings → App-Level Environment Variables. For the full server, set `JWT_SECRET` and friends here — they reach the container at runtime. The static path uses them only at build time.

## Domains and HTTPS

App → Settings → Domains → Add. TLS is provisioned automatically. `.app.ondigitalocean.app` subdomains are free.

## Costs

Static sites are free on App Platform. Web services start at the smallest instance size and scale up from there.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails with "tw: command not found" | `tw-framework` must be in `dependencies`; the spec installs before building |
| Static site 404s | confirm `output_dir: .tw` and that the build emitted it |
| Container won't start | check the runtime logs — usually a missing environment variable |
| Wrong port served | the spec's `http_port` must match the container's `PORT` (8000 default) |

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Choosing a Platform](./guide-deployment-choose.md)
- [Render](./guide-render.md) · [Railway](./guide-railway.md) — comparable platforms
