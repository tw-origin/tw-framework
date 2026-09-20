# TW Framework — Edge Runtime

This document covers one thing completely: `createEdgeHandler`, `createCloudflareWorker`, and `createDenoHandler` — running TW sites on fetch-API edge platforms.

---

## EdgeConfig

```twm
import { createEdgeHandler } from "@tw/server"

const handler = createEdgeHandler({
  rootDir: ".",                     // app root (required)
  pagesDir: "home",                 // source pages (default "home")
  staticDir: "public",              // static assets
  cache: {
    maxAge: 3600,                   // seconds
    revalidate: 600,                // stale-while-revalidate window
  },
  region: "auto",
})
```

| Option | Default | Meaning |
|--------|---------|---------|
| `rootDir` | — | Application root directory |
| `pagesDir` | `"home"` | Where page source lives |
| `staticDir` | `"public"` | Static assets served from `/_static`-style paths |
| `cache.maxAge` | — | Cache-Control seconds for responses |
| `cache.revalidate` | — | Stale-while-revalidate window |
| `region` | — | Region hint for platforms that use one |

## The Handler Contract

`createEdgeHandler` returns a fetch-compatible function — EdgeRequest in, EdgeResponse out:

```twm
type EdgeRequest = {
  url: string
  method: string
  headers: Record<string, string>
  body?: ReadableStream<Uint8Array> | string
}

type EdgeResponse = {
  status: number
  headers: Record<string, string>
  body: ReadableStream<Uint8Array> | string
}
```

Only fetch-API primitives — no Node-specific APIs — so the same handler runs on any edge platform.

```twm
const response = await handler({
  url: "https://site.com/pricing",
  method: "GET",
  headers: { "user-agent": "test" },
})
```

## Platform Adapters

Cloudflare Workers export shape:

```twm
import { createCloudflareWorker } from "@tw/server"

export default createCloudflareWorker({
  rootDir: ".",
  cache: { maxAge: 3600 },
})
```

Deno Deploy:

```twm
import { createDenoHandler } from "@tw/server"

Deno.serve(createDenoHandler({ rootDir: "." }))
```

Both wrap the same edge handler and translate their platform's request/response types to the EdgeRequest/EdgeResponse contract.

## What the Edge Handler Serves

- Prebuilt static output (the `tw build` output directory)
- `public/` assets with cache headers from `EdgeConfig`
- Redirect/rewrite-free, header-safe responses

## Deploying

Build before bundling for the edge — the handler serves the build output:

```bash
tw build
```

then point the platform entry (worker script / Deno serve) at the handler with the same `rootDir`. The platform guide for each target is in the deployment guides (docs/deployment-adapters.md through docs/guide-self-hosted.md).
