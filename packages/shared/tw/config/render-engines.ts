/**
 * Render-engine availability (strategies.render.engine).
 * TW's own VDOM is built in; React and Preact are optional. When one is
 * selected but missing the CLI offers to install it (interactive) and
 * otherwise fails with a clear message and a non-zero exit.
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

export type ForeignRenderEngine = "react" | "preact";

export interface RenderEngineInfo {
  engine: string;
  kind: "builtin" | "foreign";
  available: boolean;
  detail: string;
  packages: string[];
}

export function renderEnginePackages(engine: string): string[] {
  if (engine === "preact") return ["preact", "preact-render-to-string"];
  if (engine === "react") return ["react", "react-dom"];
  return [];
}

function hasPackage(rootDir: string, name: string): boolean {
  let dir = rootDir;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "node_modules", name))) return true;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

export function detectRenderEngine(rootDir: string, engine: string): RenderEngineInfo {
  if (engine !== "react" && engine !== "preact") {
    return { engine, kind: "builtin", available: true, detail: engine === "none" ? "no renderer" : "TW's own VDOM (built in)", packages: [] };
  }
  const packages = renderEnginePackages(engine);
  const missing = packages.filter((p) => !hasPackage(rootDir, p));
  return {
    engine, kind: "foreign", available: missing.length === 0,
    detail: missing.length === 0 ? `${engine} found` : `missing: ${missing.join(", ")}`,
    packages,
  };
}

export interface EnsureResult { ok: boolean; installed: boolean; info: RenderEngineInfo; message?: string; }
export interface EnsureOptions {
  interactive?: boolean;
  manager?: string;
  log?: (line: string) => void;
  confirm?: (question: string) => Promise<boolean>;
}

async function defaultConfirm(question: string): Promise<boolean> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally { rl.close(); }
}

/** Make sure the selected render engine is usable, offering to install it. */
export async function ensureRenderEngine(rootDir: string, engine: string, opts: EnsureOptions = {}): Promise<EnsureResult> {
  const log = opts.log ?? ((s: string) => console.log(s));
  let info = detectRenderEngine(rootDir, engine);
  if (info.kind === "builtin" || info.available) return { ok: true, installed: false, info };

  const { resolvePackageManager, installArgs, commandLine, runInstall } = await import("./package-manager");
  const interactive = opts.interactive ?? Boolean((process.stdin as any)?.isTTY);
  const manager: any = opts.manager ?? resolvePackageManager(rootDir).manager;
  const cmd = installArgs(manager, info.packages, { dev: true });

  if (!interactive) {
    return { ok: false, installed: false, info, message: `render.engine=${engine} is not available (${info.detail}). Install it with: ${commandLine(cmd)}` };
  }
  const confirm = opts.confirm ?? defaultConfirm;
  const yes = await confirm(`render.engine=${engine} — not available (${info.detail}). Install now? (y/n) `);
  if (!yes) {
    return { ok: false, installed: false, info, message: `render.engine=${engine} skipped. Install later with: ${commandLine(cmd)}` };
  }
  log(`  Installing ${info.packages.join(", ")} with ${manager}...`);
  if (!runInstall(rootDir, manager, info.packages, { dev: true })) {
    return { ok: false, installed: false, info, message: `Install failed. Try manually: ${commandLine(cmd)}` };
  }
  info = detectRenderEngine(rootDir, engine);
  return { ok: info.available, installed: true, info };
}

export function resolveRenderEngine(cfg: any): string {
  const e = cfg?.strategies?.render?.engine;
  return e === "react" || e === "preact" || e === "none" || e === "tw-vdom" ? e : "tw-vdom";
}
