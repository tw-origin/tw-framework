/**
 * Package-manager detection and commands (strategies.packages.manager).
 * `auto` (the default) reads the project's own signals -- the `packageManager`
 * field, then the lockfile -- so every command TW runs uses the manager the
 * project already uses. An explicit value overrides detection.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

export type PackageManagerName = "npm" | "pnpm" | "yarn" | "bun";
export type ManagerSource = "config" | "packageManager-field" | "lockfile" | "default";
export interface ManagerInfo { manager: PackageManagerName; source: ManagerSource; }

const LOCKFILES: Array<[string, PackageManagerName]> = [
  ["bun.lock", "bun"], ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"],
];

function fromPackageManagerField(rootDir: string): PackageManagerName | null {
  try {
    const raw = String(JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"))?.packageManager ?? "");
    const name = raw.split("@")[0].trim() as PackageManagerName;
    if (name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") return name;
  } catch { /* no package.json */ }
  return null;
}

export function detectPackageManager(rootDir: string): ManagerInfo {
  const field = fromPackageManagerField(rootDir);
  if (field) return { manager: field, source: "packageManager-field" };
  for (const [file, manager] of LOCKFILES) {
    if (existsSync(join(rootDir, file))) return { manager, source: "lockfile" };
  }
  return { manager: "npm", source: "default" };
}

export function resolvePackageManager(rootDir: string, strategies?: any): ManagerInfo {
  const chosen = strategies?.packages?.manager;
  if (chosen === "npm" || chosen === "pnpm" || chosen === "yarn" || chosen === "bun") {
    return { manager: chosen, source: "config" };
  }
  return detectPackageManager(rootDir);
}

export function installArgs(manager: PackageManagerName, packages: string[], opts: { dev?: boolean } = {}): { cmd: string; args: string[] } {
  const dev = opts.dev === true;
  switch (manager) {
    case "bun": return { cmd: "bun", args: ["add", ...(dev ? ["-d"] : []), ...packages] };
    case "pnpm": return { cmd: "pnpm", args: ["add", ...(dev ? ["-D"] : []), ...packages] };
    case "yarn": return { cmd: "yarn", args: ["add", ...(dev ? ["-D"] : []), ...packages] };
    default: return { cmd: "npm", args: ["install", ...(dev ? ["-D"] : []), ...packages] };
  }
}

export function installAllArgs(manager: PackageManagerName): { cmd: string; args: string[] } {
  switch (manager) {
    case "bun": return { cmd: "bun", args: ["install"] };
    case "pnpm": return { cmd: "pnpm", args: ["install"] };
    case "yarn": return { cmd: "yarn", args: ["install"] };
    default: return { cmd: "npm", args: ["install", "--no-audit", "--no-fund"] };
  }
}

export function execArgs(manager: PackageManagerName, bin: string, args: string[]): { cmd: string; args: string[] } {
  switch (manager) {
    case "bun": return { cmd: "bunx", args: [bin, ...args] };
    case "pnpm": return { cmd: "pnpm", args: ["dlx", bin, ...args] };
    case "yarn": return { cmd: "yarn", args: ["dlx", bin, ...args] };
    default: return { cmd: "npx", args: [bin, ...args] };
  }
}

export function runScriptArgs(manager: PackageManagerName, script: string): { cmd: string; args: string[] } {
  switch (manager) {
    case "bun": return { cmd: "bun", args: ["run", script] };
    case "pnpm": return { cmd: "pnpm", args: [script] };
    case "yarn": return { cmd: "yarn", args: [script] };
    default: return { cmd: "npm", args: ["run", script] };
  }
}

export interface EnsurePackagesResult { ok: boolean; installed: boolean; missing: string[]; message?: string; }

/**
 * Make sure optional packages are installed, offering to add them when
 * interactive. Never throws; the caller decides what to do with a non-ok
 * result. Mirrors the render-engine install flow.
 */
export async function ensurePackages(
  rootDir: string,
  packages: string[],
  label: string,
  opts: { interactive?: boolean; confirm?: (q: string) => Promise<boolean>; log?: (s: string) => void } = {},
): Promise<EnsurePackagesResult> {
  const log = opts.log ?? ((s: string) => console.log(s));
  const has = (name: string): boolean => {
    let dir = rootDir;
    for (let i = 0; i < 12; i++) {
      if (existsSync(join(dir, "node_modules", name))) return true;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return false;
  };
  const missing = packages.filter((p) => !has(p));
  if (missing.length === 0) return { ok: true, installed: false, missing: [] };

  const manager = resolvePackageManager(rootDir).manager;
  const cmd = installArgs(manager, missing, { dev: true });
  const interactive = opts.interactive ?? Boolean((process.stdin as any)?.isTTY);
  if (!interactive) {
    return { ok: false, installed: false, missing, message: `${label} needs ${missing.join(", ")}. Install with: ${commandLine(cmd)}` };
  }
  let confirm = opts.confirm;
  if (!confirm) {
    const { createInterface } = await import("node:readline/promises");
    confirm = async (q: string) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try { const a = (await rl.question(q)).trim().toLowerCase(); return a === "y" || a === "yes"; } finally { rl.close(); }
    };
  }
  if (!(await confirm(`${label} — not available (missing: ${missing.join(", ")}). Install now? (y/n) `))) {
    return { ok: false, installed: false, missing, message: `${label} skipped. Install later with: ${commandLine(cmd)}` };
  }
  log(`  Installing ${missing.join(", ")} with ${manager}...`);
  if (!runInstall(rootDir, manager, missing, { dev: true })) {
    return { ok: false, installed: false, missing, message: `Install failed. Try manually: ${commandLine(cmd)}` };
  }
  return { ok: packages.every(has), installed: true, missing: packages.filter((p) => !has(p)) };
}

export function commandLine(c: { cmd: string; args: string[] }): string {
  return c.cmd + (c.args.length ? " " + c.args.join(" ") : "");
}

export function runInstall(rootDir: string, manager: PackageManagerName, packages: string[], opts: { dev?: boolean; stdio?: "inherit" | "ignore" } = {}): boolean {
  const { cmd, args } = packages.length > 0 ? installArgs(manager, packages, opts) : installAllArgs(manager);
  return spawnSync(cmd, args, { cwd: rootDir, stdio: opts.stdio ?? "inherit" }).status === 0;
}
