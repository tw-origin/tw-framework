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
  // home/layout.tw -- root layout
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

  // home/page.tw -- home page -> /
  const pageTw = `import Header from "@./components/Header.tw"
import "@./style/home.tss"

page {
  title "${name}"
  description "Built with TW Framework"
  render static
}

state {
  count = 0
  name = "World"
}

div.container {

  Header { }

  h1 "Hello {name}"
  p "Built with TW Framework"

  button.btn on:click "count++" {
    "Clicked {count} times"
  }

  a.nav-link "About" {
    href "/about"
  }

}
`;

  await writeFile(join(dir, "home", "page.tw"), pageTw);
  console.log("  \u2713 home/page.tw");

  // tests/api.test.ts — sample test suite (runs with `tw test`)
  await mkdir(join(dir, "tests"), { recursive: true });
  const apiTest = `import { test, expect } from "bun:test";
import { testRoute } from "@tw/server/tw/testing";

test("GET /api returns ok", async () => {
  const res = await testRoute(process.cwd(), "GET", "/api");
  expect(res.status).toBe(200);
  expect(res.json.ok).toBe(true);
});

test("POST /api echoes the body", async () => {
  const res = await testRoute(process.cwd(), "POST", "/api", {
    body: JSON.stringify({ hello: "tw" }),
  });
  expect(res.status).toBe(201);
  expect(res.json.received.hello).toBe("tw");
});
`;
  await writeFile(join(dir, "tests", "api.test.ts"), apiTest);
  console.log("  \u2713 tests/api.test.ts");

  // home/about/page.tw -- about page -> /about
  const aboutTw = `import "@./style/about.tss"

page {
  title "About - ${name}"
  render static
}

div.container {

  h1 "About"
  p "This is the about page."
  a.nav-link "\u2190 Back home" {
    href "/"
  }

}
`;

  await writeFile(join(dir, "home", "about", "page.tw"), aboutTw);
  console.log("  \u2713 home/about/page.tw");

  // home/loading.tw -- loading UI
  const loadingTw = `div.loading-skeleton {
  div.skeleton-line { }
  div.skeleton-line { }
  div.skeleton-line { }
}
`;

  await writeFile(join(dir, "home", "loading.tw"), loadingTw);
  console.log("  \u2713 home/loading.tw");

  // home/error.tw -- error UI
  const errorTw = `div.error-boundary {
  h1 "Something went wrong"
  p "Please try again."
}
`;

  await writeFile(join(dir, "home", "error.tw"), errorTw);
  console.log("  \u2713 home/error.tw");

  // home/not-found.tw -- 404
  const notFoundTw = `div.not-found {
  h1 "404"
  p "Page not found"
  a.nav-link "\u2190 Home" {
    href "/"
  }
}
`;

  await writeFile(join(dir, "home", "not-found.tw"), notFoundTw);
  console.log("  \u2713 home/not-found.tw");

  // home/blog/[slug]/page.tw -- dynamic route -> /blog/:slug
  await mkdir(join(dir, "home", "blog", "[slug]"), { recursive: true });
  const blogPostTw = `import "@./style/post.tss"

page {
  title "{post.title}"
  render ssr
}

state {
  post = { title: "Hello World", body: "My first post", date: "2026-09-07" }
}

article.post {

  header.post-header {
    h1 "{post.title}"
    p.post-date "{post.date}"
  }

  div.post-body {
    p "{post.body}"
  }

  a.nav-link "\u2190 Back to blog" {
    href "/"
  }

}
`;

  await writeFile(join(dir, "home", "blog", "[slug]", "page.tw"), blogPostTw);
  console.log("  \u2713 home/blog/[slug]/page.tw");

  // home/api/route.twm -- API route -> /api
  const apiRouteTwm = `fn get(request) {
  return {
    status: 200,
    json: { ok: true, message: "Hello from TW API" }
  }
}

fn post(request) {
  const body = request.body || {}
  return {
    status: 201,
    json: { ok: true, received: body }
  }
}
`;

  await writeFile(join(dir, "home", "api", "route.twm"), apiRouteTwm);
  console.log("  \u2713 home/api/route.twm");

  // components/Header.tw
  const headerTw = `import "@./style/header.tss"

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
`;

  await writeFile(join(dir, "components", "Header.tw"), headerTw);
  console.log("  \u2713 components/Header.tw");

  // style/global.tss
  const globalTss = `* { margin 0; padding 0; box-sizing border-box }
body { font-family system-ui, sans-serif; bg #0d1117; color #c9d1d9; line-height 1.6 }
a { color #58a6ff; text-decoration none }
a:hover { text-decoration underline }
`;

  await writeFile(join(dir, "style", "global.tss"), globalTss);
  console.log("  \u2713 style/global.tss");

  // style/home.tss
  const homeTss = `.container { max-width 800px; margin 0 auto; padding 2rem }
.btn { p 0.5rem 1rem; bg #2563eb; color white; border none; br 4px; cursor pointer }
.btn:hover { bg #1d4ed8 }
.nav-link { color #58a6ff; d inline-block; m 0 0.5rem }
`;

  await writeFile(join(dir, "style", "home.tss"), homeTss);
  console.log("  \u2713 style/home.tss");

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

  // style/about.tss -- imported by the generated pages/components; written so
  // the import never dangles.
  const aboutTss = `// About page styles (imported by home/about/page.tw).

.container {
  maxw 640px
  m 0 auto
  p 2rem 1rem

  h1 {
    fs 2rem
    mb 1rem
  }

  p {
    lh 1.6
    mb 1rem
  }

  .nav-link {
    c #58a6ff
    td none
  }
}
`;
  await writeFile(join(dir, "style", "about.tss"), aboutTss);
  console.log("  \u2713 style/about.tss");

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


  // middleware.twm -- root middleware
  const middlewareTwm = `rule "api-rate-limit" {
  match "/api/**"
  rate_limit { requests 60, window 60, identity "path" }
  response { status 429, json { error "Too many requests" } }
}

rule "blocked-bots" {
  match "/**"
  user_agent {
    block ["curl/", "wget/", "python-requests", "scrapy"]
    empty_is_blocked false
  }
  response { status 403, html "<h1>403 Forbidden</h1>" }
}
`;

  await writeFile(join(dir, "middleware.twm"), middlewareTwm);
  console.log("  \u2713 middleware.twm");

  // lib/utils.ts
  const utilsTs = `export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/\\s+/g, "-");
}
`;

  await writeFile(join(dir, "lib", "utils.ts"), utilsTs);
  console.log("  \u2713 lib/utils.ts");
}

// --- Minimal Template --------------------------------------------------

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
