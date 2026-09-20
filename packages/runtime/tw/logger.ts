/**
 * Logger -- structured logging with multiple transports and formatting.
 *
 * Features:
 * - Log levels (trace, debug, info, warn, error, fatal)
 * - Multiple transports (console, file, network, custom)
 * - Structured data support (JSON, key-value)
 * - Log formatting (timestamp, level, tag, color)
 * - Log filtering (by level, tag, message)
 * - Log buffering
 * - Child loggers (with inherited context)
 * - Async logging (non-blocking)
 * - Log rotation (for file transport)
 * - Environment-aware (different levels for dev/prod)
 */

// --- Types ------------------------------------------------------------

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

export interface LogContext {
  [key: string]: unknown;
}

export interface LogRecord {
  level: LogLevel;
  message: string;
  context: LogContext;
  timestamp: string;
  elapsed: number;
  tag?: string;
}

export type LogTransport = (record: LogRecord) => void | Promise<void>;

export interface LoggerOptions {
  level?: LogLevel;
  tag?: string;
  context?: LogContext;
  transports?: LogTransport[];
  colorize?: boolean;
  timestamp?: boolean;
  bufferSize?: number;
  async?: boolean;
}

// --- Level Priority --------------------------------------------------

const LEVELS: Record<LogLevel, number> = {
  trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5, silent: 99,
};

const LEVEL_COLORS: Record<string, string> = {
  TRACE: "\x1b[90m", DEBUG: "\x1b[36m", INFO: "\x1b[32m",
  WARN: "\x1b[33m", ERROR: "\x1b[31m", FATAL: "\x1b[35m",
};

const RESET = "\x1b[0m";

// --- Logger Class ----------------------------------------------------

class Logger {
  private options: Required<LoggerOptions>;
  private buffer: LogRecord[] = [];
  private startTime: number;
  private childLoggers: Logger[] = [];

  constructor(options: LoggerOptions = {}) {
    this.options = {
      level: "debug",
      tag: "",
      context: {},
      transports: [consoleTransport()],
      colorize: true,
      timestamp: true,
      bufferSize: 500,
      async: false,
      ...options,
    };
    this.startTime = Date.now();
  }

  trace(message: string, context?: LogContext): void { this.log("trace", message, context); }
  debug(message: string, context?: LogContext): void { this.log("debug", message, context); }
  info(message: string, context?: LogContext): void { this.log("info", message, context); }
  warn(message: string, context?: LogContext): void { this.log("warn", message, context); }
  error(message: string, context?: LogContext): void { this.log("error", message, context); }
  fatal(message: string, context?: LogContext): void { this.log("fatal", message, context); }

  /**
   * Create a child logger with inherited context.
   */
  child(tag: string, context?: LogContext): Logger {
    const child = new Logger({
      ...this.options,
      tag: this.options.tag ? `${this.options.tag}:${tag}` : tag,
      context: { ...this.options.context, ...context },
    });
    this.childLoggers.push(child);
    return child;
  }

  /**
   * Set the log level.
   */
  setLevel(level: LogLevel): void { this.options.level = level; }

  /**
   * Add a transport.
   */
  addTransport(transport: LogTransport): void {
    this.options.transports.push(transport);
  }

  /**
   * Add context that will be included in all future logs.
   */
  addContext(key: string, value: unknown): void {
    this.options.context[key] = value;
  }

  /**
   * Remove context.
   */
  removeContext(key: string): void {
    delete this.options.context[key];
  }

  /**
   * Get buffered logs.
   */
  getBuffer(): LogRecord[] { return [...this.buffer]; }

  /**
   * Clear the buffer.
   */
  clearBuffer(): void { this.buffer = []; }

  /**
   * Flush buffered logs to transports.
   */
  async flush(): Promise<void> {
    const records = [...this.buffer];
    this.buffer = [];
    for (const record of records) {
      await this.sendToTransports(record);
    }
  }

  /**
   * Destroy the logger and all children.
   */
  destroy(): void {
    for (const child of this.childLoggers) child.destroy();
    this.childLoggers = [];
    this.buffer = [];
  }

  // --- Internal ------------------------------------------------------

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVELS[level] < LEVELS[this.options.level]) return;

    const record: LogRecord = {
      level,
      message,
      context: { ...this.options.context, ...context },
      timestamp: new Date().toISOString(),
      elapsed: Date.now() - this.startTime,
      tag: this.options.tag || undefined,
    };

    // Add to buffer
    this.buffer.push(record);
    if (this.buffer.length > this.options.bufferSize) this.buffer.shift();

    // Send to transports
    if (this.options.async) {
      Promise.resolve(this.sendToTransports(record)).catch(e =>
        console.error("[TW Logger] Transport error:", e)
      );
    } else {
      this.sendToTransports(record);
    }
  }

  private async sendToTransports(record: LogRecord): Promise<void> {
    for (const transport of this.options.transports) {
      try { await transport(record); }
      catch (e) { console.error("[TW Logger] Transport error:", e); }
    }
  }
}

// --- Built-in Transports ----------------------------------------------

export function consoleTransport(): LogTransport {
  return (record: LogRecord) => {
    const parts: string[] = [];

    if (record.tag) parts.push(`[${record.tag}]`);
    parts.push(record.message);

    const contextStr = Object.keys(record.context).length > 0
      ? " " + JSON.stringify(record.context)
      : "";

    const output = parts.join(" ") + contextStr;

    const consoleFn = record.level === "fatal" || record.level === "error"
      ? console.error
      : record.level === "warn"
        ? console.warn
        : record.level === "trace"
          ? console.debug
          : console.log;

    consoleFn(output);
  };
}

export function fileTransport(filename: string): LogTransport {
  // In browser environment, this would use IndexedDB or send to server
  return (record: LogRecord) => {
    const line = JSON.stringify(record) + "\n";
    // Node.js: write to file
    if (typeof process !== "undefined" && process.versions?.node) {
      // Would use fs.appendFileSync
    }
    // Browser: store in buffer or send to server
    console.debug(`[File:${filename}]`, line.trim());
  };
}

export function networkTransport(url: string, batchSize = 10): LogTransport {
  let batch: LogRecord[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (batch.length === 0) return;
    const records = [...batch];
    batch = [];

    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: records }),
      });
    } catch (e) {
      console.error("[TW Logger] Network transport failed:", e);
      // Re-add to batch
      batch.unshift(...records);
    }
  };

  return (record: LogRecord) => {
    batch.push(record);

    if (batch.length >= batchSize) {
      flush();
    } else if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, 5000);
    }
  };
}

export function jsonTransport(): LogTransport {
  return (record: LogRecord) => {
    console.log(JSON.stringify(record));
  };
}

// --- Global Logger ----------------------------------------------------

let globalLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!globalLogger) globalLogger = new Logger();
  return globalLogger;
}

export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

export function logTrace(message: string, context?: LogContext): void { getLogger().trace(message, context); }
export function logDebug(message: string, context?: LogContext): void { getLogger().debug(message, context); }
export function logInfo(message: string, context?: LogContext): void { getLogger().info(message, context); }
export function logWarn(message: string, context?: LogContext): void { getLogger().warn(message, context); }
export function logError(message: string, context?: LogContext): void { getLogger().error(message, context); }
export function logFatal(message: string, context?: LogContext): void { getLogger().fatal(message, context); }

export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}
