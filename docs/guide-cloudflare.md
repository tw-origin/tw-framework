# TW Framework — Guide: Deploying to Cloudflare Pages

This guide covers one thing completely: putting a TW app on Cloudflare Pages — setup, headers, redirects and the deploy flow.

---

## What Cloudflare Pages Serves

The static build output (`.tw/`) on Cloudflare's global network — CDN in every region, free bandwidth on the standard tier.

---

## Setup

```bash
tw adapter cloudflare
```

Writes three files:

| File | Purpose |
|------|---------|
| `wrangler.toml` | build output directory for Pages (`pages_build_output_dir = ".tw"`) |
| `_headers` | immutable caching for hashed assets + security headers |
| `_redirects` | edge redirects (empty template — extend as needed) |

Then either:

- **Git integration (recommended)** — Workers & Pages → Create → Pages → Connect to Git. Set the build command to `tw build` and the output dir to `.tw` (or rely on `wrangler.toml`). Every push deploys.
- **Direct upload** — `tw build && npx wrangler pages deploy .tw`

## Redirects

One per line in `_redirects` — source, destination, status:

```
/old-path    /new-path    301
/blog/old    /blog/new    301
```

## Headers

`_headers` applies rules per path — the adapter sets immutable caching for `/assets/*` and `/js/*` and baseline security headers for everything:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

## Environment Variables

Pages → Settings → Environment variables. Available at build time (and to Functions, if you add any). The static output itself never contains secrets.

## Domains and HTTPS

Custom domains → Set up a custom domain. Cloudflare provisions TLS automatically. If the domain is already on Cloudflare DNS, the setup is one click.

## Deploy Previews

Every branch gets its own `.<project>.pages.dev` URL — test changes in isolation before merging.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails with "tw: command not found" | ensure `tw-framework` is in `dependencies` |
| Pages 404 after deploy | confirm the build output directory is `.tw` in the dashboard or `wrangler.toml` |
| `_headers` ignored | it must sit in the **output directory root** — the adapter's copy in the repo root is picked up because the build copies it; verify it exists in `.tw/` after a build, or copy it manually if your build differs |
| Old assets cached | hashed filenames change with content; verify the new deploy is live before invalidating anything |

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Choosing a Platform](./guide-deployment-choose.md)
- [Netlify](./guide-netlify.md) · [Vercel](./guide-vercel.md)
