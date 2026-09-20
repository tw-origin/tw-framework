/**
 * Factory -- creates objects without specifying exact class
 * @module shared/patterns
 */

export interface FactoryProduct {
  type: string;
  createdAt: number;
}

export class Factory<T extends FactoryProduct> {
  private creators: Map<string, (options?: Record<string, unknown>) => T> = new Map();
  private pool: Map<string, T[]> = new Map();
  private maxPoolSize: number = 100;
  private stats = { totalCreated: 0, totalFromPool: 0, totalReturned: 0 };

  register(type: string, creator: (options?: Record<string, unknown>) => T): this {
    this.creators.set(type, creator);
    return this;
  }

  unregister(type: string): this {
    this.creators.delete(type);
    this.pool.delete(type);
    return this;
  }

  create(type: string, options?: Record<string, unknown>): T {
    const pooled = this.getFromPool(type);
    if (pooled) {
      this.stats.totalFromPool++;
      return pooled;
    }
    const creator = this.creators.get(type);
    if (!creator) throw new Error(`Unknown type: ${type}`);
    const product = creator(options);
    this.stats.totalCreated++;
    return product;
  }

  release(type: string, product: T): void {
    const pool = this.pool.get(type) ?? [];
    if (pool.length < this.maxPoolSize) {
      pool.push(product);
      this.pool.set(type, pool);
      this.stats.totalReturned++;
    }
  }

  private getFromPool(type: string): T | undefined {
    const pool = this.pool.get(type);
    if (pool && pool.length > 0) {
      return pool.pop();
    }
    return undefined;
  }

  hasType(type: string): boolean {
    return this.creators.has(type);
  }

  getTypes(): string[] {
    return [...this.creators.keys()];
  }

  getPoolSize(type: string): number {
    return this.pool.get(type)?.length ?? 0;
  }

  getTotalPoolSize(): number {
    let total = 0;
    for (const pool of this.pool.values()) total += pool.length;
    return total;
  }

  setMaxPoolSize(size: number): this {
    this.maxPoolSize = size;
    return this;
  }

  getMaxPoolSize(): number {
    return this.maxPoolSize;
  }

  clearPool(type?: string): void {
    if (type) {
      this.pool.delete(type);
    } else {
      this.pool.clear();
    }
  }

  clearAll(): void {
    this.creators.clear();
    this.pool.clear();
    this.stats = { totalCreated: 0, totalFromPool: 0, totalReturned: 0 };
  }

  getStats(): { totalCreated: number; totalFromPool:  number; totalReturned: number; registeredTypes: number; poolSize: number } {
    return { ...this.stats, registeredTypes: this.creators.size, poolSize: this.getTotalPoolSize() };
  }

  resetStats(): void {
    this.stats = { totalCreated: 0, totalFromPool: 0, totalReturned: 0 };
  }

  count(): number {
    return this.creators.size;
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createFactory<T extends FactoryProduct>(): Factory<T> {
  return new Factory<T>();
}

