/**
 * Observer -- publish-subscribe pattern
 * @module shared/patterns
 */

export interface Observer<T = unknown> {
  update(event: string, data: T): void;
}

export class Subject<T = unknown> {
  private observers: Map<string, Set<Observer<T>>> = new Map();
  private history: Array<{ event: string; data: T; timestamp: number }> = [];
  private maxHistory: number = 100;
  private stats = { totalNotifications: 0, totalSubscribers: 0 };

  subscribe(event: string, observer: Observer<T>): () => void {
    if (!this.observers.has(event)) {
      this.observers.set(event, new Set());
    }
    this.observers.get(event)!.add(observer);
    this.stats.totalSubscribers++;
    return () => {
      this.observers.get(event)?.delete(observer);
      this.stats.totalSubscribers--;
    };
  }

  unsubscribe(event: string, observer: Observer<T>): void {
    this.observers.get(event)?.delete(observer);
  }

  unsubscribeAll(event?: string): void {
    if (event) {
      this.observers.delete(event);
    } else {
      this.observers.clear();
    }
  }

  notify(event: string, data: T): void {
    const observers = this.observers.get(event);
    if (observers) {
      for (const observer of observers) {
        observer.update(event, data);
      }
    }
    this.history.push({ event, data, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();
    this.stats.totalNotifications++;
  }

  notifyAll(data: T): void {
    for (const event of this.observers.keys()) {
      this.notify(event, data);
    }
  }

  hasSubscribers(event: string): boolean {
    return (this.observers.get(event)?.size ?? 0) > 0;
  }

  getSubscriberCount(event: string): number {
    return this.observers.get(event)?.size ?? 0;
  }

  getTotalSubscribers(): number {
    let total = 0;
    for (const observers of this.observers.values()) total += observers.size;
    return total;
  }

  getEvents(): string[] {
    return [...this.observers.keys()];
  }

  getHistory(): Array<{ event: string; data: T; timestamp: number }> {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  setMaxHistory(max: number): void {
    this.maxHistory = max;
    while (this.history.length > max) this.history.shift();
  }

  getMaxHistory(): number {
    return this.maxHistory;
  }

  getStats(): { totalNotifications: number; totalSubscribers: number; events: number } {
    return { ...this.stats, events: this.observers.size };
  }

  resetStats(): void {
    this.stats = { totalNotifications: 0, totalSubscribers: 0 };
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createSubject<T = unknown>(): Subject<T> {
  return new Subject<T>();
}

