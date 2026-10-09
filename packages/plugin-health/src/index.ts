/**
 * @tw/plugin-health — health and readiness endpoints.
 *
 * A load balancer, a container orchestrator or an uptime monitor needs to ask
 * "is this instance alive, and is it ready to take traffic?". This plugin
 * answers both, and lets you plug in real checks (a database ping, a queue, an
 * upstream API) so "ready" means ready.
 *
 *   GET /health   liveness  — the process is up. Always cheap.
 *   GET /readyz   readiness — every check passes. 503 when one does not.
 *
 * Install and enable:
 *
 *   tw plugin install @tw/plugin-health
 *
 *   // tw.config.ts
 *   plugins: [
 *     {
 *       name: "@tw/plugin-health",
 *       options: {
 *         checks: [
 *           { name: "db", run: async () => { await db.ping(); } },
 *         ],
 *       },
 *     },
 *   ],
 */

export interface HealthCheck {
  /** Shown in the response. */
  name: string;
  /** Throw (or reject) to mark the instance unhealthy. */
  run: () => unknown | Promise<unknown>;
  /** Milliseconds before the check is considered failed (default 2000). */
  timeoutMs?: number;
}

export interface HealthOptions {
  /** Liveness path (default "/health"). */
  path?: string;
  /** Readiness path (default "/readyz"). */
  readyPath?: string;
  /** Extra aliases for the liveness path, e.g. ["/healthz"]. */
  aliases?: string[];
  /** Real checks that decide readiness. */
  checks?: HealthCheck[];
  /** Include process details (uptime, memory, pid) in the body (default true). */
  details?: boolean;
  /** Shown as `version` in the body. Defaults to nothing. */
  version?: string;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface HealthReport {
  status: "ok" | "error";
  uptime: number;
  checks: CheckResult[];
  details?: { pid: number; memory: number; node: string };
  version?: string;
}

/** Run one check with a timeout; never throws. */
export async function runCheck(check: HealthCheck): Promise<CheckResult> {
  const started = Date.now();
  const timeoutMs = check.timeoutMs ?? 2000;
  try {
    await Promise.race([
      Promise.resolve(check.run()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]);
    return { name: check.name, ok: true, ms: Date.now() - started };
  } catch (e: any) {
    return { name: check.name, ok: false, ms: Date.now() - started, error: e?.message ?? String(e) };
  }
}

/** Run every check and assemble the report. */
export async function buildReport(
  opts: HealthOptions,
  startedAt: number,
  withChecks: boolean,
): Promise<HealthReport> {
  const checks = withChecks ? await Promise.all((opts.checks ?? []).map(runCheck)) : [];
  const failed = checks.some((c) => !c.ok);
  const report: HealthReport = {
    status: failed ? "error" : "ok",
    uptime: Math.round((Date.now() - startedAt) / 1000),
    checks,
  };
  if (opts.details !== false) {
    const mem = (globalThis as any).process?.memoryUsage?.();
    report.details = {
      pid: (globalThis as any).process?.pid ?? 0,
      memory: mem ? Math.round(mem.rss / 1024 / 1024) : 0, // MB
      node: (globalThis as any).process?.version ?? "unknown",
    };
  }
  if (opts.version) report.version = opts.version;
  return report;
}

interface PluginApi {
  on(hook: string, handler: (ctx: any) => any): void;
  getConfig(): any;
  getLogger(): any;
}

export interface HealthPlugin {
  name: string;
  version: string;
  description: string;
  priority?: number;
  setup(api: PluginApi): void;
}

const plugin: HealthPlugin = {
  name: "health",
  version: "2.0.0",
  description: "Serves /health and /readyz for load balancers and orchestrators",

  setup(api) {
    const opts: HealthOptions =
      api.getConfig()?.plugins?.find?.((p: any) => p?.name === "@tw/plugin-health")?.options ?? {};
    const startedAt = Date.now();
    const livePaths = new Set([opts.path ?? "/health", ...(opts.aliases ?? [])]);
    const readyPath = opts.readyPath ?? "/readyz";

    api.on("onRequest", async (ctx: any) => {
      const pathname: string = ctx?.url?.pathname ?? "";

      if (livePaths.has(pathname)) {
        // Liveness is deliberately cheap: the process answered, so it is alive.
        const body = await buildReport({ ...opts, checks: [] }, startedAt, false);
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }

      if (pathname === readyPath) {
        const body = await buildReport(opts, startedAt, true);
        return new Response(JSON.stringify(body), {
          status: body.status === "ok" ? 200 : 503,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }

      return undefined;
    });
  },
};

export default plugin;
