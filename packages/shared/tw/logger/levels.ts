/** Log levels, log entry structure, and transport type. */

export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

export const LOG_LEVEL_NAMES = ["silent", "error", "warn", "info", "debug", "trace"] as const;

export interface LogEntry {
  level: LogLevel;
  levelName: string;
  message: string;
  timestamp: string;
  scope?: string;
  data?: Record<string, any>;
  traceId?: string;
  spanId?: string;
  durationMs?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export type LogTransport = (entry: LogEntry) => void | Promise<void>;
