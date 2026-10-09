/**
 * Plugin upgrade planning.
 *
 * `tw plugin upgrade` keeps the plugins a project depends on current. Official
 * plugins (`@tw/plugin-*`) are the default target, because those are the ones
 * that track the framework; `--all` also covers community packages.
 *
 * This module only *plans* — it reads the config, finds what is installed, and
 * asks npm what the latest is. The CLI runs the install. Keeping the plan
 * separate makes it testable without a network or a package manager.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classifySpec, type PluginSpecKind } from "./resolve";

export type PluginTier = "official" | "community" | "third-party" | "local";

export interface UpgradePlan {
  /** The specifier as written in tw.config.ts. */
  spec: string;
  tier: PluginTier;
  /** Version installed in node_modules, or null when it is not installed. */
  installed: string | null;
  /** Latest version on npm, or null when the registry could not be reached. */
  latest: string | null;
  /** True when `latest` is newer than `installed`. */
  behind: boolean;
  /** Why it was skipped, when it was. */
  skipped?: string;
}

/** Extract the text inside `plugins: [ ... ]`, honouring nesting and strings. */
export function extractPluginsArray(source: string): string | null {
  const at = /plugins\s*:\s*\[/.exec(source);
  if (!at) return null;
  const start = at.index + at[0].length - 1; // at the '['
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return source.slice(start + 1, i); }
  }
  return null;
}

/** The [start, end) of the text inside `plugins: [ ... ]`. */
export function pluginsArrayRange(source: string): { start: number; end: number } | null {
  const at = /plugins\s*:\s*\[/.exec(source);
  if (!at) return null;
  const start = at.index + at[0].length - 1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) return { start: start + 1, end: i }; }
  }
  return null;
}

/** Split an array body on top-level commas, keeping objects and strings whole. */
export function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      current += c;
      if (c === "\\") { current += body[++i] ?? ""; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; current += c; continue; }
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    if (c === "," && depth === 0) { out.push(current); current = ""; continue; }
    current += c;
  }
  out.push(current);
  return out;
}

/** The plugin name an entry declares — a bare string, or an object's `name:`. */
export function entryName(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    const m = /name\s*:\s*["'`]([^"'`]+)["'`]/.exec(trimmed);
    return m ? m[1] : null;
  }
  const m = /^["'`]([^"'`]+)["'`]$/.exec(trimmed);
  return m ? m[1] : null;
}

/** Pull the `plugins: [...]` entries out of tw.config.ts source. */
export function readPluginSpecs(source: string): string[] {
  const range = pluginsArrayRange(source);
  if (!range) return [];
  const out: string[] = [];
  // Read each top-level entry and ask it for its name. This is exact: an
  // option value (a URL, a glob) can never be mistaken for a plugin.
  for (const entry of splitTopLevel(source.slice(range.start, range.end))) {
    const name = entryName(entry);
    if (name) out.push(name);
  }
  return [...new Set(out)];
}

/**
 * A plugin spec is a bare name, a scoped name, or an explicit path — not an
 * option value. Option values (URLs, glob patterns, words with spaces) are
 * rejected.
 */
export function looksLikeSpec(value: string): boolean {
  if (!value) return false;
  if (value.includes(" ")) return false;
  if (value.startsWith("./") || value.startsWith("../")) return true;
  // An absolute path is a spec only if it is not a glob pattern.
  if (value.startsWith("/")) return !value.includes("*");
  if (value.startsWith("@")) return /^@[a-z0-9-]+\/[a-z0-9-]+$/i.test(value);
  return /^[a-z0-9][a-z0-9-]*$/i.test(value);
}

/** The version installed in node_modules, or null. */
export function installedVersion(pkg: string, rootDir: string): string | null {
  const pj = join(rootDir, "node_modules", ...pkg.split("/"), "package.json");
  if (!existsSync(pj)) return null;
  try { return JSON.parse(readFileSync(pj, "utf-8")).version ?? null; } catch { return null; }
}

/** Compare two semver strings; -1 older, 0 equal, 1 newer. Non-semver sorts last. */
export function compareVersions(a: string, b: string): number {
  const norm = (v: string) => v.replace(/^[^\d]*/, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const [x, y] = [norm(a), norm(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1;
  }
  return 0;
}

export interface LatestResult {
  version: string | null;
  /** Why there is no version: the package is not on npm, or we could not ask. */
  reason?: "not-found" | "unreachable";
}

/** Ask npm for a package's latest version, and why if there is none. */
export async function fetchLatest(pkg: string): Promise<LatestResult> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg).replace("%2F", "/")}/latest`);
    if (res.status === 404) return { version: null, reason: "not-found" };
    if (!res.ok) return { version: null, reason: "unreachable" };
    const body: any = await res.json();
    return { version: typeof body?.version === "string" ? body.version : null, reason: "not-found" };
  } catch { return { version: null, reason: "unreachable" }; }
}

/** Just the version, or null. Kept for callers that do not need the reason. */
export async function fetchLatestVersion(pkg: string): Promise<string | null> {
  return (await fetchLatest(pkg)).version;
}

export interface PlanOptions {
  /** Also plan community and third-party plugins (default: official only). */
  all?: boolean;
  /** Resolver for the latest version — overridden in tests. */
  latest?: (pkg: string) => Promise<string | null>;
  rootDir?: string;
}

/** Turn a missing latest into the sentence the CLI prints. */
function missingReason(r: LatestResult | null): string {
  if (!r) return "registry unreachable";
  return r.reason === "not-found" ? "not published on npm" : "registry unreachable";
}

/**
 * Build the upgrade plan. Official plugins are the default target; `--all`
 * widens it. Local plugins are never planned — they are project files.
 */
export async function planUpgrade(
  specs: string[],
  options: PlanOptions = {},
): Promise<UpgradePlan[]> {
  const rootDir = options.rootDir ?? process.cwd();
  const getLatest = options.latest ?? fetchLatestVersion;
  const plans: UpgradePlan[] = [];

  for (const spec of specs) {
    const tier = classifySpec(spec) as PluginTier;

    if (tier === "local") {
      plans.push({ spec, tier, installed: null, latest: null, behind: false, skipped: "local plugin (a project file)" });
      continue;
    }
    if (!options.all && tier !== "official") {
      plans.push({ spec, tier, installed: null, latest: null, behind: false, skipped: "not official (use --all)" });
      continue;
    }

    const installed = installedVersion(spec, rootDir);
    if (!installed) {
      plans.push({ spec, tier, installed: null, latest: null, behind: false, skipped: "not installed" });
      continue;
    }

    const latest = await getLatest(spec);
    plans.push({
      spec,
      tier,
      installed,
      latest,
      behind: latest !== null && compareVersions(installed, latest) < 0,
      skipped: latest === null
        ? (options.latest
            // a test supplied the resolver, so we cannot tell why it was null
            ? "registry unreachable"
            : missingReason(await fetchLatest(spec)))
        : undefined,
    });
  }

  return plans;
}

/** The plans that need an install. */
export function outdated(plans: UpgradePlan[]): UpgradePlan[] {
  return plans.filter((p) => p.behind);
}
