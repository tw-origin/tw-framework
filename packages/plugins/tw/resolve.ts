/**
 * Plugin resolution — a plugin is either a project file or an npm package.
 *
 * A `plugins` entry in tw.config.ts may be any of:
 *
 *   "hit-counter"              a local plugin  -> plugins/hit-counter.ts
 *   "./tools/audit"            an explicit path
 *   "tw-plugin-analytics"      an npm package  (the community convention)
 *   "@acme/tw-plugin-reports"  a scoped npm package
 *   "@tw/plugin-sitemap"       an official TW package
 *
 * Resolution order, which keeps every existing project working:
 *   1. an explicit path (starts with `.` or `/`)
 *   2. a local file  plugins/<spec>.ts
 *   3. an npm package, resolved from the project's node_modules
 *
 * A package that ships without the `tw-plugin` keyword still loads, but the
 * loader warns: the keyword is what makes a plugin discoverable.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PluginSpecKind = "path" | "local" | "package";

export interface ResolvedPlugin {
  /** The specifier exactly as it was written in tw.config.ts. */
  spec: string;
  kind: PluginSpecKind;
  /** Absolute file to import (path and local always; package when resolvable). */
  file?: string;
  /** npm package name (kind === "package"). */
  packageName?: string;
  /** Set when nothing matched — the loader logs it and skips. */
  error?: string;
  /** True when a resolved package lacks the `tw-plugin` keyword. */
  missingKeyword?: boolean;
}

/** The keyword every published TW plugin should carry. */
export const PLUGIN_KEYWORD = "tw-plugin";

/** Package-name prefixes we recognise. `@tw/*` is reserved for official. */
export const COMMUNITY_PREFIX = "tw-plugin-";
export const OFFICIAL_SCOPE = "@tw/";

/** True when a spec is written as an explicit file path. */
export function isExplicitPath(spec: string): boolean {
  return spec.startsWith(".") || spec.startsWith("/");
}

/** The plugin kind implied by a spec's name alone (before it is resolved). */
export function classifySpec(spec: string): "official" | "community" | "third-party" | "local" {
  if (spec.startsWith(OFFICIAL_SCOPE)) return "official";
  if (spec.startsWith(COMMUNITY_PREFIX)) return "community";
  if (spec.startsWith("@")) return "third-party";
  return "local";
}

/** Resolve an npm package specifier to an absolute file, from the project root. */
export function resolvePackageFile(spec: string, rootDir: string): string | null {
  // Bun resolves synchronously and understands exports + conditions.
  const B = (globalThis as any).Bun;
  if (B && typeof B.resolveSync === "function") {
    try { return B.resolveSync(spec, rootDir); } catch { /* fall through */ }
  }
  // Node: resolve from a require anchored at the project.
  try {
    const { createRequire } = require("node:module");
    const req = createRequire(join(rootDir, "package.json"));
    return req.resolve(spec);
  } catch { /* not installed */ }
  return null;
}

/** Read an installed package's manifest, or null. */
export function readPackageManifest(packageName: string, rootDir: string): any | null {
  const dir = join(rootDir, "node_modules", ...packageName.split("/"));
  const pj = join(dir, "package.json");
  if (!existsSync(pj)) return null;
  try { return JSON.parse(readFileSync(pj, "utf-8")); } catch { return null; }
}

/** True when a manifest carries the `tw-plugin` keyword. */
export function hasPluginKeyword(manifest: any): boolean {
  const kw = manifest?.keywords;
  return Array.isArray(kw) && kw.some((k: unknown) => String(k).toLowerCase() === PLUGIN_KEYWORD);
}

/**
 * Resolve one specifier to something importable.
 * Never throws — an unresolved spec comes back with `error` set.
 */
export function resolvePlugin(spec: string, rootDir: string): ResolvedPlugin {
  if (!spec || typeof spec !== "string") {
    return { spec: String(spec), kind: "local", error: "empty plugin specifier" };
  }

  // 1. an explicit path (with the same extension fallbacks a bundler uses)
  if (isExplicitPath(spec)) {
    const base = join(rootDir, spec);
    for (const candidate of [base, base + ".ts", join(base, "index.ts")]) {
      if (existsSync(candidate)) return { spec, kind: "path", file: candidate };
    }
    return { spec, kind: "path", error: `path not found: ${spec}` };
  }

  // 2. a local plugin file (existing behaviour — a bare name means plugins/<name>.ts)
  const local = join(rootDir, "plugins", spec + ".ts");
  if (existsSync(local)) return { spec, kind: "local", file: local };

  // 3. an npm package
  const file = resolvePackageFile(spec, rootDir);
  if (file) {
    const manifest = readPackageManifest(spec, rootDir);
    return {
      spec,
      kind: "package",
      file,
      packageName: spec,
      missingKeyword: manifest ? !hasPluginKeyword(manifest) : false,
    };
  }

  return {
    spec,
    kind: "local",
    error: `not found: no plugins/${spec}.ts and no package "${spec}" installed`,
  };
}
