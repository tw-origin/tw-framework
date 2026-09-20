# TW Framework — No-Terminal Guide

Not everyone has terminal access. Maybe you are on a shared hosting plan, a cPanel environment, or you simply prefer working with files directly. This guide explains how to use TW Framework without running a single terminal command.

---

## Who Is This For?

- Developers using shared hosting (Hostinger, GoDaddy, Bluehost)
- Developers using cPanel / FTP only
- Developers who want to deploy via Git push (no CLI)
- Developers using GitHub Pages, Cloudflare Pages, or Netlify Git integration
- Anyone who cannot install Bun or Node.js on their server

---

## How TW Framework Works Without Terminal

TW Framework's routing is file-system based. The compiler scans your `home/` directory and generates the route graph automatically. This means:

1. **You create files in the right places** — the routing is determined by directory structure
2. **Hosting platforms auto-build** — Vercel, Netlify, Cloudflare Pages all detect push and build automatically
3. **You never need to run commands manually** — Git push is the only action needed

---

## Step 1: Create Project Files Manually

Instead of `tw create`, create the files by hand.

### Minimum required files

Create this exact structure in your project folder:

```
my-app/
├── home/
│   ├── layout.tw
│   └── page.tw
├── style/
│   └── global.tss
├── tw.config.ts
├── package.json
└── .gitignore
```

### File contents

**`package.json`:**
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

**`tw.config.ts`:**
```typescript
import type { TwConfig } from "tw-framework";

export default {
  name: "my-app",
  version: "0.1.0",
  dev: { port: 3000, host: "localhost", hmr: true },
  build: { target: "browser", minify: true, sourcemap: true, splitting: true },
  server: { port: 8000, host: "0.0.0.0", compression: "brotli" },
  css: { engine: "tss", autoprefixer: true },
  router: {
    mode: "filesystem",
    baseDir: "home",
    pageExtensions: [".tw", ".twm"],
    renderModes: ["static", "ssr", "island", "edge"]
  },
  redirects: [], rewrites: [], headers: [], middleware: [], plugins: []
} satisfies TwConfig;
```

**`.gitignore`:**
```
node_modules/
.tw/
dist/
*.log
.env
.DS_Store
```

**`home/layout.tw`:**
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

**`home/page.tw`:**
```tw
page {
  title "My App"
  render static
}

div.container {
  h1 "Hello World"
  p "Built with TW Framework — no terminal needed!"
}
```

**`style/global.tss`:**
```tss
* { margin 0; padding 0; box-sizing border-box }
body { font-family system-ui, sans-serif; bg #0d1117; color #c9d1d9; line-height 1.6 }
.container { max-width 800px; margin 0 auto; padding 2rem }
```

---

## Step 2: Add More Pages

Just create directories with `page.tw` inside:

**About page (`home/about/page.tw`):**
```tw
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

**Blog post (`home/blog/[slug]/page.tw`):**
```tw
page {
  title "Blog Post"
  render static
}

article {
  h1 "My Blog Post"
  p "This is a blog post."
  a "Back" {
    href "/"
  }
}
```

**API route (`home/api/route.twm`):**
```twm
fn get(request) {
  return {
    status: 200,
    json: { ok: true, message: "Hello from API" }
  }
}
```

---

## Step 3: Deploy Without Terminal

### Option A: Vercel (Git Integration — No Terminal)

1. Push your project to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "Import Project" → select your GitHub repo
4. Vercel auto-detects `vercel.json` and builds automatically
5. Your site is live at `your-app.vercel.app`

**Required file:** `vercel.json` at project root:
```json
{
  "buildCommand": "npx tw build",
  "outputDirectory": ".tw",
  "installCommand": "bun install",
  "framework": null
}
```

If Bun is not available on Vercel, change `installCommand` to `npm install`.

### Option B: Netlify (Git Integration — No Terminal)

1. Push your project to GitHub
2. Go to [netlify.com](https://netlify.com) and sign in
3. Click "Add new site" → "Import from Git" → select your repo
4. Netlify auto-detects `netlify.toml` and builds

**Required file:** `netlify.toml` at project root:
```toml
[build]
  command = "npx tw build"
  publish = ".tw"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Option C: Cloudflare Pages (No Terminal)

1. Push to GitHub
2. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
3. "Create a project" → connect GitHub → select repo
4. Set build command: `npx tw build`
5. Set output directory: `.tw`

### Option D: GitHub Pages (Static Only)

For static-only sites (`render static` on all pages):

1. Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: npx tw build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./.tw
```

2. Push to GitHub — the action runs automatically
3. Enable GitHub Pages in repo settings → Pages → Source: gh-pages branch

### Option E: Shared Hosting (cPanel / FTP)

For shared hosting that supports Node.js:

1. Build locally: `tw build` (you need terminal once, or ask someone to build for you)
2. Upload `.tw/` contents to your hosting via FTP
3. Point your domain to the uploaded files

If your hosting does NOT support Node.js:
1. Build locally (or use a friend's machine / online IDE like Replit)
2. Upload the static `.tw/` folder contents via FTP to `public_html/`
3. Your site is live

### Option F: Replit / GitHub Codespaces (Browser-based Terminal)

If you have no local terminal but have a browser:

1. Go to [replit.com](https://replit.com) → create new Repl
2. Import your GitHub repo
3. Replit gives you a browser terminal — run:
   ```
   bun install
   npx tw dev
   ```
4. Your site is live at `your-repl.repl.co`

---

## Step 4: File Placement Cheat Sheet

Where to put each file (no commands needed):

| File | Location | Purpose |
|------|----------|---------|
| `layout.tw` | `home/layout.tw` | Root layout (wraps all pages) |
| `page.tw` | `home/page.tw` | Home page (/) |
| `page.tw` | `home/about/page.tw` | About page (/about) |
| `page.tw` | `home/blog/[slug]/page.tw` | Dynamic blog post (/blog/:slug) |
| `layout.tw` | `home/blog/layout.tw` | Blog section layout |
| `loading.tw` | `home/loading.tw` | Global loading skeleton |
| `error.tw` | `home/error.tw` | Global error boundary |
| `not-found.tw` | `home/not-found.tw` | 404 page |
| `route.twm` | `home/api/route.twm` | API endpoint (/api) |
| `route.twm` | `home/api/users/route.twm` | API endpoint (/api/users) |
| `middleware.twm` | `middleware.twm` (root) | Root middleware |
| `global.tss` | `style/global.tss` | Global styles |
| `home.tss` | `style/home.tss` | Home page styles |
| `Button.tw` | `components/Button.tw` | Reusable button component |
| `utils.ts` | `lib/utils.ts` | Utility functions |
| `logo.png` | `public/img/logo.png` | Static image |
| `tw.config.ts` | Project root | Framework config |
| `package.json` | Project root | Dependencies |
| `vercel.json` | Project root | Vercel deployment config |
| `netlify.toml` | Project root | Netlify deployment config |

---

## Step 5: Common Scenarios Without Terminal

### Add a new page
1. Create directory: `home/pricing/`
2. Create file: `home/pricing/page.tw`
3. Write content
4. Push to Git — hosting auto-rebuilds

### Add a new API endpoint
1. Create directory: `home/api/products/`
2. Create file: `home/api/products/route.twm`
3. Write API functions
4. Push to Git

### Add a new component
1. Create file: `components/Footer.tw`
2. Write component
3. Import in any page: `import Footer from "@./components/Footer.tw"`
4. Use: `Footer { }`

### Add a new style file
1. Create file: `style/pricing.tss`
2. Write styles
3. Import in page: `import "@./style/pricing.tss"`

### Add middleware
1. Create file: `middleware.twm` at project root (NOT inside home/)
2. Write rules
3. Push to Git

### Change the port
Edit `tw.config.ts`:
```typescript
dev: { port: 4000 }
```

### Add a 404 page
Create `home/not-found.tw`:
```tw
div.not-found {
  h1 "404"
  p "Page not found"
  a "Back home" { href "/" }
}
```

### Add an error page
Create `home/error.tw`:
```tw
div.error {
  h1 "Oops!"
  p "Something went wrong."
  a "Try again" { href "/" }
}
```

---

## Step 6: Git-based Workflow (No Terminal)

If you use GitHub's web interface:

1. Go to your repo on GitHub.com
2. Click "Add file" → "Create new file"
3. Type the path: `home/about/page.tw`
4. Write content in the editor
5. Click "Commit changes"
6. Your hosting platform (Vercel/Netlify/Cloudflare) auto-builds

This works for ALL file types — `.tw`, `.tss`, `.twm`, `.ts`.

---

## What You Cannot Do Without Terminal

| Task | Why | Workaround |
|------|-----|------------|
| Install dependencies | Requires `bun install` / `npm install` | Hosting platform does this automatically on push |
| Run dev server | Requires `tw dev` | Use Replit / Codespaces for browser-based dev |
| Type check | Requires `tw check` | Hosting platform runs check during build |
| Local testing | Requires running server | Use preview deployments on Vercel/Netlify |

---

## No-Terminal Deployment Summary

| Platform | Setup | Terminal needed? | Auto-build? |
|----------|-------|------------------|-------------|
| Vercel | Push to Git | No | Yes |
| Netlify | Push to Git | No | Yes |
| Cloudflare Pages | Push to Git | No | Yes |
| GitHub Pages | GitHub Action | No (action runs it) | Yes |
| Replit | Browser IDE | Browser-based | Yes |
| Shared hosting | FTP upload | Build once somewhere | No (static files) |

---

## Adding Adapter Files Without a Terminal

Deployment adapter files are plain text files — create them in the editor like any other:

| Platform | File to create | Content |
|----------|----------------|---------|
| Vercel | `vercel.json` | build command `tw build`, output `.tw/` |
| Netlify | `netlify.toml` | build command `tw build`, publish `.tw/` |
| Any Node host | `server.mjs` | generated by `tw adapter node` — a developer can generate it once and commit it |

Because the generated adapter files are committed to the repo, one developer (or CI) runs the CLI once and everyone else deploys by pushing.

## Related

- [Setup Guide](./setup-guide.md) — the same app, with the CLI
- [Deployment Adapters](./deployment-adapters.md) — what the generated files do
- [Project Structure](./project-tree.md)
