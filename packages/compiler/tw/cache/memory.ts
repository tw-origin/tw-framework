/** In-memory cache -- LRU eviction with TTL support. */

export interface MemoryCacheEntry<T> {
  key: string;
  value: T;
  hash: string;
  createdAt: number;
  lastAccess: number;
  hitCount: number;
  expiresAt: number;
}

export class MemoryCache<T = any> {
  private entries = new Map<string, MemoryCacheEntry<T>>();
  private maxSize: number;
  private defaultTTL: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize: number = 256, defaultTTL: number = 3600000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) { this.misses++; return null; }
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      this.misses++;
      return null;
    }
    entry.lastAccess = Date.now();
    entry.hitCount++;
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T, hash: string, ttl?: number): void {
    if (this.entries.size >= this.maxSize && !this.entries.has(key)) {
      this.evictLRU();
    }
    this.entries.set(key, {
      key, value, hash,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      hitCount: 0,
      expiresAt: Date.now() + (ttl ?? this.defaultTTL),
    });
  }

  has(key: string): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    if (Date.now() > e.expiresAt) { this.entries.delete(key); return false; }
    return true;
  }

  delete(key: string): void { this.entries.delete(key); }

  clear(): void { this.entries.clear(); this.hits = 0; this.misses = 0; }

  size(): number { return this.entries.size; }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }

  getStats() {
    return {
      size: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      entries: [...this.entries.entries()].map(([k, e]) => ({
        key: k, hits: e.hitCount, age: Date.now() - e.createdAt,
      })).sort((a, b) => b.hits - a.hits),
    };
  }

  private evictLRU(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.entries) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldest = key;
      }
    }
    if (oldest) this.entries.delete(oldest);
  }
}
