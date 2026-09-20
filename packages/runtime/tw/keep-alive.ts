/**
 * KeepAlive -- cache component instances to preserve state across navigation.
 *
 * When a component is deactivated (navigated away from), KeepAlive caches
 * its DOM and state instead of destroying it. When activated again, the
 * cached instance is restored instantly -- no re-render needed.
 *
 * Features:
 * - Configurable max cache size (LRU eviction)
 * - Include/exclude patterns for component names
 * - Lifecycle hooks: onActivated, onDeactivated
 * - Cache statistics (hits, misses, size)
 * - Manual cache invalidation
 * - Automatic cleanup on unmount
 */

import type { VNode } from "./types";

// --- Types ------------------------------------------------------------

export interface KeepAliveOptions {
  max?: number;
  include?: string[] | RegExp;
  exclude?: string[] | RegExp;
  cacheKey?: (name: string, props: Record<string, unknown>) => string;
}

export interface CacheEntry {
  key: string;
  name: string;
  vnode: VNode;
  dom: HTMLElement;
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
}

export interface KeepAliveStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  entries: Array<{ key: string; name: string; accessCount: number; lastAccessed: number }>;
}

// --- KeepAlive Class -------------------------------------------------

export class KeepAlive {
  private cache = new Map<string, CacheEntry>();
  private options: Required<Omit<KeepAliveOptions, "cacheKey">> & { cacheKey?: (name: string, props: Record<string, unknown>) => string };
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private activatedCallbacks = new Map<string, Array<() => void>>();
  private deactivatedCallbacks = new Map<string, Array<() => void>>();

  constructor(options: KeepAliveOptions = {}) {
    this.options = {
      max: 10,
      include: [],
      exclude: [],
      ...options,
    };
  }

  /**
   * Get a cached component instance by key.
   */
  get(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.accessCount++;
      this.hits++;
      this.notifyActivated(key);
    } else {
      this.misses++;
    }
    return entry;
  }

  /**
   * Cache a component instance.
   */
  set(key: string, name: string, vnode: VNode, dom: HTMLElement, props: Record<string, unknown>, state: Record<string, unknown>): void {
    if (!this.shouldCache(name)) return;

    // Evict LRU if at capacity
    while (this.cache.size >= this.options.max) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      key, name, vnode, dom, props, state,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if a component should be cached based on include/exclude.
   */
  shouldCache(name: string): boolean {
    const { include, exclude } = this.options;

    if (include instanceof RegExp) {
      if (!include.test(name)) return false;
    } else if (Array.isArray(include) && include.length > 0) {
      if (!include.includes(name)) return false;
    }

    if (exclude instanceof RegExp) {
      if (exclude.test(name)) return false;
    } else if (Array.isArray(exclude) && exclude.length > 0) {
      if (exclude.includes(name)) return false;
    }

    return true;
  }

  /**
   * Remove a specific cache entry.
   */
  remove(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.notifyDeactivated(key);
      this.cache.delete(key);
    }
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    for (const key of this.cache.keys()) {
      this.notifyDeactivated(key);
    }
    this.cache.clear();
  }

  /**
   * Check if a key is cached.
   */
  has(key: string): boolean { return this.cache.has(key); }

  /**
   * Get all cache keys.
   */
  keys(): string[] { return Array.from(this.cache.keys()); }

  /**
   * Register onActivated callback.
   */
  onActivated(key: string, callback: () => void): () => void {
    if (!this.activatedCallbacks.has(key)) this.activatedCallbacks.set(key, []);
    this.activatedCallbacks.get(key)!.push(callback);
    return () => {
      const cbs = this.activatedCallbacks.get(key);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx >= 0) cbs.splice(idx, 1);
      }
    };
  }

  /**
   * Register onDeactivated callback.
   */
  onDeactivated(key: string, callback: () => void): () => void {
    if (!this.deactivatedCallbacks.has(key)) this.deactivatedCallbacks.set(key, []);
    this.deactivatedCallbacks.get(key)!.push(callback);
    return () => {
      const cbs = this.deactivatedCallbacks.get(key);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx >= 0) cbs.splice(idx, 1);
      }
    };
  }

  /**
   * Get cache statistics.
   */
  getStats(): KeepAliveStats {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      entries: Array.from(this.cache.values()).map(e => ({
        key: e.key, name: e.name, accessCount: e.accessCount, lastAccessed: e.lastAccessed,
      })),
    };
  }

  /**
   * Update options.
   */
  updateOptions(options: Partial<KeepAliveOptions>): void {
    this.options = { ...this.options, ...options };
    if (options.max && this.cache.size > options.max) {
      while (this.cache.size > options.max) this.evictLRU();
    }
  }

  /**
   * Destroy the KeepAlive cache.
   */
  destroy(): void {
    this.clear();
    this.activatedCallbacks.clear();
    this.deactivatedCallbacks.clear();
  }

  // --- Internal ------------------------------------------------------

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.notifyDeactivated(oldestKey);
      this.cache.delete(oldestKey);
      this.evictions++;
    }
  }

  private notifyActivated(key: string): void {
    const cbs = this.activatedCallbacks.get(key);
    if (cbs) {
      for (const cb of cbs) {
        try { cb(); } catch (e) { console.error("[TW KeepAlive] onActivated error:", e); }
      }
    }
  }

  private notifyDeactivated(key: string): void {
    const cbs = this.deactivatedCallbacks.get(key);
    if (cbs) {
      for (const cb of cbs) {
        try { cb(); } catch (e) { console.error("[TW KeepAlive] onDeactivated error:", e); }
      }
    }
  }
}

// --- Factory ----------------------------------------------------------

export function createKeepAlive(options?: KeepAliveOptions): KeepAlive {
  return new KeepAlive(options);
}
