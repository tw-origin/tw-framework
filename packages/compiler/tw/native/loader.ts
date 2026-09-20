/**
 * Native binding -- tries to load the napi-rs .node addon.
 * If not available, returns null (caller falls back to child process or TS).
 *
 * This file is the "Backend 1: Native" in the hybrid compiler.
 *
 * Build the native addon:
 *   cd rust && napi build --release --platform
 *   # produces: packages/native/index.node
 *
 * Or via cargo:
 *   cd rust && cargo build -p tw-native --release
 *   # then copy the .so/.dylib/.dll to a .node file
 */

export interface NativeCompileResult {
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

export interface NativeModule {
  compile(source: string, filePath?: string): string;
  compileHtml(source: string): string;
  countTokens(source: string): number;
  tokenizeJson(source: string): string;
  parseJson(source: string): string;
  isNative(): boolean;
  nativeVersion(): string;
}

let cachedModule: NativeModule | null | undefined = undefined;

/**
 * Try to load the native .node addon.
 * Returns the module if available, null if not, never throws.
 */
export function loadNative(): NativeModule | null {
  if (cachedModule !== undefined) return cachedModule;

  try {
    // Bun: can require .node files directly
    // Node: needs process.dlopen or require
    // Try multiple paths where the .node file could be
    const paths = [
      "@tw/native",
      "../native/index.node",
      "./native/index.node",
      `${process.cwd()}/.tw/native/index.node`,
      `${process.cwd()}/node_modules/@tw/native/index.node`,
    ];

    for (const p of paths) {
      try {
        // Bun supports require() for .node files
        const mod = require(p) as NativeModule;
        if (mod && typeof mod.compile === "function") {
          cachedModule = mod;
          return mod;
        }
      } catch {
        // try next path
        continue;
      }
    }

    cachedModule = null;
    return null;
  } catch {
    cachedModule = null;
    return null;
  }
}

/**
 * Check if the native binding is available.
 */
export function hasNative(): boolean {
  return loadNative() !== null;
}

/**
 * Compile using the native binding. Throws if not available.
 */
export function compileNative(source: string, filePath?: string): NativeCompileResult {
  const mod = loadNative();
  if (!mod) throw new Error("Native binding not available");

  const json = mod.compile(source, filePath);
  try {
    return JSON.parse(json) as NativeCompileResult;
  } catch (e) {
    throw new Error(`Native compile returned invalid JSON: ${(e as Error).message}`);
  }
}

/**
 * Compile to HTML only using the native binding. Faster.
 */
export function compileHtmlNative(source: string): string {
  const mod = loadNative();
  if (!mod) throw new Error("Native binding not available");
  return mod.compileHtml(source);
}
