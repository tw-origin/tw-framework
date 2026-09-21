/**
 * TW Framework — Bun deployment adapter (full server).
 *
 * Runs the production TWServer (pages + .twm APIs + middleware + config)
 * on Bun's native HTTP server. Copy this file next to your app (or generate
 * it with `tw adapter bun`) and run:
 *
 *   bun server.ts
 *
 * Env: PORT (default 3000) HOST (default 0.0.0.0) TW_ROOT (default .tw)
 */

import { TWServer } from "@tw/server";
import { join } from "node:path";

const rootDir = process.cwd();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const staticDir = process.env.TW_ROOT ?? join(rootDir, ".tw");

const server = new TWServer({
  rootDir,
  port,
  host,
  staticDir,
} as any);

try { server.loadRoutes(); } catch { /* optional */ }
try { server.loadMiddleware(); } catch { /* optional */ }
await server.start();
