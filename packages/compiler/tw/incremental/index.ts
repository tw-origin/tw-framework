import type { Program } from "../ast/nodes";
import { sha256 } from "@tw/shared";

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); }
    catch { /* fall through */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); }
  catch { return obj; }
}

export interface CacheEntry {
  key: string;
  ir: Program;
  hash: string;
  timestamp: number;
  hitCount: number;
}

export interface IncrementalCache {
  entries: Map<string, CacheEntry>;
  maxSize: number;
  totalHits: number;
  totalMisses: number;
}

export function createCache(maxSize: number = 256): IncrementalCache {
  return {
    entries: new Map(),
    maxSize,
    totalHits: 0,
    totalMisses: 0,
  };
}

export function getCached(cache: IncrementalCache, filePath: string, source: string): Program | null {
  const hash = sha256(source);
  const entry = cache.entries.get(filePath);

  if (entry && entry.hash === hash) {
    entry.hitCount++;
    entry.timestamp = Date.now();
    cache.totalHits++;
    return entry.ir;
  }

  cache.totalMisses++;
  return null;
}

export function setCached(cache: IncrementalCache, filePath: string, source: string, ir: Program): void {
  const hash = sha256(source);

  // Evict if at capacity
  if (cache.entries.size >= cache.maxSize && !cache.entries.has(filePath)) {
    evictOldest(cache);
  }

  cache.entries.set(filePath, {
    key: filePath,
    ir: deepClone(ir),
    hash,
    timestamp: Date.now(),
    hitCount: 0,
  });
}

function evictOldest(cache: IncrementalCache): void {
  let oldest: string | null = null;
  let oldestTime = Infinity;
  let lowestHits = Infinity;

  for (const [key, entry] of cache.entries) {
    // Prefer evicting entries with fewer hits and older timestamps
    if (entry.hitCount < lowestHits || (entry.hitCount === lowestHits && entry.timestamp < oldestTime)) {
      lowestHits = entry.hitCount;
      oldestTime = entry.timestamp;
      oldest = key;
    }
  }

  if (oldest) {
    cache.entries.delete(oldest);
  }
}

export function invalidate(cache: IncrementalCache, filePath: string): void {
  cache.entries.delete(filePath);
}

export function invalidateAll(cache: IncrementalCache): void {
  cache.entries.clear();
  cache.totalHits = 0;
  cache.totalMisses = 0;
}

export function getCacheStats(cache: IncrementalCache): {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  entries: Array<{ key: string; hits: number; age: number }>;
} {
  const now = Date.now();
  const entries = Array.from(cache.entries.values()).map(e => ({
    key: e.key,
    hits: e.hitCount,
    age: now - e.timestamp,
  }));

  const total = cache.totalHits + cache.totalMisses;
  return {
    size: cache.entries.size,
    hits: cache.totalHits,
    misses: cache.totalMisses,
    hitRate: total > 0 ? cache.totalHits / total : 0,
    entries: entries.sort((a, b) => b.hits - a.hits),
  };
}

export function serializeCache(cache: IncrementalCache): string {
  const entries = Array.from(cache.entries.entries()).map(([key, entry]) => ({
    key,
    ir: entry.ir,
    hash: entry.hash,
    timestamp: entry.timestamp,
    hitCount: entry.hitCount,
  }));

  return JSON.stringify({
    entries,
    maxSize: cache.maxSize,
    totalHits: cache.totalHits,
    totalMisses: cache.totalMisses,
  });
}

export function deserializeCache(json: string): IncrementalCache {
  try {
    const parsed = JSON.parse(json);
    const cache = createCache(parsed.maxSize || 256);
    cache.totalHits = parsed.totalHits || 0;
    cache.totalMisses = parsed.totalMisses || 0;

    for (const entry of parsed.entries || []) {
      cache.entries.set(entry.key, {
        key: entry.key,
        ir: entry.ir,
        hash: entry.hash,
        timestamp: entry.timestamp,
        hitCount: entry.hitCount || 0,
      });
    }

    return cache;
  } catch {
    return createCache();
  }
}

// --- Dependency Tracking ---------------------------------------------------------

export interface DependencyGraph {
  // filePath -> files it depends on
  dependencies: Map<string, Set<string>>;
  // filePath -> files that depend on it
  dependents: Map<string, Set<string>>;
}

export function createDependencyGraph(): DependencyGraph {
  return {
    dependencies: new Map(),
    dependents: new Map(),
  };
}

export function addDependency(graph: DependencyGraph, file: string, dependsOn: string): void {
  if (!graph.dependencies.has(file)) {
    graph.dependencies.set(file, new Set());
  }
  graph.dependencies.get(file)!.add(dependsOn);

  if (!graph.dependents.has(dependsOn)) {
    graph.dependents.set(dependsOn, new Set());
  }
  graph.dependents.get(dependsOn)!.add(file);
}

export function getDependents(graph: DependencyGraph, file: string): Set<string> {
  return graph.dependents.get(file) || new Set();
}

export function getDependencies(graph: DependencyGraph, file: string): Set<string> {
  return graph.dependencies.get(file) || new Set();
}

export function getTransitiveDependents(graph: DependencyGraph, file: string): Set<string> {
  const result = new Set<string>();
  const queue = [file];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = graph.dependents.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          result.add(dep);
          queue.push(dep);
        }
      }
    }
  }

  return result;
}

export function removeFile(graph: DependencyGraph, file: string): void {
  // Remove from dependencies
  const deps = graph.dependencies.get(file);
  if (deps) {
    for (const dep of deps) {
      const dependents = graph.dependents.get(dep);
      if (dependents) {
        dependents.delete(file);
        if (dependents.size === 0) {
          graph.dependents.delete(dep);
        }
      }
    }
    graph.dependencies.delete(file);
  }

  // Remove from dependents
  const reverseDeps = graph.dependents.get(file);
  if (reverseDeps) {
    for (const dep of reverseDeps) {
      const dependencies = graph.dependencies.get(dep);
      if (dependencies) {
        dependencies.delete(file);
        if (dependencies.size === 0) {
          graph.dependencies.delete(dep);
        }
      }
    }
    graph.dependents.delete(file);
  }
}
