/** tw serve -- start production server. */

import { join } from "node:path";
import { existsSync } from "node:fs";

export async function serveCommand(): Promise<void> {
  const args = process.argv.slice(3);
  let port: number | null = null;
  let host = "0.0.0.0";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
    } else if (args[i] === "--host" && args[i + 1]) {
      host = args[i + 1];
    }
  }

  const rootDir = process.cwd();
  const outDir = join(rootDir, ".tw");

  // .env support: load KEY=VALUE lines into process.env (without overwriting)
  const envPath = join(rootDir, ".env");
  if (existsSync(envPath)) {
    try {
      const { readFileSync } = await import("node:fs");
      for (const line of readFileSync(envPath, "utf-8").split("\n")) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !(m[1] in process.env)) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
      console.log("  Env: .env loaded");
    } catch { /* ignore */ }
  }

  // tw.config.ts: full config (port, redirects, headers, ...)
  let config: any = {};
  try {
    const cfgPath = join(rootDir, "tw.config.ts");
    if (existsSync(cfgPath)) {
      const { twImportTs } = await import("@tw/shared/tw/node-import");
    const cfgMod: any = await twImportTs(cfgPath);
      config = cfgMod.default ?? cfgMod;
      const cfgPort = config?.server?.port ?? config?.port;
      // 12-factor precedence: --port flag > PORT environment variable >
      // tw.config.ts port > 8000. PaaS platforms (Docker -e, Railway,
      // Render) inject PORT and expect it to win over the repo config.
      const envPort = Number(process.env.PORT);
      if (port === null && Number.isFinite(envPort) && envPort > 0) port = envPort;
      if (port === null && typeof cfgPort === "number") port = cfgPort;
    }
  } catch (e: any) { console.error("[tw:node] config load failed:", e && e.message); }
  if (port === null) port = 8000;

  console.debug("\n  tw serve -- starting production server\n");

  // Check for built output
  if (!existsSync(outDir)) {
    console.debug("  No build found. Run 'tw build' first.\n");
    process.exit(1);
  }

  try {
    const { TWServer } = await import("@tw/server");

    // Plugins: load from plugins/ per tw.config.ts (config is the
    // authority; without a plugins field every plugins/*.ts loads).
    let pluginManager: any = null;
    try {
      const { loadPlugins } = await import("@tw/plugins");
      pluginManager = await loadPlugins(rootDir, config);
    } catch { /* plugins are optional */ }

    const server = new TWServer({
      rootDir, port, host, staticDir: outDir, config,
      ...(config?.rateLimit ? { rateLimit: config.rateLimit } : {}),
      ...(typeof config?.compression === "boolean" ? { compression: config.compression } : {}),
      ...(pluginManager && pluginManager.size() > 0 ? { plugins: pluginManager } : {}),
      ...(config?.images ? { images: config.images } : {}),
      ...(config?.security ? { security: config.security } : {}),
    } as any);
    // Lifecycle: scan routes + load root middleware.twm
    try { server.loadRoutes(); } catch { /* optional */ }
    try { server.loadMiddleware(); } catch { /* optional */ }
    await server.start();

    // Production lifecycle: drain connections on SIGTERM/SIGINT
    // (docker stop, k8s pod terminate, Ctrl+C) instead of dropping them.
    const shutdown = async (signal: string) => {
      console.log(`\n  [TW] ${signal} received — shutting down gracefully...`);
      try { await server.gracefulShutdown(5000); } catch { /* already stopped */ }
      process.exit(0);
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
    // Keep the process alive through stray async failures (Node 15+ would
    // otherwise crash on an unhandled rejection from one bad route).
    process.on("unhandledRejection", (reason: any) => {
      console.warn("[TW] Unhandled promise rejection:", reason?.message ?? reason);
    });
  } catch (e) {
    console.debug("[TW] Ignored error:", e);
    // Fallback: simple Bun static file server
    console.debug("  Server package not found, starting static file server...\n");

    const server = Bun.serve({
      port,
      hostname: host,
      async fetch(req) {
        const url = new URL(req.url);
        let path = url.pathname;

        // Default to index.html
        if (path === "/") path = "/index.html";

        // Try exact path
        let file = Bun.file(join(outDir, path));
        if (await file.exists()) {
          return new Response(file);
        }

        // Try path + .html (for clean URLs)
        file = Bun.file(join(outDir, `${path}.html`));
        if (await file.exists()) {
          return new Response(file, {
            headers: { "Content-Type": "text/html" },
          });
        }

        // 404
        const notFoundPath = join(outDir, "404.html");
        if (existsSync(notFoundPath)) {
          const nf = Bun.file(notFoundPath);
          return new Response(nf, { status: 404, headers: { "Content-Type": "text/html" } });
        }

        return new Response("404 Not Found", { status: 404 });
      },
    });

    console.debug(`  -> http://${host}:${port}\n`);
    console.debug("  Serving from: " + outDir);
    console.debug("  Press Ctrl+C to stop\n");
  }
}
