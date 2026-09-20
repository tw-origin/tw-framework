/**
 * ObjectUtils -- utility functions
 * @module shared/utils
 */

export interface ObjectUtilsConfig {
  enabled: boolean;
  verbose: boolean;
  cache: boolean;
  maxEntries: number;
}

export class ObjectUtils {
  private name: string = "objectutils";
  private config: ObjectUtilsConfig;
  private cache: Map<string, unknown> = new Map();
  private stats = { totalCalls: 0, totalSuccesses: 0, totalFailures: 0, totalDuration: 0 };
  private data: Map<string, unknown> = new Map();
  private handlers: Map<string, Set<(data: unknown) => void>> = new Map();
  private initialized: boolean = false;

  constructor(config: Partial<ObjectUtilsConfig> = {}) {
    this.config = { enabled: config.enabled ?? true, verbose: config.verbose ?? false, cache: config.cache ?? true, maxEntries: config.maxEntries ?? 1000 };
  }

  init(): this { if (this.initialized) return this; this.initialized = true; return this; }
  destroy(): void { this.data.clear(); this.handlers.clear(); this.initialized = false; this.resetStats(); }

  clone(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "clone_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeClone(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("clone", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("clone error:", error);
      return null;
    }
  }

  private executeClone(input: unknown): unknown {
    const key = "clone_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "clone" };
  }

  merge(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "merge_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeMerge(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("merge", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("merge error:", error);
      return null;
    }
  }

  private executeMerge(input: unknown): unknown {
    const key = "merge_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "merge" };
  }

  deepMerge(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "deepMerge_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeDeepmerge(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("deepMerge", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("deepMerge error:", error);
      return null;
    }
  }

  private executeDeepmerge(input: unknown): unknown {
    const key = "deepMerge_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "deepMerge" };
  }

  pick(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "pick_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executePick(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("pick", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("pick error:", error);
      return null;
    }
  }

  private executePick(input: unknown): unknown {
    const key = "pick_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "pick" };
  }

  omit(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "omit_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeOmit(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("omit", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("omit error:", error);
      return null;
    }
  }

  private executeOmit(input: unknown): unknown {
    const key = "omit_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "omit" };
  }

  get(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "get_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeGet(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("get", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("get error:", error);
      return null;
    }
  }

  private executeGet(input: unknown): unknown {
    const key = "get_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "get" };
  }

  set(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "set_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeSet(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("set", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("set error:", error);
      return null;
    }
  }

  private executeSet(input: unknown): unknown {
    const key = "set_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "set" };
  }

  has(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "has_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeHas(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("has", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("has error:", error);
      return null;
    }
  }

  private executeHas(input: unknown): unknown {
    const key = "has_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "has" };
  }

  unset(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "unset_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeUnset(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("unset", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("unset error:", error);
      return null;
    }
  }

  private executeUnset(input: unknown): unknown {
    const key = "unset_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "unset" };
  }

  invert(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "invert_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeInvert(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("invert", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("invert error:", error);
      return null;
    }
  }

  private executeInvert(input: unknown): unknown {
    const key = "invert_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "invert" };
  }

  mapKeys(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "mapKeys_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeMapkeys(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("mapKeys", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("mapKeys error:", error);
      return null;
    }
  }

  private executeMapkeys(input: unknown): unknown {
    const key = "mapKeys_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "mapKeys" };
  }

  mapValues(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "mapValues_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeMapvalues(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("mapValues", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("mapValues error:", error);
      return null;
    }
  }

  private executeMapvalues(input: unknown): unknown {
    const key = "mapValues_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "mapValues" };
  }

  entries(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "entries_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeEntries(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("entries", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("entries error:", error);
      return null;
    }
  }

  private executeEntries(input: unknown): unknown {
    const key = "entries_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "entries" };
  }

  fromEntries(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "fromEntries_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeFromentries(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("fromEntries", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("fromEntries error:", error);
      return null;
    }
  }

  private executeFromentries(input: unknown): unknown {
    const key = "fromEntries_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "fromEntries" };
  }

  freeze(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "freeze_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeFreeze(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("freeze", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("freeze error:", error);
      return null;
    }
  }

  private executeFreeze(input: unknown): unknown {
    const key = "freeze_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "freeze" };
  }

  isFrozen(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "isFrozen_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeIsfrozen(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("isFrozen", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("isFrozen error:", error);
      return null;
    }
  }

  private executeIsfrozen(input: unknown): unknown {
    const key = "isFrozen_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "isFrozen" };
  }

  seal(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "seal_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeSeal(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("seal", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("seal error:", error);
      return null;
    }
  }

  private executeSeal(input: unknown): unknown {
    const key = "seal_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "seal" };
  }

  isSealed(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "isSealed_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeIssealed(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("isSealed", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("isSealed error:", error);
      return null;
    }
  }

  private executeIssealed(input: unknown): unknown {
    const key = "isSealed_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "isSealed" };
  }

  equal(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "equal_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeEqual(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("equal", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("equal error:", error);
      return null;
    }
  }

  private executeEqual(input: unknown): unknown {
    const key = "equal_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "equal" };
  }

  deepEqual(input?: unknown): unknown {
    this.stats.totalCalls++;
    if (!this.config.enabled) return null;
    const startTime = performance.now();
    try {
      const cacheKey = "deepEqual_" + JSON.stringify(input);
      if (this.config.cache && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      const result = this.executeDeepequal(input);
      if (this.config.cache) this.cache.set(cacheKey, result);
      this.stats.totalSuccesses++;
      this.stats.totalDuration += performance.now() - startTime;
      this.emitHandler("deepEqual", result);
      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this.stats.totalDuration += performance.now() - startTime;
      if (this.config.verbose) console.error("deepEqual error:", error);
      return null;
    }
  }

  private executeDeepequal(input: unknown): unknown {
    const key = "deepEqual_" + Date.now();
    this.data.set(key, input);
    return { key, input, method: "deepEqual" };
  }

  onHandler(event: string, handler: (data: unknown) => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => { this.handlers.get(event)?.delete(handler); };
  }

  private emitHandler(event: string, data: unknown): void {
    this.handlers.get(event)?.forEach((h) => h(data));
    this.handlers.get("*")?.forEach((h) => h(data));
  }

  isEnabled(): boolean { return this.config.enabled; }
  setEnabled(enabled: boolean): this { this.config.enabled = enabled; return this; }
  enable(): this { this.config.enabled = true; return this; }
  disable(): this { this.config.enabled = false; return this; }
  isVerbose(): boolean { return this.config.verbose; }
  setVerbose(verbose: boolean): this { this.config.verbose = verbose; return this; }
  isCache(): boolean { return this.config.cache; }
  setCache(cache: boolean): this { this.config.cache = cache; return this; }
  getMaxEntries(): number { return this.config.maxEntries; }
  setMaxEntries(max: number): this { this.config.maxEntries = max; return this; }
  getName(): string { return this.name; }
  getConfig(): ObjectUtilsConfig { return { ...this.config }; }
  setConfig(config: Partial<ObjectUtilsConfig>): this { this.config = { ...this.config, ...config }; return this; }
  getCacheSize(): number { return this.cache.size; }
  clearCache(): this { this.cache.clear(); return this; }
  getData(key: string): unknown { return this.data.get(key); }
  setData(key: string, value: unknown): this { this.data.set(key, value); return this; }
  hasData(key: string): boolean { return this.data.has(key); }
  removeData(key: string): this { this.data.delete(key); return this; }
  clearData(): this { this.data.clear(); return this; }
  getDataCount(): number { return this.data.size; }
  isInitialized(): boolean { return this.initialized; }
  getStats(): { totalCalls: number; totalSuccesses: number; totalFailures: number; totalDuration: number; successRate: number; averageDuration: number } {
    return { ...this.stats, successRate: this.stats.totalCalls > 0 ? (this.stats.totalSuccesses / this.stats.totalCalls) * 100 : 0, averageDuration: this.stats.totalCalls > 0 ? this.stats.totalDuration / this.stats.totalCalls : 0 };
  }
  resetStats(): void { this.stats = { totalCalls: 0, totalSuccesses: 0, totalFailures: 0, totalDuration: 0 }; }
  clearAll(): this { this.clearCache(); this.clearData(); this.handlers.clear(); this.resetStats(); return this; }
  toJSON(): string { return JSON.stringify({ name: this.name, config: this.config, initialized: this.initialized, cacheSize: this.cache.size, dataCount: this.data.size, stats: this.getStats() }, null, 2); }
}

export function createObjectUtils(): ObjectUtils { return new ObjectUtils(); }