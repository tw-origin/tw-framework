import { Logger } from "./logger";
import { getLogger } from "./logger";
import { ANSI } from "./colors";
/** Progress bar and table printer for CLI output. */


export class ProgressBar {
  private total: number;
  private current: number = 0;
  private width: number;
  private label: string;
  private startTime: number;
  private lastRender: number = 0;
  private logger: Logger;

  constructor(label: string, total: number, opts?: { width?: number; logger?: Logger }) {
    this.label = label;
    this.total = total;
    this.width = opts?.width ?? 30;
    this.startTime = performance.now();
    this.logger = opts?.logger ?? getLogger();
  }

  update(current: number): void {
    this.current = Math.min(current, this.total);
    this.render();
  }

  increment(by: number = 1): void {
    this.update(this.current + by);
  }

  finish(): void {
    this.current = this.total;
    this.render(true);
    const elapsed = performance.now() - this.startTime;
    this.logger.debug(`Progress: ${this.label} completed in ${elapsed.toFixed(0)}ms`);
  }

  private render(force: boolean = false): void {
    const now = performance.now();
    if (!force && now - this.lastRender < 50) return;
    this.lastRender = now;

    const pct = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(this.width * pct);
    const empty = this.width - filled;
    const bar = `${"?".repeat(filled)}${"?".repeat(empty)}`;
    const pctStr = `${Math.round(pct * 100)}%`.padStart(4);
    const elapsed = ((now - this.startTime) / 1000).toFixed(1);
    const eta = pct > 0 ? (((now - this.startTime) / pct) / 1000 - parseFloat(elapsed)).toFixed(1) : "?";

    process.stderr.write(`\r${ANSI.cyan}${this.label}${ANSI.reset} ${bar} ${pctStr} ${ANSI.dim}${elapsed}s / ${eta}s${ANSI.reset}`);

    if (force || pct >= 1) {
      process.stderr.write("\n");
    }
  }
}



export function printTable(headers: string[], rows: (string | number)[][]): void {
  const widths = headers.map((h, i) => {
    const maxRowLen = Math.max(...rows.map(r => String(r[i] ?? "").length));
    return Math.max(h.length, maxRowLen);
  });

  const formatRow = (cells: string[]) =>
    " " + cells.map((cell, i) => String(cell).padEnd(widths[i])).join("  ") + " ";

  const sep = "-".repeat(widths.reduce((a, b) => a + b + 2, 0) + 1);

  process.stderr.write(`${ANSI.bold}${formatRow(headers)}${ANSI.reset}\n`);
  process.stderr.write(`${ANSI.dim}${sep}${ANSI.reset}\n`);
  for (const row of rows) {
    process.stderr.write(formatRow(row.map(String)) + "\n");
  }
}

