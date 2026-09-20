/**
 * LocalStorage wrapper -- typed, namespaced, with TTL and change notifications.
 * @module runtime/storage
 */

export interface StorageOptions {
  namespace?: string;
  ttl?: number;
  serialize?: (value: unknown) => string;
  deserialize?: (value: string) => unknown;
}

export class TypedStorage<T = Record<string, unknown>> {
  private storage: Storage;
  private namespace: string;
  private ttl: number;
  private serialize: (value: unknown) => string;
  private deserialize: (value: string) => unknown;
  private listeners: Map<string, Set<(value: unknown, oldValue: unknown) => void>> = new Map();

  constructor(storage: Storage = localStorage, options: StorageOptions = {}) {
    this.storage = storage;
    this.namespace = options.namespace ?? "tw";
    this.ttl = options.ttl ?? 0;
    this.serialize = options.serialize ?? JSON.stringify;
    this.deserialize = options.deserialize ?? JSON.parse;
  }

  private key(key: string): string {
    return `${this.namespace}:${key}`;
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    const fullKey = this.key(key as string);
    const item = this.storage.getItem(fullKey);
    if (item === null) return undefined;
    try {
      const parsed = this.deserialize(item) as { value: T[K]; expires?: number };
      if (parsed.expires && Date.now() > parsed.expires) {
        this.storage.removeItem(fullKey);
        return undefined;
      }
      return parsed.value;
    } catch {
      return undefined;
    }
  }

  set<K extends keyof T>(key: K, value: T[K], ttl?: number): void {
    const fullKey = this.key(key as string);
    const expires = ttl ? Date.now() + ttl : this.ttl ? Date.now() + this.ttl : undefined;
    const item = this.serialize({ value, expires });
    const oldValue = this.get(key);
    this.storage.setItem(fullKey, item);
    this.notify(key as string, value, oldValue);
  }

  remove(key: keyof T): void {
    const fullKey = this.key(key as string);
    const oldValue = this.get(key);
    this.storage.removeItem(fullKey);
    this.notify(key as string, undefined, oldValue);
  }

  has(key: keyof T): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    const prefix = this.namespace + ":";
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => this.storage.removeItem(key));
  }

  keys(): string[] {
    const prefix = this.namespace + ":";
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(prefix)) {
        keys.push(key.slice(prefix.length));
      }
    }
    return keys;
  }

  size(): number {
    return this.keys().length;
  }

  entries(): Array<[string, unknown]> {
    return this.keys().map((key) => [key, this.get(key as keyof T)]);
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of this.keys()) {
      result[key] = this.get(key as keyof T);
    }
    return result;
  }

  fromJSON(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      this.set(key as keyof T, value as T[keyof T]);
    }
  }

  onChange(key: string, callback: (value: unknown, oldValue: unknown) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);
    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  private notify(key: string, value: unknown, oldValue: unknown): void {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      callbacks.forEach((cb) => cb(value, oldValue));
    }
  }

  getWithTTL<K extends keyof T>(key: K): { value: T[K] | undefined; expires?: number } {
    const fullKey = this.key(key as string);
    const item = this.storage.getItem(fullKey);
    if (item === null) return { value: undefined };
    try {
      const parsed = this.deserialize(item) as { value: T[K]; expires?: number };
      if (parsed.expires && Date.now() > parsed.expires) {
        this.storage.removeItem(fullKey);
        return { value: undefined };
      }
      return { value: parsed.value, expires: parsed.expires };
    } catch {
      return { value: undefined };
    }
  }

  setWithTTL<K extends keyof T>(key: K, value: T[K], ttl: number): void {
    this.set(key, value, ttl);
  }

  getTTL(key: keyof T): number | undefined {
    const { expires } = this.getWithTTL(key);
    if (!expires) return undefined;
    return Math.max(0, expires - Date.now());
  }

  extendTTL(key: keyof T, ttl: number): void {
    const value = this.get(key);
    if (value !== undefined) {
      this.set(key, value, ttl);
    }
  }

  isExpired(key: keyof T): boolean {
    const { expires } = this.getWithTTL(key);
    if (!expires) return false;
    return Date.now() > expires;
  }

  cleanup(): number {
    let count = 0;
    for (const key of this.keys()) {
      if (this.isExpired(key as keyof T)) {
        this.remove(key as keyof T);
        count++;
      }
    }
    return count;
  }

  getNamespace(): string {
    return this.namespace;
  }

  setNamespace(namespace: string): void {
    this.namespace = namespace;
  }

  getStorage(): Storage {
    return this.storage;
  }

  isAvailable(): boolean {
    try {
      const testKey = "__tw_test__";
      this.storage.setItem(testKey, "1");
      this.storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  getUsage(): number {
    let total = 0;
    for (const key of this.keys()) {
      const fullKey = this.key(key);
      const item = this.storage.getItem(fullKey);
      if (item) total += item.length;
    }
    return total;
  }

  getUsageBytes(): number {
    return this.getUsage() * 2;
  }

  export(): string {
    return JSON.stringify(this.toJSON());
  }

  import(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.fromJSON(parsed);
    } catch {
      throw new Error("Invalid import data");
    }
  }

  merge(other: TypedStorage<T>): void {
    for (const [key, value] of other.entries()) {
      this.set(key as keyof T, value as T[keyof T]);
    }
  }

  clone(): TypedStorage<T> {
    const clone = new TypedStorage<T>(this.storage, {
      namespace: this.namespace + "_clone",
      ttl: this.ttl,
      serialize: this.serialize,
      deserialize: this.deserialize,
    });
    for (const [key, value] of this.entries()) {
      clone.set(key as keyof T, value as T[keyof T]);
    }
    return clone;
  }

  watch(callback: (key: string, value: unknown, oldValue: unknown) => void): () => void {
    const unwatchers: Array<() => void> = [];
    for (const key of this.keys()) {
      unwatchers.push(this.onChange(key, (value, oldValue) => callback(key, value, oldValue)));
    }
    return () => unwatchers.forEach((unwatch) => unwatch());
  }

  transaction(fn: (storage: TypedStorage<T>) => void): void {
    const backup = this.clone();
    try {
      fn(this);
    } catch (error) {
      this.clear();
      this.merge(backup);
      throw error;
    }
  }

  batchSet(entries: Array<[keyof T, T[keyof T]]>): void {
    for (const [key, value] of entries) {
      this.set(key, value);
    }
  }

  batchGet(keys: Array<keyof T>): Array<[keyof T, T[keyof T] | undefined]> {
    return keys.map((key) => [key, this.get(key)]);
  }

  batchRemove(keys: Array<keyof T>): void {
    keys.forEach((key) => this.remove(key));
  }

  filter(predicate: (value: unknown, key: string) => boolean): Array<[string, unknown]> {
    return this.entries().filter(([key, value]) => predicate(value, key));
  }

  map<R>(mapper: (value: unknown, key: string) => R): Array<[string, R]> {
    return this.entries().map(([key, value]) => [key, mapper(value, key)]);
  }

  forEach(callback: (value: unknown, key: string) => void): void {
    for (const [key, value] of this.entries()) {
      callback(value, key);
    }
  }

  some(predicate: (value: unknown, key: string) => boolean): boolean {
    return this.entries().some(([key, value]) => predicate(value, key));
  }

  every(predicate: (value: unknown, key: string) => boolean): boolean {
    return this.entries().every(([key, value]) => predicate(value, key));
  }

  find(predicate: (value: unknown, key: string) => boolean): [string, unknown] | undefined {
    return this.entries().find(([key, value]) => predicate(value, key));
  }

  reduce<R>(reducer: (acc: R, value: unknown, key: string) => R, initial: R): R {
    let acc = initial;
    for (const [key, value] of this.entries()) {
      acc = reducer(acc, value, key);
    }
    return acc;
  }

  count(predicate?: (value: unknown, key: string) => boolean): number {
    if (!predicate) return this.size();
    return this.filter(predicate).length;
  }

  sum(mapper: (value: unknown, key: string) => number): number {
    return this.reduce((sum, value, key) => sum + mapper(value, key), 0);
  }

  average(mapper: (value: unknown, key: string) => number): number {
    const size = this.size();
    if (size === 0) return 0;
    return this.sum(mapper) / size;
  }

  min(mapper: (value: unknown, key: string) => number): number | undefined {
    const values = this.map(mapper).map(([, v]) => v);
    return values.length > 0 ? Math.min(...values) : undefined;
  }

  max(mapper: (value: unknown, key: string) => number): number | undefined {
    const values = this.map(mapper).map(([, v]) => v);
    return values.length > 0 ? Math.max(...values) : undefined;
  }

  groupBy<K extends string>(grouper: (value: unknown, key: string) => K): Record<K, Array<[string, unknown]>> {
    const result = {} as Record<K, Array<[string, unknown]>>;
    for (const entry of this.entries()) {
      const group = grouper(entry[1], entry[0]);
      if (!result[group]) result[group] = [];
      result[group].push(entry);
    }
    return result;
  }

  sortBy(comparator: (a: [string, unknown], b: [string, unknown]) => number): Array<[string, unknown]> {
    return this.entries().sort(comparator);
  }

  reverse(): Array<[string, unknown]> {
    return this.entries().reverse();
  }

  slice(start: number, end: number): Array<[string, unknown]> {
    return this.entries().slice(start, end);
  }

  toArray<R>(mapper: (value: unknown, key: string) => R): R[] {
    return this.map(mapper).map(([, v]) => v);
  }

  toObject(): Record<string, unknown> {
    return this.toJSON();
  }

  toMap(): Map<string, unknown> {
    return new Map(this.entries());
  }

  fromMap(map: Map<string, unknown>): void {
    this.clear();
    for (const [key, value] of map) {
      this.set(key as keyof T, value as T[keyof T]);
    }
  }

  fromEntries(entries: Array<[string, unknown]>): void {
    this.clear();
    for (const [key, value] of entries) {
      this.set(key as keyof T, value as T[keyof T]);
    }
  }

  toEntries(): Array<[string, unknown]> {
    return this.entries();
  }

  diff(other: TypedStorage<T>): { added: string[]; removed: string[]; changed: Array<{ key: string; oldValue: unknown; newValue: unknown }> } {
    const thisKeys = new Set(this.keys());
    const otherKeys = new Set(other.keys());
    const added: string[] = [];
    const removed: string[] = [];
    const changed: Array<{ key: string; oldValue: unknown; newValue: unknown }> = [];
    for (const key of otherKeys) {
      if (!thisKeys.has(key)) added.push(key);
      else {
        const thisValue = this.get(key as keyof T);
        const otherValue = other.get(key as keyof T);
        if (JSON.stringify(thisValue) !== JSON.stringify(otherValue)) {
          changed.push({ key, oldValue: thisValue, newValue: otherValue });
        }
      }
    }
    for (const key of thisKeys) {
      if (!otherKeys.has(key)) removed.push(key);
    }
    return { added, removed, changed };
  }

  patch(changes: { added?: Record<string, unknown>; removed?: string[]; changed?: Record<string, unknown> }): void {
    if (changes.added) {
      for (const [key, value] of Object.entries(changes.added)) {
        this.set(key as keyof T, value as T[keyof T]);
      }
    }
    if (changes.removed) {
      for (const key of changes.removed) {
        this.remove(key as keyof T);
      }
    }
    if (changes.changed) {
      for (const [key, value] of Object.entries(changes.changed)) {
        this.set(key as keyof T, value as T[keyof T]);
      }
    }
  }

  sync(other: TypedStorage<T>): { added: string[]; removed: string[]; changed: Array<{ key: string; oldValue: unknown; newValue: unknown }> } {
    const diff = this.diff(other);
    this.patch({ added: Object.fromEntries(other.entries().filter(([k]) => diff.added.includes(k))), removed: diff.removed, changed: Object.fromEntries(diff.changed.map((c) => [c.key, c.newValue])) });
    return diff;
  }

  observe(callback: (changes: { added?: Record<string, unknown>; removed?: string[]; changed?: Array<{ key: string; oldValue: unknown; newValue: unknown }> }) => void, interval: number = 1000): () => void {
    let snapshot = this.clone();
    const timer = setInterval(() => {
      const diff = snapshot.diff(this);
      if (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0) {
        callback(diff as any);
        snapshot = this.clone();
      }
    }, interval);
    return () => clearInterval(timer);
  }

  compress(): string {
    return JSON.stringify(this.toJSON());
  }

  decompress(data: string): void {
    this.clear();
    this.import(data);
  }

  getSize(): number {
    return this.getUsage();
  }

  getCapacity(): number | undefined {
    return undefined;
  }

  getRemainingCapacity(): number | undefined {
    return undefined;
  }

  isFull(): boolean {
    return false;
  }

  isLow(): boolean {
    return false;
  }

  getUsagePercentage(): number {
    return 0;
  }

  getInfo(): {
    namespace: string;
    size: number;
    usage: number;
    available: boolean;
    keys: number;
  } {
    return {
      namespace: this.namespace,
      size: this.size(),
      usage: this.getUsage(),
      available: this.isAvailable(),
      keys: this.keys().length,
    };
  }

  getStats(): {
    totalItems: number;
    totalSize: number;
    averageSize: number;
    largestKey: string | undefined;
    smallestKey: string | undefined;
    oldestKey: string | undefined;
    newestKey: string | undefined;
  } {
    const entries = this.entries();
    if (entries.length === 0) {
      return { totalItems: 0, totalSize: 0, averageSize: 0, largestKey: undefined, smallestKey: undefined, oldestKey: undefined, newestKey: undefined };
    }
    const sizes = entries.map(([key, value]) => ({ key, size: JSON.stringify(value).length }));
    const totalSize = sizes.reduce((sum, s) => sum + s.size, 0);
    const largest = sizes.sort((a, b) => b.size - a.size)[0];
    const smallest = sizes.sort((a, b) => a.size - b.size)[0];
    return {
      totalItems: entries.length,
      totalSize,
      averageSize: totalSize / entries.length,
      largestKey: largest.key,
      smallestKey: smallest.key,
      oldestKey: entries[0][0],
      newestKey: entries[entries.length - 1][0],
    };
  }
}

export function createLocalStorage<T>(namespace?: string): TypedStorage<T> {
  return new TypedStorage<T>(localStorage, { namespace });
}

export function createSessionStorage<T>(namespace?: string): TypedStorage<T> {
  return new TypedStorage<T>(sessionStorage, { namespace });
}

export function createMemoryStorage<T>(namespace?: string): TypedStorage<T> {
  const memoryStorage = {
    _data: new Map<string, string>(),
    get length() { return memoryStorage._data.size; },
    key(index: number): string | null {
      const keys = [...memoryStorage._data.keys()];
      return keys[index] ?? null;
    },
    getItem(key: string): string | null {
      return memoryStorage._data.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      memoryStorage._data.set(key, value);
    },
    removeItem(key: string): void {
      memoryStorage._data.delete(key);
    },
    clear(): void {
      memoryStorage._data.clear();
    },
  } as unknown as Storage;
  return new TypedStorage<T>(memoryStorage, { namespace });
}

export function isStorageAvailable(type: "localStorage" | "sessionStorage"): boolean {
  try {
    const storage = window[type];
    const testKey = "__tw_test__";
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function getStorageQuota(): { usage: number; quota: number } | undefined {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
    return navigator.storage.estimate().then((estimate) => ({
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    })) as unknown as { usage: number; quota: number };
  }
  return undefined;
}

export function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
    return navigator.storage.persist();
  }
  return Promise.resolve(false);
}

export function isPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persisted) {
    return navigator.storage.persisted();
  }
  return Promise.resolve(false);
}

export class StorageMigrator<T> {
  private storage: TypedStorage<T>;
  private migrations: Map<number, (data: Record<string, unknown>) => Record<string, unknown>> = new Map();

  constructor(storage: TypedStorage<T>) {
    this.storage = storage;
  }

  addMigration(version: number, fn: (data: Record<string, unknown>) => Record<string, unknown>): this {
    this.migrations.set(version, fn);
    return this;
  }

  getCurrentVersion(): number {
    return this.storage.get("__version" as keyof T) as unknown as number ?? 0;
  }

  setCurrentVersion(version: number): void {
    this.storage.set("__version" as keyof T, version as unknown as T[keyof T]);
  }

  migrate(targetVersion: number): void {
    let currentVersion = this.getCurrentVersion();
    while (currentVersion < targetVersion) {
      const migration = this.migrations.get(currentVersion + 1);
      if (!migration) {
        throw new Error(`No migration found for version ${currentVersion + 1}`);
      }
      const data = this.storage.toJSON();
      const migrated = migration(data);
      this.storage.clear();
      this.storage.fromJSON(migrated);
      currentVersion++;
      this.setCurrentVersion(currentVersion);
    }
  }

  needsMigration(targetVersion: number): boolean {
    return this.getCurrentVersion() < targetVersion;
  }
}

export class StorageManager {
  private stores: Map<string, TypedStorage> = new Map();

  create<T>(name: string, namespace?: string): TypedStorage<T> {
    const store = new TypedStorage<T>(localStorage, { namespace: namespace ?? name });
    this.stores.set(name, store as any);
    return store;
  }

  get<T>(name: string): TypedStorage<T> | undefined {
    return this.stores.get(name) as TypedStorage<T> | undefined;
  }

  remove(name: string): void {
    const store = this.stores.get(name);
    if (store) {
      store.clear();
      this.stores.delete(name);
    }
  }

  clear(): void {
    for (const store of this.stores.values()) {
      store.clear();
    }
    this.stores.clear();
  }

  list(): string[] {
    return [...this.stores.keys()];
  }

  size(): number {
    return this.stores.size;
  }

  getTotalSize(): number {
    let total = 0;
    for (const store of this.stores.values()) {
      total += store.getUsage();
    }
    return total;
  }

  getTotalItems(): number {
    let total = 0;
    for (const store of this.stores.values()) {
      total += store.size();
    }
    return total;
  }

  cleanup(): number {
    let count = 0;
    for (const store of this.stores.values()) {
      count += store.cleanup();
    }
    return count;
  }

  export(): string {
    const data: Record<string, unknown> = {};
    for (const [name, store] of this.stores) {
      data[name] = store.toJSON();
    }
    return JSON.stringify(data);
  }

  import(data: string): void {
    const parsed = JSON.parse(data);
    for (const [name, storeData] of Object.entries(parsed)) {
      let store = this.stores.get(name);
      if (!store) {
        store = this.create(name);
      }
      store.fromJSON(storeData as Record<string, unknown>);
    }
  }
}
