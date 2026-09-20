# TW Framework — Guide: Deploying to GitHub Pages

This guide covers one thing completely: publishing a static TW site on GitHub Pages with an Actions workflow.

---

## What GitHub Pages Serves

Static output only — pre-rendered pages, assets and chunks. `.twm` API routes do not run on GitHub Pages.

## Setup

```bash
tw adapter github-pages
```

Writes:

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | builds on every push to `main`, deploys `.tw/` to Pages |
| `.nojekyll` | stops GitHub from running Jekyll processing on the output |

Then in the repo: **Settings → Pages → Source: GitHub Actions**. Push — the workflow builds and deploys.

## The URL Shape Matters

GitHub Pages serves project sites under `/<repo-name>/` and user sites (`username.github.io`) from the root. TW builds with root-absolute asset paths (`/assets/...`), which resolve correctly when the site is at a domain root. Use one of:

- A user site repo (`username.github.io`) — serves from `/`
- A custom domain on the project site — serves from `/`

## Custom Domains

Settings → Pages → Custom domain. Add a `CNAME` file to the output if you want Pages to remember the domain across deploys:

```bash
echo "mysite.com" > public/CNAME   # tw build copies it into .tw/
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Workflow fails on `bunx tw build` | check `tw-framework` is in `dependencies` and committed |
| Site loads without styles | the site is served under `/<repo-name>/` — use a user site or custom domain |
| 404 on Pages | Settings → Pages → Source must be "GitHub Actions" |
| Old deploy live | check the Actions run finished; Pages deploys after the build job |

## Related

- [Deployment Adapters](./deployment-adapters.md)
- [Choosing a Platform](./guide-deployment-choose.md)
- [Cloudflare](./guide-cloudflare.md) — free CDN alternative for the same output
