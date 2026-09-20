# TW Framework — Commands Reference

Every CLI command, flag, and troubleshooting guide. After reading this, you will know exactly what command to run and what to do if something goes wrong.

---

## Quick Start

```bash
tw create my-app     # Create project
cd my-app
bun install          # Install dependencies
tw dev               # Start dev server
tw build             # Build for production
tw serve             # Serve production build
tw check             # Type check
tw ship              # Build + deploy
```

---

## 1. `tw create` — Create New Project

### Basic usage

```bash
tw create <name>
```

Creates a new TW Framework project with the default template.

### With template

```bash
tw create <name> --template <template>
```

### Available templates

| Template | Description | Files generated |
|----------|-------------|-----------------|
| `default` | Full example with layout, pages, API, middleware | All special files + blog/[slug] + api/route |
| `minimal` | Bare minimum — one page | home/layout.tw + home/page.tw + style/global.tss |
| `blog` | Blog with dynamic routes | home/layout.tw + home/page.tw + blog/[slug]/page.tw + api |
| `dashboard` | Dashboard with sidebar and settings | home/layout.tw + home/page.tw + settings/page.tw |

### Examples

```bash
tw create my-blog --template blog
tw create company-site
tw create admin-panel --template dashboard
tw create simple-page --template minimal
```

### What it generates (default template)

```
my-app/
├── home/
│   ├── layout.tw
│   ├── page.tw
│   ├── loading.tw
│   ├── error.tw
│   ├── not-found.tw
│   ├── about/
│   │   └── page.tw
│   ├── blog/
│   │   └── [slug]/
│   │       └── page.tw
│   └── api/
│       └── route.twm
├── components/
│   └── Header.tw
├── style/
│   ├── global.tss
│   └── home.tss
├── lib/
│   └── utils.ts
├── public/
├── middleware.twm
├── tw.config.ts
├── package.json
├── tsconfig.json
├── .gitignore
├── vercel.json
└── README.md
```

### Flags

| Flag | Description |
|------|-------------|
| `--template <name>` | Use a specific template |
| `--help` | Show help |

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `mkdir: cannot create directory` | Directory already exists. Use a different name or delete the existing one. |
| `Permission denied` | Check write permissions in the current directory. |
| `tw: command not found` | Use `npx tw-framework create` instead, or install globally: `npm i -g tw-framework` |

---

## 2. `tw dev` — Start Dev Server

### Basic usage

```bash
tw dev
```

Starts the development server with HMR, error overlay, and file watching.

### Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--port <number>` | Port to run on | 3000 |
| `--host <name>` | Hostname to bind | localhost |
| `--no-hmr` | Disable Hot Module Replacement | (HMR enabled by default) |
| `--no-overlay` | Disable error overlay | (overlay enabled by default) |
| `--https` | Enable HTTPS | (HTTP by default) |
| `--open` | Auto-open browser | (disabled by default) |

### Examples

```bash
tw dev --port 3001           # Run on port 3001
tw dev --host 0.0.0.0        # Allow external connections
tw dev --no-hmr              # Disable HMR (full reload on every change)
tw dev --https               # HTTPS mode (for testing secure cookies, etc.)
tw dev --open                # Auto-open browser to http://localhost:3000
```

### What happens on startup

```
  TW Dev Server
  → http://localhost:3000

  Routes:
  /              → home/page.tw
  /about         → home/about/page.tw
  /blog/:slug    → home/blog/[slug]/page.tw
  /api           → home/api/route.twm

  Watching for changes...
  Ready in 234ms
```

### Dev server features

| Feature | What it does |
|---------|-------------|
| HMR | Saves a file → browser updates instantly, state preserved |
| Error overlay | Compile errors show as overlay in browser |
| Fast refresh | Components re-render without losing state |
| Route table | Shows all routes on startup |
| File watching | New/deleted routes auto-detected |
| Source maps | Errors point to original source, not compiled output |

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `Port 3000 already in use` | Use `--port 3001` or kill process: `lsof -i :3000` then `kill <PID>` |
| `Cannot find module 'tw-framework'` | Run `bun install` or `npm install` first |
| Changes not reflecting | Check if file is in a watched directory (home/, components/, style/) |
| HMR not working | Try `--no-hmr` for full reload, or restart server |
| Error overlay stuck | Refresh browser (Ctrl+Shift+R) |
| `tw: command not found` | Use `npx tw dev` instead |
| Blank page | Check browser console, verify home/page.tw exists and is valid |
| Slow startup | Large projects — enable incremental compilation in config |

---

## 3. `tw build` — Build for Production

### Basic usage

```bash
tw build
```

Compiles all files and produces optimized output in `.tw/`.

### Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--minify` | Minify output (HTML, CSS, JS) | true |
| `--no-minify` | Disable minification | false |
| `--sourcemap` | Generate source maps | true |
| `--no-sourcemap` | Disable source maps | false |
| `--analyze` | Show bundle analysis | false |
| `--output <dir>` | Output directory | .tw |
| `--target <env>` | Build target (browser/node) | browser |

### Examples

```bash
tw build                     # Standard build
tw build --no-minify         # Debug build (readable output)
tw build --analyze           # Show bundle size breakdown
tw build --output ./dist     # Custom output directory
```

### What it does

1. Scans route tree
2. Compiles every `.tw` file
3. Compiles every `.tss` file
4. Processes `.twm` API routes
5. Bundles JS with code splitting
6. Minifies all output
7. Copies `public/` assets
8. Generates route manifest
9. Writes to `.tw/`

### Build output

```
.tw/
├── output/
│   ├── index.html
│   ├── about/index.html
│   ├── blog/[slug]/index.html
│   ├── _assets/
│   │   ├── css/global.css
│   │   ├── js/main.js
│   │   └── js/chunks/
│   └── manifest.json
├── dist/
└── cache/
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `Build failed — N errors` | Run `tw check` to see all errors, fix them, rebuild |
| `Cannot write to .tw/` | `mkdir -p .tw && chmod -R 755 .tw/` |
| Build is slow | Enable `incremental: true` in config, check for large imports |
| Output is too large | Enable `splitting: true` and `treeshake: true` in config |
| `tsc` errors | Run `tw check` and fix TypeScript errors |
| Styles missing in production | Check if `.tss` files are imported in `.tw` files |

---

## 4. `tw serve` — Serve Production Build

### Basic usage

```bash
tw serve
```

Serves the production build from `.tw/`.

### Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--port <number>` | Port to serve on | 8000 |
| `--host <name>` | Hostname to bind | 0.0.0.0 |
| `--compression <type>` | Compression (gzip/brotli/none) | brotli |

### Examples

```bash
tw serve                    # Serve on port 8000
tw serve --port 80          # Serve on port 80
tw serve --compression gzip # Use gzip instead of brotli
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `No build found` | Run `tw build` first |
| `Port 8000 already in use` | Use `--port 8001` |
| `404 on all routes` | Check if `.tw/` has files, run `tw build` again |

---

## 5. `tw check` — Type Check

### Basic usage

```bash
tw check
```

Runs `tsc --strict` on the project. Reports all TypeScript errors.

### What it does

1. Runs TypeScript compiler in strict mode
2. Reports all type errors with file and line numbers
3. Exits with code 0 (no errors) or 1 (errors found)

### Example output (no errors)

```
  Checking TypeScript...
  ✓ No type errors found.

  Checked 678 files in 2.3s
```

### Example output (with errors)

```
  Checking TypeScript...
  ✗ 3 type errors found.

  home/page.tw:15:5
  error TS2322: Type 'string' is not assignable to type 'number'.

  components/Header.tw:8:3
  error TS2304: Cannot find name 'user'.

  lib/api.ts:22:10
  error TS2345: Argument of type 'any' is not assignable to parameter of type 'string'.

  Fix these errors and run "tw check" again.
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `Cannot find type definition for 'bun-types'` | `bun add -d @types/bun` or `npm i -d @types/bun` |
| `Cannot find module 'tw-framework'` | Run `bun install` or `npm install` |
| Errors in generated files | Add them to `exclude` in tsconfig.json |

---

## 6. `tw ship` — Build + Deploy

### Basic usage

```bash
tw ship
```

Builds the project and deploys it.

### What it does

1. Runs `tw check` (type check)
2. Runs `tw build` (production build)
3. Deploys to configured platform (Vercel, Netlify, or custom)

### Flags

| Flag | Description |
|------|-------------|
| `--platform <name>` | Deploy platform (vercel/netlify/custom) |
| `--no-check` | Skip type check |
| `--dry-run` | Build but do not deploy |

### Examples

```bash
tw ship                       # Build + deploy (auto-detect platform)
tw ship --platform vercel     # Deploy to Vercel
tw ship --platform netlify    # Deploy to Netlify
tw ship --dry-run             # Build only, do not deploy
tw ship --no-check            # Skip type check (not recommended)
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `Deployment failed` | Check platform credentials (VERCEL_TOKEN, NETLIFY_AUTH_TOKEN) |
| `Type check failed` | Fix errors with `tw check`, or use `--no-check` (not recommended) |
| `Build failed` | Fix build errors with `tw build` |
| `No platform configured` | Add `vercel.json` or `netlify.toml` to project root |

---

## 7. `tw adapter` — Generate Deployment Adapters

### Basic usage

```bash
tw adapter node           # zero-dependency Node static server
tw adapter bun            # full TW server on Bun
tw adapter docker         # Dockerfiles + compose
tw adapter vercel         # vercel.json
tw adapter netlify         # netlify.toml
tw adapter cloudflare     # wrangler.toml + _headers + _redirects
tw adapter aws            # S3 + CloudFront deploy script
tw adapter digitalocean   # .do/app.yaml
tw adapter render         # render.yaml
tw adapter railway        # railway.toml
tw adapter fly            # fly.toml
tw adapter github-pages   # Actions deploy workflow + .nojekyll
tw adapter firebase       # firebase.json
tw adapter nginx          # nginx.conf
tw adapter caddy          # Caddyfile
tw adapter list           # everything available
```

### What it does

Writes the files needed to run your built app on a specific platform into the project:

| Adapter | Files generated | Runs with |
|---------|-----------------|-----------|
| `node` | `server.mjs` — zero-dependency static server | `node server.mjs` (Node 18+) |
| `bun` | `server.ts` — the full TW server (pages + APIs + middleware) | `bun server.ts` |
| `docker` | `Dockerfile`, `Dockerfile.static`, `docker-compose.yml`, `.dockerignore` | `docker build` |
| `vercel` | `vercel.json` wired to the TW build | git push / Vercel |
| `netlify` | `netlify.toml` with immutable asset headers | git push / Netlify |
| `cloudflare` | `wrangler.toml`, `_headers`, `_redirects` | `wrangler pages deploy` / git push |
| `aws` | `deploy-s3.sh`, `AWS-DEPLOY.md` | `BUCKET=b bash deploy-s3.sh` |
| `digitalocean` | `.do/app.yaml` App Platform spec | `doctl apps create` |
| `render` | `render.yaml` blueprint | Render blueprint |
| `railway` | `railway.toml` container config | `railway up` |
| `fly` | `fly.toml` machine config | `fly deploy` |
| `github-pages` | `.github/workflows/deploy.yml`, `.nojekyll` | git push |
| `firebase` | `firebase.json` hosting config | `firebase deploy` |
| `nginx` | `nginx.conf` server block | your nginx |
| `caddy` | `Caddyfile` | `caddy run` |

### Examples

```bash
tw build
tw adapter node
PORT=3000 node server.mjs
```

```bash
tw build
tw adapter docker
docker build -t my-app .
docker run -p 3000:3000 -e PORT=3000 my-app
```

### Troubleshooting

- **"Run `tw build` first"** — adapters serve the `.tw/` output; build before generating/running
- **Wrong port at runtime** — the generated servers honour `PORT` (`--port`-style flags come from `tw serve`, not the adapters)
- Full guide: [Deployment Adapters](./deployment-adapters.md)

---

## 8. `tw plugin` — Manage Project Plugins

### Basic usage

```bash
tw plugin list           # plugins/ files + enabled state
tw plugin create <name>  # scaffold plugins/<name>.ts + enable it
tw plugin add <name>     # enable a plugin in tw.config.ts
tw plugin remove <name>  # disable a plugin in tw.config.ts
```

### What it does

Manages the `plugins/` directory and the `plugins: [...]` list in `tw.config.ts` — the list is the authority: a listed plugin runs with `tw serve`, an unlisted one does not. `tw plugin create` writes a working scaffold with `onRequest`/`onResponse` hooks and registers it.

Full plugin system — hooks, routes, failure guarantees: [Plugins](./plugins.md).

---

## Command Summary Table

| Command | Purpose | When to use |
|---------|---------|-------------|
| `tw create` | Create new project | Starting a new project |
| `tw dev` | Start dev server | During development |
| `tw build` | Build for production | Before deploying |
| `tw serve` | Serve production build | Testing production locally |
| `tw check` | Type check | Before commit / CI |
| `tw ship` | Build + deploy | Releasing to production |
| `tw adapter` | Generate platform adapters | Deploying to node/bun/docker/vercel |
| `tw plugin` | Manage plugins | Adding or removing project plugins |
| `tw test` | Run the test suite | After changes, in CI |

---

## Using with npm/npx (if tw is not installed globally)

All commands work with `npx` (create runs anywhere; inside a project with `tw-framework` installed, plain `npx tw <command>` uses the local bin):

```bash
npx tw-framework create my-app
npx tw dev
npx tw build
npx tw serve
npx tw check
npx tw ship
npx tw adapter docker
npx tw test
```

Or add to `package.json` scripts:

```json
{
  "scripts": {
    "dev": "tw dev",
    "build": "tw build",
    "start": "tw serve",
    "check": "tw check",
    "ship": "tw ship"
  }
}
```

Then use:
```bash
npm run dev
npm run build
npm start
npm run check
npm run ship
```

---

## Environment-specific notes

### Bun (recommended)
```bash
bun run dev
bun run build
```

### Node.js (fallback)
```bash
node --loader tw-framework/loader dev
# or
npx tw dev
```

### Docker
```bash
docker build -t my-app .
docker run -p 8000:8000 my-app
```

### CI/CD (GitHub Actions)
```yaml
- name: Install
  run: bun install

- name: Check
  run: npx tw check

- name: Build
  run: npx tw build

- name: Deploy
  run: npx tw ship --platform vercel
```


## 9. `tw lsp` — Language Server

Starts the TW language server for `.tw` files. It speaks JSON-RPC over stdio — editors and IDE plugins launch it as a language server binary.

### Basic usage

```bash
tw lsp
```

### What it provides

| Capability | What you get |
|-----------|--------------|
| diagnostics | errors and warnings for the open file, the same checks as the compiler |
| completions | tag names, attribute names, state fields, imports |
| hover | symbol information where the cursor rests |

The diagnostics use the same TW error codes as `tw build` — what the editor shows is what the build enforces. See [LSP](./lsp.md) for the full protocol behaviour.
