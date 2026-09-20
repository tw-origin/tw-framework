/**
 * Hybrid compiler -- auto-detects the fastest available backend.
 *
 * Priority:
 *   1. Native (napi-rs .node addon)     -- zero overhead, direct V8 FFI
 *   2. Child process pool (tw-rust)      -- persistent process, ~1ms overhead
 *   3. Pure TypeScript compiler          -- no binary needed, baseline speed
 *
 * This is the main entry point that `tw build` and `tw dev` use.
 * It automatically picks the best backend without user config.
 *
 * Usage:
 *   import { compile } from "@tw/compiler";
 *   const result = await compile("<div>hello</div>");
 *
 * Or force a specific backend:
 *   import { compileWith } from "@tw/compiler";
 *   const result = await compileWith("native", source);
 */

import { compile as tsCompile, compileSync as tsCompileSync } from "../index";
import { loadNative, hasNative, type NativeCompileResult } from "./loader";
import { findRustBinary, hasChildProcess, compilePooled, destroyPool } from "./child-process";

function safeJsonParse<T>(json: string, fallback: T): T {
  try { return safeJsonParse(json, null) as T; }
  catch { return fallback; }
}



export type Backend = "native" | "child-process" | "ts" | "auto";

export interface HybridCompileResult {
  html: string;
  css: string;
  js: string;
  diagnostics: any[];
  metadata: {
    totalTimeUs: number;
    totalTimeMs: number;
    nodeCount: number;
    directiveCount: number;
    backend: Backend;
    fromCache?: boolean;
  };
}

let detectedBackend: Backend | null = null;
let detectionCache: { native: boolean; childProcess: boolean } | null = null;

/**
 * Detect which backends are available.
 * Cached after first call -- only checks once per process.
 */
export function detectBackends(): { native: boolean; childProcess: boolean } {
  if (detectionCache) return detectionCache;

  detectionCache = {
    native: hasNative(),
    childProcess: hasChildProcess(),
  };

  return detectionCache;
}

/**
 * Get the best available backend.
 * Priority: native > child-process > ts
 */
export function getBestBackend(): Backend {
  if (detectedBackend) return detectedBackend;

  const { native, childProcess } = detectBackends();

  if (native) {
    detectedBackend = "native";
  } else if (childProcess) {
    detectedBackend = "child-process";
  } else {
    detectedBackend = "ts";
  }

  return detectedBackend;
}

/**
 * Set the backend manually. Pass "auto" to re-detect.
 */
export function setBackend(backend: Backend) {
  if (backend === "auto") {
    detectedBackend = null;
    detectionCache = null;
  } else {
    detectedBackend = backend;
  }
}

/**
 * Get info about all backends for debugging.
 */
export function getBackendInfo() {
  const { native, childProcess } = detectBackends();
  const best = getBestBackend();
  return {
    native: {
      available: native,
      path: native ? "@tw/native" : null,
    },
    childProcess: {
      available: childProcess,
      binary: childProcess ? findRustBinary() : null,
    },
    ts: {
      available: true, // always available
    },
    current: best,
  };
}

/**
 * Compile with a specific backend.
 */
export async function compileWith(
  backend: Backend,
  source: string,
  filePath?: string
): Promise<HybridCompileResult> {
  const start = Date.now();

  switch (backend) {
    case "native": {
      const mod = loadNative();
      if (!mod) throw new Error("Native backend not available. Build with: cd rust && napi build --release");
      const json = mod.compile(source, filePath);
      const result = safeJsonParse(json, null) as NativeCompileResult;
      const elapsed = Date.now() - start;
      return {
        html: result.html,
        css: result.css,
        js: result.js,
        diagnostics: result.diagnostics,
        metadata: {
          ...result.metadata,
          totalTimeMs: elapsed,
          backend: "native",
        },
      };
    }

    case "child-process": {
      const result = await compilePooled(source, filePath);
      const elapsed = Date.now() - start;
      return {
        html: result.html,
        css: result.css,
        js: result.js,
        diagnostics: result.diagnostics,
        metadata: {
          ...result.metadata,
          totalTimeMs: elapsed,
          backend: "child-process",
        },
      };
    }

    case "ts": {
      const result = await tsCompile(source, { filePath });
      const elapsed = Date.now() - start;
      return {
        html: result.html,
        css: result.css,
        js: result.js,
        diagnostics: result.diagnostics ?? [],
        metadata: {
          totalTimeUs: (result.metadata?.totalTime ?? elapsed) * 1000,
          totalTimeMs: elapsed,
          nodeCount: result.metadata?.nodeCount ?? 0,
          directiveCount: (result.metadata as any)?.directiveCount ?? 0,
          backend: "ts",
        },
      };
    }

    case "auto":
    default: {
      return compileAuto(source, filePath);
    }
  }
}

/**
 * Auto-detect and compile with the best available backend.
 * This is the primary function used by `tw build` and `tw dev`.
 */
export async function compileAuto(source: string, filePath?: string): Promise<HybridCompileResult> {
  const backend = getBestBackend();
  return compileWith(backend, source, filePath);
}

/**
 * Compile HTML only -- skips CSS/JS/diagnostics for maximum speed.
 * Uses the fastest available backend.
 */
export async function compileHtml(source: string): Promise<string> {
  const backend = getBestBackend();

  if (backend === "native") {
    const mod = loadNative();
    if (mod) return mod.compileHtml(source);
  }

  if (backend === "child-process") {
    const result = await compilePooled(source);
    return result.html;
  }

  // TS fallback
  const result = await tsCompile(source);
  return result.html;
}

/**
 * Compile synchronously -- only works with native or one-shot child process.
 * Falls back to TS compile if neither is available (TS compile is always sync).
 */
export function compileSync(source: string, filePath?: string): HybridCompileResult {
  const start = Date.now();
  const backend = getBestBackend();

  if (backend === "native") {
    const mod = loadNative();
    if (mod) {
      const json = mod.compile(source, filePath);
      const result = safeJsonParse(json, null) as NativeCompileResult;
      const elapsed = Date.now() - start;
      return {
        html: result.html,
        css: result.css,
        js: result.js,
        diagnostics: result.diagnostics,
        metadata: {
          ...result.metadata,
          totalTimeMs: elapsed,
          backend: "native",
        },
      };
    }
  }

  // For child-process and TS, use sync versions
  if (backend === "child-process") {
    const { spawnSync } = require("node:child_process");
    const binary = findRustBinary();
    if (binary) {
      const req = JSON.stringify({ source, filePath: filePath ?? null });
      const result = spawnSync(binary, ["--json"], {
        input: req,
        encoding: "utf8",
        timeout: 30000,
      });
      if (result.status === 0) {
        const parsed = safeJsonParse(result.stdout, null);
        const elapsed = Date.now() - start;
        return {
          html: parsed.html,
          css: parsed.css,
          js: parsed.js,
          diagnostics: parsed.diagnostics ?? [],
          metadata: {
            ...parsed.metadata,
            totalTimeMs: elapsed,
            backend: "child-process",
          },
        };
      }
    }
  }

  // TS fallback (always sync)
  const result = tsCompileSync(source, { filePath });
  const elapsed = Date.now() - start;
  return {
    html: result.html,
    css: result.css,
    js: result.js,
    diagnostics: result.diagnostics ?? [],
    metadata: {
      totalTimeUs: (result.metadata?.totalTime ?? elapsed) * 1000,
      totalTimeMs: elapsed,
      nodeCount: result.metadata?.nodeCount ?? 0,
      directiveCount: (result.metadata as any)?.directiveCount ?? 0,
      backend: "ts",
    },
  };
}

/**
 * Shutdown -- destroy process pool if active.
 */
export function shutdown() {
  destroyPool();
}
