# TW Framework — Guide: Environments

This guide covers one thing completely: running dev, staging and production — ports, variables, builds and what differs between them.

---

## The Three Environments

| | Development | Staging/Preview | Production |
|---|---|---|---|
| Command | `tw dev` | `tw build` + platform preview | `tw build` + `tw serve` / adapter |
| Port | 3000 (default) | platform-assigned | `PORT` or config |
| Env vars | `.env` | platform (preview scope) | platform (production scope) |
| Output | in-memory, on-demand | `.tw/` | `.tw/` |
| Minified | no | yes | yes |
| Caching | off/rebuilt | hashed | immutable |

---

## Development

```bash
tw dev
```

- Compiles on demand — only the pages you visit
- Unminified styles and chunks for debugging
- `.env` at the project root is loaded at startup

## Staging / Preview

Most platforms build every branch or PR into a preview URL:

- Netlify / Vercel / Cloudflare Pages — automatic deploy previews
- Render / Railway — preview environments
- Self-hosted — run the production build on a second port: `PORT=8080 tw serve`

Set preview-scope environment variables on the platform — the same names as production, safe values.

## Production

```bash
tw build
tw serve                     # full server
# or a generated adapter (node/docker/bun/...)
```

Environment variables come from the platform, per service, production scope. The static output never contains them; the running server reads them at request time.

## What Actually Differs

**Only three things** change between environments:

1. **Port** — dev defaults to 3000, production honours `PORT`/config
2. **Environment variables** — `.env` locally, platform settings in production
3. **The output** — compiled in dev, `.tw/` on disk in production

The code is the same. Any environment-specific behaviour reads from `process.env` on the server:

```twm
fn get(request) {
  const isProd = process.env.NODE_ENV == "production"
  return { status: 200, json: { mode: isProd ? "live" : "staging" } }
}
```

## Promotion Checklist — Staging to Production

```
□ tw check / tw test / tw build all green on the main branch
□ Environment variables set for the production service
□ Secrets rotated for production (never reuse staging secrets)
□ Smoke test: curl the home page, one API route, one private route (expect 401)
```

## Related

- [Configuration](./configuration.md) · [Server Features](./server-features.md)
- [Testing and CI](./guide-testing-ci.md) · [Deployment Adapters](./deployment-adapters.md)
