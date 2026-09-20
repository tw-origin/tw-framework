/**
 * Cache Manager -- multi-layer caching with TTL, LRU, and persistence.
 *
 * Features:
 * - Memory cache (fastest, volatile)
 * - Session cache (sessionStorage)
 * - Persistent cache (localStorage)
 * - TTL (time-to-live) support
 * - LRU (least-recently-used) eviction
 * - Tag-based invalidation
 * - Stale-while-revalidate
 * - Background refresh
 * - Cache statistics
 * - Preloading
 */

// --- Types ------------------------------------------------------------

export type CacheLayer = "memory" | "session" | "persistent" | "all";

export interface CacheEntry<T = unknown> {
  value: T;
  timestamp: number;
  ttl: number | null;
  tags: string[];
  accessCount: number;
  lastAccessed: number;
  size: number;
}

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  layer?: CacheLayer;
  staleWhileRevalidate?: boolean;
  revalidateFn?: () => Promise<unknown>;
  revalidateInterval?: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  entries: Array<{ key: string; size: number; lastAccessed: number; tags: string[] }>;
}

// --- Memory Cache ----------------------------------------------------

class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private stats = { hits: 0, misses: 0, evictions: 0 };

  constructor(maxSize = 500) { this.maxSize = maxSize; }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) { this.stats.misses++; return undefined; }

    // Check TTL
    if (entry.ttl !== null && Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value as T;
  }

  set<T>(key: string, value: T, options: CacheOptions = {}): void {
    // Evict LRU if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      } else break;
    }

    const entry: CacheEntry = {
      value,
      timestamp: Date.now(),
      ttl: options.ttl ?? null,
      tags: options.tags || [],
      accessCount: 0,
      lastAccessed: Date.now(),
      size: this.estimateSize(value),
    };

    this.cache.set(key, entry);
  }

  has(key: string): boolean { return this.cache.has(key); }

  delete(key: string): void { this.cache.delete(key); }

  clear(): void { this.cache.clear(); this.stats = { hits: 0, misses: 0, evictions: 0 }; }

  invalidateTag(tag: string): number {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  getStats(): CacheStats {
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key, size: entry.size, lastAccessed: entry.lastAccessed, tags: entry.tags,
      })),
    };
  }

  private estimateSize(value: unknown): number {
    try { return JSON.stringify(value).length; }
    catch { return 0; }
  }
}

// --- Persistent Cache --------------------------------------------------

class PersistentCache {
  private storage: Storage | null = null;
  private prefix: string;

  constructor(layer: "session" | "persistent", prefix = "tw-cache:") {
    try {
      this.storage = layer === "session" ? sessionStorage : localStorage;
    } catch { this.storage = null; }
    this.prefix = prefix;
  }

  get<T>(key: string): T | undefined {
    if (!this.storage) return undefined;
    try {
      const raw = this.storage.getItem(this.prefix + key);
      if (!raw) return undefined;
      const entry = JSON.parse(raw) as CacheEntry;
      if (entry.ttl !== null && Date.now() - entry.timestamp > entry.ttl) {
        this.storage.removeItem(this.prefix + key);
        return undefined;
      }
      return entry.value as T;
    } catch { return undefined; }
  }

  set<T>(key: string, value: T, options: CacheOptions = {}): void {
    if (!this.storage) return;
    try {
      const entry: CacheEntry = {
        value, timestamp: Date.now(),
        ttl: options.ttl ?? null,
        tags: options.tags || [],
        accessCount: 0, lastAccessed: Date.now(),
        size: 0,
      };
      this.storage.setItem(this.prefix + key, JSON.stringify(entry));
    } catch (e) {
      console.error("[TW Cache] Persistent set error:", e);
    }
  }

  has(key: string): boolean {
    if (!this.storage) return false;
    return this.storage.getItem(this.prefix + key) !== null;
  }

  delete(key: string): void {
    if (!this.storage) return;
    this.storage.removeItem(this.prefix + key);
  }

  clear(): void {
    if (!this.storage) return;
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) keys.push(key);
    }
    for (const key of keys) this.storage.removeItem(key);
  }
}

// --- Cache Manager ----------------------------------------------------

class CacheManager {
  private memoryCache: MemoryCache;
  private sessionCache: PersistentCache;
  private persistentCache: PersistentCache;
  private revalidating = new Set<string>();

  constructor(maxMemorySize = 500) {
    this.memoryCache = new MemoryCache(maxMemorySize);
    this.sessionCache = new PersistentCache("session");
    this.persistentCache = new PersistentCache("persistent");
  }

  /**
   * Get a value from cache.
   * Checks memory -> session -> persistent.
   */
  get<T>(key: string): T | undefined {
    // Memory first
    const memValue = this.memoryCache.get<T>(key);
    if (memValue !== undefined) return memValue;

    // Session
    const sessionValue = this.sessionCache.get<T>(key);
    if (sessionValue !== undefined) {
      this.memoryCache.set(key, sessionValue);
      return sessionValue;
    }

    // Persistent
    const persistentValue = this.persistentCache.get<T>(key);
    if (persistentValue !== undefined) {
      this.memoryCache.set(key, persistentValue);
      return persistentValue;
    }

    return undefined;
  }

  /**
   * Set a value in cache.
   */
  set<T>(key: string, value: T, options: CacheOptions = {}): void {
    const layer = options.layer || "all";

    if (layer === "all" || layer === "memory") {
      this.memoryCache.set(key, value, options);
    }
    if (layer === "all" || layer === "session") {
      this.sessionCache.set(key, value, options);
    }
    if (layer === "all" || layer === "persistent") {
      this.persistentCache.set(key, value, options);
    }
  }

  /**
   * Get or compute a value.
   * If the value is not in cache, call the factory function.
   */
  async getOrCompute<T>(key: string, factory: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      if (options.staleWhileRevalidate && options.revalidateFn) {
        // Return stale value, revalidate in background
        this.revalidate(key, options.revalidateFn, options);
      }
      return cached;
    }

    const value = await factory();
    this.set(key, value, options);
    return value;
  }

  /**
   * Check if a key exists in cache.
   */
  has(key: string): boolean {
    return this.memoryCache.has(key) || this.sessionCache.has(key) || this.persistentCache.has(key);
  }

  /**
   * Delete a key from all layers.
   */
  delete(key: string): void {
    this.memoryCache.delete(key);
    this.sessionCache.delete(key);
    this.persistentCache.delete(key);
  }

  /**
   * Invalidate all entries with a specific tag.
   */
  invalidateTag(tag: string): number {
    const count = this.memoryCache.invalidateTag(tag);
    // Note: persistent cache doesn't support tag invalidation efficiently
    // Would need to scan all keys
    return count;
  }

  /**
   * Clear all caches.
   */
  clear(): void {
    this.memoryCache.clear();
    this.sessionCache.clear();
    this.persistentCache.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return this.memoryCache.getStats();
  }

  /**
   * Preload a value into cache.
   */
  async preload<T>(key: string, factory: () => Promise<T>, options: CacheOptions = {}): Promise<void> {
    if (!this.has(key)) {
      const value = await factory();
      this.set(key, value, options);
    }
  }

  /**
   * Background revalidation.
   */
  private async revalidate(key: string, factory: () => Promise<unknown>, options: CacheOptions): Promise<void> {
    if (this.revalidating.has(key)) return;
    this.revalidating.add(key);

    try {
      const newValue = await factory();
      this.set(key, newValue, options);
    } catch (e) {
      console.error(`[TW Cache] Revalidation error for '${key}':`, e);
    } finally {
      this.revalidating.delete(key);
    }
  }
}

// --- Global Cache Manager --------------------------------------------

let globalCacheManager: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!globalCacheManager) globalCacheManager = new CacheManager();
  return globalCacheManager;
}

export function cacheGet<T>(key: string): T | undefined { return getCacheManager().get<T>(key); }
export function cacheSet<T>(key: string, value: T, options?: CacheOptions): void { getCacheManager().set(key, value, options); }
export function cacheHas(key: string): boolean { return getCacheManager().has(key); }
export function cacheDelete(key: string): void { getCacheManager().delete(key); }
export function cacheClear(): void { getCacheManager().clear(); }
export function cacheStats(): CacheStats { return getCacheManager().getStats(); }
