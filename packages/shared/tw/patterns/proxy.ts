/**
 * Proxy -- controls access to an object
 * @module shared/patterns
 */

export class ProxyHandler<T extends object> {
  private target: T;
  private accessCount: Map<string, number> = new Map();
  private stats = { totalGets: 0, totalSets: 0, totalHas: 0, totalDeletes: 0 };
  private readonly: Set<string> = new Set();
  private hidden: Set<string> = new Set();
  private validators: Map<string, (value: unknown) => boolean> = new Map();

  constructor(target: T) {
    this.target = target;
  }

  setReadOnly(key: string): this { this.readonly.add(key); return this; }
  setHidden(key: string): this { this.hidden.add(key); return this; }
  setValidator(key: string, validator: (value: unknown) => boolean): this { this.validators.set(key, validator); return this; }

  get(target: T, prop: string): unknown {
    if (this.hidden.has(prop)) return undefined;
    this.stats.totalGets++;
    this.accessCount.set(prop, (this.accessCount.get(prop) ?? 0) + 1);
    return target[prop as keyof T];
  }

  set(target: T, prop: string, value: unknown): boolean {
    if (this.readonly.has(prop)) return false;
    const validator = this.validators.get(prop);
    if (validator && !validator(value)) return false;
    this.stats.totalSets++;
    target[prop as keyof T] = value as T[keyof T];
    return true;
  }

  has(target: T, prop: string): boolean {
    if (this.hidden.has(prop)) return false;
    this.stats.totalHas++;
    return prop in target;
  }

  deleteProperty(target: T, prop: string): boolean {
    if (this.readonly.has(prop)) return false;
    this.stats.totalDeletes++;
    return delete target[prop as keyof T];
  }

  getAccessCount(key: string): number { return this.accessCount.get(key) ?? 0; }
  getMostAccessed(count: number = 10): Array<{ key: string; count: number }> {
    return [...this.accessCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, count).map(([key, count]) => ({ key, count }));
  }
  getStats(): { totalGets: number; totalSets: number; totalHas: number; totalDeletes: number } { return { ...this.stats }; }
  resetStats(): void { this.stats = { totalGets: 0, totalSets: 0, totalHas: 0, totalDeletes: 0 }; this.accessCount.clear(); }
  toJSON(): string { return JSON.stringify(this.getStats(), null, 2); }
}

export function createProxy<T extends object>(target: T): T & { __proxyHandler: ProxyHandler<T> } {
  const handler = new ProxyHandler(target);
  const proxy = new Proxy(target, handler) as T & { __proxyHandler: ProxyHandler<T> };
  proxy.__proxyHandler = handler;
  return proxy;
}

