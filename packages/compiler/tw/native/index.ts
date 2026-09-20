/**
 * Native + hybrid compiler backends.
 *
 * Three backends, auto-selected:
 *   1. Native (napi-rs .node addon)     -- 10x faster, zero IPC
 *   2. Child process pool (tw-rust)      -- persistent process, ~1ms overhead
 *   3. Pure TypeScript compiler          -- always available, baseline
 *
 * Usage:
 *   import { compileAuto, compileWith, getBestBackend } from "@tw/compiler/native";
 *
 *   const result = await compileAuto("<div>hello</div>");
 *   console.debug(result.metadata.backend);  // "native" | "child-process" | "ts"
 *
 * Force a specific backend:
 *   const result = await compileWith("native", source);
 */

export { compileChildProcess, compileChildProcessAsync, compilePooled, destroyPool, findRustBinary, getPool, hasChildProcess } from "./child-process";
export type { BridgeResult } from "./child-process";
export { compileAuto, compileHtml, compileSync, compileWith, detectBackends, getBackendInfo, getBestBackend, setBackend, shutdown } from "./hybrid";
export type { Backend, HybridCompileResult } from "./hybrid";
export { compileHtmlNative, compileNative, hasNative, loadNative } from "./loader";
export type { NativeCompileResult, NativeModule } from "./loader";
