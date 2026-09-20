/**
 * Command -- encapsulates operations as objects
 * @module shared/patterns
 */

export interface Command {
  execute(): unknown;
  undo?(): unknown;
  redo?(): unknown;
  getName(): string;
}

export class CommandInvoker {
  private history: Command[] = [];
  private undone: Command[] = [];
  private maxHistory: number = 100;
  private stats = { totalExecuted: 0, totalUndone: 0, totalRedone: 0 };

  execute(command: Command): unknown {
    const result = command.execute();
    this.history.push(command);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.undone = [];
    this.stats.totalExecuted++;
    return result;
  }

  undo(): unknown {
    const command = this.history.pop();
    if (!command) throw new Error("Nothing to undo");
    const result = command.undo?.();
    this.undone.push(command);
    this.stats.totalUndone++;
    return result;
  }

  redo(): unknown {
    const command = this.undone.pop();
    if (!command) throw new Error("Nothing to redo");
    const result = command.redo?.() ?? command.execute();
    this.history.push(command);
    this.stats.totalRedone++;
    return result;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  canRedo(): boolean {
    return this.undone.length > 0;
  }

  getHistory(): Command[] {
    return [...this.history];
  }

  getUndone(): Command[] {
    return [...this.undone];
  }

  getHistorySize(): number {
    return this.history.length;
  }

  getUndoneSize(): number {
    return this.undone.length;
  }

  clearHistory(): void {
    this.history = [];
  }

  clearUndone(): void {
    this.undone = [];
  }

  clearAll(): void {
    this.clearHistory();
    this.clearUndone();
  }

  setMaxHistory(max: number): void {
    this.maxHistory = max;
    while (this.history.length > max) this.history.shift();
  }

  getMaxHistory(): number {
    return this.maxHistory;
  }

  getStats(): { totalExecuted: number; totalUndone: number; totalRedone: number; historySize: number; undoneSize: number } {
    return { ...this.stats, historySize: this.history.length, undoneSize: this.undone.length };
  }

  resetStats(): void {
    this.stats = { totalExecuted: 0, totalUndone: 0, totalRedone: 0 };
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createCommandInvoker(): CommandInvoker {
  return new CommandInvoker();
}

