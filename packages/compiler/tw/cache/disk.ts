/** Disk cache -- persistent filesystem-based cache for compiled output. */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { sha256 } from "@tw/shared";

export interface DiskCacheEntry<T> {
  key: string;
  value: T;
  hash: string;
  createdAt: number;
}

export class DiskCache<T = any> {
  constructor(private cacheDir: string) {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
  }

  get(key: string): T | null {
    const path = this.keyToPath(key);
    if (!existsSync(path)) return null;
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      return data.value as T;
    } catch {
      return null;
    }
  }

  set(key: string, value: T, hash: string): void {
    const path = this.keyToPath(key);
    mkdirSync(dirname(path), { recursive: true });
    const entry: DiskCacheEntry<T> = { key, value, hash, createdAt: Date.now() };
    writeFileSync(path, JSON.stringify(entry));
  }

  has(key: string): boolean {
    return existsSync(this.keyToPath(key));
  }

  delete(key: string): void {
    const path = this.keyToPath(key);
    try { unlinkSync(path); } catch { /* ignored */ }
  }

  clear(): void {
    try {
      const files = readdirSync(this.cacheDir);
      for (const f of files) {
        if (f.endsWith(".json")) {
          try { unlinkSync(join(this.cacheDir, f)); } catch { /* ignored */ }
        }
      }
    } catch { /* ignored */ }
  }

  keys(): string[] {
    try {
      return readdirSync(this.cacheDir)
        .filter(f => f.endsWith(".json"))
        .map(f => f.replace(".json", ""));
    } catch {
      return [];
    }
  }

  size(): number {
    return this.keys().length;
  }

  private keyToPath(key: string): string {
    const safeKey = sha256(key).slice(0, 32);
    return join(this.cacheDir, `${safeKey}.json`);
  }
}
