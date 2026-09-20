/** tw ship -- deploy to platform. */

import { join } from "node:path";
import { existsSync } from "node:fs";

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
      generateVercelConfig(rootDir, outDir);
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

function generateVercelConfig(rootDir: string, outDir: string): void {
  const config = {
    buildCommand: "npx tw build",
    outputDirectory: ".tw",
    installCommand: "bun install",
    framework: null,
  };

  const configPath = join(rootDir, "vercel.json");
  const existing = existsSync(configPath);

  if (!existing) {
    const { writeFileSync } = require("node:fs");
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("  OK Generated vercel.json");
  } else {
    console.log("  OK vercel.json already exists");
  }
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
