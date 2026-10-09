/**
 * Strategy layer — every subsystem offers ALL its options, the user picks one.
 *
 * Principle: never replace an option with another. Ship both, select via
 * `tw.config.ts` (or a CLI flag), default to the current behaviour so nothing
 * breaks. A wrong value is a build-time error with a suggestion.
 */

// --- Option families ---------------------------------------------------------

/** How live signal updates reach the browser. */
export type SignalTransport = "sse" | "ws" | "long-poll";

/** Which styling engine compiles `.tss` / `.css` / `.scss` / Tailwind input. */
export type CssEngine = "tss" | "tailwind" | "css" | "scss";

/** Which renderer produces the client DOM. */
export type RenderEngine = "tw-vdom" | "react" | "preact" | "none";

/** Which server runtime hosts the app. */
export type ServerRuntime = "auto" | "bun" | "node" | "deno" | "edge";

/** Which runtime executes a `.twm` API handler. */
export type ApiRuntime = "node" | "edge";

/** How client state is modelled. */
export type StateModel = "signals" | "hooks" | "store";
/** Which auth mechanism a project uses. */
export type AuthModel = "session" | "jwt" | "oauth";

/** How data reaches pages/components. */
export type DataLayer = "routes" | "graphql" | "trpc";

/** How responses are cached. */
export type CacheMode = "isr" | "swr" | "none" | "cdn";

/** Which package manager the toolchain drives. */
export type PackageManager = "auto" | "npm" | "pnpm" | "yarn" | "bun";

/** How much JS runs on the client. */
export type HydrationMode = "auto" | "full" | "islands" | "none";

export type DbAdapterName = "sql" | "kv" | "vector";

export interface StrategiesConfig {
  signals: { transport: SignalTransport };
  css: { engine: CssEngine };
  render: { engine: RenderEngine };
  runtime: { server: ServerRuntime };
  api: { runtime: ApiRuntime };
  state: { model: StateModel };
  auth: { model: AuthModel };
  data: { layer: DataLayer };
  cache: { mode: CacheMode };
  packages: { manager: PackageManager };
  hydration: { mode: HydrationMode };
  db: { adapter: DbAdapterName };
}

/** Every strategy field with its allowed values. Drives validation + doctor. */
export const STRATEGY_OPTIONS = {
  "signals.transport": ["sse", "ws", "long-poll"],
  "css.engine": ["tss", "tailwind", "css", "scss"],
  "render.engine": ["tw-vdom", "react", "preact", "none"],
  "runtime.server": ["auto", "bun", "node", "deno", "edge"],
  "api.runtime": ["node", "edge"],
  "state.model": ["signals", "hooks", "store"],
  "auth.model": ["session", "jwt", "oauth"],
  "data.layer": ["routes", "graphql", "trpc"],
  "cache.mode": ["isr", "swr", "none", "cdn"],
  "packages.manager": ["auto", "npm", "pnpm", "yarn", "bun"],
  "hydration.mode": ["auto", "full", "islands", "none"],
  "db.adapter": ["sql", "kv", "vector"],
} as const;

export type StrategyPath = keyof typeof STRATEGY_OPTIONS;

/** Defaults = exactly today's behaviour, so nothing breaks. */
export const DEFAULT_STRATEGIES: StrategiesConfig = {
  signals: { transport: "sse" },
  css: { engine: "tss" },
  render: { engine: "tw-vdom" },
  runtime: { server: "auto" },
  api: { runtime: "node" },
  state: { model: "signals" },
  auth: { model: "session" },
  data: { layer: "routes" },
  cache: { mode: "isr" },
  packages: { manager: "auto" },
  hydration: { mode: "auto" },
  db: { adapter: "sql" },
};

/** Human-readable summary of each option — used by `tw doctor` and errors. */
export const STRATEGY_NOTES: Record<StrategyPath, Record<string, string>> = {
  "signals.transport": {
    sse: "Server-Sent Events — one long HTTP stream (default, proxy-friendly)",
    ws: "WebSocket — full duplex, lower per-message overhead",
    "long-poll": "Long polling — works where streaming is blocked",
  },
  "css.engine": {
    tss: "TW's own stylesheet language (default)",
    tailwind: "Tailwind CSS utility classes compiled by TW",
    css: "Plain CSS files, passed through",
    scss: "SCSS with nesting, $vars, &, @mixin/@include",
  },
  "render.engine": {
    "tw-vdom": "TW's own VDOM (default, ~3KB, zero-JS capable)",
    react: "React components rendered by TW",
    preact: "Preact components (smaller React-compatible runtime)",
    none: "No client renderer — static HTML only",
  },
  "runtime.server": {
    auto: "Detect at runtime (default)",
    bun: "Bun only",
    node: "Node.js 18+ only",
    deno: "Deno",
    edge: "Edge isolate (no Node APIs)",
  },
  "api.runtime": {
    node: "The server process \u2014 every Node/Bun API (default)",
    edge: "V8 isolate \u2014 no filesystem, no native modules",
  },
  "auth.model": {
    session: "cookie sessions (default)",
    jwt: "signed tokens",
    oauth: "external identity provider",
  },
  "state.model": {
    signals: "TW signals — public/private/serverOnly/derived (default)",
    hooks: "React-style hooks (useState/useEffect) compatibility",
    store: "External store adapter (Redux/Zustand-style)",
  },
  "data.layer": {
    routes: "API routes + server actions (default)",
    graphql: "GraphQL endpoint + typed client",
    trpc: "tRPC-style typed procedures",
  },
  "cache.mode": {
    isr: "Incremental Static Regeneration + revalidate (default)",
    swr: "Stale-while-revalidate only",
    none: "Always fresh, never cached",
    cdn: "Cache-Control driven, CDN purge hooks",
  },
  "packages.manager": {
    auto: "Detect from lockfile (default)",
    npm: "npm",
    pnpm: "pnpm",
    yarn: "yarn",
    bun: "bun",
  },
  "db.adapter": {
    sql: "A SQL database \u2014 bun:sqlite in-process by default (default)",
    kv: "A key/value store with TTL, prefix scan and atomic counters",
    vector: "A vector store with cosine-similarity top-k search",
  },
  "hydration.mode": {
    auto: "Decide per page from its markers (default)",
    full: "Hydrate every interactive page",
    islands: "Hydrate only marked islands",
    none: "Ship zero client JS",
  },
};

// --- Resolve / validate ------------------------------------------------------

function setPath(obj: any, path: string, value: any): void {
  const [a, b] = path.split(".");
  obj[a] = obj[a] ?? {};
  obj[a][b] = value;
}

function getPath(obj: any, path: string): any {
  const [a, b] = path.split(".");
  return obj?.[a]?.[b];
}

/** Deep-merge a partial strategy config over the defaults. */
export function resolveStrategies(partial?: Partial<StrategiesConfig> | null): StrategiesConfig {
  const out: any = JSON.parse(JSON.stringify(DEFAULT_STRATEGIES));
  if (!partial) return out;
  for (const path of Object.keys(STRATEGY_OPTIONS) as StrategyPath[]) {
    const v = getPath(partial, path);
    if (v !== undefined && v !== null && v !== "") setPath(out, path, v);
  }
  return out as StrategiesConfig;
}

export interface StrategyIssue {
  path: StrategyPath;
  value: unknown;
  allowed: readonly string[];
  /** Closest allowed value, when the typo is obvious. */
  suggestion?: string;
  message: string;
}

/** Levenshtein distance — used only for "did you mean" suggestions. */
function distance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function nearest(value: string, allowed: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const a of allowed) {
    const d = distance(value.toLowerCase(), a.toLowerCase());
    if (d < bestD) { bestD = d; best = a; }
  }
  return bestD <= 3 ? best : undefined;
}

/** Validate a partial strategy config. Returns [] when everything is valid. */
export function validateStrategies(partial?: Partial<StrategiesConfig> | null): StrategyIssue[] {
  if (!partial) return [];
  const issues: StrategyIssue[] = [];
  for (const path of Object.keys(STRATEGY_OPTIONS) as StrategyPath[]) {
    const v = getPath(partial, path);
    if (v === undefined || v === null || v === "") continue;
    const allowed = STRATEGY_OPTIONS[path];
    if (!(allowed as readonly string[]).includes(String(v))) {
      issues.push({
        path,
        value: v,
        allowed,
        suggestion: typeof v === "string" ? nearest(v, allowed) : undefined,
        message:
          `Invalid ${path}: ${JSON.stringify(v)}. Allowed: ${allowed.join(", ")}` +
          (typeof v === "string" && nearest(v, allowed) ? ` (did you mean "${nearest(v, allowed)}"?)` : ""),
      });
    }
  }
  return issues;
}

// --- CLI flags ---------------------------------------------------------------

/**
 * Map CLI flags to strategy overrides:
 *   --signals=ws --css=tailwind --render=react --api=edge ...
 * Unknown values are returned as-is so validateStrategies() can reject them
 * with a suggestion.
 */
export function parseStrategyFlags(argv: string[]): Partial<StrategiesConfig> {
  const out: any = {};
  const flagToPath: Record<string, StrategyPath> = {
    "--signals": "signals.transport",
    "--transport": "signals.transport",
    "--css": "css.engine",
    "--render": "render.engine",
    "--runtime": "runtime.server",
    "--api": "api.runtime",
    "--state": "state.model",
    "--data": "data.layer",
    "--cache": "cache.mode",
    "--pm": "packages.manager",
    "--packages": "packages.manager",
    "--hydration": "hydration.mode",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const key = eq === -1 ? a : a.slice(0, eq);
    const path = flagToPath[key];
    if (!path) continue;
    let value = eq === -1 ? argv[i + 1] : a.slice(eq + 1);
    if (!value || value.startsWith("--")) continue;
    setPath(out, path, value);
    if (eq === -1) i++;
  }
  return out;
}

/** Non-default fields, for `tw doctor` and logs. */
export function changedStrategies(resolved: StrategiesConfig): Array<{ path: StrategyPath; value: string; def: string }> {
  const out: Array<{ path: StrategyPath; value: string; def: string }> = [];
  for (const path of Object.keys(STRATEGY_OPTIONS) as StrategyPath[]) {
    const value = String(getPath(resolved, path));
    const def = String(getPath(DEFAULT_STRATEGIES, path));
    if (value !== def) out.push({ path, value, def });
  }
  return out;
}

/** Pretty lines for `tw doctor` / build summary. */
export function describeStrategies(resolved: StrategiesConfig): string[] {
  return (Object.keys(STRATEGY_OPTIONS) as StrategyPath[]).map((path) => {
    const value = String(getPath(resolved, path));
    const note = STRATEGY_NOTES[path][value] ?? "";
    const def = String(getPath(DEFAULT_STRATEGIES, path));
    const mark = value === def ? "" : "  <- changed";
    return `${path.padEnd(20)} ${value.padEnd(12)} ${note}${mark}`;
  });
}
