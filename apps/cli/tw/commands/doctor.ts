/**
 * `tw doctor` — report which strategy each subsystem is using, whether the
 * selected options are available in this project, and which combinations
 * conflict. Read-only: never writes, never builds.
 *
 * Exit codes (CI-friendly):
 *   0  everything fine
 *   1  an invalid value (typo / unknown option)
 *   2  an unsupported combination
 *   3  a selected option is unavailable here (e.g. tailwind not installed)
 *
 * `--json` prints the whole report as one JSON object and uses the same codes.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolvePackageManager, describeStateModel, describeDataLayer, describeAuthModel, CACHE_MODES } from "@tw/shared";
import {
  DEFAULT_STRATEGIES,
  STRATEGY_NOTES,
  STRATEGY_OPTIONS,
  changedStrategies,
  checkCompatibility,
  describeStrategies,
  parseStrategyFlags,
  resolveStrategies,
  validateStrategies,
  type StrategiesConfig,
  type StrategyPath,
} from "@tw/shared";

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};
const ok = (s: string) => `${C.green}✓${C.reset} ${s}`;
const warn = (s: string) => `${C.yellow}!${C.reset} ${s}`;
const bad = (s: string) => `${C.red}✗${C.reset} ${s}`;

interface Availability {
  option: string;
  available: boolean;
  detail: string;
  fix?: string;
}

function hasPackage(rootDir: string, name: string): boolean {
  for (const base of [rootDir, process.cwd()]) {
    if (existsSync(join(base, "node_modules", name))) return true;
  }
  return false;
}

/** The manager TW will use, and how it was decided. */
function managerLabel(rootDir: string, resolved: StrategiesConfig): string {
  const info = resolvePackageManager(rootDir, resolved);
  const how = info.source === "config" ? "from strategies.packages.manager"
    : info.source === "packageManager-field" ? "from the packageManager field"
    : info.source === "lockfile" ? "from the lockfile" : "default";
  return `${info.manager} (${how})`;
}

/** Availability of the *selected* options in this project. */
function availability(resolved: StrategiesConfig, rootDir: string): Availability[] {
  const out: Availability[] = [];
  const isBun = typeof (globalThis as any).Bun !== "undefined";

  const t = resolved.signals.transport;
  if (t === "ws") {
    out.push(isBun
      ? { option: "signals.transport=ws", available: true, detail: "Bun's built-in WebSocket server" }
      : { option: "signals.transport=ws", available: false, detail: "no Bun runtime detected",
          fix: "run on Bun, or use --signals=sse / --signals=long-poll" });
  } else {
    out.push({ option: `signals.transport=${t}`, available: true, detail: "no extra dependency" });
  }

  const css = resolved.css.engine;
  if (css === "tailwind") {
    out.push(hasPackage(rootDir, "tailwindcss")
      ? { option: "css.engine=tailwind", available: true, detail: "tailwindcss found" }
      : { option: "css.engine=tailwind", available: false, detail: "tailwindcss not installed",
          fix: "npm i -D tailwindcss" });
  } else {
    out.push({ option: `css.engine=${css}`, available: true, detail: "built in" });
  }

  const r = resolved.render.engine;
  if (r === "react" || r === "preact") {
    out.push(hasPackage(rootDir, r)
      ? { option: `render.engine=${r}`, available: true, detail: `${r} found` }
      : { option: `render.engine=${r}`, available: false, detail: `${r} not installed`,
          fix: `npm i ${r}` });
  } else {
    out.push({ option: `render.engine=${r}`, available: true, detail: "built in" });
  }

  const dl = describeDataLayer(resolved.data.layer, rootDir);
  out.push(dl.available
    ? { option: `data.layer=${dl.layer}`, available: true, detail: dl.detail }
    : { option: `data.layer=${dl.layer}`, available: false, detail: `needs ${dl.missing.join(", ")}`, fix: `npm i -D ${dl.missing.join(" ")}` });

  out.push({ option: `cache.mode=${resolved.cache.mode}`, available: true, detail: CACHE_MODES[resolved.cache.mode as keyof typeof CACHE_MODES]?.detail ?? "" });

  const am = describeAuthModel(resolved.auth.model, rootDir);
  out.push(am.available
    ? { option: `auth.model=${am.model}`, available: true, detail: am.detail + " (" + am.provider + ")" }
    : { option: `auth.model=${am.model}`, available: false, detail: `needs ${am.missing.join(", ")}`, fix: `npm i -D ${am.missing.join(" ")}` });

  const sm = describeStateModel(resolved.state.model, resolved.render.engine);
  out.push(sm.available
    ? { option: `state.model=${sm.model}`, available: true, detail: sm.detail }
    : { option: `state.model=${sm.model}`, available: false, detail: `needs a React-compatible renderer`, fix: sm.fix });

  const api = resolved.api.runtime;
  if (api === "edge") {
    out.push({ option: "api.runtime=edge", available: true,
      detail: "handlers are checked at build time for fs / native / child_process" });
  } else {
    out.push({ option: `api.runtime=${api}`, available: true, detail: "every Node/Bun API" });
  }

  return out;
}

export async function doctorCommand(): Promise<void> {
  const rootDir = process.cwd();
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");

  let cfg: any = null;
  try {
    // A tw.config.ts must be imported (Bun evaluates TS natively);
    // loadConfigSync cannot read .ts and would report defaults.
    const tsPath = join(rootDir, "tw.config.ts");
    if (existsSync(tsPath)) {
      const { twImportTs } = await import("@tw/shared/tw/node-import");
      const mod: any = await twImportTs(tsPath);
      cfg = mod?.default ?? mod;
    } else {
      const { loadConfigSync } = await import("@tw/shared");
      cfg = loadConfigSync(rootDir);
    }
  } catch { cfg = null; }

  // config first, then CLI flags on top
  const merged: any = { ...(cfg?.strategies ?? {}) };
  const fromFlags = parseStrategyFlags(argv);
  for (const path of Object.keys(STRATEGY_OPTIONS) as StrategyPath[]) {
    const [a, b] = path.split(".");
    const flagVal = (fromFlags as any)[a]?.[b];
    if (flagVal !== undefined) {
      merged[a] = merged[a] ?? {};
      merged[a][b] = flagVal;
    }
  }

  const invalid = validateStrategies(merged);
  const resolved = resolveStrategies(merged);
  const conflicts = checkCompatibility(resolved);
  const avail = availability(resolved, rootDir);
  const changed = changedStrategies(resolved);
  const unavailable = avail.filter((a) => !a.available);
  const hardConflicts = conflicts.filter((c) => c.tier === "unsupported");
  const softConflicts = conflicts.filter((c) => c.tier !== "unsupported");

  const exitCode = invalid.length > 0 ? 1 : hardConflicts.length > 0 ? 2 : unavailable.length > 0 ? 3 : 0;

  if (asJson) {
    console.log(JSON.stringify({
      ok: exitCode === 0,
      exitCode,
      strategies: resolved,
      changed,
      invalid: invalid.map((i) => ({ path: i.path, value: i.value, allowed: i.allowed, suggestion: i.suggestion, message: i.message })),
      conflicts: conflicts.map((c) => ({ id: c.id, tier: c.tier, message: c.message, fix: c.fix })),
      availability: avail,
      packageManager: managerLabel(rootDir, resolved),
    }, null, 2));
    process.exit(exitCode);
  }

  console.log("");
  console.log(`${C.bold}tw doctor${C.reset} ${C.dim}— strategy + availability report${C.reset}`);
  console.log("");

  if (invalid.length > 0) {
    console.log(`${C.red}Invalid strategy values:${C.reset}`);
    for (const i of invalid) console.log("  " + bad(i.message));
    console.log("");
  }

  console.log(`${C.bold}Active strategies${C.reset}`);
  console.log("");
  for (const line of describeStrategies(resolved)) {
    console.log("  " + (line.includes("<- changed") ? C.cyan : C.dim) + line + C.reset);
  }
  console.log("");

  console.log(`${C.bold}Availability${C.reset}`);
  for (const a of avail) {
    const text = a.option + (a.detail ? ` — ${a.detail}` : "");
    console.log("  " + (a.available ? ok(text) : bad(text + (a.fix ? ` (fix: ${a.fix})` : ""))));
  }
  console.log(`${C.dim}  package manager:${C.reset} ${managerLabel(rootDir, resolved)}`);
  console.log("");

  if (conflicts.length > 0) {
    console.log(`${C.bold}Conflicts${C.reset}`);
    for (const c of conflicts) {
      const line = `[${c.tier}] ${c.message}`;
      console.log("  " + (c.tier === "unsupported" ? bad(line) : warn(line)));
      console.log(`      ${C.dim}fix: ${c.fix}${C.reset}`);
    }
    console.log("");
  } else {
    console.log(ok("No conflicts between the selected options."));
    console.log("");
  }

  if (changed.length > 0) {
    console.log(`${C.bold}Changed from default (${changed.length}):${C.reset}`);
    for (const c of changed) {
      console.log(`  ${c.path}: ${C.dim}${c.def}${C.reset} -> ${C.cyan}${c.value}${C.reset}`);
      const note = STRATEGY_NOTES[c.path as StrategyPath]?.[c.value];
      if (note) console.log(`      ${C.dim}${note}${C.reset}`);
    }
    console.log("");
  }

  console.log(`${C.dim}Switch with a flag, e.g.:${C.reset} tw build --css=tailwind --signals=ws`);
  console.log(`${C.dim}Machine-readable:${C.reset} tw doctor --json`);
  console.log("");

  if (exitCode !== 0) {
    console.log(`${C.red}Status: FAILED${C.reset} ${C.dim}(exit ${exitCode}: 1 invalid value, 2 unsupported combination, 3 option unavailable)${C.reset}`);
    console.log("");
  }

  process.exit(exitCode);
}
