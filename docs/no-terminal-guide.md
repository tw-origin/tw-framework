# TW Framework — No-Terminal Guide

Not everyone has terminal access. Maybe you are on a shared hosting plan, a cPanel environment, or you simply prefer working with files directly. This guide explains how to use TW Framework without running a single terminal command.

**Everything added in TW 2.1 works this way too.** The new components
(`Head`, `Script`, `Form`) need no install at all — the compiler replaces the
tag, so you import the specifier and it just works. The new server APIs
(`clientIp`, `geolocation`, `cache`, `redirect`, …) come from the `"tw"`
specifier, which the framework resolves for you. There is nothing extra to
download and no command to run.

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
    "tw-framework": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "^1.1.0"
  }
}
```

**`tw.config.ts`:**
```typescript
import type { TwConfigInput } from "tw-framework";

export default {
  name: "my-app",
  version: "0.1.0",
  dev: { port: 3000, host: "localhost", hmr: true },
  build: { target: "browser", minify: true, sourcemap: true, splitting: true },
  server: { port: 8000, host: "0.0.0.0", compression: "brotli" },
  css: { engine: "tss", autoprefixer: true },
  redirects: [], rewrites: [], headers: [], middleware: [], plugins: []
} satisfies TwConfigInput;
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

### Add social meta tags
Create `home/pricing/page.tw` and add a `Head` block (Step 5b):
```tw
import Head from "@tw/Head"

page { title "Pricing" render static }

Head { title "Pricing" description "Simple plans" ogImage "/pricing-og.png" }
```

### Add a form
Add a `Form` block (Step 5b). It submits correctly without JavaScript, and the
runtime upgrades it when JavaScript is available:
```tw
import Form from "@tw/Form"

Form { action "/subscribe" method "post" }
  div { input { name "email" type "email" required "true" } }
  div { button "Subscribe" }
```

### Add a third-party script
```tw
import Script from "@tw/Script"

Script { src "/chat-widget.js" strategy "lazyOnload" }
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

## Step 5b: The TW 2.1 APIs, Without a Terminal

Everything below is created the same way as any other file: add it in the
GitHub editor (or upload it over FTP) and push. No install, no command.

### The three components need zero setup

Create a page and import the specifier. The compiler turns the tag into plain
HTML at build time — there is no package to add to `package.json` and nothing
lands in `node_modules`.

**`home/contact/page.tw`:**
```tw
import Head from "@tw/Head"
import Script from "@tw/Script"
import Form from "@tw/Form"

page { title "Contact" render static }

Head {
  title "Contact us"
  description "Get in touch"
  ogImage "/og.png"
  twitterCard "summary_large_image"
  canonical "https://example.com/contact"
}

Script { src "/analytics.js" strategy "lazyOnload" }

Form { action "/subscribe" method "post" }
  div { p "Your email" }
  div { input { name "email" type "email" required "true" } }
  div { button "Send" }
```

That is the whole file. It builds to a page with the meta tags, the script and
a real `<form>` that works even with JavaScript turned off.

**Script strategies you can write:** `beforeInteractive`, `afterInteractive`,
`lazyOnload`, `worker`, `idle`. Add `sri "sha384-..."` for subresource
integrity, or `nonce "..."` for a Content-Security-Policy.

### Server APIs come from `"tw"`

In an API route (`route.twm`), import what you need from `"tw"`. The framework
resolves it — there is no path to get wrong.

**`home/api/whoami/route.twm`:**
```tw
import { clientIp, geolocation, userAgent, cache } from "tw"

fn get(request) {
  const ip = clientIp(request)
  const geo = geolocation(request)
  const ua = userAgent(request)

  return {
    status: 200,
    json: {
      ip: ip.ip,
      source: ip.source,
      city: geo.city,
      country: geo.country,
      flag: geo.flag,
      mobile: ua.isMobile,
    },
  }
}
```

What you can pull from `"tw"`:

| Import | What it gives you |
|---|---|
| `clientIp(request)` | the visitor's address **with provenance** — `ip`, `version`, `trusted`, `source`, `isPrivate` |
| `geolocation(request)` | `city`, `country`, `flag`, `timezone`, `isEU`, `distanceTo()` |
| `userAgent(request)` | parsed — `browser`, `os`, `device`, `isMobile`, `isBot` |
| `env` | typed environment access — `env.require()`, `env.int()`, `env.bool()`, `env.schema({...})` |
| `deadline()` | the request time budget, with an `abortSignal` |
| `cache(name)` | a scoped cache with tags — `get`/`set`/`invalidateTag` |
| `cached(fn)` | memoize a function, with stale-while-revalidate |
| `draftMode(request)` | preview mode |
| `redirect(to, opts)` | a 307/308 redirect, `preserveQuery` included |
| `forbidden()`, `unauthorized()` | a 403 / a 401 with the right challenge header |
| `TWRequest`, `TWResponse` | wrappers — `req.ip()`, `TWResponse.json()` |

> `clientIp` understands **seven** proxy header families — `cf-connecting-ip`,
> `true-client-ip`, `fly-client-ip`, `x-vercel-forwarded-for`, `x-real-ip`,
> `x-forwarded-for` and RFC 7239 `Forwarded`. On shared hosting behind
> Cloudflare or cPanel, the address is read correctly without configuration.

### Reading and changing the URL

In a page, the navigation hooks come from `"@tw/runtime"`:

```tw
import { usePathname, useSearchParams, useParams } from "@tw/runtime"

page { title "Blog" render ssr }

div {
  p "You are on: " + usePathname()
  p "Post: " + useParams().slug
}
```

`useSearchParams()` can **change** the URL, not only read it:

```ts
const params = useSearchParams()
params.update({ page: 2, sort: "latest" })
await params.commit()      // one navigation, not two
```

### Caching an expensive page

`cache(name)` is scoped, so one page's entries never collide with another's:

```ts
import { cache } from "tw"

const posts = cache("posts")
let list = await posts.get("all")
if (!list) {
  list = await loadPosts()
  await posts.set("all", list, { tags: ["posts"], revalidate: "5m" })
}
```

To drop it later from anywhere: `await posts.invalidateTag("posts")`.

### A social card image, with no image library

`@tw/og` renders an SVG — nothing to install, works on any host:

**`home/api/og/route.twm`:**
```tw
import { imageResponse } from "@tw/og"

fn get(request) {
  return imageResponse({
    title: "TW Framework",
    eyebrow: "tw framework",
    badge: "v2.1",
  })
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
| Using the 2.1 components | **Nothing** — they need no install | Import the specifier and push |
| Using the 2.1 server APIs | **Nothing** — they resolve from `"tw"` | Import from `"tw"` in a `route.twm` |

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
- [Builtin Components](./builtin-components.md) — Head, Script, Form in full
- [Request Context](./request-context.md) — clientIp, geolocation, userAgent
- [Response Helpers](./response-helpers.md) — redirect, forbidden, unauthorized
- [Cache](./cache.md) — cache(), cached(), draftMode
- [Navigation Hooks](./navigation-hooks.md) — usePathname, useSearchParams
- [Client Bundles](./client-bundles.md) — what actually reaches the browser
