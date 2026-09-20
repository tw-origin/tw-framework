# TW Framework — Tips: Deployment

This is a quick-fire collection of practical deployment tips. Each links to the full document.

---

## Generate, Commit, Forget

```bash
tw adapter <platform>     # plain-text config files
git add -A && git push    # done — the platform takes over
```

The files are meant to be committed; every push redeploys. [Deployment Adapters](./deployment-adapters.md)

## Match the Adapter to the Output

- Static output (`render static` / pre-rendered) → netlify, cloudflare, github-pages, firebase, vercel, nginx, caddy, aws-s3
- Full server (`.twm` APIs, middleware) → docker, railway, fly, render (docker service), bun

Choosing a static adapter for an API app is the #1 deployment mistake. [Choosing a Platform](./guide-deployment-choose.md)

## PORT Is the Contract

Every generated server honours `PORT`. Platforms inject it; the app obeys. If the port is wrong, check for a stray `PORT` before anything else. [Server Features](./server-features.md)

## The .tw Directory Is a Dot-Directory

External hosts that point directly at the build output must allow dot-directories — the adapters handle this; a hand-rolled config might not. [Build Output](./build-output.md)

## Pre-Deploy Gate

```bash
tw check && tw test && tw build
```

The same three commands your CI runs. A green local run is a green deploy. [Testing and CI](./guide-testing-ci.md)

## Secrets Live on the Platform

`.env` is for your machine. On every platform, set the same variables in the service settings — production scope. A static output never contains them; a running server reads them at request time. [Environments](./guide-environments.md)

## Smoke Test After Every Deploy

```bash
curl -sI https://mysite.com/ | head -3
curl -s https://mysite.com/api/health
curl -s -o /dev/null -w "%{http_code}" https://mysite.com/private    # expect 401
```

Three requests: the site, the API, the gate. [Server Features](./server-features.md)

## Immutable Headers Come Free — Keep Them

The generated configs set `Cache-Control: immutable` for `/assets/*` and `/js/*` on every platform. Do not delete these lines — they are why repeat visits are fast. [Production CSS](./production-css.md)

## Redirects Are Part of the Deploy

URL changes ship in the same commit as the pages they affect — 301, platform config. [SEO](./guide-seo.md)

## Rollback = Redeploy the Old Commit

The build is deterministic from source. Pin the platform to the previous commit and redeploy — no partial states.
