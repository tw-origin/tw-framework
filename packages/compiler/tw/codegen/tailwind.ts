/**
 * First-class Tailwind CSS support (strategies.css.engine = "tailwind").
 * TW runs the project's own Tailwind at build time; when it is not installed
 * the caller fails with a clear message rather than shipping an unstyled page.
 */
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

export interface TailwindInfo { available: boolean; bin: string | null; major: number; detail: string; }

export function detectTailwind(rootDir: string): TailwindInfo {
  const pkgPath = join(rootDir, "node_modules", "tailwindcss", "package.json");
  const v3Cli = join(rootDir, "node_modules", "tailwindcss", "lib", "cli.js");
  const v4Cli = join(rootDir, "node_modules", "@tailwindcss", "cli", "dist", "index.mjs");
  let major = 0;
  if (existsSync(pkgPath)) {
    try { major = parseInt(String(JSON.parse(readFileSync(pkgPath, "utf8")).version ?? "").split(".")[0], 10) || 0; } catch { /* unreadable */ }
  }
  if (major >= 4 && existsSync(v4Cli)) return { available: true, bin: v4Cli, major: 4, detail: "tailwindcss v4 (via @tailwindcss/cli)" };
  if (existsSync(v3Cli)) return { available: true, bin: v3Cli, major: major || 3, detail: "tailwindcss v" + (major || 3) };
  if (existsSync(pkgPath)) return { available: true, bin: v3Cli, major: major || 3, detail: "tailwindcss found (CLI not located)" };
  return { available: false, bin: null, major: 0, detail: "tailwindcss not installed" };
}

function defaultInput(major: number): string {
  return major >= 4 ? '@import "tailwindcss";\n' : "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n";
}

export interface RunTailwindOptions { rootDir: string; content: string[]; input?: string; extraArgs?: string[]; }

export function runTailwind(opts: RunTailwindOptions): string {
  const info = detectTailwind(opts.rootDir);
  if (!info.available || !info.bin) {
    throw new Error("css.engine=tailwind requires tailwindcss in this project. Install it (npm i -D tailwindcss) or set strategies.css.engine to tss/css/scss.");
  }
  const work = mkdtempSync(join(tmpdir(), "tw-tailwind-"));
  const inFile = join(work, "in.css");
  const outFile = join(work, "out.css");
  writeFileSync(inFile, opts.input ?? defaultInput(info.major));
  const args = [info.bin, "-i", inFile, "-o", outFile];
  if (info.major < 4 && opts.content.length > 0) args.push("--content", opts.content.join(","));
  if (opts.extraArgs) args.push(...opts.extraArgs);
  try {
    const res = spawnSync(process.execPath, args, { cwd: opts.rootDir, encoding: "utf8" });
    if (res.status !== 0) throw new Error("tailwindcss exited " + res.status + (res.stderr ? ": " + res.stderr.trim().split("\n")[0] : ""));
    return existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
