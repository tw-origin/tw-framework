/** tw ship -- deploy to platform. */

import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

/** Load the adapters package the same way `tw adapter` does (monorepo or node_modules). */
async function loadAdapters(rootDir: string): Promise<any> {
  const candidates = [
    resolve(rootDir, "node_modules", "@tw", "adapters", "tw", "index.ts"),
    resolve(rootDir, "node_modules", "@tw", "adapters", "tw", "index.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try { return await import(c); } catch { /* try the next candidate */ }
    }
  }
  try { return await import("@tw/adapters"); } catch { return null; }
}

export async function shipCommand(): Promise<void> {
  const args = process.argv.slice(3);
  const target = args[0] || "auto";
  const rootDir = process.cwd();
  const outDir = join(rootDir, ".tw");

  console.log("\n  tw ship -- deploy project\n");

  // Check for build output
  if (!existsSync(outDir)) {
    console.log("  No build found. Running build first...\n");

    try {
      const { buildCommand } = await import("./build");
      await buildCommand();
    } catch (err: any) {
      console.log(`  Build failed: ${err.message}\n`);
      process.exit(1);
    }
  }

  // Detect target
  let deployTarget = target;

  if (target === "auto") {
    // Auto-detect based on config files
    if (existsSync(join(rootDir, "vercel.json"))) {
      deployTarget = "vercel";
    } else if (existsSync(join(rootDir, "netlify.toml"))) {
      deployTarget = "netlify";
    } else if (existsSync(join(rootDir, "wrangler.toml"))) {
      deployTarget = "cloudflare";
    } else if (existsSync(join(rootDir, "Dockerfile"))) {
      deployTarget = "docker";
    } else {
      deployTarget = "static";
    }
  }

  console.log(`  Target: ${deployTarget}`);

  // Generate deployment config
  switch (deployTarget) {
    case "vercel":
      await generateVercelConfig(rootDir, outDir);
      break;
    case "netlify":
      generateNetlifyConfig(rootDir, outDir);
      break;
    case "cloudflare":
      generateCloudflareConfig(rootDir, outDir);
      break;
    case "docker":
      generateDockerfile(rootDir, outDir);
      break;
    case "static":
    default:
      console.log(`\n  Static output ready in: ${outDir}`);
      console.log("  Deploy this directory to any static host.");
      console.log("  Self-hosting? `tw adapter node` generates a zero-dependency Node server.\n");
      break;
  }

  // Show deployment instructions
  switch (deployTarget) {
    case "vercel":
      console.log("\n  Vercel deployment:");
      console.log("    1. Install: npm i -g vercel");
      console.log("    2. Run: vercel --prod");
      console.log("    3. Vercel will detect tw.config and build output\n");
      break;
    case "netlify":
      console.log("\n  Netlify deployment:");
      console.log("    1. Install: npm i -g netlify-cli");
      console.log("    2. Run: netlify deploy --prod");
      console.log("    3. Or connect GitHub repo on netlify.com\n");
      break;
    case "cloudflare":
      console.log("\n  Cloudflare deployment:");
      console.log("    1. Install: npm i -g wrangler");
      console.log("    2. Run: wrangler deploy\n");
      break;
    case "docker":
      console.log("\n  Docker deployment:");
      console.log("    1. Generate files: tw adapter docker   (Dockerfile, Dockerfile.static, docker-compose.yml)");
      console.log("    2. Build: docker build -t tw-app .");
      console.log("    3. Run: docker run -p 8000:8000 tw-app");
      console.log("    Static site? Build with: docker build -f Dockerfile.static -t tw-app .\n");
      break;
    default: break;
  }
}

async function generateVercelConfig(rootDir: string, outDir: string): Promise<void> {
  const adapters = await loadAdapters(rootDir);
  const configPath = join(rootDir, "vercel.json");

  if (existsSync(configPath)) {
    console.log("  OK vercel.json already exists (left unchanged)");
    // Never clobber a config the app already has -- but say so loudly when it
    // cannot serve an SSR/API app, instead of letting an empty site deploy.
    if (adapters?.readBuildSummary && adapters?.needsServer) {
      if (adapters.needsServer(adapters.readBuildSummary(rootDir))) {
        let raw = "";
        try { raw = readFileSync(configPath, "utf-8"); } catch { /* unreadable */ }
        if (!/"functions"|"rewrites"/.test(raw)) {
          console.log("  [!] This app has SSR pages, API routes or middleware, but vercel.json is a");
          console.log("      static config -- Vercel will serve an empty site. To fix it:");
          console.log("        $ rm vercel.json && tw adapter vercel");
        }
      }
    }
    return;
  }

  if (adapters?.generateAdapter) {
    for (const w of adapters.generateAdapter("vercel", rootDir)) console.log("  OK " + w.replace(rootDir + "/", ""));
    return;
  }

  // Adapters package unavailable -- fall back to a build-aware config inline.
  const { writeFileSync } = require("node:fs");
  writeFileSync(configPath, JSON.stringify({ buildCommand: "npx tw build", installCommand: "npm install", outputDirectory: ".tw", framework: null }, null, 2));
  console.log("  OK Generated vercel.json");
}

function generateNetlifyConfig(rootDir: string, outDir: string): void {
  const config = `[build]
  command = "npx tw build"
  publish = ".tw"

[build.environment]
  NODE_VERSION = "20"`;

  const configPath = join(rootDir, "netlify.toml");
  const existing = existsSync(configPath);

  if (!existing) {
    const { writeFileSync } = require("node:fs");
    writeFileSync(configPath, config);
    console.log("  OK Generated netlify.toml");
  } else {
    console.log("  OK netlify.toml already exists");
  }
}

function generateCloudflareConfig(rootDir: string, outDir: string): void {
  const config = `name = "tw-app"
compatibility_date = "2024-01-01"

[assets]
directory = ".tw"`;

  const configPath = join(rootDir, "wrangler.toml");
  const existing = existsSync(configPath);

  if (!existing) {
    const { writeFileSync } = require("node:fs");
    writeFileSync(configPath, config);
    console.log("  OK Generated wrangler.toml");
  } else {
    console.log("  OK wrangler.toml already exists");
  }
}

function generateDockerfile(rootDir: string, outDir: string): void {
  const dockerfile = `FROM oven/bun:latest
WORKDIR /app
COPY . .
RUN bun install
RUN bun run apps/cli/tw/bin.ts build
EXPOSE 8000
CMD ["bun", "run", "apps/cli/tw/bin.ts", "serve", "--port", "8000"]`;

  const configPath = join(rootDir, "Dockerfile");
  const existing = existsSync(configPath);

  if (!existing) {
    const { writeFileSync } = require("node:fs");
    writeFileSync(configPath, dockerfile);
    console.log("  OK Generated Dockerfile");
  } else {
    console.log("  OK Dockerfile already exists");
  }
}
