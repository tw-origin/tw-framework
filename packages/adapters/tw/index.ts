/**
 * TW Framework — deployment adapters.
 *
 * Each adapter is a set of ready-to-copy files for one deployment target:
 *   - node:       zero-dependency Node 18+ server for a `tw build` output
 *   - bun:        full production TWServer on Bun
 *   - docker:     multi-stage Dockerfiles (full + static runtimes)
 *   - vercel:     vercel.json build config
 *   - netlify:    netlify.toml build config
 *   - cloudflare: wrangler.toml + _headers + _redirects (Pages)
 *   - aws:       S3 + CloudFront deploy script (static) / container path
 *   - digitalocean: .do/app.yaml App Platform spec
 *   - render:    render.yaml blueprint
 *   - railway:   railway.toml container config
 *   - fly:       fly.toml machine config
 *   - github-pages: deploy workflow + .nojekyll
 *   - firebase:  firebase.json hosting config
 *   - nginx:     nginx.conf server block (self-hosted static)
 *   - caddy:     Caddyfile (self-hosted static)
 *
 * Apps pull them in with `tw adapter <name>` (apps/cli/tw/commands/adapter.ts).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface AdapterInfo {
  name: string;
  description: string;
  /** Files copied into the app root: { source-in-package, destination } */
  files: Array<{ from: string; to: string }>;
  /** Printed after generation. */
  nextSteps: string[];
}

// Resolve the adapter files directory. In the monorepo this is
// packages/adapters/tw/; in the published CLI bundle the files are copied
// next to dist/tw.mjs under dist/adapters/ and the bundle sets
// globalThis.__TW_BUNDLE_DIR to dist/.
function resolvePkgDir(): string {
  const self = dirname(fileURLToPath(import.meta.url));
  const bundleDir = (globalThis as any).__TW_BUNDLE_DIR as string | undefined;
  if (bundleDir) {
    const fromBundle = join(bundleDir, "adapters");
    if (existsSync(join(fromBundle, "node", "server.mjs"))) return fromBundle;
  }
  if (existsSync(join(self, "node", "server.mjs"))) return self;
  return self;
}

const PKG_DIR = resolvePkgDir();

export const ADAPTERS: Record<string, AdapterInfo> = {
  node: {
    name: "node",
    description: "Zero-dependency Node 18+ static server for the .tw/ build output (no .twm APIs)",
    files: [{ from: "node/server.mjs", to: "server.mjs" }],
    nextSteps: [
      "tw build",
      "node server.mjs          # PORT=8000 HOST=0.0.0.0 by default",
    ],
  },
  bun: {
    name: "bun",
    description: "Full production TWServer (pages, .twm APIs, middleware) on Bun",
    files: [{ from: "bun/server.ts", to: "server.ts" }],
    nextSteps: [
      "tw build",
      "bun server.ts             # PORT=3000 by default",
    ],
  },
  docker: {
    name: "docker",
    description: "Multi-stage Docker images: Dockerfile (full server incl. .twm APIs) + Dockerfile.static (tiny Node runtime)",
    files: [
      { from: "docker/Dockerfile", to: "Dockerfile" },
      { from: "docker/Dockerfile.static", to: "Dockerfile.static" },
      { from: "docker/.dockerignore", to: ".dockerignore" },
      { from: "docker/docker-compose.yml", to: "docker-compose.yml" },
      { from: "node/server.mjs", to: "server.mjs" },
    ],
    nextSteps: [
      "docker build -t tw-app .",
      "docker run -p 8000:8000 tw-app",
      "# or: docker compose up",
    ],
  },
  vercel: {
    name: "vercel",
    description: "Vercel build configuration for the .tw/ output",
    files: [{ from: "vercel/vercel.json", to: "vercel.json" }],
    nextSteps: [
      "npx vercel deploy --prod",
    ],
  },
  netlify: {
    name: "netlify",
    description: "Netlify build configuration (static + pre-rendered output)",
    files: [{ from: "netlify/netlify.toml", to: "netlify.toml" }],
    nextSteps: [
      "git push (netlify.toml is picked up on connect)",
      "# or: npx netlify deploy --prod --dir .tw",
    ],
  },
  cloudflare: {
    name: "cloudflare",
    description: "Cloudflare Pages config with asset caching and security headers",
    files: [
      { from: "cloudflare/wrangler.toml", to: "wrangler.toml" },
      { from: "cloudflare/_headers", to: "_headers" },
      { from: "cloudflare/_redirects", to: "_redirects" },
    ],
    nextSteps: [
      "npx wrangler pages deploy .tw",
      "# or connect the repo in the Cloudflare dashboard",
    ],
  },
  aws: {
    name: "aws",
    description: "AWS deployment: S3 + CloudFront sync script for static output (containers for the full server)",
    files: [
      { from: "aws/deploy-s3.sh", to: "deploy-s3.sh" },
      { from: "aws/README.md", to: "AWS-DEPLOY.md" },
    ],
    nextSteps: [
      "tw build",
      "BUCKET=<your-bucket> DISTRIBUTION_ID=<id> bash deploy-s3.sh",
      "# full server (APIs): tw adapter docker + App Runner / ECS",
    ],
  },
  digitalocean: {
    name: "digitalocean",
    description: "DigitalOcean App Platform spec (static output; containers for the full server)",
    files: [{ from: "digitalocean/.do/app.yaml", to: ".do/app.yaml" }],
    nextSteps: [
      "doctl apps create --spec .do/app.yaml",
      "# or: Apps -> Create App from repo in the control panel",
    ],
  },
  render: {
    name: "render",
    description: "Render blueprint: static site service (docker service for the full server)",
    files: [{ from: "render/render.yaml", to: "render.yaml" }],
    nextSteps: [
      "Dashboard -> New -> Blueprint -> pick this repo",
    ],
  },
  railway: {
    name: "railway",
    description: "Railway container config for the full server (PORT honoured)",
    files: [{ from: "railway/railway.toml", to: "railway.toml" }],
    nextSteps: [
      "tw adapter docker        # railway deploys the Dockerfile",
      "railway up               # or connect the repo in the dashboard",
    ],
  },
  fly: {
    name: "fly",
    description: "Fly.io machine config for the full server (needs the Dockerfile)",
    files: [{ from: "fly/fly.toml", to: "fly.toml" }],
    nextSteps: [
      "tw adapter docker        # fly deploys the container image",
      "fly launch && fly deploy",
    ],
  },
  "github-pages": {
    name: "github-pages",
    description: "GitHub Actions workflow deploying the static build to Pages",
    files: [
      { from: "github-pages/.github/workflows/deploy.yml", to: ".github/workflows/deploy.yml" },
      { from: "github-pages/.nojekyll", to: ".nojekyll" },
    ],
    nextSteps: [
      "git add .github/workflows/deploy.yml .nojekyll && git push",
      "Settings -> Pages -> Source: GitHub Actions",
    ],
  },
  firebase: {
    name: "firebase",
    description: "Firebase Hosting config with clean URLs and immutable asset caching",
    files: [{ from: "firebase/firebase.json", to: "firebase.json" }],
    nextSteps: [
      "tw build && firebase deploy",
    ],
  },
  nginx: {
    name: "nginx",
    description: "nginx server block for self-hosting the static build",
    files: [{ from: "nginx/nginx.conf", to: "nginx.conf" }],
    nextSteps: [
      "tw build",
      "cp nginx.conf /etc/nginx/sites-available/tw-app",
      "# adjust server_name + root, then enable the site",
    ],
  },
  caddy: {
    name: "caddy",
    description: "Caddyfile for self-hosting the static build with automatic HTTPS",
    files: [{ from: "caddy/Caddyfile", to: "Caddyfile" }],
    nextSteps: [
      "tw build",
      "caddy run    # replace example.com with your domain",
    ],
  },
};

/** Copy an adapter's files into an app directory. Returns the written paths. */
export function generateAdapter(name: string, appDir: string): string[] {
  const adapter = ADAPTERS[name];
  if (!adapter) {
    throw new Error(`Unknown adapter "${name}". Available: ${Object.keys(ADAPTERS).join(", ")}`);
  }
  const written: string[] = [];
  for (const f of adapter.files) {
    const src = join(PKG_DIR, f.from);
    if (!existsSync(src)) throw new Error(`Adapter file missing: ${f.from}`);
    const dest = join(appDir, f.to);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(src));
    written.push(dest);
  }
  return written;
}

export function listAdapters(): AdapterInfo[] {
  return Object.values(ADAPTERS);
}
