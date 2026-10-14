/**
 * Vercel config generation -- one implementation for `tw adapter vercel`,
 * `tw ship vercel` and `tw init`.
 *
 * Vercel can serve a TW app two ways: the pre-built `.tw/` directory (static
 * pages only) or a serverless function that runs the whole TW server (SSR pages,
 * `.twm` API routes, middleware). Which one is right depends on the app, so the
 * config is chosen from the build summary `tw build` writes -- never guessed. An
 * SSR/API app given the static config deploys an empty site, which is exactly
 * what used to happen.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface BuildSummary {
  staticPages: number;
  ssrPages: number;
  apiRoutes: number;
  middleware: boolean;
}

/** The summary `tw build` writes into `.tw/`, or null when it is not there yet. */
export function readBuildSummary(appDir: string): BuildSummary | null {
  const p = join(appDir, ".tw", "build-summary.json");
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf-8"));
    return {
      staticPages: Number(j.staticPages) || 0,
      ssrPages: Number(j.ssrPages) || 0,
      apiRoutes: Number(j.apiRoutes) || 0,
      middleware: j.middleware === true,
    };
  } catch {
    return null;
  }
}

/** True when the app has anything a static host cannot serve. */
export function needsServer(summary: BuildSummary | null): boolean {
  if (!summary) return false;
  return summary.ssrPages > 0 || summary.apiRoutes > 0 || summary.middleware;
}

/** Static-only: serve the pre-built `.tw/` directory. */
export function vercelStaticConfig(): Record<string, unknown> {
  return {
    buildCommand: "npx tw build",
    installCommand: "npm install",
    outputDirectory: ".tw",
    framework: null,
  };
}

/** Serverless: every route runs the full TW server as a function. */
export function vercelServerlessConfig(): Record<string, unknown> {
  return {
    buildCommand: "npx tw build",
    installCommand: "npm install",
    functions: { "api/tw-server.ts": { memory: 512 } },
    rewrites: [{ source: "/(.*)", destination: "/api/tw-server" }],
  };
}

/** The serverless function entry that `vercel.json` rewrites every route to. */
export function vercelServerlessEntry(): string {
  return [
    "// TW Framework -- Vercel serverless entry.",
    "// Runs the full TW server (SSR pages + .twm API routes + middleware) as a",
    "// Vercel function. vercel.json rewrites every route here.",
    'import { TWServer } from "tw-framework/server";',
    "",
    "const server = new TWServer({ rootDir: process.cwd() });",
    "",
    "export default async function handler(request: Request): Promise<Response> {",
    "  return server.handleRequest(request);",
    "}",
    "",
  ].join("\n");
}

/**
 * Write `vercel.json` -- and, when the app needs a server, `api/tw-server.ts`.
 * Returns the paths written.
 */
export function writeVercelFiles(appDir: string, serverless: boolean): string[] {
  const written: string[] = [];
  const configPath = join(appDir, "vercel.json");
  writeFileSync(configPath, JSON.stringify(serverless ? vercelServerlessConfig() : vercelStaticConfig(), null, 2) + "\n");
  written.push(configPath);
  if (serverless) {
    const fn = join(appDir, "api", "tw-server.ts");
    mkdirSync(dirname(fn), { recursive: true });
    writeFileSync(fn, vercelServerlessEntry());
    written.push(fn);
  }
  return written;
}
