/** Log transports - console, file, memory, remote HTTP. */

import { type LogEntry, type LogTransport } from "./levels";
import { ANSI, LEVEL_COLORS, LEVEL_ICONS } from "./colors";


export function createConsoleTransport(opts?: {
  colorize?: boolean;
  showTimestamp?: boolean;
  showScope?: boolean;
  showData?: boolean;
}): LogTransport {
  const colorize = opts?.colorize ?? true;
  const showTimestamp = opts?.showTimestamp ?? true;
  const showScope = opts?.showScope ?? true;
  const showData = opts?.showData ?? true;

  return (entry: LogEntry) => {
    const parts: string[] = [];
    const c = colorize ? ANSI : { reset: "", dim: "", bold: "" } as any;
    const color = colorize ? LEVEL_COLORS[entry.level] : "";

    if (showTimestamp) {
      const ts = entry.timestamp;
      parts.push(colorize ? `${c.dim}${ts}${c.reset}` : ts);
    }

    const icon = LEVEL_ICONS[entry.level];
    const levelStr = entry.levelName.toUpperCase().padEnd(5);
    parts.push(colorize ? `${color}${icon} ${levelStr}${c.reset}` : `${icon} ${levelStr}`);

    if (showScope && entry.scope) {
      parts.push(colorize ? `${c.cyan}[${entry.scope}]${c.reset}` : `[${entry.scope}]`);
    }

    parts.push(entry.message);

    if (entry.durationMs !== undefined) {
      parts.push(colorize ? `${c.dim}${entry.durationMs}ms${c.reset}` : `${entry.durationMs}ms`);
    }

    const line = parts.join(" ");

    if (showData && entry.data && Object.keys(entry.data).length > 0) {
      const dataStr = JSON.stringify(entry.data, null, 2);
      const colored = colorize ? `${c.dim}${dataStr}${c.reset}` : dataStr;
      process.stderr.write(`${line}\n${colored}\n`);
    } else {
      process.stderr.write(`${line}\n`);
    }

    if (entry.error) {
      const errStr = entry.error.stack || `${entry.error.name}: ${entry.error.message}`;
      const colored = colorize ? `${ANSI.red}${errStr}${c.reset}` : errStr;
      process.stderr.write(`${colored}\n`);
    }
  };
}



export function createFileTransport(
  filePath: string,
  opts?: { maxSize?: number; maxFiles?: number; json?: boolean },
): LogTransport {
  const maxSize = opts?.maxSize ?? 10 * 1024 * 1024;
  const useJson = opts?.json ?? true;
  let currentSize = 0;

  return (entry: LogEntry) => {
    const output = useJson
      ? JSON.stringify(entry) + "\n"
      : formatPlain(entry) + "\n";

    const bytes = new TextEncoder().encode(output);

    if (currentSize + bytes.length > maxSize) {
      // Rotate: in a real system we'd rename to .1, .2, etc.
      // For now, we just truncate. A production version would use proper rotation.
      currentSize = 0;
    }

    try {
      const fs = (globalThis as any).require?.("node:fs");
      if (fs) {
        fs.appendFileSync(filePath, output);
        currentSize += bytes.length;
      }
    } catch {
      // File not available -- silently skip
    }
  };
}



export function createMemoryTransport(maxEntries: number = 1000): { transport: LogTransport; entries: LogEntry[]; clear: () => void } {
  const entries: LogEntry[] = [];
  return {
    transport: (entry: LogEntry) => {
      entries.push(entry);
      if (entries.length > maxEntries) {
        entries.shift();
      }
    },
    entries,
    clear: () => entries.length = 0,
  };
}



export function createRemoteTransport(
  url: string,
  opts?: { batchSize?: number; flushIntervalMs?: number; headers?: Record<string, string> },
): LogTransport & { flush: () => Promise<void> } {
  const batchSize = opts?.batchSize ?? 10;
  const flushIntervalMs = opts?.flushIntervalMs ?? 5000;
  const headers = opts?.headers ?? { "Content-Type": "application/json" };
  const batch: LogEntry[] = [];
  let flushTimer: any = null;

  async function flush(): Promise<void> {
    if (batch.length === 0) return;
    const toSend = batch.splice(0, batch.length);
    try {
      await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ logs: toSend }),
      });
    } catch {
      // Remote endpoint unavailable -- silently drop
    }
  }

  if (flushIntervalMs > 0) {
    const _interval = flushTimer = setInterval(flush, flushIntervalMs);
    if (flushTimer.unref) flushTimer.unref();
  }

  const transport = (entry: LogEntry) => {
    batch.push(entry);
    if (batch.length >= batchSize) {
      flush().catch((e) => { console.debug("[TW] Cleanup error:", e); });
    }
  };

  (transport as any).flush = flush;

  return transport as LogTransport & { flush: () => Promise<void> };
}

function formatPlain(entry: LogEntry): string {
  const parts: string[] = [
    entry.timestamp,
    entry.levelName.toUpperCase(),
  ];
  if (entry.scope) parts.push(`[${entry.scope}]`);
  parts.push(entry.message);
  if (entry.durationMs !== undefined) parts.push(`${entry.durationMs}ms`);
  if (entry.data) parts.push(JSON.stringify(entry.data));
  if (entry.error) parts.push(`${entry.error.name}: ${entry.error.message}`);
  return parts.join(" ");
}

