/**
 * Object manipulation utilities.
 * @module shared/utils/object
 */

export function assign<T extends object>(target: T, ...sources: Partial<T>[]): T {
  return Object.assign(target, ...sources);
}

export function mergeDeep<T extends object>(target: T, ...sources: Partial<T>[]): T {
  const result = { ...target };
  for (const source of sources) {
    for (const key in source) {
      if (source[key] instanceof Object && key in result) {
        (result as Record<string, unknown>)[key] = mergeDeep(
          (result as Record<string, unknown>)[key] as object,
          (source as Record<string, unknown>)[key] as object,
        );
      } else {
        (result as Record<string, unknown>)[key] = (source as Record<string, unknown>)[key];
      }
    }
  }
  return result;
}

export function clone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return [...obj] as unknown as T;
  return { ...obj };
}

export function cloneDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(cloneDeep) as unknown as T;
  if (obj instanceof Date) return new Date(obj) as unknown as T;
  if (obj instanceof Map) return new Map([...obj].map(([k, v]) => [cloneDeep(k), cloneDeep(v)])) as unknown as T;
  if (obj instanceof Set) return new Set([...obj].map(cloneDeep)) as unknown as T;
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = cloneDeep((obj as Record<string, unknown>)[key]);
    }
  }
  return result as unknown as T;
}

export function keys<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}

export function values<T extends object>(obj: T): T[keyof T][] {
  return Object.values(obj) as T[keyof T][];
}

export function entries<T extends object>(obj: T): Array<[keyof T, T[keyof T]]> {
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
}

export function fromEntries<K extends string, V>(entries: Array<[K, V]>): Record<K, V> {
  const result = {} as Record<K, V>;
  for (const [key, value] of entries) {
    result[key] = value;
  }
  return result;
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

export function pickBy<T extends object>(obj: T, predicate: (value: T[keyof T], key: keyof T) => boolean): Partial<T> {
  const result = {} as Partial<T>;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && predicate(obj[key], key)) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

export function omitBy<T extends object>(obj: T, predicate: (value: T[keyof T], key: keyof T) => boolean): Partial<T> {
  const result = { ...obj };
  for (const key in result) {
    if (Object.prototype.hasOwnProperty.call(result, key) && predicate(result[key] as T[keyof T], key as keyof T)) {
      delete result[key];
    }
  }
  return result;
}

export function invert<T extends Record<string, string | number>>(obj: T): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[String(value)] = key;
  }
  return result;
}

export function mapKeys<T extends object>(obj: T, iteratee: (value: T[keyof T], key: keyof T) => string): Record<string, T[keyof T]> {
  const result: Record<string, T[keyof T]> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = iteratee(obj[key], key);
      result[newKey] = obj[key];
    }
  }
  return result;
}

export function mapValues<T extends object, R>(obj: T, iteratee: (value: T[keyof T], key: keyof T) => R): Record<string, R> {
  const result: Record<string, R> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = iteratee(obj[key], key);
    }
  }
  return result;
}

export function findKey<T extends object>(obj: T, predicate: (value: T[keyof T], key: keyof T) => boolean): keyof T | undefined {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && predicate(obj[key], key)) {
      return key;
    }
  }
  return undefined;
}

export function findLastKey<T extends object>(obj: T, predicate: (value: T[keyof T], key: keyof T) => boolean): keyof T | undefined {
  const keys = Object.keys(obj).reverse() as (keyof T)[];
  for (const key of keys) {
    if (predicate(obj[key], key)) return key;
  }
  return undefined;
}

export function forIn<T extends object>(obj: T, iteratee: (value: T[keyof T], key: keyof T) => void): void {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      iteratee(obj[key], key);
    }
  }
}

export function forOwn<T extends object>(obj: T, iteratee: (value: T[keyof T], key: keyof T) => void): void {
  Object.keys(obj).forEach((key) => iteratee((obj as Record<string, unknown>)[key] as T[keyof T], key as keyof T));
}

export function get<T extends object>(obj: T, path: string, defaultValue?: unknown): unknown {
  const keys = path.split(/[.[\]]/).filter(Boolean);
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return defaultValue;
    current = (current as Record<string, unknown>)[key];
  }
  return current === undefined ? defaultValue : current;
}

export function set<T extends object>(obj: T, path: string, value: unknown): T {
  const keys = path.split(/[.[\]]/).filter(Boolean);
  const result = cloneDeep(obj);
  let current: Record<string, unknown> = result as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === null || current[key] === undefined || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
  return result;
}

export function unset<T extends object>(obj: T, path: string): T {
  const keys = path.split(/[.[\]]/).filter(Boolean);
  const result = cloneDeep(obj);
  let current: Record<string, unknown> = result as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined) return result;
    current = current[keys[i]] as Record<string, unknown>;
  }
  delete current[keys[keys.length - 1]];
  return result;
}

export function has<T extends object>(obj: T, path: string): boolean {
  const keys = path.split(/[.[\]]/).filter(Boolean);
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") return false;
    if (!(key in (current as Record<string, unknown>))) return false;
    current = (current as Record<string, unknown>)[key];
  }
  return true;
}

export function hasIn<T extends object>(obj: T, path: string): boolean {
  const keys = path.split(/[.[\]]/).filter(Boolean);
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return false;
    if (typeof current !== "object") return false;
    current = (current as Record<string, unknown>)[key];
  }
  return true;
}

export function at<T extends object>(obj: T, paths: string[]): unknown[] {
  return paths.map((path) => get(obj, path));
}

export function defaults<T extends object>(obj: T, ...sources: Partial<T>[]): T {
  const result = { ...obj };
  for (const source of sources) {
    for (const key in source) {
      if (result[key] === undefined) {
        result[key] = source[key] as any;
      }
    }
  }
  return result;
}

export function defaultsDeep<T extends object>(obj: T, ...sources: Partial<T>[]): T {
  const result = cloneDeep(obj);
  for (const source of sources) {
    for (const key in source) {
      if (result[key] === undefined) {
        result[key] = cloneDeep(source[key]) as any;
      } else if (typeof result[key] === "object" && typeof source[key] === "object") {
        result[key] = defaultsDeep(result[key] as object, source[key] as Partial<object>) as any;
      }
    }
  }
  return result;
}

export function merge<T extends object>(target: T, ...sources: Partial<T>[]): T {
  const result = { ...target };
  for (const source of sources) {
    for (const key in source) {
      if (source[key] !== undefined) {
        result[key] = source[key] as any;
      }
    }
  }
  return result;
}

export function isEmpty(obj: unknown): boolean {
  if (obj === null || obj === undefined) return true;
  if (Array.isArray(obj) || typeof obj === "string") return obj.length === 0;
  if (obj instanceof Map || obj instanceof Set) return obj.size === 0;
  if (typeof obj === "object") return Object.keys(obj).length === 0;
  return false;
}

export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => isEqual(item, b[i]));
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !isEqual(value, b.get(key))) return false;
    }
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => isEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

export function isDeepEqual(a: unknown, b: unknown): boolean {
  return isEqual(a, b);
}

export function isShallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => item === b[i]);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]);
}

export function isMatch<T extends object>(obj: T, source: Partial<T>): boolean {
  for (const key in source) {
    if (source[key] !== undefined) {
      if (typeof source[key] === "object" && source[key] !== null) {
        if (!isMatch(obj[key] as object, source[key] as object)) return false;
      } else {
        if (obj[key] !== source[key]) return false;
      }
    }
  }
  return true;
}

export function matches<T extends object>(source: Partial<T>): (obj: T) => boolean {
  return (obj) => isMatch(obj, source);
}

export function matchesProperty<T extends object>(path: keyof T, value: unknown): (obj: T) => boolean {
  return (obj) => obj[path] === value;
}

export function property<T extends object, K extends keyof T>(path: K): (obj: T) => T[K] {
  return (obj) => obj[path];
}

export function conforms<T extends object>(source: Record<string, (value: unknown) => boolean>): (obj: T) => boolean {
  return (obj) => {
    for (const key in source) {
      if (!source[key]((obj as Record<string, unknown>)[key])) return false;
    }
    return true;
  };
}

export function toPlainObject<T extends object>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function toPairs<T extends object>(obj: T): Array<[keyof T, T[keyof T]]> {
  return entries(obj);
}

export function fromPairsSafe<T>(pairs: Array<[string, T]>): Record<string, T> {
  return fromEntries(pairs);
}

export function transform<T extends object, R>(obj: T, iteratee: (acc: R, value: T[keyof T], key: keyof T) => void, accumulator: R): R {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      iteratee(accumulator, obj[key], key);
    }
  }
  return accumulator;
}

export function reduceDeep<T extends object, R>(obj: T, iteratee: (acc: R, value: unknown, key: string) => R, accumulator: R): R {
  const walk = (current: unknown, path: string): R => {
    if (current === null || typeof current !== "object") {
      return iteratee(accumulator, current, path);
    }
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        walk(current[i], path ? `${path}[${i}]` : `[${i}]`);
      }
    } else {
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          walk((current as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
        }
      }
    }
    return accumulator;
  };
  return walk(obj, "");
}

export function deepFreeze<T extends object>(obj: T): T {
  Object.freeze(obj);
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] === "object" && obj[key] !== null && !Object.isFrozen(obj[key])) {
      deepFreeze(obj[key] as unknown as object);
    }
  }
  return obj;
}

export function deepSeal<T extends object>(obj: T): T {
  Object.seal(obj);
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] === "object" && obj[key] !== null && !Object.isSealed(obj[key])) {
      deepSeal(obj[key] as unknown as object);
    }
  }
  return obj;
}

export function isFrozen<T extends object>(obj: T): boolean {
  return Object.isFrozen(obj);
}

export function isSealed<T extends object>(obj: T): boolean {
  return Object.isSealed(obj);
}

export function isExtensible<T extends object>(obj: T): boolean {
  return Object.isExtensible(obj);
}

export function preventExtensions<T extends object>(obj: T): T {
  Object.preventExtensions(obj);
  return obj;
}

export function getPrototypeOf<T extends object>(obj: T): object | null {
  return Object.getPrototypeOf(obj);
}

export function setPrototypeOf<T extends object>(obj: T, proto: object | null): T {
  Object.setPrototypeOf(obj, proto);
  return obj;
}

export function create<T extends object>(proto: object | null, properties?: PropertyDescriptorMap): T {
  return Object.create(proto, properties) as T;
}

export function defineProperty<T extends object>(obj: T, key: string, descriptor: PropertyDescriptor): T {
  Object.defineProperty(obj, key, descriptor);
  return obj;
}

export function defineProperties<T extends object>(obj: T, descriptors: PropertyDescriptorMap): T {
  Object.defineProperties(obj, descriptors);
  return obj;
}

export function getOwnPropertyDescriptor<T extends object>(obj: T, key: string): PropertyDescriptor | undefined {
  return Object.getOwnPropertyDescriptor(obj, key);
}

export function getOwnPropertyNames<T extends object>(obj: T): string[] {
  return Object.getOwnPropertyNames(obj);
}

export function getOwnPropertySymbols<T extends object>(obj: T): symbol[] {
  return Object.getOwnPropertySymbols(obj);
}

export function getReflectKeys<T extends object>(obj: T): Array<string | symbol> {
  return [...Reflect.ownKeys(obj)];
}

export function shallowEqual<T extends object>(a: T, b: T): boolean {
  return isShallowEqual(a, b);
}

export function shallowDiff<T extends object>(a: T, b: T): string[] {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  const diff: string[] = [];
  for (const key of keysA) {
    if (!keysB.includes(key) || (a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) {
      diff.push(key);
    }
  }
  for (const key of keysB) {
    if (!keysA.includes(key)) {
      diff.push(key);
    }
  }
  return diff;
}

export function deepDiff<T extends object>(a: T, b: T, path: string = ""): string[] {
  const diff: string[] = [];
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    const valA = (a as Record<string, unknown>)[key];
    const valB = (b as Record<string, unknown>)[key];
    if (valA === undefined && valB !== undefined) {
      diff.push(`${currentPath} (+)`);
    } else if (valA !== undefined && valB === undefined) {
      diff.push(`${currentPath} (-)`);
    } else if (typeof valA === "object" && typeof valB === "object" && valA !== null && valB !== null) {
      diff.push(...deepDiff(valA as object, valB as object, currentPath));
    } else if (!isEqual(valA, valB)) {
      diff.push(currentPath);
    }
  }
  return diff;
}

export function patchObject<T extends object>(original: T, patches: Partial<T>): T {
  return merge(original, patches);
}

export function unpatchObject<T extends object>(original: T, patched: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in patched) {
    if (!isEqual(original[key], patched[key])) {
      result[key] = original[key];
    }
  }
  return result;
}

export function watchChanges<T extends object>(obj: T, callback: (key: keyof T, oldValue: unknown, newValue: unknown) => void): T {
  return new Proxy(obj, {
    set(target, prop, value, receiver) {
      const oldValue = target[prop as keyof T];
      target[prop as keyof T] = value;
      callback(prop as keyof T, oldValue, value);
      return true;
    },
  });
}

export function observableObject<T extends object>(obj: T, callback: (changes: Array<{ key: keyof T; oldValue: unknown; newValue: unknown }>) => void): T {
  const changes: Array<{ key: keyof T; oldValue: unknown; newValue: unknown }> = [];
  let scheduled = false;
  const flush = () => {
    if (changes.length > 0) {
      callback([...changes]);
      changes.length = 0;
    }
    scheduled = false;
  };
  return new Proxy(obj, {
    set(target, prop, value) {
      const oldValue = target[prop as keyof T];
      if (!isEqual(oldValue, value)) {
        changes.push({ key: prop as keyof T, oldValue, newValue: value });
        if (!scheduled) {
          scheduled = true;
          Promise.resolve().then(flush);
        }
      }
      target[prop as keyof T] = value;
      return true;
    },
  });
}
