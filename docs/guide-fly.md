# TW Framework — Guide: Deploying to Fly.io

This guide covers one thing completely: running the full TW server on Fly.io machines.

---

## What Fly Runs

The complete server as a container, deployed to one or more regions, with automatic start/stop of machines.

## Setup

```bash
tw adapter docker      # generates the Dockerfile (the image fly deploys)
tw adapter fly         # generates fly.toml
```

`fly.toml` listens on `internal_port = 8000`, matching the container default:

```toml
app = "tw-app"
primary_region = "bom"

[http_service]
  internal_port = 8000
  force_https = true
```

Deploy:

```bash
fly launch     # first time — picks the app name and region
fly deploy
```

## Regions

Set `primary_region` to the region closest to your users (the generated default is `bom` — Mumbai). Add regions and let Fly spread machines for lower latency.

## Environment Variables

```bash
fly secrets set JWT_SECRET=a-long-random-value
```

Secrets reach the running container — set everything the `.twm` routes read.

## Scaling

`auto_stop_machines` / `auto_start_machines` (both on in the generated config) park idle machines and wake them on traffic. `fly scale count 2` runs more machines.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Dockerfile not found" | run and commit `tw adapter docker` first |
| Deployed app unreachable | `internal_port` must match the container port (8000) |
| Crash on boot | `fly logs` — usually a missing secret |

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Choosing a Platform](./guide-deployment-choose.md)
- [Railway](./guide-railway.md) · [AWS](./guide-aws.md)
