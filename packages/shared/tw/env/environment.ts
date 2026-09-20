declare const Deno: any;

/** Environment detection -- detect runtime, platform, and capabilities. */

export type Runtime = "bun" | "node" | "deno" | "browser" | "worker" | "unknown";
export type Platform = "linux" | "darwin" | "win32" | "android" | "unknown";
export type Arch = "x64" | "arm64" | "arm" | "ia32" | "unknown";

export function detectRuntime(): Runtime {
  if (typeof Bun !== "undefined") return "bun";
  if (typeof Deno !== "undefined") return "deno";
  if (typeof process !== "undefined" && process.versions?.node) return "node";
  if (typeof window !== "undefined") return "browser";
  if (typeof self !== "undefined") return "worker";
  return "unknown";
}

export function detectPlatform(): Platform {
  if (typeof process !== "undefined" && process.platform) {
    return process.platform as Platform;
  }
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) return "android";
    if (ua.includes("win")) return "win32";
    if (ua.includes("mac")) return "darwin";
    if (ua.includes("linux")) return "linux";
  }
  return "unknown";
}

export function detectArch(): Arch {
  if (typeof process !== "undefined" && process.arch) {
    return process.arch as Arch;
  }
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("arm64") || ua.includes("aarch64")) return "arm64";
    if (ua.includes("arm")) return "arm";
    if (ua.includes("wow64") || ua.includes("x64")) return "x64";
  }
  return "unknown";
}

export function isProduction(): boolean {
  return process.env?.NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return process.env?.NODE_ENV === "development" || !isProduction();
}

export function isTest(): boolean {
  return process.env?.NODE_ENV === "test" || typeof (globalThis as any).jest !== "undefined";
}

export function supportsColor(): boolean {
  if (process.env?.NO_COLOR) return false;
  if (process.env?.FORCE_COLOR) return true;
  return typeof process !== "undefined" && process.stdout?.isTTY === true;
}

export function supportsWebSocket(): boolean {
  return typeof WebSocket !== "undefined" || typeof Bun !== "undefined";
}

export function supportsFileSystem(): boolean {
  return detectRuntime() !== "browser" && detectRuntime() !== "worker";
}

export function getEnvVar(name: string, fallback: string = ""): string {
  return process.env?.[name] ?? fallback;
}

export function getEnvBool(name: string, fallback: boolean = false): boolean {
  const val = process.env?.[name];
  if (val === undefined) return fallback;
  return val === "1" || val === "true" || val === "yes";
}

export function getEnvNumber(name: string, fallback: number = 0): number {
  const val = process.env?.[name];
  if (val === undefined) return fallback;
  const num = parseInt(val, 10);
  return isNaN(num) ? fallback : num;
}

export interface EnvironmentInfo {
  runtime: Runtime;
  platform: Platform;
  arch: Arch;
  nodeVersion: string | null;
  bunVersion: string | null;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  supportsColor: boolean;
  supportsWebSocket: boolean;
  supportsFileSystem: boolean;
  cwd: string;
  tmpDir: string;
}

export function getEnvironmentInfo(): EnvironmentInfo {
  const runtime = detectRuntime();
  return {
    runtime,
    platform: detectPlatform(),
    arch: detectArch(),
    nodeVersion: process.versions?.node ?? null,
    bunVersion: typeof Bun !== "undefined" ? Bun.version : null,
    isProduction: isProduction(),
    isDevelopment: isDevelopment(),
    isTest: isTest(),
    supportsColor: supportsColor(),
    supportsWebSocket: supportsWebSocket(),
    supportsFileSystem: supportsFileSystem(),
    cwd: process.cwd?.() ?? ".",
    tmpDir: (typeof require === "function" ? require("node:os").tmpdir() : "/tmp"),
  };
}
