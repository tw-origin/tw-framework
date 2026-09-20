/** Synchronous file system operations. */

import { join, dirname, extname } from "node:path";
import { getFs } from "./runtime-compat";
import { getFsPromises } from "./runtime-compat";
import { globMatch } from "./async";

function safeJsonParse(json, fallback) {
  try { return JSON.parse(json); }
  catch { return fallback; }
}



export function readFileSync(path: string): string {
  const fs = getFs();
  return fs.readFileSync(path, "utf-8");
}

export function writeFileSync(path: string, content: string | Uint8Array): void {
  const fs = getFs();
  fs.writeFileSync(path, content);
}

export function existsSync(path: string): boolean {
  const fs = getFs();
  try {
    return fs.existsSync(path);
  } catch {
    return false;
  }
}

export function statSync(path: string): { size: number; mtime: number; isFile: boolean; isDir: boolean } {
  const fs = getFs();
  const stat = fs.statSync(path);
  return {
    size: stat.size,
    mtime: stat.mtimeMs,
    isFile: stat.isFile(),
    isDir: stat.isDirectory(),
  };
}

export function mkdirSync(path: string, recursive: boolean = true): void {
  const fs = getFs();
  fs.mkdirSync(path, { recursive });
}

export function removeSync(path: string): void {
  const fs = getFs();
  try {
    fs.rmSync(path, { recursive: true, force: true });
  } catch {
    // Already removed
  }
}

export function copyFileSync(src: string, dest: string): void {
  const fs = getFs();
  fs.copyFileSync(src, dest);
}

export function renameSync(oldPath: string, newPath: string): void {
  const fs = getFs();
  fs.renameSync(oldPath, newPath);
}

export function readdirSync(path: string): string[] {
  const fs = getFs();
  return fs.readdirSync(path);
}

export function chmodSync(path: string, mode: number): void {
  const fs = getFs();
  fs.chmodSync(path, mode);
}

// --- Async Operations ---------------------------------------------------------

export function atomicWriteSync(path: string, content: string | Uint8Array): void {
  const fs = getFs();
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(dirname(path), { recursive: true });
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, path);
}

// --- File Locking ------------------------------------------------------------

export class FileLock {
  private lockPath: string;
  private acquired: boolean = false;

  constructor(filePath: string) {
    this.lockPath = `${filePath}.lock`;
  }

  async acquire(timeoutMs: number = 5000): Promise<boolean> {
    const fsp = getFsPromises();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        await fsp.writeFile(this.lockPath, String(process.pid), { flag: "wx" });
        this.acquired = true;
        return true;
      } catch (err: any) {
        if (err.code === "EEXIST") {
          // Check if the lock is stale
          try {
            const content = await fsp.readFile(this.lockPath, "utf-8");
            const lockPid = parseInt(content.trim(), 10);
            if (lockPid && !await isProcessAlive(lockPid)) {
              await fsp.unlink(this.lockPath);
              continue;
            }
          } catch {
            // Can't read lock -- wait and retry
          }
          await sleep(50);
        } else {
          throw err;
        }
      }
    }
    return false;
  }

  release(): Promise<void> {
    const fsp = getFsPromises();
    if (!this.acquired) return Promise.resolve();
    this.acquired = false;
    return fsp.unlink(this.lockPath).catch((e) => { console.debug("[TW] Cleanup error:", e); });
  }

  async withLock<T>(fn: () => T | Promise<T>, timeoutMs: number = 5000): Promise<T> {
    const acquired = await this.acquire(timeoutMs);
    if (!acquired) throw new Error(`Failed to acquire lock: ${this.lockPath}`);
    try {
      return await fn();
    } finally {
      await this.release();
    }
  }
}

async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// --- Walk / Traverse ----------------------------------------------------------

export interface WalkOptions {
  maxDepth?: number;
  includeDirs?: boolean;
  includeFiles?: boolean;
  extensions?: string[];
  exclude?: string[];
  excludeDirs?: string[];
  followSymlinks?: boolean;
}

export function walkSync(dir: string, opts?: WalkOptions): string[] {
  const maxDepth = opts?.maxDepth ?? Infinity;
  const includeDirs = opts?.includeDirs ?? false;
  const includeFiles = opts?.includeFiles ?? true;
  const extensions = opts?.extensions;
  const exclude = opts?.exclude ?? ["node_modules", ".git", "dist", ".tw-cache"];
  const excludeDirs = opts?.excludeDirs ?? ["node_modules", ".git", "dist", ".tw-cache"];
  const results: string[] = [];
  const fs = getFs();

  function walkDir(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = (fs.readdirSync(currentDir, { withFileTypes: true }) as any[]).map((d: any) => d.name);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, (entry as any).name);

      if ((entry as any).isDirectory()) {
        if (excludeDirs.includes((entry as any).name)) continue;
        if (includeDirs) results.push(fullPath);
        walkDir(fullPath, depth + 1);
      } else if ((entry as any).isFile() && includeFiles) {
        if (extensions && !extensions.includes(extname((entry as any).name))) continue;
        if (exclude.some(pattern => fullPath.includes(pattern))) continue;
        results.push(fullPath);
      }
    }
  }

  walkDir(dir, 0);
  return results;
}

// --- Glob Matching -----------------------------------------------------------

export function globSync(
  dir: string,
  pattern: string,
  opts?: WalkOptions,
): string[] {
  const files = walkSync(dir, opts);
  return files.filter(f => globMatch(pattern, f));
}

// --- File Watching ------------------------------------------------------------

export interface WatchOptions {
  recursive?: boolean;
  ignoreInitial?: boolean;
  exclude?: string[];
}

export interface WatchEvent {
  type: "create" | "modify" | "delete" | "rename";
  path: string;
  timestamp: number;
}

export function readJSONSync<T = any>(path: string): T {
  const content = readFileSync(path);
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Failed to parse JSON");
  }
}

export function writeJSONSync(path: string, data: any, pretty: boolean = true): void {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  atomicWriteSync(path, json);
}

// --- Misc Utilities ----------------------------------------------------------

export function copyDirSync(src: string, dest: string): void {
  const fs = getFs();
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// --- Temp Files ----------------------------------------------------------------

export function tempFileSync(ext: string = ".tmp"): { path: string; cleanup: () => void } {
  const os = (globalThis as any).require?.("node:os");
  const tmpDir = os?.tmpdir?.() ?? "/tmp";
  const path = join(tmpDir, `tw_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  return {
    path,
    cleanup: () => removeSync(path),
  };
}

// --- Safe read with fallback -------------------------------------------------

export function readOrSync<T>(path: string, fallback: T): T {
  try {
    return readFileSync(path) as unknown as T;
  } catch {
    return fallback;
  }
}











// --- Async Operations ---------------------------------------------------------


// --- File Locking ------------------------------------------------------------






// --- Walk / Traverse ----------------------------------------------------------



// --- Glob Matching -----------------------------------------------------------


// --- File Watching ------------------------------------------------------------





// --- Misc Utilities ----------------------------------------------------------


// --- Temp Files ----------------------------------------------------------------


// --- Safe read with fallback -------------------------------------------------


