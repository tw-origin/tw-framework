# TW Framework — Getting Started

This document covers one thing completely: going from an empty machine to a deployed TW Framework site — twice. Once with a terminal, once without one. Every command in this document works with the published `tw-framework` package.

---

## What You Need

| Path | Required | Recommended |
|------|----------|-------------|
| Terminal | Node.js 18+ | Bun 1.0+ |
| No terminal | A browser and a Git host or hosting panel | — |

`tw create`, `tw build`, `tw test`, `tw check`, `tw ship` and `tw adapter` run on Node.js 18+. `tw dev` and `tw serve` use the Bun runtime. If Bun is not installed, build with Node and serve with the Node adapter (shown below).

Install Bun (optional, recommended):

```bash
curl -fsSL https://bun.sh/install | bash
bun --version    # 1.0 or newer
```

---

## Part 1 — With a Terminal

### Step 1: Create the Project

```bash
npx create-tw-framework@latest my-app
cd my-app
npm run dev
```

`create-tw-framework` scaffolds the project, initializes a git repository and installs dependencies in one command. Skip either with `--skip-install` / `--disable-git`. (`npx tw-framework create my-app` is the same tool without the extra package; `bunx`, `yarn` and `pnpm create tw-app` work too.)

Templates:

```bash
npx create-tw-framework@latest my-app --template minimal     # bare minimum
npx create-tw-framework@latest my-app --template blog        # dynamic routes
npx create-tw-framework@latest my-app --template dashboard   # sidebar layout
npx create-tw-framework@latest my-app --template default     # full example
```

To use the `tw` command directly, install once globally:

```bash
npm i -g tw-framework
tw create my-app
```

### Step 2: Understand the Structure

Routing is file-system based — a folder inside `home/` is a route.

```
my-app/
├── home/
│   ├── layout.tw              # wraps every page
│   ├── page.tw                # the / route
│   ├── about/page.tw          # /about
│   ├── blog/[slug]/page.tw    # /blog/hello — dynamic route
│   ├── api/users/route.twm    # /api/users — API route
│   ├── not-found.tw           # 404 page
│   ├── error.tw               # error boundary
│   └── loading.tw             # loading state
├── components/Header.tw       # reusable components
├── style/global.tss           # global styles
├── lib/utils.ts               # shared code
├── middleware.twm             # request middleware
├── plugins/                   # project plugins
├── tests/api.test.ts          # test suite
├── tw.config.ts               # project configuration
└── package.json
```

### Step 3: Write Code

A page in one syntax — frontmatter, state, markup and events together in `home/page.tw` (the `layout.tw` provides the `html`/`body` shell):

```tw
page {
  title "Counter"
  render ssr
}

state { count = 0 }

div.hero {
  h1 "Welcome to TW"
  p "Count: {count}"
  button.btn on:click "count = count + 1" {
    "Add"
  }
}
```

Styles live in `.tss` files. `style/global.tss` applies everywhere; each page can carry its own. The compiler emits route-split, content-hashed CSS automatically.

An API route in `home/api/users/route.twm`:

```
fn get(request) {
  return { status: 200, json: { users: ["Kanishk", "Aslam"] } }
}

fn post(request) {
  return { status: 201, json: { ok: true } }
}
```

Every handler returns the same response envelope: `{ status, json | body | html | text, headers }`.

Pages choose a render mode in their frontmatter — `static`, `ssr`, `island` or `edge`. `static` pre-renders at build time; the others render per request.

### Step 4: Develop

```bash
tw dev                  # http://localhost:3000
tw dev --port 3001     # different port
```

The dev server compiles on demand and hot-reloads — save a file, the browser updates. No restart needed.

### Step 5: Check Quality

```bash
tw test                 # runs tests/ suite on Bun and Node
tw check                # diagnostics: config, routes, imports
```

### Step 6: Build

```bash
tw build
```

Output lands in `.tw/` — compiled pages, client chunks, hydration runtime, route-split CSS. For a stage-by-stage report:

```bash
tw build --profile
```

### Step 7: Serve and Deploy

Local production server:

```bash
tw serve                # Bun runtime, port 8000 by default
tw serve --port 8080
```

To deploy, generate platform configs:

```bash
tw ship                 # Vercel, Netlify, Cloudflare, Docker
```

Or pick a single adapter:

```bash
tw adapter node      && node server.mjs     # zero-dependency Node server (static output)
tw adapter bun       && bun server.ts       # full server — pages + API routes
tw adapter docker                              # Dockerfiles + compose
tw adapter vercel                              # vercel.json
```

Also available: `netlify`, `cloudflare`, `aws`, `digitalocean`, `render`, `fly`, `railway`, `github-pages`, `nginx`, `caddy`, `firebase`.

---

## Part 2 — Without a Terminal

TW Framework needs no local commands. The routing is file-system based and the hosting platform builds for you.

### Step 1: Create the Files by Hand

In a Git repository (GitHub, GitLab — created from the browser), create this structure:

```
my-app/
├── home/
│   ├── layout.tw
│   └── page.tw
├── style/global.tss
├── tw.config.ts
├── package.json
└── .gitignore
```

`package.json`:

```json
{
  "name": "my-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tw dev",
    "build": "tw build",
    "start": "tw serve",
    "check": "tw check",
    "ship": "tw ship"
  },
  "dependencies": {
    "tw-framework": "^1.0.0"
  }
}
```

`home/layout.tw`:

```tw
import "@./style/global.tss"

html {
  head { title "My App" }
  body {
    slot { }
  }
}
```

`home/page.tw`:

```tw
page {
  title "Home"
  render static
}

div.hero {
  h1 "Hello from TW"
  p "This page was created without a terminal."
}
```

`style/global.tss`:

```
.hero {
  padding 48;
  text-align center;
}
```

`tw.config.ts`:

```typescript
import type { TwConfig } from "tw-framework";

export default {
  name: "my-app",
  version: "0.1.0",
  dev: { port: 3000, host: "localhost", hmr: true },
};
```

### Step 2: Push

Commit the files and push. No build step runs locally — the platform does it.

### Step 3: Connect a Host

- **Vercel / Netlify / Cloudflare Pages**: import the repository, set the build command to `npm install && npx tw build`, set the output directory to `.tw`, deploy. Every push rebuilds automatically.
- **GitHub Pages (static)**: add a workflow file at `.github/workflows/deploy.yml` that runs `npm install`, then `bunx tw build` (or `npx tw build` on a Node runner), then publishes `.tw/`. Static hosting serves pre-rendered pages and assets only — `.twm` API routes do not run there.
- **Shared hosting (cPanel / FTP)**: upload a `.tw/` build output together with the Node adapter's `server.mjs`, then start it as a Node app from the panel.

### Step 4: Keep Editing

Open any `.tw` file in the Git host's web editor, edit, commit. The platform rebuilds on every push. That is the entire loop.

---

## Where to Go Next

- [Setup Guide](docs/setup-guide.md) — full walkthrough, editors, troubleshooting
- [Commands Reference](docs/commands-reference.md) — every command and flag
- [No-Terminal Guide](docs/no-terminal-guide.md) — the no-terminal path in depth
- [Framework Overview](docs/framework-overview.md) — the full documentation index (177 documents)
- [Deployment Guides](docs/guide-vercel.md) — one guide per platform
