# TW Framework — Guide: Deploying to Netlify

This guide covers one thing completely: putting a TW app on Netlify — setup, redirects, headers, and the deploy flow.

---

## What Netlify Serves

The static build output (`.tw/`): pages, pre-rendered content, assets and client chunks, served from Netlify's CDN.

---

## Setup

```bash
tw adapter netlify
```

Writes `netlify.toml`:

```toml
[build]
  command = "tw build"
  publish = ".tw"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/js/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

Then either:

- **Git integration (recommended)** — push the repo, add the site in Netlify from "Import from Git", pick the branch. Netlify reads `netlify.toml` and builds on every push.
- **CLI** — `npx netlify deploy --prod --dir .tw` (after `tw build`)

## Local Preview

```bash
npx netlify dev
```

Runs the build pipeline and serves the result locally, including the redirects and headers from `netlify.toml`.

## Redirects

Add permanent redirects to `netlify.toml`:

```toml
[[redirects]]
  from = "/old-path"
  to = "/new-path"
  status = 301
```

Netlify answers these at the edge — no round trip to the origin.

## Environment Variables

Site configuration → Environment variables. They exist for the build step; a static output never contains server secrets.

## Domains and HTTPS

Domain management → Add domain. TLS certificates are provisioned and renewed automatically.

## Deploy Previews

Netlify builds every pull request into a preview URL — verify the change before merging. The preview uses the same `netlify.toml`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "tw: command not found" in the build | `tw-framework` must be in `dependencies` so the build can run it |
| Deploy succeeds but pages 404 | check the deploy log for the publish directory — it must be `.tw` |
| Header rules not applied | headers live in `netlify.toml`, not `_headers`, when you use the TOML config |
| Old content after a fix | deploys are atomic per-URL; confirm the latest deploy finished |

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Choosing a Platform](./guide-deployment-choose.md)
- [Vercel](./guide-vercel.md) · [Cloudflare](./guide-cloudflare.md)
