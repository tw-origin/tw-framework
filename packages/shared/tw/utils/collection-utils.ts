/**
 * Collection utilities -- array, object, set, map manipulation helpers.
 * @module shared/utils
 */

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function compact<T>(array: T[]): T[] {
  return array.filter((item) => item !== null && item !== undefined);
}

export function difference<T>(array: T[], values: T[]): T[] {
  const set = new Set(values);
  return array.filter((item) => !set.has(item));
}

export function differenceBy<T>(array: T[], values: T[], iteratee: (item: T) => unknown): T[] {
  const valueSet = new Set(values.map(iteratee));
  return array.filter((item) => !valueSet.has(iteratee(item)));
}

export function differenceWith<T>(array: T[], values: T[], comparator: (a: T, b: T) => boolean): T[] {
  return array.filter((item) => !values.some((value) => comparator(item, value)));
}

export function drop<T>(array: T[], count: number = 1): T[] {
  return array.slice(count);
}

export function dropRight<T>(array: T[], count: number = 1): T[] {
  return array.slice(0, Math.max(0, array.length - count));
}

export function dropWhile<T>(array: T[], predicate: (item: T) => boolean): T[] {
  let i = 0;
  while (i < array.length && predicate(array[i])) {
    i++;
  }
  return array.slice(i);
}

export function dropRightWhile<T>(array: T[], predicate: (item: T) => boolean): T[] {
  let i = array.length;
  while (i > 0 && predicate(array[i - 1])) {
    i--;
  }
  return array.slice(0, i);
}

export function fill<T>(array: T[], value: T, start: number = 0, end: number = array.length): T[] {
  let result = [...array];
  for (let i = start; i < Math.min(end, result.length); i++) {
    result[i] = value;
  }
  return result;
}

export function findIndex<T>(array: T[], predicate: (item: T, index: number) => boolean, fromIndex: number = 0): number {
  for (let i = fromIndex; i < array.length; i++) {
    if (predicate(array[i], i)) return i;
  }
  return -1;
}

export function findLastIndex<T>(array: T[], predicate: (item: T, index: number) => boolean, fromIndex: number = array.length - 1): number {
  for (let i = fromIndex; i >= 0; i--) {
    if (predicate(array[i], i)) return i;
  }
  return -1;
}

export function flatten<T>(array: T[][]): T[] {
  return array.reduce<T[]>((acc, val) => acc.concat(val), []);
}

export function flattenDeep<T>(array: unknown[]): T[] {
  return array.reduce<T[]>((acc, val) => Array.isArray(val) ? acc.concat(flattenDeep(val)) : acc.concat(val as T), []);
}

export function flattenDepth<T>(array: unknown[], depth: number = 1): unknown[] {
  if (depth <= 0) return array;
  return array.reduce<unknown[]>((acc, val) => Array.isArray(val) ? acc.concat(flattenDepth(val, depth - 1)) : acc.concat(val), []);
}

export function fromPairs<T>(pairs: Array<[string, T]>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of pairs) {
    (result as any)[key] = value;
  }
  return result;
}

export function head<T>(array: T[]): T | undefined {
  return array[0];
}

export function tail<T>(array: T[]): T[] {
  return array.slice(1);
}

export function initial<T>(array: T[]): T[] {
  return array.slice(0, -1);
}

export function last<T>(array: T[]): T | undefined {
  return array[array.length - 1];
}

export function nth<T>(array: T[], n: number): T | undefined {
  const index = n < 0 ? array.length + n : n;
  return array[index];
}

export function intersection<T>(...arrays: T[][]): T[] {
  if (arrays.length === 0) return [];
  const set = new Set(arrays[0]);
  for (let i = 1; i < arrays.length; i++) {
    const newSet = new Set<T>();
    for (const item of arrays[i]) {
      if (set.has(item)) newSet.add(item);
    }
    set.clear();
    for (const item of newSet) set.add(item);
  }
  return [...set];
}

export function intersectionBy<T>(...args: [...T[][], (item: T) => unknown]): T[] {
  const iteratee = args[args.length - 1] as (item: T) => unknown;
  const arrays = args.slice(0, -1) as T[][];
  if (arrays.length === 0) return [];
  const set = new Set(arrays[0].map(iteratee));
  for (let i = 1; i < arrays.length; i++) {
    const newSet = new Set<unknown>();
    for (const item of arrays[i]) {
      if (set.has(iteratee(item))) newSet.add(iteratee(item));
    }
    set.clear();
    for (const item of newSet) set.add(item);
  }
  return arrays[0].filter((item) => set.has(iteratee(item)));
}

export function intersectionWith<T>(...args: [...T[][], (a: T, b: T) => boolean]): T[] {
  const comparator = args[args.length - 1] as (a: T, b: T) => boolean;
  const arrays = args.slice(0, -1) as T[][];
  if (arrays.length === 0) return [];
  return arrays[0].filter((item) => arrays.slice(1).every((arr) => arr.some((other) => comparator(item, other))));
}

export function join<T>(array: T[], separator: string = ","): string {
  return array.join(separator);
}

export function pull<T>(array: T[], ...values: T[]): T[] {
  const set = new Set(values);
  return array.filter((item) => !set.has(item));
}

export function pullAll<T>(array: T[], values: T[]): T[] {
  const set = new Set(values);
  return array.filter((item) => !set.has(item));
}

export function pullAt<T>(array: T[], indexes: number[]): T[] {
  const set = new Set(indexes);
  return array.filter((_, i) => !set.has(i));
}

export function remove<T>(array: T[], predicate: (item: T) => boolean): T[] {
  return array.filter((item) => !predicate(item));
}

export function reverse<T>(array: T[]): T[] {
  return [...array].reverse();
}

export function slice<T>(array: T[], start: number = 0, end: number = array.length): T[] {
  return array.slice(start, end);
}

export function sortedIndex<T>(array: T[], value: T): number {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (array[mid] < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export function sortedIndexBy<T>(array: T[], value: T, iteratee: (item: T) => number): number {
  let low = 0;
  let high = array.length;
  const targetValue = iteratee(value);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (iteratee(array[mid]) < targetValue) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export function sortedIndexOf<T>(array: T[], value: T): number {
  const index = sortedIndex(array, value);
  if (index < array.length && array[index] === value) return index;
  return -1;
}

export function sortedUniq<T>(array: T[]): T[] {
  const result: T[] = [];
  let prev: T | undefined;
  for (const item of array) {
    if (item !== prev) {
      result.push(item);
      prev = item;
    }
  }
  return result;
}

export function sortedUniqBy<T>(array: T[], iteratee: (item: T) => unknown): T[] {
  const result: T[] = [];
  let prevKey: unknown;
  for (const item of array) {
    const key = iteratee(item);
    if (key !== prevKey) {
      result.push(item);
      prevKey = key;
    }
  }
  return result;
}

export function tail2<T>(array: T[]): T[] {
  return array.slice(1);
}

export function take<T>(array: T[], count: number = 1): T[] {
  return array.slice(0, count);
}

export function takeRight<T>(array: T[], count: number = 1): T[] {
  return array.slice(Math.max(0, array.length - count));
}

export function takeWhile<T>(array: T[], predicate: (item: T) => boolean): T[] {
  const result: T[] = [];
  for (const item of array) {
    if (predicate(item)) {
      result.push(item);
    } else {
      break;
    }
  }
  return result;
}

export function takeRightWhile<T>(array: T[], predicate: (item: T) => boolean): T[] {
  const result: T[] = [];
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) {
      result.unshift(array[i]);
    } else {
      break;
    }
  }
  return result;
}

export function union<T>(...arrays: T[][]): T[] {
  const set = new Set<T>();
  for (const array of arrays) {
    for (const item of array) {
      set.add(item);
    }
  }
  return [...set];
}

export function unionBy<T>(...args: [...T[][], (item: T) => unknown]): T[] {
  const iteratee = args[args.length - 1] as (item: T) => unknown;
  const arrays = args.slice(0, -1) as T[][];
  const seen = new Set<unknown>();
  const result: T[] = [];
  for (const array of arrays) {
    for (const item of array) {
      const key = iteratee(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
  }
  return result;
}

export function unionWith<T>(...args: [...T[][], (a: T, b: T) => boolean]): T[] {
  const comparator = args[args.length - 1] as (a: T, b: T) => boolean;
  const arrays = args.slice(0, -1) as T[][];
  const result: T[] = [];
  for (const array of arrays) {
    for (const item of array) {
      if (!result.some((existing) => comparator(existing, item))) {
        result.push(item);
      }
    }
  }
  return result;
}

export function uniq<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export function uniqBy<T>(array: T[], iteratee: (item: T) => unknown): T[] {
  const seen = new Set<unknown>();
  const result: T[] = [];
  for (const item of array) {
    const key = iteratee(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function uniqWith<T>(array: T[], comparator: (a: T, b: T) => boolean): T[] {
  const result: T[] = [];
  for (const item of array) {
    if (!result.some((existing) => comparator(existing, item))) {
      result.push(item);
    }
  }
  return result;
}

export function unzip<T>(array: T[][]): T[][] {
  const maxLen = Math.max(...array.map((a) => a.length));
  const result: T[][] = [];
  for (let i = 0; i < maxLen; i++) {
    result.push(array.map((a) => a[i]));
  }
  return result;
}

export function unzipWith<T, R>(array: T[][], iteratee: (a: T, b: T) => R): R[] {
  return unzip(array).map((group: any[]) => group.reduce((a: any, b: any) => iteratee(a, b))) as R[];
}

export function without<T>(array: T[], ...values: T[]): T[] {
  const set = new Set(values);
  return array.filter((item) => !set.has(item));
}

export function xor<T>(...arrays: T[][]): T[] {
  const counts = new Map<T, number>();
  for (const array of arrays) {
    for (const item of array) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count === 1).map(([item]) => item);
}

export function xorBy<T>(...args: [...T[][], (item: T) => unknown]): T[] {
  const iteratee = args[args.length - 1] as (item: T) => unknown;
  const arrays = args.slice(0, -1) as T[][];
  const counts = new Map<unknown, T[]>();
  for (const array of arrays) {
    for (const item of array) {
      const key = iteratee(item);
      if (!counts.has(key)) counts.set(key, []);
      counts.get(key)!.push(item);
    }
  }
  return [...counts.entries()].filter(([, items]) => items.length === 1).map(([, items]) => items[0]);
}

export function xorWith<T>(...args: [...T[][], (a: T, b: T) => boolean]): T[] {
  const comparator = args[args.length - 1] as (a: T, b: T) => boolean;
  const arrays = args.slice(0, -1) as T[][];
  const all = arrays.flat();
  return all.filter((item) => arrays.every((arr) => arr.filter((other) => comparator(item, other)).length <= 1));
}

export function zip<A, B>(array1: A[], array2: B[]): Array<[A, B]> {
  const minLen = Math.min(array1.length, array2.length);
  const result: Array<[A, B]> = [];
  for (let i = 0; i < minLen; i++) {
    result.push([array1[i], array2[i]]);
  }
  return result;
}

export function zipObject<K extends string, V>(keys: K[], values: V[]): Record<K, V> {
  const result = {} as Record<K, V>;
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = values[i];
  }
  return result;
}

export function zipObjectDeep(keys: string[], values: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const parts = keys[i].split(".");
    let current = result;
    for (let j = 0; j < parts.length - 1; j++) {
      if (!(parts[j] in current)) {
        current[parts[j]] = {};
      }
      current = current[parts[j]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = values[i];
  }
  return result;
}

export function zipWith<A, B, R>(array1: A[], array2: B[], iteratee: (a: A, b: B) => R): R[] {
  const minLen = Math.min(array1.length, array2.length);
  const result: R[] = [];
  for (let i = 0; i < minLen; i++) {
    result.push(iteratee(array1[i], array2[i]));
  }
  return result;
}

export function countBy<T>(array: T[], iteratee: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of array) {
    const key = iteratee(item);
    (result as any)[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

export function every2<T>(array: T[], predicate: (item: T) => boolean): boolean {
  return array.every(predicate);
}

export function filter2<T>(array: T[], predicate: (item: T) => boolean): T[] {
  return array.filter(predicate);
}

export function find2<T>(array: T[], predicate: (item: T) => boolean): T | undefined {
  return array.find(predicate);
}

export function findLast<T>(array: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) return array[i];
  }
  return undefined;
}

export function flatMap<T, R>(array: T[], iteratee: (item: T) => R[]): R[] {
  return array.flatMap(iteratee);
}

export function flatMapDeep<T, R>(array: T[], iteratee: (item: T) => unknown): R[] {
  return flattenDeep(array.flatMap(iteratee));
}

export function forEach2<T>(array: T[], iteratee: (item: T, index: number) => void): void {
  array.forEach(iteratee);
}

export function forEachRight<T>(array: T[], iteratee: (item: T, index: number) => void): void {
  for (let i = array.length - 1; i >= 0; i--) {
    iteratee(array[i], i);
  }
}

export function groupBy<T>(array: T[], iteratee: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of array) {
    const key = iteratee(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

export function includes2<T>(array: T[], value: T, fromIndex: number = 0): boolean {
  return array.slice(fromIndex).includes(value);
}

export function keyBy<T>(array: T[], iteratee: (item: T) => string): Record<string, T> {
  const result: Record<string, T> = {};
  for (const item of array) {
    result[iteratee(item)] = item;
  }
  return result;
}

export function map2<T, R>(array: T[], iteratee: (item: T, index: number) => R): R[] {
  return array.map(iteratee);
}

export function orderBy<T>(array: T[], iteratees: Array<(item: T) => unknown>, orders: Array<"asc" | "desc">): T[] {
  return [...array].sort((a, b) => {
    for (let i = 0; i < iteratees.length; i++) {
      const aValue = iteratees[i](a);
      const bValue = iteratees[i](b);
      if (aValue < bValue) return orders[i] === "desc" ? 1 : -1;
      if (aValue > bValue) return orders[i] === "desc" ? -1 : 1;
    }
    return 0;
  });
}

export function partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of array) {
    if (predicate(item)) pass.push(item);
    else fail.push(item);
  }
  return [pass, fail];
}

export function reduce2<T, R>(array: T[], iteratee: (acc: R, item: T) => R, initial: R): R {
  return array.reduce(iteratee, initial);
}

export function reduceRight<T, R>(array: T[], iteratee: (acc: R, item: T) => R, initial: R): R {
  return array.reduceRight(iteratee, initial);
}

export function reject<T>(array: T[], predicate: (item: T) => boolean): T[] {
  return array.filter((item) => !predicate(item));
}

export function sample<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

export function sampleSize<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function size2(collection: unknown[] | Record<string, unknown> | string): number {
  if (Array.isArray(collection) || typeof collection === "string") return collection.length;
  if (typeof collection === "object" && collection !== null) return Object.keys(collection).length;
  return 0;
}

export function some2<T>(array: T[], predicate: (item: T) => boolean): boolean {
  return array.some(predicate);
}

export function sortBy<T>(array: T[], iteratee: (item: T) => number | string): T[] {
  return [...array].sort((a, b) => {
    const aValue = iteratee(a);
    const bValue = iteratee(b);
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
  });
}

export function assign<T extends Record<string, unknown>>(target: T, ...sources: Record<string, unknown>[]): T {
  const result = { ...target };
  for (const source of sources) {
    Object.assign(result, source);
  }
  return result;
}

export function assignIn<T extends Record<string, unknown>>(target: T, ...sources: Record<string, unknown>[]): T {
  return assign(target, ...sources);
}

export function assignWith<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>, customizer: (targetValue: unknown, sourceValue: unknown, key: string) => unknown): T {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const targetValue = result[key];
    const sourceValue = source[key];
    const customValue = customizer(targetValue, sourceValue, key);
    if (customValue !== undefined) {
      (result as any)[key] = customValue;
    } else if (sourceValue !== undefined) {
      (result as any)[key] = sourceValue;
    }
  }
  return result;
}

export function at(object: Record<string, unknown>, paths: string[]): unknown[] {
  return paths.map((path) => {
    const parts = path.split(".");
    let current: unknown = object;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  });
}

export function create<T extends Record<string, unknown>>(prototype: object, properties?: Record<string, unknown>): T {
  const obj = Object.create(prototype);
  if (properties) {
    Object.assign(obj, properties);
  }
  return obj as T;
}

export function defaults<T extends Record<string, unknown>>(object: T, ...sources: Record<string, unknown>[]): T {
  const result = { ...object };
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      if (!(key in result)) {
        (result as any)[key] = source[key];
      }
    }
  }
  return result;
}

export function defaultsDeep<T extends Record<string, unknown>>(object: T, ...sources: Record<string, unknown>[]): T {
  const result = { ...object };
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      if (!(key in result)) {
        (result as any)[key] = source[key];
      } else if (typeof result[key] === "object" && typeof source[key] === "object" && result[key] !== null && source[key] !== null) {
        (result as any)[key] = defaultsDeep(result[key] as Record<string, unknown>, source[key] as Record<string, unknown>) as unknown;
      }
    }
  }
  return result;
}

export function findKey<T extends Record<string, unknown>>(object: T, predicate: (value: unknown, key: string) => boolean): string | undefined {
  for (const key of Object.keys(object)) {
    if (predicate(object[key], key)) return key;
  }
  return undefined;
}

export function findLastKey<T extends Record<string, unknown>>(object: T, predicate: (value: unknown, key: string) => boolean): string | undefined {
  const keys = Object.keys(object).reverse();
  for (const key of keys) {
    if (predicate(object[key], key)) return key;
  }
  return undefined;
}

export function forIn<T extends Record<string, unknown>>(object: T, iteratee: (value: unknown, key: string) => void): void {
  for (const key in object) {
    iteratee(object[key], key);
  }
}

export function forInRight<T extends Record<string, unknown>>(object: T, iteratee: (value: unknown, key: string) => void): void {
  const keys = Object.keys(object).reverse();
  for (const key of keys) {
    iteratee(object[key], key);
  }
}

export function forOwn<T extends Record<string, unknown>>(object: T, iteratee: (value: unknown, key: string) => void): void {
  for (const key of Object.keys(object)) {
    iteratee(object[key], key);
  }
}

export function forOwnRight<T extends Record<string, unknown>>(object: T, iteratee: (value: unknown, key: string) => void): void {
  const keys = Object.keys(object).reverse();
  for (const key of keys) {
    iteratee(object[key], key);
  }
}

export function functions<T extends Record<string, unknown>>(object: T): string[] {
  return Object.keys(object).filter((key) => typeof object[key] === "function");
}

export function functionsIn<T extends Record<string, unknown>>(object: T): string[] {
  return functions(object);
}

export function get(object: unknown, path: string, defaultValue?: unknown): unknown {
  const parts = path.split(".");
  let current: unknown = object;
  for (const part of parts) {
    if (current === null || current === undefined) return defaultValue;
    current = (current as Record<string, unknown>)[part];
  }
  return current === undefined ? defaultValue : current;
}

export function has(object: unknown, path: string): boolean {
  const parts = path.split(".");
  let current: unknown = object;
  for (const part of parts) {
    if (current === null || current === undefined) return false;
    if (!(part in (current as Record<string, unknown>))) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return true;
}

export function hasIn(object: unknown, path: string): boolean {
  return has(object, path);
}

export function invert(object: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(object)) {
    result[value] = key;
  }
  return result;
}

export function invertBy(object: Record<string, string>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(object)) {
    if (!result[value]) result[value] = [];
    result[value].push(key);
  }
  return result;
}

export function invoke(object: unknown, path: string, ...args: unknown[]): unknown {
  const parts = path.split(".");
  let current: unknown = object;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[parts[i]];
  }
  if (current === null || current === undefined) return undefined;
  const method = (current as Record<string, unknown>)[parts[parts.length - 1]];
  if (typeof method === "function") {
    return (method as (...args: unknown[]) => unknown)(...args);
  }
  return undefined;
}

export function keys2<T extends Record<string, unknown>>(object: T): string[] {
  return Object.keys(object);
}

export function keysIn<T extends Record<string, unknown>>(object: T): string[] {
  const result: string[] = [];
  for (const key in object) {
    result.push(key);
  }
  return result;
}

export function mapKeys<T extends Record<string, unknown>>(object: T, iteratee: (value: unknown, key: string) => string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(object)) {
    const newKey = iteratee(object[key], key);
    result[newKey] = object[key];
  }
  return result;
}

export function mapValues<T extends Record<string, unknown>>(object: T, iteratee: (value: unknown, key: string) => unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(object)) {
    (result as any)[key] = iteratee(object[key], key);
  }
  return result;
}

export function merge<T extends Record<string, unknown>>(object: T, ...sources: Record<string, unknown>[]): T {
  const result = { ...object };
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      if (typeof result[key] === "object" && typeof source[key] === "object" && result[key] !== null && source[key] !== null) {
        (result as any)[key] = merge(result[key] as Record<string, unknown>, source[key] as Record<string, unknown>) as unknown;
      } else {
        (result as any)[key] = source[key];
      }
    }
  }
  return result;
}

export function mergeWith<T extends Record<string, unknown>>(object: T, source: Record<string, unknown>, customizer: (targetValue: unknown, sourceValue: unknown, key: string) => unknown): T {
  const result = { ...object };
  for (const key of Object.keys(source)) {
    const customValue = customizer(result[key], source[key], key);
    if (customValue !== undefined) {
      (result as any)[key] = customValue;
    } else if (typeof result[key] === "object" && typeof source[key] === "object" && result[key] !== null && source[key] !== null) {
      (result as any)[key] = mergeWith(result[key] as Record<string, unknown>, source[key] as Record<string, unknown>, customizer) as unknown;
    } else {
      (result as any)[key] = source[key];
    }
  }
  return result;
}

export function omit<T extends Record<string, unknown>>(object: T, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keySet = new Set(keys);
  for (const key of Object.keys(object)) {
    if (!keySet.has(key)) {
      (result as any)[key] = object[key];
    }
  }
  return result;
}

export function omitBy<T extends Record<string, unknown>>(object: T, predicate: (value: unknown, key: string) => boolean): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(object)) {
    if (!predicate(object[key], key)) {
      (result as any)[key] = object[key];
    }
  }
  return result;
}

export function pick<T extends Record<string, unknown>>(object: T, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keySet = new Set(keys);
  for (const key of Object.keys(object)) {
    if (keySet.has(key)) {
      (result as any)[key] = object[key];
    }
  }
  return result;
}

export function pickBy<T extends Record<string, unknown>>(object: T, predicate: (value: unknown, key: string) => boolean): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(object)) {
    if (predicate(object[key], key)) {
      (result as any)[key] = object[key];
    }
  }
  return result;
}

export function result(object: unknown, path: string, defaultValue?: unknown): unknown {
  const value = get(object, path);
  if (typeof value === "function") {
    return value();
  }
  return value === undefined ? defaultValue : value;
}

export function set(object: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split(".");
  let current = object;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || current[parts[i]] === null || current[parts[i]] === undefined) {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
  return object;
}

export function toPairs<T extends Record<string, unknown>>(object: T): Array<[string, unknown]> {
  return Object.entries(object);
}

export function toPairsIn<T extends Record<string, unknown>>(object: T): Array<[string, unknown]> {
  return toPairs(object);
}

export function transform<T extends Record<string, unknown>, R>(object: T, iteratee: (acc: R, value: unknown, key: string) => boolean | void, accumulator: R): R {
  let result = accumulator;
  for (const key of Object.keys(object)) {
    const shouldContinue = iteratee(result, object[key], key);
    if (shouldContinue === false) break;
  }
  return result;
}

export function unset(object: Record<string, unknown>, path: string): boolean {
  const parts = path.split(".");
  let current = object;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current)) return false;
    current = current[parts[i]] as Record<string, unknown>;
  }
  return delete current[parts[parts.length - 1]];
}

export function update<T extends Record<string, unknown>>(object: T, path: string, updater: (value: unknown) => unknown): T {
  const currentValue = get(object, path);
  const newValue = updater(currentValue);
  set(object, path, newValue);
  return object;
}

export function values<T extends Record<string, unknown>>(object: T): unknown[] {
  return Object.values(object);
}

export function valuesIn<T extends Record<string, unknown>>(object: T): unknown[] {
  return values(object);
}

export function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return [...value] as unknown as T;
  return { ...value } as T;
}

export function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function cloneWith<T>(value: T, customizer: (value: T) => unknown): T {
  const custom = customizer(value);
  if (custom !== undefined) return custom as T;
  return clone(value);
}

export function cloneDeepWith<T>(value: T, customizer: (value: T) => unknown): T {
  const custom = customizer(value);
  if (custom !== undefined) return custom as T;
  return cloneDeep(value);
}

export function conformsTo<T extends Record<string, unknown>>(object: T, source: Record<string, (value: unknown) => boolean>): boolean {
  for (const key of Object.keys(source)) {
    if (!source[key](object[key])) return false;
  }
  return true;
}

export function eq(value: unknown, other: unknown): boolean {
  return value === other || (value !== value && other !== other);
}

export function gt(value: unknown, other: unknown): boolean {
  return (value as number) > (other as number);
}

export function gte(value: unknown, other: unknown): boolean {
  return (value as number) >= (other as number);
}

export function isArguments(value: unknown): boolean {
  return value !== null && typeof value === "object" && "length" in value && typeof (value as { callee?: unknown }).callee === "function";
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isArrayBuffer(value: unknown): boolean {
  return value instanceof ArrayBuffer;
}

export function isArrayLike(value: unknown): boolean {
  return value !== null && typeof value !== "function" && typeof (value as { length?: number }).length === "number";
}

export function isArrayLikeObject(value: unknown): boolean {
  return isArrayLike(value) && typeof value === "object";
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean" || value instanceof Boolean;
}

export function isBuffer(value: unknown): boolean {
  return typeof Buffer !== "undefined" && Buffer.isBuffer(value);
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

export function isElement(value: unknown): boolean {
  return value !== null && typeof value === "object" && (value as { nodeType?: number }).nodeType === 1;
}

export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value) || typeof value === "string") return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

export function isEqual(value: unknown, other: unknown): boolean {
  return JSON.stringify(value) === JSON.stringify(other);
}

export function isEqualWith(value: unknown, other: unknown, customizer: (a: unknown, b: unknown) => boolean | undefined): boolean {
  const custom = customizer(value, other);
  if (custom !== undefined) return custom;
  return isEqual(value, other);
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function isFinite2(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

export function isFunction(value: unknown): value is Function {
  return typeof value === "function";
}

export function isInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value);
}

export function isLength(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && (value as number) >= 0;
}

export function isMap(value: unknown): value is Map<unknown, unknown> {
  return value instanceof Map;
}

export function isMatch(object: unknown, source: Record<string, unknown>): boolean {
  for (const key of Object.keys(source)) {
    if (!isEqual((object as Record<string, unknown>)?.[key], source[key])) return false;
  }
  return true;
}

export function isMatchWith(object: unknown, source: Record<string, unknown>, customizer: (objValue: unknown, srcValue: unknown, key: string) => boolean | undefined): boolean {
  for (const key of Object.keys(source)) {
    const custom = customizer((object as Record<string, unknown>)?.[key], source[key], key);
    if (custom !== undefined) {
      if (!custom) return false;
    } else if (!isEqual((object as Record<string, unknown>)?.[key], source[key])) {
      return false;
    }
  }
  return true;
}

export function isNaN2(value: unknown): boolean {
  return typeof value === "number" && isNaN(value);
}

export function isNative(value: unknown): boolean {
  return typeof value === "function" && /\[native code\]/.test(value.toString());
}

export function isNil(value: unknown): boolean {
  return value === null || value === undefined;
}

export function isNull(value: unknown): value is null {
  return value === null;
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" || value instanceof Number;
}

export function isObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

export function isObjectLike(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

export function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

export function isSafeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function isSet(value: unknown): value is Set<unknown> {
  return value instanceof Set;
}

export function isString(value: unknown): value is string {
  return typeof value === "string" || value instanceof String;
}

export function isSymbol(value: unknown): boolean {
  return typeof value === "symbol";
}

export function isTypedArray(value: unknown): boolean {
  return value !== null && typeof value === "object" && ArrayBuffer.isView(value) && !(value instanceof DataView);
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

export function isWeakMap(value: unknown): boolean {
  return value instanceof WeakMap;
}

export function isWeakSet(value: unknown): boolean {
  return value instanceof WeakSet;
}

export function lt(value: unknown, other: unknown): boolean {
  return (value as number) < (other as number);
}

export function lte(value: unknown, other: unknown): boolean {
  return (value as number) <= (other as number);
}

export function toArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split("");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>);
  if (typeof (value as { length?: number; [index: number]: unknown }).length === "number") {
    return Array.from(value as ArrayLike<unknown>);
  }
  return [value];
}

export function toFinite(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  if (isNaN(num)) return 0;
  if (num === Infinity) return Number.MAX_VALUE;
  if (num === -Infinity) return -Number.MAX_VALUE;
  return num;
}

export function toInteger(value: unknown): number {
  const num = toFinite(value);
  return Math.trunc(num);
}

export function toLength(value: unknown): number {
  const num = toInteger(value);
  return Math.max(0, Math.min(num, 4294967295));
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return parseFloat(value) || 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  return NaN;
}

export function toPlainObject(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === "object") return { ...value as Record<string, unknown> };
  return {};
}

export function toSafeInteger(value: unknown): number {
  const num = toInteger(value);
  return Math.max(-9007199254740991, Math.min(num, 9007199254740991));
}

export function toString2(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function add(augend: number, addend: number): number {
  return augend + addend;
}

export function ceil(number: number, precision: number = 0): number {
  const factor = Math.pow(10, precision);
  return Math.ceil(number * factor) / factor;
}

export function divide(dividend: number, divisor: number): number {
  return dividend / divisor;
}

export function floor(number: number, precision: number = 0): number {
  const factor = Math.pow(10, precision);
  return Math.floor(number * factor) / factor;
}

export function max(array: number[]): number {
  return Math.max(...array);
}

export function maxBy<T>(array: T[], iteratee: (item: T) => number): T | undefined {
  if (array.length === 0) return undefined;
  let maxItem = array[0];
  let maxValue = iteratee(maxItem);
  for (let i = 1; i < array.length; i++) {
    const value = iteratee(array[i]);
    if (value > maxValue) {
      maxValue = value;
      maxItem = array[i];
    }
  }
  return maxItem;
}

export function mean(array: number[]): number {
  if (array.length === 0) return 0;
  return array.reduce((sum, n) => sum + n, 0) / array.length;
}

export function meanBy<T>(array: T[], iteratee: (item: T) => number): number {
  if (array.length === 0) return 0;
  return array.reduce((sum, item) => sum + iteratee(item), 0) / array.length;
}

export function min(array: number[]): number {
  return Math.min(...array);
}

export function minBy<T>(array: T[], iteratee: (item: T) => number): T | undefined {
  if (array.length === 0) return undefined;
  let minItem = array[0];
  let minValue = iteratee(minItem);
  for (let i = 1; i < array.length; i++) {
    const value = iteratee(array[i]);
    if (value < minValue) {
      minValue = value;
      minItem = array[i];
    }
  }
  return minItem;
}

export function multiply(multiplier: number, multiplicand: number): number {
  return multiplier * multiplicand;
}

export function round(number: number, precision: number = 0): number {
  const factor = Math.pow(10, precision);
  return Math.round(number * factor) / factor;
}

export function subtract(minuend: number, subtrahend: number): number {
  return minuend - subtrahend;
}

export function sum(array: number[]): number {
  return array.reduce((acc, n) => acc + n, 0);
}

export function sumBy<T>(array: T[], iteratee: (item: T) => number): number {
  return array.reduce((acc, item) => acc + iteratee(item), 0);
}

export function clamp(number: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, number));
}

export function inRange(number: number, start: number, end: number): boolean {
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  return number >= lower && number < upper;
}

export function random2(min: number = 0, max: number = 1, floating: boolean = false): number {
  const result = Math.random() * (max - min) + min;
  return floating ? result : Math.floor(result);
}

export function uniqueId(prefix: string = ""): string {
  const id = Math.random().toString(36).slice(2, 10);
  return `${prefix}${id}`;
}

export function uniqueIdFromCounter(prefix: string = ""): () => string {
  let counter = 0;
  return () => `${prefix}${++counter}`;
}

export function generateId(length: number = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function generateShortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function generateNanoId(length: number = 21): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

export function generateSequentialId(prefix: string = "id_"): () => string {
  let counter = 0;
  return () => `${prefix}${++counter}`;
}

export function generateTimestampId(prefix: string = ""): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateHashId(input: string, length: number = 8): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(length, "0").slice(0, length);
}

export function generateColorId(): string {
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`;
}

export function generateCode(prefix: string = "CODE", length: number = 6): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}_${result}`;
}

export function generateOTP(length: number = 6): string {
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10).toString();
  }
  return otp;
}

export function generatePIN(length: number = 4): string {
  return generateOTP(length);
}

export function generateToken(length: number = 32, charset: string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

export function generateApiKey(prefix: string = "key", length: number = 32): string {
  return `${prefix}_${generateToken(length, "0123456789abcdef")}`;
}

export function generateSecret(length: number = 64): string {
  return generateToken(length, "0123456789abcdef");
}

export function generateReference(prefix: string = "REF"): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
}
