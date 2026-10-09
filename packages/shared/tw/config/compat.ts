/**
 * Strategy compatibility — the cross-field rules.
 *
 * Single-field validation catches typos (`taiwind`). Real bugs come from
 * *combinations*: a WebSocket transport on a runtime that has no WebSocket
 * server, ISR on a runtime with no writable cache, "zero JS" together with a
 * client-side state model. Those are checked here.
 *
 * Tiers
 *   supported    — we test this combination in CI
 *   best-effort  — allowed, not guaranteed, no hard error
 *   unsupported  — a hard error with a fix suggestion
 */
import type { StrategiesConfig } from "./strategies";

export type CompatTier = "supported" | "best-effort" | "unsupported";

export interface CompatRule {
  id: string;
  /** Human sentence describing the conflict. */
  message: string;
  /** How to fix it — shown by `tw doctor` and in the config error. */
  fix: string;
  tier: CompatTier;
  /** true when the resolved strategies violate the rule. */
  when: (s: StrategiesConfig) => boolean;
}

const NON_BUN_RUNTIMES = ["node", "deno", "edge"];
const CLIENT_RENDERERS = ["react", "preact", "tw-vdom"];

export const COMPAT_RULES: CompatRule[] = [
  {
    id: "ws-needs-bun",
    tier: "unsupported",
    message:
      "signals.transport=ws needs a WebSocket server; runtime.server is node/deno/edge",
    fix: "switch runtime.server to \"bun\", or use --signals=sse / --signals=long-poll",
    when: (s) => s.signals.transport === "ws" && NON_BUN_RUNTIMES.includes(s.runtime.server),
  },
  {
    id: "no-renderer-no-hydration",
    tier: "unsupported",
    message: "render.engine=none ships no renderer, so hydration.mode=full/islands has nothing to hydrate",
    fix: "set hydration.mode=\"none\", or pick a render engine (tw-vdom | react | preact)",
    when: (s) => s.render.engine === "none" && (s.hydration.mode === "full" || s.hydration.mode === "islands"),
  },
  {
    id: "zero-js-vs-client-model",
    tier: "unsupported",
    message: "hydration.mode=none ships zero client JS, which contradicts a client-side state model / renderer",
    fix: "set hydration.mode=\"auto\" (or \"full\"), or move state to the server (signals + serverOnlySignal)",
    when: (s) =>
      s.hydration.mode === "none" &&
      (s.state.model === "hooks" || s.render.engine === "react" || s.render.engine === "preact"),
  },
  {
    id: "isr-needs-writable-cache",
    tier: "unsupported",
    message: "cache.mode=isr needs a writable cache; runtime.server=edge has no persistent storage",
    fix: "switch runtime.server to \"bun\"/\"node\", or use --cache=cdn / --cache=swr",
    when: (s) => s.cache.mode === "isr" && s.runtime.server === "edge",
  },
  {
    id: "hooks-need-react",
    tier: "unsupported",
    message: "state.model=hooks needs a React-compatible renderer",
    fix: "set render.engine=\"react\" or \"preact\", or keep state.model=\"signals\"",
    when: (s) => s.state.model === "hooks" && !["react", "preact"].includes(s.render.engine),
  },
  {
    id: "store-needs-client-js",
    tier: "unsupported",
    message: "state.model=store is a client-side store and cannot run with hydration.mode=none",
    fix: "set hydration.mode=\"auto\", or use state.model=\"signals\"",
    when: (s) => s.state.model === "store" && s.hydration.mode === "none",
  },
  {
    id: "graphql-trpc-need-server",
    tier: "best-effort",
    message: "data.layer=graphql/trpc needs a server runtime to host the endpoint",
    fix: "runtime.server=\"edge\" works only if the endpoint is stateless; otherwise use bun/node",
    when: (s) => (s.data.layer === "graphql" || s.data.layer === "trpc") && s.runtime.server === "edge",
  },
  {
    id: "ws-on-edge-timeouts",
    tier: "best-effort",
    message: "signals.transport=ws on an edge runtime is limited by the platform's connection timeout",
    fix: "prefer --signals=sse or --signals=long-poll on edge platforms",
    when: (s) => s.signals.transport === "ws" && s.runtime.server === "edge",
  },
  {
    id: "sse-on-edge-timeouts",
    tier: "best-effort",
    message: "signals.transport=sse holds a long-lived response, which edge platforms cap by request duration",
    fix: "on edge platforms prefer --signals=long-poll (each request is short)",
    when: (s) => s.signals.transport === "sse" && s.runtime.server === "edge",
  },
  {
    id: "islands-need-a-renderer",
    tier: "unsupported",
    message: "hydration.mode=islands needs a client renderer to hydrate the islands",
    fix: "pick render.engine=\"tw-vdom\" | \"react\" | \"preact\", or use hydration.mode=\"none\"",
    when: (s) => s.hydration.mode === "islands" && s.render.engine === "none",
  },
];

export interface CompatIssue {
  id: string;
  tier: CompatTier;
  message: string;
  fix: string;
}

/** All compatibility problems for a resolved strategy set. */
export function checkCompatibility(s: StrategiesConfig): CompatIssue[] {
  const out: CompatIssue[] = [];
  for (const rule of COMPAT_RULES) {
    try {
      if (rule.when(s)) out.push({ id: rule.id, tier: rule.tier, message: rule.message, fix: rule.fix });
    } catch { /* a rule must never break config loading */ }
  }
  return out;
}

/** Hard errors only (tier=unsupported). */
export function compatErrors(s: StrategiesConfig): CompatIssue[] {
  return checkCompatibility(s).filter((i) => i.tier === "unsupported");
}

/**
 * The combinations CI actually runs. Every entry must be conflict-free; the
 * test suite asserts exactly that, so the matrix can never rot.
 */
export const SUPPORTED_MATRIX: Array<Partial<Record<string, string>>> = [
  { "signals.transport": "sse", "css.engine": "tss", "render.engine": "tw-vdom", "runtime.server": "bun", "cache.mode": "isr" },
  { "signals.transport": "ws", "css.engine": "tss", "render.engine": "tw-vdom", "runtime.server": "bun", "cache.mode": "isr" },
  { "signals.transport": "long-poll", "css.engine": "tss", "render.engine": "tw-vdom", "runtime.server": "bun", "cache.mode": "isr" },
  { "signals.transport": "sse", "css.engine": "tailwind", "render.engine": "tw-vdom", "runtime.server": "node", "cache.mode": "swr" },
  { "signals.transport": "sse", "css.engine": "scss", "render.engine": "react", "runtime.server": "bun", "cache.mode": "isr", "state.model": "hooks" },
  { "signals.transport": "long-poll", "css.engine": "css", "render.engine": "none", "runtime.server": "edge", "hydration.mode": "none", "cache.mode": "cdn" },
  { "signals.transport": "long-poll", "css.engine": "tss", "render.engine": "preact", "runtime.server": "edge", "cache.mode": "cdn", "api.runtime": "edge" },
];

/** Expand a dotted-key matrix entry into a partial StrategiesConfig. */
export function matrixEntryToConfig(entry: Record<string, string>): any {
  const out: any = {};
  for (const [path, value] of Object.entries(entry)) {
    const [a, b] = path.split(".");
    out[a] = out[a] ?? {};
    out[a][b] = value;
  }
  return out;
}
