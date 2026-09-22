/** tw create -- scaffold a new TW project with the modern syntax and structure. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, "-");
}

export async function createCommand(): Promise<void> {
  const args = process.argv.slice(3);
  const name = args[0];

  if (!name) {
    console.error("Usage: tw create <name>");
    console.error("       tw create <name> --template minimal");
    process.exit(1);
  }

  // Parse template
  let template = "default";
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--template" && args[i + 1]) {
      template = args[i + 1];
    }
  }

  // Next-pattern flags
  const skipInstall = args.includes("--skip-install");
  const disableGit = args.includes("--disable-git");

  // SECURITY: the project name becomes a directory under the current working
  // directory -- it must be a single safe path segment, never a traversal
  // (`../x`, `a/../../b`, absolute paths, ...).
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes("..")) {
    console.error(`Invalid project name: "${name}"`);
    console.error("Use letters, digits, dashes, underscores or dots (single path segment).");
    process.exit(1);
  }

  const targetDir = join(process.cwd(), name);

  console.log(`\n  Creating TW project: ${name}\n`);

  // Create directory structure -- home/ based routing
  const dirs = [
    "",
    "home",
    "home/about",
    "home/blog",
    "home/api",
    "home/api/users",
    "components",
    "lib",
    "public",
    "public/css",
    "public/js",
    "public/img",
    "style",
    "plugins",
  ];

  for (const dir of dirs) {
    await mkdir(join(targetDir, dir), { recursive: true });
  }

  // Generate files based on template
  switch (template) {
    case "minimal":
      await createMinimalProject(targetDir, name);
      break;
    case "blog":
      await createBlogProject(targetDir, name);
      break;
    case "dashboard":
      await createDashboardProject(targetDir, name);
      break;
    default:
      await createDefaultProject(targetDir, name);
  }

  // Always generate these
  await createPackageJson(targetDir, name);
  await createTwConfig(targetDir, name);
  await createGitignore(targetDir);
  await createReadme(targetDir, name);
  await createVercelJson(targetDir);

  console.log(`\n  \u2713 Project created: ${name}`);

  // Git init (Next pattern) -- best effort, silent skip
  if (!disableGit) {
    try {
      const { spawnSync } = await import("node:child_process");
      const git = spawnSync("git", ["init"], { cwd: targetDir, stdio: "ignore" });
      if (git.status === 0) console.log("  \u2713 Initialized a git repository");
    } catch {
      /* git not available -- skip */
    }
  }

  // Auto-install (Next pattern) -- best effort, graceful on failure
  if (!skipInstall) {
    console.log("\n  Installing packages. This might take a couple of minutes.\n");
    try {
      const { spawnSync } = await import("node:child_process");
      const npm = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
        cwd: targetDir,
        stdio: "inherit",
      });
      if (npm.status !== 0) {
        console.log("\n  Install skipped -- run `npm install` inside the project.");
      }
    } catch {
      console.log("  npm not found -- run `npm install` inside the project.");
    }
  }

  console.log(`\n  Success! Created ${name} at ${targetDir}`);
  console.log("\n  Inside that directory, you can run several commands:\n");
  console.log("    npm run dev");
  console.log("      Starts the development server.\n");
  console.log("    npm run build");
  console.log("      Builds the app for production.\n");
  console.log("    npm start");
  console.log("      Runs the built app in production mode.\n");
  console.log("  We suggest that you begin by typing:\n");
  console.log(`    cd ${name}`);
  console.log("    npm run dev\n");
}

async function createPackageJson(dir: string, name: string): Promise<void> {
  const pkg = {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "tw dev",
      build: "tw build",
      start: "tw serve",
      check: "tw check",
      ship: "tw ship",
    },
    dependencies: {
      "tw-framework": "^1.0.0",
    },
    devDependencies: {
      typescript: "^5.4.0",
      "@types/bun": "^1.1.0",
    },
  };

  await writeFile(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  console.log("  \u2713 package.json");
}

async function createTwConfig(dir: string, name: string): Promise<void> {
  const config = `import type { TwConfig } from "tw-framework";

export default {
  name: "${name}",
  version: "0.1.0",

  dev: {
    port: 3000,
    host: "localhost",
    hmr: true,
    openBrowser: false,
  },

  build: {
    target: "browser",
    minify: true,
    sourcemap: true,
    splitting: true,
  },

  server: {
    port: 8000,
    host: "0.0.0.0",
    compression: "brotli",
  },

  css: {
    engine: "tss",
    autoprefixer: true,
  },

  router: {
    mode: "filesystem",
    baseDir: "home",
    pageExtensions: [".tw", ".twm"],
    renderModes: ["static", "ssr", "island", "edge"],
  },

  redirects: [],
  rewrites: [],
  headers: [],
  middleware: [],
  plugins: [],
} satisfies TwConfig;
`;

  await writeFile(join(dir, "tw.config.ts"), config);
  console.log("  \u2713 tw.config.ts");
}

async function createGitignore(dir: string): Promise<void> {
  const content = `node_modules/
.tw/
dist/
*.log
.env
.env.local
.DS_Store
.vercel
.netlify
`;

  await writeFile(join(dir, ".gitignore"), content);
  console.log("  \u2713 .gitignore");
}

async function createReadme(dir: string, name: string): Promise<void> {
  const content = `# ${name}

Built with TW Framework 1.0.0.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Build

\`\`\`bash
npx tw build
npx tw serve
\`\`\`

## Project Structure

\`\`\`
${name}/
\u251c\u2500\u2500 home/              # File-based routing (root)
\u2502   \u251c\u2500\u2500 layout.tw        # Root layout (wraps all pages)
\u2502   \u251c\u2500\u2500 page.tw          # Home page \u2192 /
\u2502   \u251c\u2500\u2500 loading.tw       # Loading UI
\u2502   \u251c\u2500\u2500 error.tw         # Error boundary
\u2502   \u251c\u2500\u2500 not-found.tw     # 404 page
\u2502   \u251c\u2500\u2500 about/
\u2502   \u2502   \u2514\u2500\u2500 page.tw      # \u2192 /about
\u2502   \u2514\u2500\u2500 blog/
\u2502       \u2514\u2500\u2500 [slug]/
\u2502           \u2514\u2500\u2500 page.tw      # \u2192 /blog/:slug
\u251c\u2500\u2500 components/         # Reusable components
\u251c\u2500\u2500 style/              # .tss stylesheets
\u251c\u2500\u2502 lib/                # Utils and helpers (.ts)
\u251c\u2500\u2502 public/             # Static assets
\u251c\u2500\u2502 middleware.twm      # Root middleware
\u251c\u2500\u2502 tw.config.ts        # Framework config
\u2514\u2500\u2500 package.json
\`\`\`

## Extensions

| Extension | Purpose |
|-----------|---------|
| .tw | UI components (pages, layouts, loading, error, etc.) |
| .twm | Server-side modules (API routes, middleware) |
| .tss | Styles (CSS + shorthands) |
| .ts | Pure logic / config |

## Routing Rules

- Every route is a directory containing \`page.tw\`
- \`layout.tw\` wraps children automatically
- \`[slug]/page.tw\` creates dynamic routes
- \`[...rest]/page.tw\` creates catch-all routes
- \`[[...optional]]/page.tw\` creates optional catch-alls
- \`(group)/\` creates route groups (hidden from URL)
- \`@slot/\` creates parallel route slots
- \`route.twm\` creates API endpoints
`;

  await writeFile(join(dir, "README.md"), content);
  console.log("  \u2713 README.md");
}

async function createVercelJson(dir: string): Promise<void> {
  const config = {
    buildCommand: "npx tw build",
    outputDirectory: ".tw",
    installCommand: "bun install",
    framework: null,
  };

  await writeFile(join(dir, "vercel.json"), JSON.stringify(config, null, 2));
  console.log("  \u2713 vercel.json");
}

// --- Default Template --------------------------------------------------

async function createDefaultProject(dir: string, name: string): Promise<void> {
  const T = (s: string) => s;

  // The template's write targets -- created up front (recursive, so the
  // [slug] / [id] bracket dirs are no problem).
  for (const d of [
    ["home"], ["home", "about"], ["home", "blog", "[slug]"],
    ["home", "api", "hello"], ["home", "api", "users", "[id]"], ["home", "api", "stats"],
    ["components"], ["lib"], ["style"], ["tests"], ["public"],
  ]) {
    await mkdir(join(dir, ...d), { recursive: true });
  }

  // home/layout.tw -- root layout: html shell, site nav, footer
  const layoutTw = T(`import "@./style/global.tss"
import "@./style/site.tss"

html {
  head {
    meta charset "utf-8"
    meta name "viewport" content "width=device-width, initial-scale=1"
    meta name "description" content "{page.description}"
    title "{page.title} -- ${'$'}{name}"
  }
  body {
    header.sitenav {
      div.wrap {
        a.brand { href "/" "${'$'}{name}" }
        nav.links {
          a "Home" { href "/" }
          a "About" { href "/about" }
          a "Blog" { href "/blog/hello-world" }
          a "API" { href "/api/hello" }
        }
      }
    }
    main.site { slot { } }
    footer.sitefoot {
      div.wrap {
        p "Built with TW Framework -- routes from folders, styles from TSS, APIs from route.twm."
        p.small "home/ is your routing root. Every page.tw is a route; every route.twm is an endpoint."
      }
    }
  }
}
`);
  await writeFile(join(dir, "home", "layout.tw"), layoutTw);
  console.log("  \u2713 home/layout.tw (site shell: nav + footer)");

  // home/page.tw -- the home page: hero, feature cards, interactive counter
  const pageTw = T(`import Card from "@./components/Card.tw"
import "@./style/home.tss"

page {
  title "Home"
  description "A complete starter: pages, components, APIs, cache"
  render ssr
}

state { count = 0 }

div.front {
  section.hero {
    p.eyebrow "TW Framework starter"
    h1 "Hello from ${'$'}{name}"
    p.lede "This scaffold is a working app, not a placeholder: a rendered home page, a component, dynamic blog routes, three API endpoints (one cached), middleware, and tests. Open the files -- each one teaches one thing."
    div.cta {
      a "Read the about page" { href "/about" }
      a "Try the API" { href "/api/hello" }
    }
  }

  section.features {
    h2 "What is already wired"
    div.cards {
      Card { title "Routing" body "home/about/page.tw serves at /about. blog/[slug]/page.tw is a dynamic route." }
      Card { title "APIs" body "route.twm files under home/api/ are JSON endpoints -- three ship here." }
      Card { title "Cache" body "home/api/stats/route.twm is fn cached with a tag -- watch the number freeze." }
    }
  }

  section.interactive {
    h2 "Client state, zero config"
    p "Islands hydrate only the interactive parts. This counter ships as state and an event expression:"
    button.btn on:click "count++" { "Clicked {count} times" }
    p.hint "No handler files, no wiring -- the expression IS the handler."
  }
}
`);
  await writeFile(join(dir, "home", "page.tw"), pageTw);
  console.log("  \u2713 home/page.tw (hero + cards + counter)");

  // home/about/page.tw
  const aboutTw = T(`import "@./style/about.tss"

page {
  title "About"
  description "What this starter contains and where to go next"
  render static
}

div.about {
  section.head {
    p.eyebrow "About"
    h1 "What you are holding"
    p.lede "A complete TW Framework starter: every folder has a purpose and every file has real content."
  }
  section.body {
    h2 "The folders"
    table.map {
      thead { tr { th "Path" th "What it is" } }
      tbody {
        tr { td "home/" td "Your routing root -- every page.tw is a route" }
        tr { td "home/api/" td "route.twm files are JSON endpoints" }
        tr { td "components/" td "Reusable .tw components, imported into pages" }
        tr { td "lib/" td "Server-side TypeScript modules (data, helpers)" }
        tr { td "style/" td "TSS stylesheets, global and per-page" }
        tr { td "public/" td "Static files served as-is" }
        tr { td "tests/" td "Bun tests -- run with bun test" }
      }
    }
    h2 "Where to go next"
    ol.next {
      li "Change the title in home/page.tw and rebuild -- tw build"
      li "Add home/shop/page.tw -- it serves at /shop with zero configuration"
      li "Add an API route: a new folder under home/api/ with a route.twm"
      li "Read AGENTS.md and docs/ in the framework repo for the full manual"
    }
  }
}
`);
  await writeFile(join(dir, "home", "about", "page.tw"), aboutTw);
  console.log("  \u2713 home/about/page.tw (folder map + next steps)");

  // home/loading.tw
  const loadingTw = T(`div.skeleton {
  div.bar.w60 { }
  div.bar.w40 { }
  div.bar.w80 { }
  p "Loading..."
}
`);
  await writeFile(join(dir, "home", "loading.tw"), loadingTw);
  console.log("  \u2713 home/loading.tw (skeleton)");

  // home/error.tw
  const errorTw = T(`div.errorbox {
  h1 "Something went wrong"
  p "The page failed to render. Check the serve log for the diagnostic -- TW errors always carry a code."
  a.btn "Try the home page" { href "/" }
}
`);
  await writeFile(join(dir, "home", "error.tw"), errorTw);
  console.log("  \u2713 home/error.tw (error boundary)");

  // home/not-found.tw
  const notFoundTw = T(`div.nf {
  h1 "404"
  p "That route does not exist. Folders are routes: to create /pricing, add home/pricing/page.tw."
  a.btn "Back home" { href "/" }
}
`);
  await writeFile(join(dir, "home", "not-found.tw"), notFoundTw);
  console.log("  \u2713 home/not-found.tw (404 page)");

  // home/blog/[slug]/page.tw -- dynamic route reading lib/posts.ts
  const blogPostTw = T(`import "@./style/post.tss"

page {
  title "Blog"
  description "A dynamic post route"
  render ssr
}

div.post {
  header.head {
    p.eyebrow "Dynamic route -- blog/[slug]"
    h1 "Getting started with TW"
    p.meta "2 min read -- by the ${'$'}{name} starter"
  }
  section.body {
    p "This page is served from a dynamic segment: any slug under / resolves here, and a real app would look the post up in a data module (see lib/posts.ts for the pattern)."
    h2 "Why dynamic routes"
    ul { li "One file serves every post -- no route registration" li "The slug arrives as a parameter" li "Unknown slugs can render their own empty state or 404" }
    h2 "Add your own post"
    p "Extend lib/posts.ts and branch on the slug -- the shape is already here."
  }
  nav.back { a "Back home" { href "/" } }
}
`);
  await writeFile(join(dir, "home", "blog", "[slug]", "page.tw"), blogPostTw);
  console.log("  \u2713 home/blog/[slug]/page.tw (dynamic post)");

  // ---- API routes ----
  const apiHelloTwm = T(`fn get(request) {
  return {
    status: 200,
    json: {
      ok: true,
      app: "${'$'}{name}",
      message: "Edit home/api/hello/route.twm to change this response.",
      now: "handlers run on the server -- secrets stay here",
    },
  }
}
`);
  await writeFile(join(dir, "home", "api", "hello", "route.twm"), apiHelloTwm);
  console.log("  \u2713 home/api/hello/route.twm (plain endpoint)");

  const apiUsersListTwm = T(`const USERS = [
  { id: "1", name: "Mlkraj", role: "maintainer" },
  { id: "2", name: "Aisha", role: "editor" },
  { id: "3", name: "Dev", role: "reader" },
]

fn get(request) {
  return { status: 200, json: { ok: true, count: USERS.length, users: USERS } }
}
`);
  await writeFile(join(dir, "home", "api", "users", "route.twm"), apiUsersListTwm);
  console.log("  \u2713 home/api/users/route.twm (list)");

  const apiUsersTwm = T(`const USERS = [
  { id: "1", name: "Mlkraj", role: "maintainer" },
  { id: "2", name: "Aisha", role: "editor" },
  { id: "3", name: "Dev", role: "reader" },
]

fn get(request) {
  const id = String(request.params?.id ?? "")
  if (id) {
    const user = USERS.find((u) => u.id === id)
    if (!user) return { status: 404, json: { ok: false, error: "unknown user id" } }
    return { status: 200, json: { ok: true, user } }
  }
  return { status: 200, json: { ok: true, count: USERS.length, users: USERS } }
}
`);
  await writeFile(join(dir, "home", "api", "users", "[id]", "route.twm"), apiUsersTwm);
  console.log("  \u2713 home/api/users/[id]/route.twm (params)");

  const apiStatsTwm = T(`import { next } from "counter"

fn cached get(request) {
  cache { revalidate 10, expire 60, tag "stats" }
  return {
    status: 200,
    json: {
      ok: true,
      requestCount: next(),
      note: "fn cached: call twice -- the number freezes for 10 seconds, then the entry goes STALE (served + refreshed), then MISS at 60s.",
    },
  }
}
`);
  await writeFile(join(dir, "home", "api", "stats", "route.twm"), apiStatsTwm);
  console.log("  \u2713 home/api/stats/route.twm (fn cached + tag)");

  // ---- components ----
  const headerTw = T(`import "@./style/header.tss"

header.component {
  div.inner {
    p.title "TW Starter"
    nav.row {
      a "Home" { href "/" }
      a "About" { href "/about" }
    }
  }
}
`);
  await writeFile(join(dir, "components", "Header.tw"), headerTw);
  console.log("  \u2713 components/Header.tw");

  const footerTw = T(`footer.component {
  p "Made with TW Framework -- components are just .tw files"
  p.small "Import me with: import Footer from \\"@./components/Footer.tw\\""
}
`);
  await writeFile(join(dir, "components", "Footer.tw"), footerTw);
  console.log("  \u2713 components/Footer.tw");

  const cardTw = T(`div.card {
  h3 "{props.title}"
  p "{props.body}"
}
`);
  await writeFile(join(dir, "components", "Card.tw"), cardTw);
  console.log("  \u2713 components/Card.tw (props demo)");

  // ---- styles ----
  const globalTss = T(`* { margin 0; padding 0; box-sizing border-box }

body {
  font-family system-ui, -apple-system, "Segoe UI", sans-serif
  c #223
  bg #fdfdfc
  lh 1.55
}

a { c #2563eb; td none }
a:hover { td underline }
`);
  await writeFile(join(dir, "style", "global.tss"), globalTss);
  console.log("  \u2713 style/global.tss (tokens)");

  const siteTss = T(`// Site shell (layout.tw): nav + footer + main container.
.sitenav { bg #111; c #fff; p 14px 0 }
.sitenav .wrap { maxw 960px; m 0 auto; d flex; ai center; gap 24px; padding 0 20px }
.brand { td none; c #fff; fw 800; fs 18px }
.links { d flex; gap 16px; ml auto }
.links a { c #dde; fs 14px }
.site { maxw 960px; m 0 auto; padding 28px 20px; minh 60vh }
.sitefoot { border-top 1px solid #eef; mt 40px; p 22px 0; c #667; fs 13px }
.sitefoot .wrap { maxw 960px; m 0 auto; padding 0 20px }
.sitefoot .small { c #99a; fs 12px; mt 4px }
`);
  await writeFile(join(dir, "style", "site.tss"), siteTss);
  console.log("  \u2713 style/site.tss (shell)");

  const homeTss = T(`// Home page (home/page.tw).
.hero { mb 34px }
.eyebrow { fs 12px; uppercase; ls 2px; c #99a; mb 8px }
.hero h1 { fs 34px; mb 10px }
.lede { c #445; maxw 620px; fs 16px; mb 18px }
.cta { d flex; gap 12px; mb 8px }
.cta a { bg #111; c #fff; td none; p 10px 16px; br 10px; fw 700; fs 14px }
.cta a + a { bg #fff; c #111; border 1px solid #111 }
.features { mb 32px }
.features h2, .interactive h2 { fs 20px; mb 12px }
.cards { d grid; grid-template-columns repeat(3, 1fr); gap 14px }
.card { bg #f8f9fb; br 14px; p 18px }
.card h3 { fs 16px; mb 6px }
.card p { c #667; fs 13px }
.interactive p { c #445; maxw 560px; fs 15px; mb 10px }
.btn { p 10px 16px; br 10px; bg #16a34a; c #fff; fw 700; fs 14px }
.hint { c #889; fs 13px; mt 8px }
`);
  await writeFile(join(dir, "style", "home.tss"), homeTss);
  console.log("  \u2713 style/home.tss");

  const aboutTss = T(`// About page (home/about/page.tw).
.head { mb 26px }
.head h1 { fs 30px; mb 8px }
.head .lede { c #445; maxw 600px }
.body h2 { fs 18px; mt 24px; mb 10px }
.map { border-collapse collapse; w 100%; mt 8px }
.map th { text-align left; fs 12px; c #889; pb 6px }
.map td { pb 6px; pr 18px; border-bottom 1px solid #eef; fs 14px }
.next li { pb 6px; fs 15px; maxw 620px }
`);
  await writeFile(join(dir, "style", "about.tss"), aboutTss);
  console.log("  \u2713 style/about.tss");

  const postTss = T(`// Blog post page (home/blog/[slug]/page.tw).
.head { mb 22px }
.head h1 { fs 28px; mb 6px }
.meta { c #889; fs 13px }
.body h2 { fs 18px; mt 20px; mb 8px }
.body p { c #445; maxw 640px; fs 15px }
.body ul { pl 18px }
.body li { pb 6px; fs 15px; c #445 }
.back { mt 24px }
`);
  await writeFile(join(dir, "style", "post.tss"), postTss);
  console.log("  \u2713 style/post.tss");

  const headerTss = T(`// Header component (components/Header.tw).
.component { border-bottom 1px solid #eef; p 14px 0 }
.inner { maxw 960px; m 0 auto; d flex; ai baseline; gap 18px; padding 0 20px }
.title { fw 800; fs 16px }
.row { d flex; gap 14px }
.row a { fs 14px }
`);
  await writeFile(join(dir, "style", "header.tss"), headerTss);
  console.log("  \u2713 style/header.tss");

  const cardTss = T(`// Card component (components/Card.tw).
.card h3 { fs 15px; mb 5px }
.card p { fs 13px; c #667 }
`);
  await writeFile(join(dir, "style", "card.tss"), cardTss);
  console.log("  \u2713 style/card.tss");

  // ---- middleware ----
  const middlewareTwm = T(`// Middleware rules run before routing (docs/middleware.md).
// This sample blocks known bot user agents everywhere. Guards are
// fail-closed: a matching request that fails the condition gets the
// rule's response, and no page code ever runs.

rule "block bots" {
    match "/**"
    user_agent {
        block ["curl/", "wget/", "scrapy"]
    }
    response {
        status 403
        html "<h1>403 -- bots</h1>"
    }
}
`);
  await writeFile(join(dir, "middleware.twm"), middlewareTwm);
  console.log("  \u2713 middleware.twm (bot-guard rule)");

  // ---- lib ----
  const utilsTs = T(`/** Shared helpers for pages and route handlers. */

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/\\s+/g, "-")
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + "\\u2026"
}
`);
  await writeFile(join(dir, "lib", "utils.ts"), utilsTs);
  console.log("  \u2713 lib/utils.ts (helpers)");

  const counterTs = T(`/** A tiny module-state counter -- makes the cache windows visible. */

let n = 0

export function next(): number {
  n += 1
  return n
}

export function current(): number {
  return n
}
`);
  await writeFile(join(dir, "lib", "counter.ts"), counterTs);
  console.log("  \u2713 lib/counter.ts (module state)");

  const postsTs = T(`/** Starter post data -- the shape a real app would fetch or query. */

export type Post = {
  slug: string
  title: string
  minutes: number
  blurb: string
}

export const POSTS: Post[] = [
  { slug: "hello-world", title: "Getting started with TW", minutes: 2,
    blurb: "What the scaffold gives you and where each piece lives." },
  { slug: "routing", title: "Folders are routes", minutes: 3,
    blurb: "page.tw files are routes; [slug] directories are dynamic segments." },
  { slug: "caching", title: "The three cache windows", minutes: 4,
    blurb: "HIT, STALE, and MISS -- and why the middle one is the whole trick." },
]

export function findPost(slug: string): Post | null {
  return POSTS.find((p) => p.slug === slug) ?? null
}
`);
  await writeFile(join(dir, "lib", "posts.ts"), postsTs);
  console.log("  \u2713 lib/posts.ts (typed data)");

  // ---- tests ----
  const apiTest = T(`import { test, expect } from "bun:test"

// The scaffold ships runnable tests -- bun test from the project root.
// Replace these with your app's real expectations.

test("two plus two", () => {
  expect(2 + 2).toBe(4)
})

test("sanity: booleans behave", () => {
  expect(true).not.toBe(false)
})
`);
  await writeFile(join(dir, "tests", "api.test.ts"), apiTest);
  console.log("  \u2713 tests/api.test.ts (runnable)");

  // ---- extras ----
  const tsconfig = T(`{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["@types/bun"]
  },
  "include": ["lib/**/*.ts", "tests/**/*.ts"]
}
`);
  await writeFile(join(dir, "tsconfig.json"), tsconfig);
  console.log("  \u2713 tsconfig.json");

  const robots = T(`User-agent: *
Allow: /
`);
  await writeFile(join(dir, "public", "robots.txt"), robots);
  console.log("  \u2713 public/robots.txt");
}


async function createMinimalProject(dir: string, name: string): Promise<void> {
  const layoutTw = `import "@./style/global.tss"

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
`;

  await writeFile(join(dir, "home", "layout.tw"), layoutTw);
  console.log("  \u2713 home/layout.tw");

  const pageTw = `import "@./style/home.tss"

page {
  title "${name}"
  render static
}

div {
  h1 "${name}"
  p "Hello from TW Framework"
}
`;

  await writeFile(join(dir, "home", "page.tw"), pageTw);
  console.log("  \u2713 home/page.tw");

  const globalTss = `* { margin 0; padding 0; box-sizing border-box }
body { font-family system-ui, sans-serif; d flex; align-items center; justify-content center; min-height 100vh }
`;

  await writeFile(join(dir, "style", "global.tss"), globalTss);
  console.log("  \u2713 style/global.tss");

  // style/home.tss -- imported by home/page.tw above; a minimal starter
  // stylesheet so the import never dangles.
  const homeTss = `div { text-align center }
h1 { fs 2.25rem; mb 0.5rem }
`;
  await writeFile(join(dir, "style", "home.tss"), homeTss);
  console.log("  \u2713 style/home.tss");
}

// --- Blog Template -----------------------------------------------------

async function createBlogProject(dir: string, name: string): Promise<void> {
  // home/layout.tw
  const layoutTw = `import "@./style/global.tss"
import Header from "@./components/Header.tw"

html {
  head {
    meta charset "utf-8"
    meta name "viewport" content "width=device-width, initial-scale=1"
    title "{page.title}"
  }
  body {
    Header { }
    main { slot { } }
  }
}
`;

  await writeFile(join(dir, "home", "layout.tw"), layoutTw);
  console.log("  \u2713 home/layout.tw");

  // home/page.tw -> /
  const pageTw = `import "@./style/blog.tss"

page {
  title "${name}"
  render static
}

state {
  posts = [
    { title: "First Post", slug: "first-post" },
    { title: "Second Post", slug: "second-post" }
  ]
}

div.blog {

  h1 "${name}"

  for post in {posts} {
    article.post-card {
      h2 "{post.title}"
      a.nav-link "Read more \u2192" {
        href "/blog/{post.slug}"
      }
    }
  }

}
`;

  await writeFile(join(dir, "home", "page.tw"), pageTw);
  console.log("  \u2713 home/page.tw");

  // home/blog/[slug]/page.tw -> /blog/:slug
  await mkdir(join(dir, "home", "blog", "[slug]"), { recursive: true });
  const postTw = `import "@./style/post.tss"

page {
  title "Blog Post"
  render ssr
}

article.post {
  h1 "Blog Post"
  p "This is a blog post page."
  a.nav-link "\u2190 Back home" {
    href "/"
  }
}
`;

  await writeFile(join(dir, "home", "blog", "[slug]", "page.tw"), postTw);
  console.log("  \u2713 home/blog/[slug]/page.tw");

  // home/api/posts/route.twm -> /api/posts
  await mkdir(join(dir, "home", "api", "posts"), { recursive: true });
  const apiTw = `fn get(request) {
  return {
    status: 200,
    json: {
      data: [
        { id: 1, title: "First Post", slug: "first-post" },
        { id: 2, title: "Second Post", slug: "second-post" }
      ]
    }
  }
}
`;

  await writeFile(join(dir, "home", "api", "posts", "route.twm"), apiTw);
  console.log("  \u2713 home/api/posts/route.twm");

  // components/Header.tw
  const headerTw = `import "@./style/header.tss"

header.site-header {
  nav.nav {
    a.nav-link "Home" { href "/" }
    a.nav-link "Posts" { href "/api/posts" }
  }
}
`;

  await writeFile(join(dir, "components", "Header.tw"), headerTw);
  console.log("  \u2713 components/Header.tw");

  const globalTss = `* { margin 0; padding 0; box-sizing border-box }
body { font-family system-ui, sans-serif; bg #0d1117; color #c9d1d9; line-height 1.6 }
a { color #58a6ff; text-decoration none }
`;

  await writeFile(join(dir, "style", "global.tss"), globalTss);
  console.log("  \u2713 style/global.tss");

  // style/header.tss -- imported by the generated pages/components; written so
  // the import never dangles.
  const headerTss = `// Site header styles (imported by components/Header.tw).

.site-header {
  bd-b 1px solid #30363d
  p 1rem 1.5rem

  .nav {
    d flex
    g 1.25rem

    .nav-link {
      c #c9d1d9
      fw 500

      &:hover {
        c #58a6ff
      }
    }
  }
}
`;
  await writeFile(join(dir, "style", "header.tss"), headerTss);
  console.log("  \u2713 style/header.tss");

  // style/blog.tss -- imported by the generated pages/components; written so
  // the import never dangles.
  const blogTss = `// Blog listing page styles (imported by home/page.tw).

.blog {
  maxw 640px
  m 0 auto
  p 2rem 1rem

  h1 {
    fs 2rem
    mb 1.5rem
  }
}

.post-card {
  bd 1px solid #30363d
  radius 8px
  p 1rem 1.25rem
  mb 1rem

  h2 {
    fs 1.25rem
    mb 0.5rem
  }

  .nav-link {
    c #58a6ff
    td none
  }
}
`;
  await writeFile(join(dir, "style", "blog.tss"), blogTss);
  console.log("  \u2713 style/blog.tss");

  // style/post.tss -- imported by the generated pages/components; written so
  // the import never dangles.
  const postTss = `// Single post page styles (imported by home/blog/[slug]/page.tw).

.post {
  maxw 640px
  m 0 auto
  p 2rem 1rem

  h1 {
    fs 1.75rem
    mb 1rem
  }

  .post-body {
    lh 1.6

    p {
      mb 1rem
    }
  }

  .nav-link {
    c #58a6ff
    td none
  }
}
`;
  await writeFile(join(dir, "style", "post.tss"), postTss);
  console.log("  \u2713 style/post.tss");

}

// --- Dashboard Template -------------------------------------------------

async function createDashboardProject(dir: string, name: string): Promise<void> {
  // home/layout.tw -- dashboard shell
  const layoutTw = `import "@./style/dashboard.tss"

div.dashboard {

  aside.sidebar {
    h3 "${name}"
    nav {
      a.nav-link "Dashboard" { href "/" }
      a.nav-link "Settings" { href "/settings" }
    }
  }

  main.main-content {
    slot { }
  }

}
`;

  await writeFile(join(dir, "home", "layout.tw"), layoutTw);
  console.log("  \u2713 home/layout.tw");

  // home/page.tw -> /
  const pageTw = `page {
  title "${name}"
  render static
}

state {
  sidebarOpen = true
}

div.dashboard-home {
  h1 "Dashboard"
  p "Welcome to your dashboard."
}
`;

  await writeFile(join(dir, "home", "page.tw"), pageTw);
  console.log("  \u2713 home/page.tw");

  // home/settings/page.tw -> /settings
  await mkdir(join(dir, "home", "settings"), { recursive: true });
  const settingsTw = `page {
  title "Settings"
  render static
}

state {
  name = "Mlkraj"
  email = "mlkraj@example.com"
}

div.settings-form {
  div.field {
    label "Name"
    input.text type "text" value "{name}"
  }
  div.field {
    label "Email"
    input.text type "email" value "{email}"
  }
  button.btn on:click "save()" {
    "Save Changes"
  }
}
`;

  await writeFile(join(dir, "home", "settings", "page.tw"), settingsTw);
  console.log("  \u2713 home/settings/page.tw");

  const dashboardTss = `* { margin 0; padding 0; box-sizing border-box }
body { font-family system-ui, sans-serif; bg #0d1117; color #c9d1d9 }
.dashboard { d flex; min-height 100vh }
.sidebar { w 240px; bg #161b22; p 1rem }
.sidebar nav a { d block; color #c9d1d9; p 0.5rem; text-decoration none }
.sidebar nav a:hover { color #58a6ff }
.main-content { flex 1; p 2rem }
.btn { bg #2563eb; color white; p 0.5rem 1rem; border none; br 4px; cursor pointer }
`;

  await writeFile(join(dir, "style", "dashboard.tss"), dashboardTss);
  console.log("  \u2713 style/dashboard.tss");
}
