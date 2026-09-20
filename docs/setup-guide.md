# TW Framework — Complete Setup Guide

This guide takes you from zero to a running TW Framework application. No prior TW experience needed.

---

## Prerequisites

Before you start, make sure you have:

| Tool | Version | Why | Install |
|------|---------|-----|---------|
| **Bun (recommended)** | 1.0+ | Runtime and package manager | `curl -fsSL https://bun.sh/install \| bash` |
| **TypeScript** | 5.4+ | Type checking | `bun add -g typescript` or `npm i -g typescript` |
| **Node.js** | 18+ | Fallback runtime (if Bun unavailable) | [nodejs.org](https://nodejs.org) |
| **Git** | any | Version control | [git-scm.com](https://git-scm.com) |

Verify:
```bash
bun --version    # should be 1.0+
tsc --version    # should be 5.4+
git --version
```

---

## Step 1: Create a New Project

### Using the CLI (recommended)

```bash
npx tw-framework create my-app
cd my-app
```

### With a template

```bash
npx tw-framework create my-app --template minimal     # bare minimum
npx tw-framework create my-app --template blog        # blog with dynamic routes
npx tw-framework create my-app --template dashboard   # dashboard with sidebar
npx tw-framework create my-app --template default     # full example (default)
```

### Manual setup (without CLI)

If you cannot run `npx tw-framework create`, create the project manually:

```bash
mkdir my-app
cd my-app
```

Create these directories:
```bash
mkdir -p home/api/users
mkdir -p home/blog/[slug]
mkdir -p home/about
mkdir -p components
mkdir -p style
mkdir -p lib
mkdir -p public/img
```

---

## Step 2: Install Dependencies

```bash
bun install
```

If `bun install` fails (some environments), use:
```bash
npm install
```

### Manual package.json

If you did not use the CLI, create `package.json`:

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
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "^1.1.0"
  }
}
```

Then run `bun install` or `npm install`.

---

## Step 3: Configuration

### tw.config.ts

This is the main configuration file. Place it at the project root.

```typescript
import type { TwConfig } from "tw-framework";

export default {
  name: "my-app",
  version: "0.1.0",

  // Development server settings
  dev: {
    port: 3000,
    host: "localhost",
    hmr: true,           // Hot Module Replacement
    openBrowser: false,  // Set true to auto-open browser
  },

  // Build settings
  build: {
    target: "browser",
    minify: true,
    sourcemap: true,
    splitting: true,     // Code splitting for routes
  },

  // Production server settings
  server: {
    port: 8000,
    host: "0.0.0.0",
    compression: "brotli",
  },

  // CSS engine
  css: {
    engine: "tss",       // Use TSS (TW Style Sheets) — supports shorthands
    autoprefixer: true,
  },

  // Routing configuration
  router: {
    mode: "filesystem",  // File-based routing
    baseDir: "home",     // Root routing directory
    pageExtensions: [".tw", ".twm"],
    renderModes: ["static", "ssr", "island", "edge"],
  },

  // Redirects (optional)
  redirects: [
    { from: "/old-page", to: "/new-page", status: 301 },
  ],

  // Rewrites (optional)
  rewrites: [
    { from: "/api/v1/*", to: "/api/v2/*" },
  ],

  // Custom headers (optional)
  headers: [
    { path: "/secure/*", headers: { "X-Frame-Options": "DENY" } },
  ],

  // Middleware (optional)
  middleware: [],

  // Plugins (optional)
  plugins: [],
} satisfies TwConfig;
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": ".tw/dist",
    "types": ["bun-types"]
  },
  "include": ["home/**/*", "components/**/*", "lib/**/*", "tw.config.ts"],
  "exclude": ["node_modules", ".tw", "dist"]
}
```

### .gitignore

```
node_modules/
.tw/
dist/
*.log
.env
.env.local
.DS_Store
.vercel
.netlify
```

### vercel.json (for Vercel deployment)

```json
{
  "buildCommand": "npx tw build",
  "outputDirectory": ".tw",
  "installCommand": "bun install",
  "framework": null
}
```

---

## Step 4: Create Your First Page

### home/layout.tw (root layout)

```tw
import "@./style/global.tss"

html {
  head {
    meta charset "utf-8"
    meta name "viewport" content "width=device-width, initial-scale=1"
    title "{page.title}"
  }
  body {
    slot { }
  }
}
```

### home/page.tw (home page → /)

```tw
import Header from "@./components/Header.tw"
import "@./style/home.tss"

page {
  title "My First Page"
  render ssr
}

state {
  count = 0
  name = "World"
}

div.container {

  Header { }

  h1 "Hello {name}"

  p "You clicked {count} times"

  button.btn on:click "count++" {
    "Click me"
  }

  a.nav-link "About" {
    href "/about"
  }

}
```

### home/about/page.tw (about page → /about)

```tw
import "@./style/about.tss"

page {
  title "About"
  render static
}

div.container {

  h1 "About Us"
  p "This is the about page."

  a.nav-link "Back home" {
    href "/"
  }

}
```

### components/Header.tw

```tw
import "@./style/header.tss"

header.site-header {

  nav.nav {
    a.nav-link "Home" {
      href "/"
    }
    a.nav-link "About" {
      href "/about"
    }
  }

}
```

### style/global.tss

```tss
* { margin 0; padding 0; box-sizing border-box }
body { font-family system-ui, sans-serif; bg #0d1117; color #c9d1d9; line-height 1.6 }
a { color #58a6ff; text-decoration none }
a:hover { text-decoration underline }
```

### style/home.tss

```tss
.container { max-width 800px; margin 0 auto; padding 2rem }
.btn { p 0.5rem 1rem; bg #2563eb; color white; border none; br 4px; cursor pointer }
.btn:hover { bg #1d4ed8 }
.nav-link { color #58a6ff; d inline-block; m 0 0.5rem }
```

---

## Step 5: Run the Dev Server

```bash
npx tw dev
```

Output:
```
  TW Dev Server
  → http://localhost:3000

  Routes:
  /              → home/page.tw
  /about         → home/about/page.tw

  Watching for changes...
```

Open `http://localhost:3000` in your browser. You should see your page.

### Dev server features

| Feature | Description |
|---------|-------------|
| HMR | Hot Module Replacement — changes appear instantly without full reload |
| Error overlay | Compile errors show in browser overlay |
| Fast refresh | State is preserved on changes |
| File watching | Automatically detects new/changed/deleted files |
| Route table | Shows all detected routes on startup |

---

## Step 6: Build for Production

```bash
npx tw build
```

This produces optimized output in `.tw/`:
- Minified HTML
- Bundled CSS
- Code-split JS per route
- Source maps (if enabled)

### Build output structure

```
.tw/
├── output/
│   ├── index.html
│   ├── about/
│   │   └── index.html
│   ├── _assets/
│   │   ├── css/
│   │   ├── js/
│   │   └── img/
│   └── manifest.json
├── dist/
│   └── (TypeScript compiled output)
└── cache/
    └── (incremental build cache)
```

---

## Step 7: Serve Production Build

```bash
npx tw serve
```

Starts the production server on port 8000 (or whatever you configured).

---

## Step 8: Deploy

### Vercel

The `vercel.json` is already configured. Just:

```bash
npx tw ship
```

Or connect your Git repo to Vercel — it auto-detects the build command.

### Netlify

Create `netlify.toml`:

```toml
[build]
  command = "npx tw build"
  publish = ".tw"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Docker

The project includes a `Dockerfile`. Build and run:

```bash
docker build -t my-app .
docker run -p 8000:8000 my-app
```

### Manual / VPS

```bash
npx tw build
npx tw serve --port 80
```

Use a process manager like PM2 or systemd for production.

---

## Step 9: Type Check

```bash
npx tw check
```

Or directly:

```bash
tsc --strict
```

Zero errors means your TypeScript is clean.

---

## Project Structure After Setup

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
│   └── img/
├── middleware.twm
├── tw.config.ts
├── package.json
├── tsconfig.json
├── .gitignore
├── vercel.json
└── README.md
```

---

## Troubleshooting Setup

| Problem | Solution |
|---------|----------|
| `bun: command not found` | Install Bun: `curl -fsSL https://bun.sh/install \| bash` |
| `tw: command not found` | Run `bun install` first, then use `npx tw dev` |
| `Cannot find module 'tw-framework'` | Run `bun install` or `npm install` |
| Port 3000 already in use | Change port in `tw.config.ts`: `dev: { port: 3001 }` |
| `tsc` errors about bun-types | Install: `bun add -d @types/bun` |
| Blank page on localhost | Check if `home/page.tw` exists and has valid syntax |
| Styles not loading | Check if `.tss` file is imported via `import "@./style/file.tss"` |
| Route not found (404) | Ensure route is a directory with `page.tw` inside it |
| `npm install` fails with `workspace:*` | Use `bun install` instead, or use npm 7+ with workspaces |

---

## Environment Variables

Create a `.env` file at the project root:

```env
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/myapp

# Auth
JWT_SECRET=your-secret-key-here
TW_SESSION_SECRET=your-session-secret-here

# API Keys
STRIPE_SECRET_KEY=sk_test_xxx

# App
TW_APP_URL=http://localhost:3000
NODE_ENV=development
```

Access in your code:
```tw
// In .twm API routes:
fn get(request) {
  const apiKey = process.env.STRIPE_SECRET_KEY
  // ...
}
```

**IMPORTANT:** Never commit `.env` to Git. It is in `.gitignore` by default.

---

## Next Steps

1. Read **project-tree.md** to understand routing fully
2. Read **extensions-guide.md** to learn about file types
3. Read **syntax-guide.md** to learn the TW language
4. Read **styling-guide.md** to learn TSS
5. Start building pages!


## Runtime options

TW runs on **Bun** (recommended) or **Node.js 18+**.

```bash
# Bun (native TypeScript, fastest)
bun install && npx tw dev

# Node (no Bun needed — CLI ships as a prebuilt JS bundle)
npm install && node node_modules/tw-framework/dist/tw.mjs dev
```

---

## Environment Variables

Create a `.env` at the project root — `tw dev` and `tw serve` load it at startup:

```bash
JWT_SECRET=a-long-random-secret
DATABASE_URL=postgres://user:pass@host/db
```

Read them only in server code (`.twm` routes, `lib/`):

```twm
fn post(request) {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    return { status: 500, json: { error: "Server misconfigured" } }
  }
  // ...
}
```

Never import environment values into `.tw` pages — client bundles must not contain secrets. Keep `.env` in `.gitignore`.

## Ports

```
tw dev   →  http://localhost:3000
tw serve →  http://0.0.0.0:8000
```

Both honour `--port`, then the `PORT` environment variable, then the `tw.config.ts` port. Full precedence in [Configuration](./configuration.md).

## Setup Troubleshooting

| Symptom | Fix |
|---------|-----|
| `command not found: tw` | run through `npx tw ...`, or install the CLI globally |
| Port already in use | `tw dev --port 4000` — or stop the process holding the old port |
| Blank page on first run | check the dev console — a compile error overlays in the browser |
| Styles missing | the layout must import the stylesheet (`import "@./style/global.tss"`) |
| TW1007 on build | a page imports server-only code — move it to `lib/` or a `.twm` route |

## Next Steps

- [Syntax Overview](./syntax-guide.md) — then each feature's deep dive
- [Styling Overview](./styling-guide.md)
- [Commands Reference](./commands-reference.md)
- [Testing](./testing.md) — add a `tests/` suite to the app
