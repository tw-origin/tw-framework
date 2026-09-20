# TW Framework — Configuration

This document covers one thing completely: project configuration — `tw.config.ts`, environment variables and `.env`.

---

## tw.config.ts

At the project root, beside `home/`:

```ts
// tw.config.ts
export default {
  port: 3000,
  redirects: {
    "/old-path": "/new-path",
  },
  headers: {
    "/assets/**": {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  },
};
```

Loaded by `tw dev` and `tw serve` at startup. Comments and TypeScript types are allowed — it is a real `.ts` file.

---

## Fields

| Field | Purpose | Used by |
|-------|---------|---------|
| `port` | default port when no flag/env override | dev, serve |
| `redirects` | permanent path redirects, applied before routing | dev, serve |
| `headers` | response headers per path pattern | dev, serve |
| `source` | source directory (default `home/`) | build, dev |
| `build` | build options — `sourcemap`, target settings | build |
| `plugins` | plugin names (or `{ name, options }` entries) that run with `tw serve` | serve |
| `security` | `{ headers: "standard" \| "strict" \| "dev" \| "off" }` — security headers on every response. `tw serve` defaults to `standard`, `tw dev` to `dev`; `off` disables | dev, serve |
| `rateLimit` | `{ max, windowMs }` — server-level requests-per-window limit. Over the limit, responses are `429` with a `Retry-After` header | serve |

### redirects

```ts
export default {
  redirects: {
    "/blog/old-slug": "/blog/new-slug",
    "/shop": "/store",
  },
};
```

Redirects are matched before route resolution — visitors and crawlers are forwarded with `301`. The query string is preserved (`/old?tab=2` → `/new?tab=2`) unless the target URL has its own query.

### rateLimit

```ts
export default {
  rateLimit: { max: 100, windowMs: 60_000 }, // 100 requests per minute per IP
};
```

Counters are per-IP, in memory. The first request after a window expires starts a new count. When the limit is exceeded, `tw serve` answers `429 Too Many Requests` with a `Retry-After` header instead of running the route.


### headers

```ts
export default {
  headers: {
    "/assets/**": {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    "/**": {
      "X-Frame-Options": "DENY",
    },
  },
};
```

### build

```ts
export default {
  build: {
    sourcemap: "linked",     // none | linked | inline | external
    plugins: [],
  },
};
```

---

## Port Resolution — The Full Precedence

```
--port flag   >   PORT environment variable   >   tw.config.ts port   >   default
```

Default: `3000` for `tw dev`, `8000` for `tw serve`.

`PORT` sits above the config file so platforms that inject it (Docker, Railway, Render, Heroku) always win. If your server starts on the wrong port, check for a stray `PORT` in the environment before anything else.

---

## Environment Variables — .env

A `.env` file at the project root is loaded by `tw dev` and `tw serve` at startup:

```bash
# .env
JWT_SECRET=a-long-random-secret
DATABASE_URL=postgres://user:pass@host/db
PAYMENT_API_KEY=pk_live_...
```

Read them in server code only:

```twm
fn post(request) {
  const key = process.env.PAYMENT_API_KEY
  if (!key) {
    return { status: 500, json: { error: "Server misconfigured" } }
  }
  // ...
}
```

Rules:

- `.env` belongs in `.gitignore` — commit a `.env.example` with the keys and no values
- Environment variables are server-side. They are never exposed to pages or client chunks (the server boundary — [Client Modules](./client-modules.md))
- `.twm` routes and `lib/` code are the only places that read them

---

## tsconfig.json

A typical project keeps a `tsconfig.json` for editor support and `tw check`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["bun-types"]
  },
  "include": ["home", "components", "lib", "style"]
}
```

`tw check` runs the type check across your project — see [Commands Reference](./commands-reference.md).

---

## package.json Scripts

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tw dev",
    "build": "tw build",
    "start": "tw serve",
    "test": "tw test",
    "check": "tw check"
  }
}
```

---

## What Is NOT Configured in tw.config.ts

| Concern | Where it lives |
|---------|----------------|
| Routes | the file system — `home/` directory ([Project Structure](./project-tree.md)) |
| Middleware rules | `middleware.twm` ([Middleware](./middleware.md)) |
| Page titles and render modes | `page { }` in each file ([Page Config](./syntax-page-config.md)) |
| Styles | imports in pages and layouts ([Styling Guide](./styling-guide.md)) |
| Deployment platform | `tw adapter` / `tw ship` outputs ([Deployment Adapters](./deployment-adapters.md)) |

The file system is the configuration — `tw.config.ts` only holds what has no natural home in the tree.

---

## Common Mistakes

### Editing tw.config.ts while the server runs

Config reloads on restart. Stop and start `tw serve` / `tw dev` after changing it.

### Setting the port only in the config on a PaaS

Platforms inject `PORT` and it outranks the config — that is intended. Set the platform's port variable, not the file.

### Committing .env

Secrets in git history are leaked secrets. Keep `.env` ignored; rotate anything that was ever committed.

---

## Quick Reference

```ts
// tw.config.ts
export default {
  port: 3000,
  redirects: { "/old": "/new" },
  headers: { "/assets/**": { "Cache-Control": "immutable" } },
  build: { sourcemap: "linked", plugins: [] },
};
```

## Related

- [Commands Reference](./commands-reference.md)
- [Server Features](./server-features.md) — port precedence in production
- [Setup Guide](./setup-guide.md)
