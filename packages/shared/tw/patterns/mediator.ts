/**
 * Mediator -- centralizes communication between components
 * @module shared/patterns
 */

export class Mediator {
  private colleagues: Map<string, { receive: (event: string, data: unknown) => void }> = new Map();
  private history: Array<{ from: string; to: string; event: string; data: unknown; timestamp: number }> = [];
  private maxHistory: number = 100;
  private stats = { totalMessages: 0, totalBroadcasts: 0 };

  register(name: string, colleague: { receive: (event: string, data: unknown) => void }): this {
    this.colleagues.set(name, colleague);
    return this;
  }

  unregister(name: string): this {
    this.colleagues.delete(name);
    return this;
  }

  send(from: string, to: string, event: string, data: unknown): boolean {
    const colleague = this.colleagues.get(to);
    if (!colleague) return false;
    colleague.receive(event, data);
    this.history.push({ from, to, event, data, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();
    this.stats.totalMessages++;
    return true;
  }

  broadcast(from: string, event: string, data: unknown): void {
    for (const [name, colleague] of this.colleagues) {
      if (name !== from) {
        colleague.receive(event, data);
        this.history.push({ from, to: name, event, data, timestamp: Date.now() });
      }
    }
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
    this.stats.totalBroadcasts++;
  }

  hasColleague(name: string): boolean { return this.colleagues.has(name); }
  getColleagueCount(): number { return this.colleagues.size; }
  getColleagueNames(): string[] { return [...this.colleagues.keys()]; }
  getHistory(): Array<{ from: string; to: string; event: string; data: unknown; timestamp: number }> { return [...this.history]; }
  clearHistory(): void { this.history = []; }
  setMaxHistory(max: number): void { this.maxHistory = max; while (this.history.length > max) this.history.shift(); }
  getStats(): { totalMessages: number; totalBroadcasts: number; colleagues: number } { return { ...this.stats, colleagues: this.colleagues.size }; }
  resetStats(): void { this.stats = { totalMessages: 0, totalBroadcasts: 0 }; }
  toJSON(): string { return JSON.stringify(this.getStats(), null, 2); }
}

export function createMediator(): Mediator { return new Mediator(); }

