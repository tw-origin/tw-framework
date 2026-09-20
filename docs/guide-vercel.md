# TW Framework — Guide: Deploying to Vercel

This guide covers one thing completely: putting a TW app on Vercel — setup, config, environment variables, and what runs where.

---

## What Vercel Serves

The Vercel adapter serves the **static build output** (`.tw/`) on Vercel's CDN: static pages, pre-rendered island shells, assets and chunks. SSR-per-request pages, `.twm` API routes and middleware need a running server — for those, run the [Docker](./guide-railway.md)-style container platforms or the [Bun](./guide-self-hosted.md) server.

---

## Setup

```bash
tw adapter vercel
```

Writes `vercel.json`:

```json
{
  "buildCommand": "tw build",
  "devCommand": "tw dev",
  "installCommand": "bun install",
  "outputDirectory": ".tw",
  "framework": null
}
```

Commit it. Then either:

- **Git integration (recommended)** — push the repo to GitHub/GitLab/Bitbucket, click "Add New Project" on Vercel, import the repo. Vercel reads `vercel.json` and builds on every push.
- **CLI** — `npx vercel deploy --prod`

## Local Preview

```bash
npx vercel dev        # runs the Vercel build pipeline locally
```

## Environment Variables

Set in the Vercel dashboard (Project → Settings → Environment Variables) per environment (Production / Preview / Development). Values never appear in the built static output — they exist only for the build step.

## Domains and HTTPS

Project → Settings → Domains → add yours. TLS is automatic, including renewals. Vercel issues the certificate and serves HTTPS at the edge.

## Caching

Hashed assets (`/assets/*.css`, `/js/*.js`) are fingerprinted — Vercel's CDN serves them with long-lived caching. HTML is served fresh. The adapter's config keeps this working with zero tuning.

## Deploy Checklist

```
□ tw build passes locally with zero errors
□ tw test passes
□ vercel.json committed at the repo root
□ No .twm APIs on the deployed paths (or move to a container platform)
□ Environment variables set for the build
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails with "tw: command not found" | ensure `tw-framework` is in `dependencies`, the install command runs `bun install` |
| 404 on all pages | check the build log — did `tw build` emit `.tw/`? |
| Old version live | check that the latest commit built; deployments are immutable per-URL |
| Assets 404 after deploy | make sure `public/` files are committed — the build copies them into the output |

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Choosing a Platform](./guide-deployment-choose.md)
- [Netlify](./guide-netlify.md) — the same workflow on Netlify
