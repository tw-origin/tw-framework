/** Unified cache -- combines memory + disk with fallback. */

import { MemoryCache } from "./memory";
import { DiskCache } from "./disk";

export interface CacheOptions {
  memorySize?: number;
  ttl?: number;
  diskDir?: string;
  enableDisk?: boolean;
}

export class UnifiedCache<T = any> {
  private mem: MemoryCache<T>;
  private disk: DiskCache<T> | null;
  private opts: CacheOptions;

  constructor(opts: CacheOptions = {}) {
    this.opts = opts;
    this.mem = new MemoryCache(opts.memorySize ?? 256, opts.ttl);
    this.disk = opts.enableDisk && opts.diskDir
      ? new DiskCache<T>(opts.diskDir)
      : null;
  }

  get(key: string): T | null {
    // Try memory first
    const memVal = this.mem.get(key);
    if (memVal !== null) return memVal;

    // Fallback to disk
    if (this.disk) {
      const diskVal = this.disk.get(key);
      if (diskVal !== null) {
        // Warm memory cache
        this.mem.set(key, diskVal, "disk");
        return diskVal;
      }
    }

    return null;
  }

  set(key: string, value: T, hash: string): void {
    this.mem.set(key, value, hash);
    if (this.disk) this.disk.set(key, value, hash);
  }

  has(key: string): boolean {
    return this.mem.has(key) || (this.disk?.has(key) ?? false);
  }

  delete(key: string): void {
    this.mem.delete(key);
    this.disk?.delete(key);
  }

  clear(): void {
    this.mem.clear();
    this.disk?.clear();
  }

  getStats() {
    return {
      memory: this.mem.getStats(),
      diskSize: this.disk?.size() ?? 0,
    };
  }
}
