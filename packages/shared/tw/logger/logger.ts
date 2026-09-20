/** Logger class - structured logging with profiling, counters, grouping. */

import { type LogEntry, type LogTransport, LogLevel, LOG_LEVEL_NAMES } from "./levels";
import { createConsoleTransport } from "./transports";


export class Logger {
  private level: LogLevel;
  private transports: LogTransport[];
  private scope: string;
  private traceId: string | undefined;
  private spanId: string | undefined;
  private debugEnabled: boolean;
  private profileStart: Map<string, number>;
  private counters: Map<string, number>;
  private muted: Set<string>;

  constructor(opts?: {
    level?: LogLevel;
    transports?: LogTransport[];
    scope?: string;
    traceId?: string;
    debug?: boolean;
  }) {
    this.level = opts?.level ?? LogLevel.INFO;
    this.transports = opts?.transports ?? [createConsoleTransport()];
    this.scope = opts?.scope ?? "tw";
    this.traceId = opts?.traceId;
    this.spanId = undefined;
    this.debugEnabled = opts?.debug ?? false;
    this.profileStart = new Map();
    this.counters = new Map();
    this.muted = new Set();
  }

  child(scope: string): Logger {
    const child = new Logger({
      level: this.level,
      transports: this.transports,
      scope: `${this.scope}:${scope}`,
      traceId: this.traceId,
      debug: this.debugEnabled,
    });
    return child;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  enableDebug(): void {
    this.debugEnabled = true;
    this.level = Math.max(this.level, LogLevel.DEBUG);
  }

  disableDebug(): void {
    this.debugEnabled = false;
  }

  mute(scope: string): void {
    this.muted.add(scope);
  }

  unmute(scope: string): void {
    this.muted.delete(scope);
  }

  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  removeTransport(transport: LogTransport): void {
    const idx = this.transports.indexOf(transport);
    if (idx !== -1) this.transports.splice(idx, 1);
  }

  setTraceId(traceId: string): void {
    this.traceId = traceId;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level && !this.muted.has(this.scope);
  }

  private async write(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): Promise<void> {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      levelName: LOG_LEVEL_NAMES[level],
      message,
      timestamp: new Date().toISOString(),
      scope: this.scope,
      data,
      traceId: this.traceId,
      spanId: this.spanId,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      } : undefined,
    };

    for (const transport of this.transports) {
      try {
        await transport(entry);
      } catch {
        // Transport failure should not crash the application
      }
    }
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.write(LogLevel.ERROR, message, data, error);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.write(LogLevel.WARN, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.write(LogLevel.INFO, message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.debugEnabled || this.level >= LogLevel.DEBUG) {
      this.write(LogLevel.DEBUG, message, data);
    }
  }

  trace(message: string, data?: Record<string, unknown>): void {
    if (this.level >= LogLevel.TRACE) {
      this.write(LogLevel.TRACE, message, data);
    }
  }

}

let defaultLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!defaultLogger) {
    const envLevel = process.env.TW_LOG_LEVEL?.toLowerCase();
    let level = LogLevel.INFO;
    switch (envLevel) {
      case "silent": level = LogLevel.SILENT; break;
      case "error":  level = LogLevel.ERROR; break;
      case "warn":   level = LogLevel.WARN; break;
      case "info":   level = LogLevel.INFO; break;
      case "debug":  level = LogLevel.DEBUG; break;
      case "trace":  level = LogLevel.TRACE; break;
      default:
        break;

    }
    defaultLogger = new Logger({ level, debug: process.env.TW_DEBUG === "1" });
  }
  return defaultLogger;
}

export function setLogger(logger: Logger): void {
  defaultLogger = logger;
}

export function resetLogger(): void {
  defaultLogger = null;
}

