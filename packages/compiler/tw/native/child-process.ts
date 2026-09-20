/**
 * Child process backend -- spawns `tw-rust` binary, communicates via stdin/stdout JSON.
 *
 * This is "Backend 2: Child Process" in the hybrid compiler.
 * Uses a persistent process pool to avoid spawn overhead on repeated calls.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function safeJsonParse<T>(json: string, fallback: T): T {
  try { return safeJsonParse(json, null) as T; }
  catch { return fallback; }
}



export interface BridgeResult {
  html: string;
  css: string;
  js: string;
  diagnostics: string[];
  metadata: {
    totalTimeUs: number;
    nodeCount: number;
    directiveCount: number;
  };
}

// --- Binary Discovery -------------------------------------------------

let cachedBinaryPath: string | null | undefined = undefined;

/**
 * Find the tw-rust binary. Checks common locations.
 * Returns null if not found.
 */
export function findRustBinary(): string | null {
  if (cachedBinaryPath !== undefined) return cachedBinaryPath;

  const candidates: string[] = [
    // Local build
    join(process.cwd(), "rust/target/release/tw-rust"),
    join(process.cwd(), "rust/target/debug/tw-rust"),
    // .tw directory
    join(process.cwd(), ".tw/native/tw-rust"),
    // node_modules
    join(process.cwd(), "node_modules/.bin/tw-rust"),
    // Global
    "tw-rust",
  ];

  // Also check platform-specific names
  const ext = process.platform === "win32" ? ".exe" : "";
  for (const base of [...candidates]) {
    candidates.push(base + ext);
  }

  for (const candidate of candidates) {
    // For absolute/relative paths, check file exists
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(candidate)) {
        cachedBinaryPath = candidate;
        return candidate;
      }
    } else {
      // For global binary, try spawning with --version
      try {
        const { spawnSync } = require("node:child_process");
        const result = spawnSync(candidate, ["--version"], { timeout: 2000 });
        if (result.status === 0) {
          cachedBinaryPath = candidate;
          return candidate;
        }
      } catch {
        continue;
      }
    }
  }

  cachedBinaryPath = null;
  return null;
}

/**
 * Check if the child process backend is available.
 */
export function hasChildProcess(): boolean {
  return findRustBinary() !== null;
}

// --- One-shot compile (spawns process, compiles, exits) ---------------

/**
 * Compile using a one-shot child process spawn.
 * Each call spawns a new process -- simple but has ~5-10ms overhead.
 */
export function compileChildProcess(source: string, filePath?: string): BridgeResult {
  const binary = findRustBinary();
  if (!binary) throw new Error("tw-rust binary not found");

  const { spawnSync } = require("node:child_process");
  const req = JSON.stringify({ source, filePath: filePath ?? null });

  const result = spawnSync(binary, ["--json"], {
    input: req,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`tw-rust exited with code ${result.status}: ${result.stderr}`);
  }

  return safeJsonParse(result.stdout, null) as BridgeResult;
}

/**
 * Async version using child_process.spawn (non-blocking).
 */
export function compileChildProcessAsync(source: string, filePath?: string): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    const binary = findRustBinary();
    if (!binary) {
      reject(new Error("tw-rust binary not found"));
      return;
    }

    const child = spawn(binary, ["--json"]);
    const req = JSON.stringify({ source, filePath: filePath ?? null });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("close", (code: number) => {
      if (code !== 0) {
        reject(new Error(`tw-rust exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(safeJsonParse(stdout, null) as BridgeResult);
      } catch (e) {
        reject(new Error(`Failed to parse tw-rust output: ${e}`));
      }
    });

    child.on("error", reject);

    child.stdin.write(req);
    child.stdin.end();
  });
}

// --- Persistent Process Pool ------------------------------------------

/**
 * A persistent tw-rust process that stays alive and handles multiple
 * compile requests via a simple JSON line protocol.
 *
 * Protocol:
 *   Request:  JSON\n
 *   Response: JSON\n
 *
 * This avoids the 5-10ms spawn overhead on every compile call.
 * Used in dev mode where many compiles happen rapidly.
 */

const POOL_SIZE = 1; // One persistent process is enough for most cases
let pool: ProcessPool | null = null;

interface PoolWorker {
  process: ChildProcessWithoutNullStreams;
  busy: boolean;
  resolve: ((value: BridgeResult) => void) | null;
  reject: ((error: Error) => void) | null;
  buffer: string;
}

class ProcessPool {
  private workers: PoolWorker[] = [];
  private queue: Array<{
    source: string;
    filePath?: string;
    resolve: (value: BridgeResult) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(private binaryPath: string, private size: number) {
    for (let i = 0; i < size; i++) {
      this.spawnWorker();
    }
  }

  private spawnWorker() {
    const child = spawn(this.binaryPath, ["--json"]);
    const worker: PoolWorker = {
      process: child,
      busy: false,
      resolve: null,
      reject: null,
      buffer: "",
    };

    child.stdout.on("data", (chunk: Buffer) => {
      worker.buffer += chunk.toString();
      // Look for complete JSON line (ends with \n)
      const newlineIdx = worker.buffer.indexOf("\n");
      if (newlineIdx !== -1) {
        const line = worker.buffer.slice(0, newlineIdx);
        worker.buffer = worker.buffer.slice(newlineIdx + 1);
        if (worker.resolve) {
          try {
            const result = safeJsonParse(line, null) as BridgeResult;
            worker.resolve(result);
          } catch (e) {
            worker.reject?.(new Error(`Parse error: ${e}`));
          }
          worker.busy = false;
          worker.resolve = null;
          worker.reject = null;
          this.processQueue();
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      // Log stderr but don't crash
      console.error(`[tw-rust] ${chunk.toString().trim()}`);
    });

    child.on("error", (err: Error) => {
      worker.reject?.(err);
      worker.busy = false;
      worker.resolve = null;
      worker.reject = null;
    });

    child.on("close", (code: number) => {
      if (code !== 0 && worker.busy) {
        worker.reject?.(new Error(`tw-rust exited with code ${code}`));
      }
      // Respawn worker if pool is still active
      const idx = this.workers.indexOf(worker);
      if (idx !== -1) {
        this.workers.splice(idx, 1);
        if (this.workers.length < this.size) {
          this.spawnWorker();
        }
      }
    });

    this.workers.push(worker);
  }

  compile(source: string, filePath?: string): Promise<BridgeResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ source, filePath, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.queue.length === 0) return;

    const worker = this.workers.find((w) => !w.busy);
    if (!worker) return;

    const job = this.queue.shift()!;
    worker.busy = true;
    worker.resolve = job.resolve;
    worker.reject = job.reject;

    const req = JSON.stringify({ source: job.source, filePath: job.filePath ?? null }) + "\n";
    worker.process.stdin.write(req);
  }

  destroy() {
    for (const worker of this.workers) {
      worker.process.kill();
    }
    this.workers = [];
  }
}

/**
 * Get or create the process pool.
 */
export function getPool(): ProcessPool | null {
  if (pool) return pool;

  const binary = findRustBinary();
  if (!binary) return null;

  pool = new ProcessPool(binary, POOL_SIZE);
  return pool;
}

/**
 * Compile using the persistent process pool (fastest child process mode).
 */
export async function compilePooled(source: string, filePath?: string): Promise<BridgeResult> {
  const p = getPool();
  if (!p) throw new Error("tw-rust binary not found");
  return p.compile(source, filePath);
}

/**
 * Destroy the process pool (called on shutdown).
 */
export function destroyPool() {
  pool?.destroy();
  pool = null;
}
