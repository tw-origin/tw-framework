/**
 * Debug Utils -- debugging and development utilities.
 *
 * Features:
 * - Debug logging with levels and filtering
 * - Assertions (throw on condition failure)
 * - Performance timing (measure code blocks)
 * - Memory usage tracking
 * - Stack trace capture
 * - Object inspection (deep print)
 * - Color-coded console output
 * - Log buffering (collect logs for later)
 * - Environment detection
 * - Development-only checks
 * - Performance.now() wrappers
 * - Slow function detection
 */

// --- Types ------------------------------------------------------------

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

export interface DebugOptions {
  level?: LogLevel;
  enabled?: boolean;
  colorize?: boolean;
  timestamp?: boolean;
  filter?: string | RegExp;
  bufferSize?: number;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  data: unknown[];
  timestamp: number;
  elapsed: number;
  tag?: string;
}

export interface PerformanceMeasurement {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  metadata?: Record<string, unknown>;
}

// --- Level Priority --------------------------------------------------

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5, silent: 6,
};

// --- Colors ----------------------------------------------------------

const COLORS: Record<LogLevel, string> = {
  trace: "\x1b[90m",   // gray
  debug: "\x1b[36m",   // cyan
  info: "\x1b[32m",    // green
  warn: "\x1b[33m",    // yellow
  error: "\x1b[31m",   // red
  fatal: "\x1b[35m",   // magenta
  silent: "",
};

const RESET = "\x1b[0m";

// --- Debugger ---------------------------------------------------------

class Debugger {
  private options: Required<DebugOptions>;
  private buffer: LogEntry[] = [];
  private measurements: PerformanceMeasurement[] = [];
  private activeMeasurements = new Map<string, number>();
  private startTime: number;

  constructor(options: DebugOptions = {}) {
    this.options = {
      level: "debug",
      enabled: true,
      colorize: typeof process !== "undefined" ? process.env?.FORCE_COLOR !== "0" : true,
      timestamp: true,
      filter: "",
      bufferSize: 1000,
      ...options,
    };
    this.startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  /**
   * Log at trace level.
   */
  trace(message: string, ...data: unknown[]): void {
    this.log("trace", message, data);
  }

  /**
   * Log at debug level.
   */
  debug(message: string, ...data: unknown[]): void {
    this.log("debug", message, data);
  }

  /**
   * Log at info level.
   */
  info(message: string, ...data: unknown[]): void {
    this.log("info", message, data);
  }

  /**
   * Log at warn level.
   */
  warn(message: string, ...data: unknown[]): void {
    this.log("warn", message, data);
  }

  /**
   * Log at error level.
   */
  error(message: string, ...data: unknown[]): void {
    this.log("error", message, data);
  }

  /**
   * Log at fatal level.
   */
  fatal(message: string, ...data: unknown[]): void {
    this.log("fatal", message, data);
  }

  /**
   * Create a tagged logger.
   */
  tag(tag: string): TaggedLogger {
    return new TaggedLogger(this, tag);
  }

  /**
   * Assert a condition (throw if false).
   */
  assert(condition: unknown, message: string = "Assertion failed"): void {
    if (!condition) {
      const error = new Error(message);
      this.error(`Assertion failed: ${message}`);
      throw error;
    }
  }

  /**
   * Assert with custom error.
   */
  assertError(condition: unknown, error: Error): void {
    if (!condition) {
      this.error(`Assertion failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start a performance measurement.
   */
  startMeasure(name: string): void {
    this.activeMeasurements.set(name, typeof performance !== "undefined" ? performance.now() : Date.now());
  }

  /**
   * End a performance measurement.
   */
  endMeasure(name: string, metadata?: Record<string, unknown>): PerformanceMeasurement | null {
    const startTime = this.activeMeasurements.get(name);
    if (startTime === undefined) {
      this.warn(`No active measurement named '${name}'`);
      return null;
    }

    const endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    const measurement: PerformanceMeasurement = {
      name,
      startTime,
      endTime,
      duration: endTime - startTime,
      metadata,
    };

    this.measurements.push(measurement);
    this.activeMeasurements.delete(name);

    if (measurement.duration > 16) {
      this.warn(`Slow operation: '${name}' took ${measurement.duration.toFixed(2)}ms`);
    }

    return measurement;
  }

  /**
   * Measure a function execution time.
   */
  measure<T>(name: string, fn: () => T): T {
    this.startMeasure(name);
    try {
      const result = fn();
      this.endMeasure(name);
      return result;
    } catch (e) {
      this.endMeasure(name);
      throw e;
    }
  }

  /**
   * Measure an async function execution time.
   */
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.startMeasure(name);
    try {
      const result = await fn();
      this.endMeasure(name);
      return result;
    } catch (e) {
      this.endMeasure(name);
      throw e;
    }
  }

  /**
   * Get all measurements.
   */
  getMeasurements(): PerformanceMeasurement[] {
    return [...this.measurements];
  }

  /**
   * Get measurement by name.
   */
  getMeasurement(name: string): PerformanceMeasurement | undefined {
    return this.measurements.find(m => m.name === name);
  }

  /**
   * Get the slowest measurement.
   */
  getSlowest(): PerformanceMeasurement | null {
    if (this.measurements.length === 0) return null;
    return this.measurements.reduce((slowest, current) =>
      current.duration > slowest.duration ? current : slowest
    );
  }

  /**
   * Get all buffered logs.
   */
  getBuffer(): LogEntry[] {
    return [...this.buffer];
  }

  /**
   * Clear the log buffer.
   */
  clearBuffer(): void {
    this.buffer = [];
  }

  /**
   * Clear all measurements.
   */
  clearMeasurements(): void {
    this.measurements = [];
  }

  /**
   * Set the log level.
   */
  setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  /**
   * Enable or disable logging.
   */
  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
  }

  /**
   * Set a filter (only log messages matching the filter).
   */
  setFilter(filter: string | RegExp): void {
    this.options.filter = filter;
  }

  /**
   * Get memory usage (Node.js only).
   */
  getMemoryUsage(): NodeJS.MemoryUsage | null {
    if (typeof process !== "undefined" && process.memoryUsage) {
      return process.memoryUsage();
    }
    return null;
  }

  /**
   * Inspect an object (deep print).
   */
  inspect(obj: unknown, depth: number = 3): string {
    return this.inspectInternal(obj, depth, 0, new WeakSet());
  }

  /**
   * Check if running in development mode.
   */
  get isDev(): boolean {
    if (typeof process !== "undefined") {
      return process.env?.NODE_ENV !== "production";
    }
    if (typeof globalThis !== "undefined") {
      const g = globalThis as Record<string, unknown>;
      return g.__TW_DEV__ === true || g.__DEV__ === true;
    }
    return false;
  }

  /**
   * Check if running in production.
   */
  get isProd(): boolean {
    return !this.isDev;
  }

  // --- Internal ------------------------------------------------------

  private log(level: LogLevel, message: string, data: unknown[]): void {
    if (!this.options.enabled) return;
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.options.level]) return;

    // Filter
    if (this.options.filter) {
      const filter = this.options.filter;
      if (typeof filter === "string") {
        if (!message.includes(filter)) return;
      } else if (!filter.test(message)) return;
    }

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const entry: LogEntry = {
      level, message, data,
      timestamp: Date.now(),
      elapsed: now - this.startTime,
    };

    // Add to buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.options.bufferSize) {
      this.buffer.shift();
    }

    // Output to console
    this.output(entry);
  }

  private output(entry: LogEntry): void {
    const parts: string[] = [];

    if (this.options.timestamp) {
      const time = new Date(entry.timestamp).toISOString().split("T")[1].replace("Z", "");
      parts.push(`[${time}]`);
    }

    parts.push(`[${entry.level.toUpperCase()}]`);
    parts.push(entry.message);

    const prefix = parts.join(" ");

    if (this.options.colorize) {
      const color = COLORS[entry.level];
      if (entry.data.length > 0) {
        const lvl = entry.level;
        const fn = lvl === "fatal" ? "error" : lvl;
        console[fn](color + prefix + RESET, ...entry.data);
      } else {
        const lvl = entry.level;
        const fn = lvl === "fatal" ? "error" : lvl;
        console[fn](color + prefix + RESET);
      }
    } else {
      if (entry.data.length > 0) {
        const lvl = entry.level;
        const fn = lvl === "fatal" ? "error" : lvl;
        console[fn](prefix, ...entry.data);
      } else {
        const lvl = entry.level;
        const fn = lvl === "fatal" ? "error" : lvl;
        console[fn](prefix);
      }
    }
  }

  private inspectInternal(obj: unknown, maxDepth: number, currentDepth: number, seen: WeakSet<object>): string {
    if (obj === null) return "null";
    if (obj === undefined) return "undefined";
    if (typeof obj === "string") return `"${obj}"`;
    if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
    if (typeof obj === "function") return `[Function: ${obj.name || "anonymous"}]`;
    if (typeof obj === "symbol") return obj.toString();

    if (currentDepth >= maxDepth) return "[Object]";

    if (typeof obj === "object") {
      if (seen.has(obj as object)) return "[Circular]";
      seen.add(obj as object);

      if (Array.isArray(obj)) {
        const items = obj.slice(0, 20).map(item => this.inspectInternal(item, maxDepth, currentDepth + 1, seen));
        if (obj.length > 20) items.push(`... ${obj.length - 20} more`);
        return `[${items.join(", ")}]`;
      }

      if (obj instanceof Error) return `[Error: ${obj.message}]`;
      if (obj instanceof Date) return obj.toISOString();
      if (obj instanceof RegExp) return obj.toString();
      if (obj instanceof Map) {
        const entries = Array.from(obj.entries()).slice(0, 20).map(([k, v]) =>
          `${this.inspectInternal(k, maxDepth, currentDepth + 1, seen)} => ${this.inspectInternal(v, maxDepth, currentDepth + 1, seen)}`
        );
        return `Map(${entries.length}) { ${entries.join(", ")} }`;
      }
      if (obj instanceof Set) {
        const items = Array.from(obj).slice(0, 20).map(item => this.inspectInternal(item, maxDepth, currentDepth + 1, seen));
        return `Set(${obj.size}) { ${items.join(", ")} }`;
      }

      const entries = Object.entries(obj as Record<string, unknown>).slice(0, 20).map(([k, v]) =>
        `${k}: ${this.inspectInternal(v, maxDepth, currentDepth + 1, seen)}`
      );
      const keys = Object.keys(obj as object);
      if (keys.length > 20) entries.push(`... ${keys.length - 20} more`);
      return `{ ${entries.join(", ")} }`;
    }

    return String(obj);
  }
}

// --- Tagged Logger ----------------------------------------------------

class TaggedLogger {
  private parent: Debugger;
  private tag: string;

  constructor(parent: Debugger, tag: string) {
    this.parent = parent;
    this.tag = tag;
  }

  trace(message: string, ...data: unknown[]): void { this.parent.trace(`[${this.tag}] ${message}`, ...data); }
  debug(message: string, ...data: unknown[]): void { this.parent.debug(`[${this.tag}] ${message}`, ...data); }
  info(message: string, ...data: unknown[]): void { this.parent.info(`[${this.tag}] ${message}`, ...data); }
  warn(message: string, ...data: unknown[]): void { this.parent.warn(`[${this.tag}] ${message}`, ...data); }
  error(message: string, ...data: unknown[]): void { this.parent.error(`[${this.tag}] ${message}`, ...data); }
  fatal(message: string, ...data: unknown[]): void { this.parent.fatal(`[${this.tag}] ${message}`, ...data); }

  measure<T>(name: string, fn: () => T): T { return this.parent.measure(`${this.tag}:${name}`, fn); }
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> { return this.parent.measureAsync(`${this.tag}:${name}`, fn); }
  assert(condition: unknown, message?: string): void { this.parent.assert(condition, `[${this.tag}] ${message || "Assertion failed"}`); }
}

// --- Global Debugger --------------------------------------------------

let globalDebugger: Debugger | null = null;

export function getDebugger(): Debugger {
  if (!globalDebugger) globalDebugger = new Debugger();
  return globalDebugger;
}

export function debugLog(message: string, ...data: unknown[]): void { getDebugger().debug(message, ...data); }
export function infoLog(message: string, ...data: unknown[]): void { getDebugger().info(message, ...data); }
export function warnLog(message: string, ...data: unknown[]): void { getDebugger().warn(message, ...data); }
export function errorLog(message: string, ...data: unknown[]): void { getDebugger().error(message, ...data); }

export function assertCondition(condition: unknown, message?: string): void {
  getDebugger().assert(condition, message);
}

export function measureTime<T>(name: string, fn: () => T): T { return getDebugger().measure(name, fn); }
export async function measureTimeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> { return getDebugger().measureAsync(name, fn); }

export function isDev(): boolean { return getDebugger().isDev; }
export function isProd(): boolean { return getDebugger().isProd; }
export function inspectObject(obj: unknown, depth?: number): string { return getDebugger().inspect(obj, depth); }
