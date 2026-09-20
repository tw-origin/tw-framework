/**
 * Progress Reporter -- progress for long-running operations.
 * @module lsp/progress/reporter
 */
export type ProgressToken = string | number;
export interface ProgressBegin { kind: "begin"; title: string; cancellable?: boolean; message?: string; percentage?: number; }
export interface ProgressReport { kind: "report"; message?: string; percentage?: number; }
export interface ProgressEnd { kind: "end"; message?: string; }
export type ProgressCallback = (notification: unknown) => void;

export class ProgressReporter {
  private sendNotification: ProgressCallback;
  private active: Map<ProgressToken, { title: string; startTime: number }> = new Map();
  private nextToken: number = 1;
  constructor(sendNotification: ProgressCallback) { this.sendNotification = sendNotification; }

  begin(title: string, message?: string, cancellable?: boolean): ProgressToken {
    const token = this.nextToken++;
    this.sendNotification({ method: "$/progress", params: { token, value: { kind: "begin", title, cancellable: cancellable ?? false, message } as ProgressBegin } });
    this.active.set(token, { title, startTime: Date.now() });
    return token;
  }

  report(token: ProgressToken, message?: string, percentage?: number): void {
    if (!this.active.has(token)) return;
    this.sendNotification({ method: "$/progress", params: { token, value: { kind: "report", message, percentage } as ProgressReport } });
  }

  end(token: ProgressToken, message?: string): void {
    if (!this.active.has(token)) return;
    this.sendNotification({ method: "$/progress", params: { token, value: { kind: "end", message } as ProgressEnd } });
    this.active.delete(token);
  }

  async withProgress<T>(title: string, fn: (report: (msg: string, pct?: number) => void) => Promise<T>): Promise<T> {
    const token = this.begin(title);
    try { const result = await fn((msg, pct) => this.report(token, msg, pct)); this.end(token); return result; }
    catch (err) { this.end(token, err instanceof Error ? err.message : "Failed"); throw err; }
  }

  get activeCount(): number { return this.active.size; }
}
export function createProgressReporter(sendNotification: ProgressCallback): ProgressReporter { return new ProgressReporter(sendNotification); }
