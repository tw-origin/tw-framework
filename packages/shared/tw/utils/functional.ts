/**
 * Functional programming helpers -- compose, pipe, curry, partial, memoize.
 * @module shared/utils
 */

export type Function0<R> = () => R;
export type Function1<T1, R> = (a: T1) => R;
export type Function2<T1, T2, R> = (a: T1, b: T2) => R;
export type Function3<T1, T2, T3, R> = (a: T1, b: T2, c: T3) => R;
export type Function4<T1, T2, T3, T4, R> = (a: T1, b: T2, c: T3, d: T4) => R;
export type AnyFunction = (...args: unknown[]) => unknown;
export type Predicate<T> = (value: T) => boolean;
export type Consumer<T> = (value: T) => void;
export type Supplier<T> = () => T;
export type Mapper<T, R> = (value: T) => R;
export type Reducer<T, R> = (acc: R, value: T) => R;
export type BinaryOp<T> = (a: T, b: T) => T;
export type UnaryOp<T> = (value: T) => T;

export function compose<R>(...fns: Array<(arg: R) => R>): (arg: R) => R {
  return (arg: R) => fns.reduceRight((acc, fn) => fn(acc), arg);
}

export function composeAsync<R>(...fns: Array<(arg: R) => R | Promise<R>>): (arg: R) => Promise<R> {
  return async (arg: R) => {
    let result = arg;
    for (let i = fns.length - 1; i >= 0; i--) {
      result = await fns[i](result);
    }
    return result;
  };
}

export function pipe<R>(...fns: Array<(arg: R) => R>): (arg: R) => R {
  return (arg: R) => fns.reduce((acc, fn) => fn(acc), arg);
}

export function pipeAsync<R>(...fns: Array<(arg: R) => R | Promise<R>>): (arg: R) => Promise<R> {
  return async (arg: R) => {
    let result = arg;
    for (const fn of fns) {
      result = await fn(result);
    }
    return result;
  };
}

export function curry<T1, T2, R>(fn: (a: T1, b: T2) => R): (a: T1) => (b: T2) => R {
  return (a: T1) => (b: T2) => fn(a, b);
}

export function curry3<T1, T2, T3, R>(fn: (a: T1, b: T2, c: T3) => R): (a: T1) => (b: T2) => (c: T3) => R {
  return (a: T1) => (b: T2) => (c: T3) => fn(a, b, c);
}

export function curry4<T1, T2, T3, T4, R>(fn: (a: T1, b: T2, c: T3, d: T4) => R): (a: T1) => (b: T2) => (c: T3) => (d: T4) => R {
  return (a: T1) => (b: T2) => (c: T3) => (d: T4) => fn(a, b, c, d);
}

export function partial<T1, T2, R>(fn: (a: T1, b: T2) => R, a: T1): (b: T2) => R {
  return (b: T2) => fn(a, b);
}

export function partial3<T1, T2, T3, R>(fn: (a: T1, b: T2, c: T3) => R, a: T1, b: T2): (c: T3) => R {
  return (c: T3) => fn(a, b, c);
}

export function partialRight<T1, T2, R>(fn: (a: T1, b: T2) => R, b: T2): (a: T1) => R {
  return (a: T1) => fn(a, b);
}

export function flip<T1, T2, R>(fn: (a: T1, b: T2) => R): (b: T2, a: T1) => R {
  return (b: T2, a: T1) => fn(a, b);
}

export function identity<T>(value: T): T {
  return value;
}

export function always<T>(value: T): (...args: unknown[]) => T {
  return () => value;
}

export function noop(): void {}

export function noopAsync(): Promise<void> {
  return Promise.resolve();
}

export function T(): boolean { return true; }
export function F(): boolean { return false; }

export function memoize<T extends AnyFunction>(fn: T, keyResolver?: (...args: Parameters<T>) => string): T {
  const cache = new Map<string, unknown>();
  const memoized = (...args: Parameters<T>): unknown => {
    const key = keyResolver ? keyResolver(...args) : JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    let result = fn(...args);
    cache.set(key, result);
    return result;
  };
  return memoized as T;
}

export function memoizeAsync<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, keyResolver?: (...args: Parameters<T>) => string): T {
  const cache = new Map<string, Promise<unknown>>();
  const memoized = (...args: Parameters<T>): Promise<unknown> => {
    const key = keyResolver ? keyResolver(...args) : JSON.stringify(args);
    if (cache.has(key)) return cache.get(key)!;
    const promise = fn(...args);
    cache.set(key, promise);
    return promise;
  };
  return memoized as T;
}

export function once<T extends AnyFunction>(fn: T): T {
  let called = false;
  let result: unknown;
  const onceFn = (...args: Parameters<T>): unknown => {
    if (called) return result;
    result = fn(...args);
    called = true;
    return result;
  };
  return onceFn as T;
}

export function debounce<T extends AnyFunction>(fn: T, delay: number): T & { cancel: () => void; flush: () => void; pending: () => boolean } {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  const debounced = (...args: Parameters<T>): void => {
    lastArgs = args;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
      if (lastArgs) fn(...lastArgs);
      lastArgs = null;
    }, delay);
  };
  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
    lastArgs = null;
  };
  debounced.flush = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
    if (lastArgs) fn(...lastArgs);
    lastArgs = null;
  };
  debounced.pending = () => timeout !== null;
  return debounced as T & { cancel: () => void; flush: () => void; pending: () => boolean };
}

export function throttle<T extends AnyFunction>(fn: T, limit: number): T & { cancel: () => void } {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;
  const throttled = (...args: Parameters<T>): void => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          fn(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
  throttled.cancel = () => {
    inThrottle = false;
    lastArgs = null;
  };
  return throttled as T & { cancel: () => void };
}

export function throttleLeading<T extends AnyFunction>(fn: T, limit: number): T & { cancel: () => void } {
  let inThrottle = false;
  const throttled = (...args: Parameters<T>): void => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
  throttled.cancel = () => { inThrottle = false; };
  return throttled as T & { cancel: () => void };
}

export function throttleTrailing<T extends AnyFunction>(fn: T, limit: number): T & { cancel: () => void } {
  let lastArgs: Parameters<T> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const throttled = (...args: Parameters<T>): void => {
    lastArgs = args;
    if (!timeout) {
      timeout = setTimeout(() => {
        timeout = null;
        if (lastArgs) {
          fn(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    }
  };
  throttled.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
    lastArgs = null;
  };
  return throttled as T & { cancel: () => void };
}

export function after<T extends AnyFunction>(n: number, fn: T): T {
  let count = 0;
  const afterFn = (...args: Parameters<T>): unknown => {
    count++;
    if (count >= n) return fn(...args);
    return undefined;
  };
  return afterFn as T;
}

export function before<T extends AnyFunction>(n: number, fn: T): T {
  let count = 0;
  let result: unknown;
  const beforeFn = (...args: Parameters<T>): unknown => {
    count++;
    if (count < n) {
      result = fn(...args);
    }
    return result;
  };
  return beforeFn as T;
}

export function ary<T extends AnyFunction>(fn: T, n: number): T {
  return ((...args: Parameters<T>) => fn(...args.slice(0, n))) as T;
}

export function unary<T extends (arg: unknown) => unknown>(fn: T): T {
  return ((arg: unknown) => fn(arg)) as T;
}

export function binary<T extends AnyFunction>(fn: T): T {
  return ((a: unknown, b: unknown) => fn(a, b)) as T;
}

export function negate<T>(predicate: Predicate<T>): Predicate<T> {
  return (value: T) => !predicate(value);
}

export function complement<T>(predicate: Predicate<T>): Predicate<T> {
  return negate(predicate);
}

export function not<T>(predicate: Predicate<T>): Predicate<T> {
  return negate(predicate);
}

export function and<T>(...predicates: Array<Predicate<T>>): Predicate<T> {
  return (value: T) => predicates.every((p) => p(value));
}

export function or<T>(...predicates: Array<Predicate<T>>): Predicate<T> {
  return (value: T) => predicates.some((p) => p(value));
}

export function allPass<T>(...predicates: Array<Predicate<T>>): Predicate<T> {
  return and(...predicates);
}

export function anyPass<T>(...predicates: Array<Predicate<T>>): Predicate<T> {
  return or(...predicates);
}

export function both<T>(pred1: Predicate<T>, pred2: Predicate<T>): Predicate<T> {
  return (value: T) => pred1(value) && pred2(value);
}

export function either<T>(pred1: Predicate<T>, pred2: Predicate<T>): Predicate<T> {
  return (value: T) => pred1(value) || pred2(value);
}

export function ifElse<T, R>(predicate: Predicate<T>, onTrue: Mapper<T, R>, onFalse: Mapper<T, R>): Mapper<T, R> {
  return (value: T) => (predicate(value) ? onTrue(value) : onFalse(value));
}

export function when<T>(predicate: Predicate<T>, action: Consumer<T>): (value: T) => T {
  return (value: T) => {
    if (predicate(value)) action(value);
    return value;
  };
}

export function unless<T>(predicate: Predicate<T>, action: Consumer<T>): (value: T) => T {
  return (value: T) => {
    if (!predicate(value)) action(value);
    return value;
  };
}

export function cond<T, R>(pairs: Array<[Predicate<T>, Mapper<T, R>]>): Mapper<T, R | undefined> {
  return (value: T) => {
    for (const [predicate, mapper] of pairs) {
      if (predicate(value)) return mapper(value);
    }
    return undefined;
  };
}

export function tryCatch<T>(fn: () => T, onError: (error: Error) => T): T {
  try {
    return fn();
  } catch (error) {
    return onError(error as Error);
  }
}

export function tryCatchAsync<T>(fn: () => Promise<T>, onError: (error: Error) => T | Promise<T>): Promise<T> {
  return fn().catch((error) => onError(error as Error));
}

export function tap<T>(fn: Consumer<T>): (value: T) => T {
  return (value: T) => {
    fn(value);
    return value;
  };
}

export function map<T, R>(mapper: Mapper<T, R>): (iterable: Iterable<T>) => R[] {
  return (iterable: Iterable<T>) => {
    const result: R[] = [];
    for (const item of iterable) {
      result.push(mapper(item));
    }
    return result;
  };
}

export function filter<T>(predicate: Predicate<T>): (iterable: Iterable<T>) => T[] {
  return (iterable: Iterable<T>) => {
    const result: T[] = [];
    for (const item of iterable) {
      if (predicate(item)) result.push(item);
    }
    return result;
  };
}

export function reduce<T, R>(reducer: Reducer<T, R>, initial: R): (iterable: Iterable<T>) => R {
  return (iterable: Iterable<T>) => {
    let acc = initial;
    for (const item of iterable) {
      acc = reducer(acc, item);
    }
    return acc;
  };
}

export function find<T>(predicate: Predicate<T>): (iterable: Iterable<T>) => T | undefined {
  return (iterable: Iterable<T>) => {
    for (const item of iterable) {
      if (predicate(item)) return item;
    }
    return undefined;
  };
}

export function findLast<T>(predicate: Predicate<T>): (iterable: Iterable<T>) => T | undefined {
  return (iterable: Iterable<T>) => {
    let result: T | undefined;
    for (const item of iterable) {
      if (predicate(item)) result = item;
    }
    return result;
  };
}

export function some<T>(predicate: Predicate<T>): (iterable: Iterable<T>) => boolean {
  return (iterable: Iterable<T>) => {
    for (const item of iterable) {
      if (predicate(item)) return true;
    }
    return false;
  };
}

export function every<T>(predicate: Predicate<T>): (iterable: Iterable<T>) => boolean {
  return (iterable: Iterable<T>) => {
    for (const item of iterable) {
      if (!predicate(item)) return false;
    }
    return true;
  };
}

export function forEach<T>(consumer: Consumer<T>): (iterable: Iterable<T>) => void {
  return (iterable: Iterable<T>) => {
    for (const item of iterable) {
      consumer(item);
    }
  };
}

export function flatMap<T, R>(mapper: (item: T) => R[]): (iterable: Iterable<T>) => R[] {
  return (iterable: Iterable<T>) => {
    const result: R[] = [];
    for (const item of iterable) {
      result.push(...mapper(item));
    }
    return result;
  };
}

export function take<T>(n: number): (iterable: Iterable<T>) => T[] {
  return (iterable: Iterable<T>) => {
    const result: T[] = [];
    let count = 0;
    for (const item of iterable) {
      if (count >= n) break;
      result.push(item);
      count++;
    }
    return result;
  };
}

export function drop<T>(n: number): (iterable: Iterable<T>) => T[] {
  return (iterable: Iterable<T>) => {
    const result: T[] = [];
    let count = 0;
    for (const item of iterable) {
      if (count >= n) result.push(item);
      count++;
    }
    return result;
  };
}

export function takeWhile<T>(predicate: Predicate<T>): (iterable: Iterable<T>) => T[] {
  return (iterable: Iterable<T>) => {
    const result: T[] = [];
    for (const item of iterable) {
      if (!predicate(item)) break;
      result.push(item);
    }
    return result;
  };
}

export function dropWhile<T>(predicate: Predicate<T>): (iterable: Iterable<T>) => T[] {
  return (iterable: Iterable<T>) => {
    const result: T[] = [];
    let dropping = true;
    for (const item of iterable) {
      if (dropping && predicate(item)) continue;
      dropping = false;
      result.push(item);
    }
    return result;
  };
}

export function chunk2<T>(size: number): (iterable: Iterable<T>) => T[][] {
  return (iterable: Iterable<T>) => {
    const result: T[][] = [];
    let current: T[] = [];
    for (const item of iterable) {
      current.push(item);
      if (current.length === size) {
        result.push(current);
        current = [];
      }
    }
    if (current.length > 0) result.push(current);
    return result;
  };
}

export function zip<A, B>(iterableA: Iterable<A>, iterableB: Iterable<B>): Array<[A, B]> {
  const result: Array<[A, B]> = [];
  const iterA = iterableA[Symbol.iterator]();
  const iterB = iterableB[Symbol.iterator]();
  while (true) {
    const a = iterA.next();
    const b = iterB.next();
    if (a.done || b.done) break;
    result.push([a.value, b.value]);
  }
  return result;
}

export function zipWith<A, B, R>(iterableA: Iterable<A>, iterableB: Iterable<B>, fn: (a: A, b: B) => R): R[] {
  const result: R[] = [];
  const iterA = iterableA[Symbol.iterator]();
  const iterB = iterableB[Symbol.iterator]();
  while (true) {
    const a = iterA.next();
    const b = iterB.next();
    if (a.done || b.done) break;
    result.push(fn(a.value, b.value));
  }
  return result;
}

export function range(start: number, end: number, step: number = 1): number[] {
  const result: number[] = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) result.push(i);
  } else if (step < 0) {
    for (let i = start; i > end; i += step) result.push(i);
  }
  return result;
}

export function repeat<T>(value: T, n: number): T[] {
  return Array(n).fill(value);
}

export function replicate<T>(n: number, fn: () => T): T[] {
  return Array.from({ length: n }, fn);
}

export function iterate<T>(fn: (value: T) => T, initial: T, n: number): T[] {
  const result: T[] = [initial];
  let current = initial;
  for (let i = 0; i < n - 1; i++) {
    current = fn(current);
    result.push(current);
  }
  return result;
}

export function unfold<T, R>(fn: (seed: T) => { done: false; value: R; next: T } | { done: true }, seed: T): R[] {
  const result: R[] = [];
  let current = seed;
  while (true) {
    const next = fn(current);
    if (next.done) break;
    result.push((next as any).value);
    current = (next as any).next;
  }
  return result;
}

export function scan<T, R>(reducer: Reducer<T, R>, initial: R): (iterable: Iterable<T>) => R[] {
  return (iterable: Iterable<T>) => {
    const result: R[] = [initial];
    let acc = initial;
    for (const item of iterable) {
      acc = reducer(acc, item);
      result.push(acc);
    }
    return result;
  };
}

export function groupBy2<T, K extends string | number>(keyFn: (item: T) => K): (iterable: Iterable<T>) => Map<K, T[]> {
  return (iterable: Iterable<T>) => {
    const result = new Map<K, T[]>();
    for (const item of iterable) {
      const key = keyFn(item);
      if (!result.has(key)) result.set(key, []);
      result.get(key)!.push(item);
    }
    return result;
  };
}

export function countBy2<T, K extends string | number>(keyFn: (item: T) => K): (iterable: Iterable<T>) => Map<K, number> {
  return (iterable: Iterable<T>) => {
    const result = new Map<K, number>();
    for (const item of iterable) {
      const key = keyFn(item);
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  };
}

export function indexBy<T, K extends string | number>(keyFn: (item: T) => K): (iterable: Iterable<T>) => Map<K, T> {
  return (iterable: Iterable<T>) => {
    const result = new Map<K, T>();
    for (const item of iterable) {
      result.set(keyFn(item), item);
    }
    return result;
  };
}

export function uniqueBy2<T, K>(keyFn: (item: T) => K): (iterable: Iterable<T>) => T[] {
  return (iterable: Iterable<T>) => {
    const seen = new Set<K>();
    const result: T[] = [];
    for (const item of iterable) {
      const key = keyFn(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  };
}

export function sortBy2<T, K>(keyFn: (item: T) => K): (iterable: Iterable<T>) => T[] {
  return (iterable: Iterable<T>) => {
    return [...iterable].sort((a, b) => {
      const aKey = keyFn(a);
      const bKey = keyFn(b);
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      return 0;
    });
  };
}

export function orderBy2<T, K>(keyFn: (item: T) => K, order: "asc" | "desc" = "asc"): (iterable: Iterable<T>) => T[] {
  return (iterable: Iterable<T>) => {
    const sorted = sortBy2(keyFn)(iterable);
    return order === "desc" ? sorted.reverse() : sorted;
  };
}

export function minBy2<T, K>(keyFn: (item: T) => K): (iterable: Iterable<T>) => T | undefined {
  return (iterable: Iterable<T>) => {
    let minItem: T | undefined;
    let minKey: K | undefined;
    for (const item of iterable) {
      const key = keyFn(item);
      if (minKey === undefined || key < minKey) {
        minKey = key;
        minItem = item;
      }
    }
    return minItem;
  };
}

export function maxBy2<T, K>(keyFn: (item: T) => K): (iterable: Iterable<T>) => T | undefined {
  return (iterable: Iterable<T>) => {
    let maxItem: T | undefined;
    let maxKey: K | undefined;
    for (const item of iterable) {
      const key = keyFn(item);
      if (maxKey === undefined || key > maxKey) {
        maxKey = key;
        maxItem = item;
      }
    }
    return maxItem;
  };
}

export function sumBy2<T>(keyFn: (item: T) => number): (iterable: Iterable<T>) => number {
  return (iterable: Iterable<T>) => {
    let sum = 0;
    for (const item of iterable) sum += keyFn(item);
    return sum;
  };
}

export function meanBy2<T>(keyFn: (item: T) => number): (iterable: Iterable<T>) => number {
  return (iterable: Iterable<T>) => {
    let sum = 0;
    let count = 0;
    for (const item of iterable) {
      sum += keyFn(item);
      count++;
    }
    return count > 0 ? sum / count : 0;
  };
}

export function partition2<T>(predicate: Predicate<T>): (iterable: Iterable<T>) => [T[], T[]] {
  return (iterable: Iterable<T>) => {
    const pass: T[] = [];
    const fail: T[] = [];
    for (const item of iterable) {
      if (predicate(item)) pass.push(item);
      else fail.push(item);
    }
    return [pass, fail];
  };
}

export function pluck<T, K extends keyof T>(key: K): (iterable: Iterable<T>) => T[K][] {
  return (iterable: Iterable<T>) => {
    const result: T[K][] = [];
    for (const item of iterable) result.push(item[key]);
    return result;
  };
}

export function pick2<T, K extends keyof T>(keys: K[]): (obj: T) => Pick<T, K> {
  return (obj: T) => {
    const result = {} as Pick<T, K>;
    for (const key of keys) {
      result[key] = obj[key];
    }
    return result;
  };
}

export function omit2<T, K extends keyof T>(keys: K[]): (obj: T) => Omit<T, K> {
  return (obj: T) => {
    const keySet = new Set(keys as string[]);
    const result = {} as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (!keySet.has(key)) result[key] = value;
    }
    return result as Omit<T, K>;
  };
}

export function prop<T, K extends keyof T>(key: K): (obj: T) => T[K] {
  return (obj: T) => obj[key];
}

export function path<T>(keys: string[]): (obj: unknown) => unknown {
  return (obj: unknown) => {
    let current: unknown = obj;
    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  };
}

export function hasPath2(keys: string[]): (obj: unknown) => boolean {
  return (obj: unknown) => {
    let current: unknown = obj;
    for (const key of keys) {
      if (current === null || current === undefined) return false;
      if (!(key in (current as Record<string, unknown>))) return false;
      current = (current as Record<string, unknown>)[key];
    }
    return true;
  };
}

export function lens<T, R>(getter: (obj: T) => R, setter: (value: R, obj: T) => T): { get: (obj: T) => R; set: (value: R, obj: T) => T; modify: (fn: (value: R) => R, obj: T) => T } {
  return {
    get: getter,
    set: setter,
    modify: (fn: (value: R) => R, obj: T) => setter(fn(getter(obj)), obj),
  };
}

export function lensProp<T, K extends keyof T>(key: K): { get: (obj: T) => T[K]; set: (value: T[K], obj: T) => T; modify: (fn: (value: T[K]) => T[K], obj: T) => T } {
  return lens(
    (obj: T) => obj[key],
    (value: T[K], obj: T) => ({ ...obj, [key]: value }),
  );
}

export function over<T, R>(lensObj: { modify: (fn: (value: R) => R, obj: T) => T }, fn: (value: R) => R): (obj: T) => T {
  return (obj: T) => lensObj.modify(fn, obj);
}

export function set2<T, R>(lensObj: { set: (value: R, obj: T) => T }, value: R): (obj: T) => T {
  return (obj: T) => lensObj.set(value, obj);
}

export function view<T, R>(lensObj: { get: (obj: T) => R }): (obj: T) => R {
  return (obj: T) => lensObj.get(obj);
}

export function maybe<T>(value: T | null | undefined): { map: <R>(fn: (value: T) => R) => R | null; filter: (predicate: (value: T) => boolean) => T | null; isPresent: () => boolean; get: () => T | null; orElse: (defaultValue: T) => T; orElseGet: (supplier: () => T) => T; orNull: () => T | null } {
  const isPresent = value !== null && value !== undefined;
  return {
    map: <R>(fn: (value: T) => R) => (isPresent ? fn(value as T) : null),
    filter: (predicate: (value: T) => boolean) => (isPresent && predicate(value as T) ? value : null),
    isPresent: () => isPresent,
    get: () => (isPresent ? (value as T) : null),
    orElse: (defaultValue: T) => (isPresent ? (value as T) : defaultValue),
    orElseGet: (supplier: () => T) => (isPresent ? (value as T) : supplier()),
    orNull: () => (isPresent ? (value as T) : null),
  };
}

export function either2<L, R>(value: L | R, isRight: boolean): { map: <T>(fn: (value: R) => T) => { left: L; right: T } | { left: L; right: null }; fold: <T>(onLeft: (value: L) => T, onRight: (value: R) => T) => T; isRight: () => boolean; isLeft: () => boolean; getOrElse: (defaultValue: R) => R; getOrThrow: () => R } {
  return {
    map: <T>(fn: (value: R) => T) => isRight ? { left: null as unknown as L, right: fn(value as R) } : { left: value as L, right: null },
    fold: <T>(onLeft: (value: L) => T, onRight: (value: R) => T) => (isRight ? onRight(value as R) : onLeft(value as L)),
    isRight: () => isRight,
    isLeft: () => !isRight,
    getOrElse: (defaultValue: R) => (isRight ? (value as R) : defaultValue),
    getOrThrow: () => {
      if (!isRight) throw new Error("Either is Left");
      return value as R;
    },
  };
}

export function result<T>(fn: () => T): { ok: boolean; value: T | null; error: Error | null; map: <R>(fn: (value: T) => R) => { ok: boolean; value: R | null; error: Error | null }; unwrap: () => T; unwrapOr: (defaultValue: T) => T; unwrapOrElse: (supplier: (error: Error) => T) => T } {
  try {
    const value = fn();
    return {
      ok: true,
      value,
      error: null,
      map: <R>(fn: (value: T) => R) => result(() => fn(value)),
      unwrap: () => value,
      unwrapOr: (defaultValue: T) => value,
      unwrapOrElse: (supplier: (error: Error) => T) => value,
    };
  } catch (e) {
    const error = e as Error;
    return {
      ok: false,
      value: null,
      error,
      map: <R>(fn: (value: T) => R) => ({ ok: false, value: null, error }),
      unwrap: () => { throw error; },
      unwrapOr: (defaultValue: T) => defaultValue,
      unwrapOrElse: (supplier: (error: Error) => T) => supplier(error),
    };
  }
}

export function flow<T>(value: T): { pipe: <R>(fn: (value: T) => R) => Flow<R>; done: () => T } & Flow<T> {
  return createFlow(value);
}

interface Flow<T> {
  pipe: <R>(fn: (value: T) => R) => Flow<R>;
  done: () => T;
  tap: (fn: (value: T) => void) => Flow<T>;
  map: <R>(fn: (value: T) => R) => Flow<R>;
  filter: (predicate: (value: T) => boolean) => Flow<T>;
  ifThen: (predicate: (value: T) => boolean, fn: (value: T) => T) => Flow<T>;
}

function createFlow<T>(value: T): Flow<T> {
  return {
    pipe: <R>(fn: (value: T) => R) => createFlow(fn(value)),
    done: () => value,
    tap: (fn: (value: T) => void) => { fn(value); return createFlow(value); },
    map: <R>(fn: (value: T) => R) => createFlow(fn(value)),
    filter: (predicate: (value: T) => boolean) => predicate(value) ? createFlow(value) : createFlow(value),
    ifThen: (predicate: (value: T) => boolean, fn: (value: T) => T) => predicate(value) ? createFlow(fn(value)) : createFlow(value),
  };
}

export function chain<T>(value: T): Flow<T> {
  return createFlow(value);
}

export function whenDefined<T>(value: T | undefined | null, fn: (value: T) => void): boolean {
  if (value !== undefined && value !== null) {
    fn(value);
    return true;
  }
  return false;
}

export function whenDefinedOrElse<T, R>(value: T | undefined | null, fn: (value: T) => R, defaultValue: R): R {
  if (value !== undefined && value !== null) {
    return fn(value);
  }
  return defaultValue;
}

export function requireNonNull<T>(value: T | null | undefined, message: string = "Value is required"): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

export function requireNonEmpty<T>(value: T[] | string | Record<string, unknown>, message: string = "Value must not be empty"): T[] | string | Record<string, unknown> {
  if (Array.isArray(value) && value.length === 0) throw new Error(message);
  if (typeof value === "string" && value.length === 0) throw new Error(message);
  if (typeof value === "object" && Object.keys(value).length === 0) throw new Error(message);
  return value;
}

export function requireTrue(value: boolean, message: string = "Value must be true"): void {
  if (!value) throw new Error(message);
}

export function requireInRange(value: number, min: number, max: number, message: string = `Value must be between ${min} and ${max}`): number {
  if (value < min || value > max) throw new Error(message);
  return value;
}

export function requireMatches(value: string, pattern: RegExp, message: string = "Value does not match pattern"): string {
  if (!pattern.test(value)) throw new Error(message);
  return value;
}

export function coalesce<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

export function coalesceOrElse<T>(defaultValue: T, ...values: Array<T | null | undefined>): T {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return defaultValue;
}

export function defaultTo<T>(defaultValue: T, value: T | null | undefined): T {
  return (value === null || value === undefined) ? defaultValue : value;
}

export function defaultWhen<T>(defaultValue: T, predicate: (value: T) => boolean, value: T): T {
  return predicate(value) ? defaultValue : value;
}

export function retry<T>(fn: () => T, times: number = 3, delay: number = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const attempt = () => {
      try {
        resolve(fn());
      } catch (error) {
        attempts++;
        if (attempts >= times) {
          reject(error);
        } else {
          setTimeout(attempt, delay * attempts);
        }
      }
    };
    attempt();
  });
}

export function retryAsync<T>(fn: () => Promise<T>, times: number = 3, delay: number = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const attempt = () => {
      fn()
        .then(resolve)
        .catch((error) => {
          attempts++;
          if (attempts >= times) {
            reject(error);
          } else {
            setTimeout(attempt, delay * attempts);
          }
        });
    };
    attempt();
  });
}

export function withTimeout<T>(fn: () => T, ms: number, message: string = "Timeout"): T {
  const start = Date.now();
  const result = fn();
  if (Date.now() - start > ms) {
    throw new Error(message);
  }
  return result;
}

export function withTimeoutAsync<T>(fn: () => Promise<T>, ms: number, message: string = "Timeout"): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

export function delay2<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sleepUntil(predicate: () => boolean, interval: number = 100, timeout: number = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) {
        resolve(true);
      } else if (Date.now() - start > timeout) {
        resolve(false);
      } else {
        setTimeout(check, interval);
      }
    };
    check();
  });
}

export function poll<T>(fn: () => T | Promise<T>, interval: number, callback: (result: T) => void, stopCondition?: (result: T) => boolean): () => void {
  let stopped = false;
  const pollFn = async () => {
    if (stopped) return;
    try {
      const result = await fn();
      callback(result);
      if (stopCondition && stopCondition(result)) {
        stopped = true;
        return;
      }
    } catch (e) {
      console.warn("[TW] Silent catch:", e);
    }
    if (!stopped) setTimeout(pollFn, interval);
  };
  pollFn();
  return () => { stopped = true; };
}

export function benchmark<T>(fn: () => T, iterations: number = 1): { result: T; totalTime: number; averageTime: number; minTime: number; maxTime: number; iterations: number } {
  const times: number[] = [];
  let result: T;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    result = fn();
    times.push(performance.now() - start);
  }
  const totalTime = times.reduce((sum, t) => sum + t, 0);
  return {
    result: result!,
    totalTime,
    averageTime: totalTime / iterations,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
    iterations,
  };
}

export function benchmarkAsync<T>(fn: () => Promise<T>, iterations: number = 1): Promise<{ result: T; totalTime: number; averageTime: number; minTime: number; maxTime: number; iterations: number }> {
  return (async () => {
    const times: number[] = [];
    let result: T;
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      result = await fn();
      times.push(performance.now() - start);
    }
    const totalTime = times.reduce((sum, t) => sum + t, 0);
    return {
      result: result!,
      totalTime,
      averageTime: totalTime / iterations,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      iterations,
    };
  })();
}

export function compareBenchmark<T>(baseline: () => T, candidate: () => T, iterations: number = 1000): { baseline: { averageTime: number; totalTime: number }; candidate: { averageTime: number; totalTime: number }; speedup: number; faster: boolean } {
  const baseResult = benchmark(baseline, iterations);
  const candResult = benchmark(candidate, iterations);
  return {
    baseline: { averageTime: baseResult.averageTime, totalTime: baseResult.totalTime },
    candidate: { averageTime: candResult.averageTime, totalTime: candResult.totalTime },
    speedup: baseResult.averageTime / candResult.averageTime,
    faster: candResult.averageTime < baseResult.averageTime,
  };
}

export function concurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  return new Promise((resolve) => {
    const results: T[] = new Array(tasks.length);
    let currentIndex = 0;
    let completed = 0;
    const runNext = () => {
      while (currentIndex < tasks.length && currentIndex - completed < limit) {
        const index = currentIndex++;
        tasks[index]().then((result) => {
          results[index] = result;
          completed++;
          if (completed === tasks.length) {
            resolve(results);
          } else {
            runNext();
          }
        });
      }
    };
    runNext();
  });
}

export function allSettled<T>(promises: Array<Promise<T>>): Promise<Array<{ status: "fulfilled"; value: T } | { status: "rejected"; reason: Error }>> {
  return Promise.allSettled(promises).then((results) => results as Array<{ status: "fulfilled"; value: T } | { status: "rejected"; reason: Error }>);
}

export function waterfall<T>(initial: T, fns: Array<(value: T) => Promise<T>>): Promise<T> {
  return fns.reduce((promise, fn) => promise.then(fn), Promise.resolve(initial));
}

export function series<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  return tasks.reduce((promise, task) => promise.then((results) => task().then((result) => [...results, result])), Promise.resolve<T[]>([]));
}

export function race<T>(promises: Array<Promise<T>>): Promise<T> {
  return Promise.race(promises);
}

export function any<T>(promises: Array<Promise<T>>): Promise<T> {
  return Promise.any(promises);
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function barrier(count: number): { wait: () => Promise<void>; release: () => void } {
  let current = 0;
  let resolve!: () => void;
  const promise = new Promise<void>((res) => { resolve = res; });
  return {
    wait: () => {
      current++;
      if (current >= count) resolve();
      return promise;
    },
    release: () => { resolve(); },
  };
}

export function semaphore(initial: number): { acquire: () => Promise<void>; release: () => void; tryAcquire: () => boolean; available: () => number } {
  let available = initial;
  const waiters: Array<() => void> = [];
  return {
    acquire: () => {
      if (available > 0) {
        available--;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
    release: () => {
      if (waiters.length > 0) {
        const next = waiters.shift()!;
        next();
      } else {
        available++;
      }
    },
    tryAcquire: () => {
      if (available > 0) {
        available--;
        return true;
      }
      return false;
    },
    available: () => available,
  };
}

export function mutex(): { lock: () => Promise<() => void>; tryLock: () => (() => void) | null; isLocked: () => boolean } {
  const sem = semaphore(1);
  return {
    lock: async () => {
      await sem.acquire();
      return () => sem.release();
    },
    tryLock: () => {
      if (sem.tryAcquire()) {
        return () => sem.release();
      }
      return null;
    },
    isLocked: () => sem.available() === 0,
  };
}

export function channel<T>(bufferSize: number = 0): { send: (value: T) => Promise<void>; receive: () => Promise<T>; close: () => void; isClosed: () => boolean } {
  const buffer: T[] = [];
  const senders: Array<{ value: T; resolve: () => void }> = [];
  const receivers: Array<(value: T) => void> = [];
  let closed = false;
  return {
    send: (value: T) => {
      if (closed) return Promise.reject(new Error("Channel is closed"));
      if (receivers.length > 0) {
        const receiver = receivers.shift()!;
        receiver(value);
        return Promise.resolve();
      }
      if (buffer.length < bufferSize) {
        buffer.push(value);
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        senders.push({ value, resolve });
      });
    },
    receive: () => {
      if (buffer.length > 0) {
        const value = buffer.shift()!;
        if (senders.length > 0) {
          const sender = senders.shift()!;
          buffer.push(sender.value);
          sender.resolve();
        }
        return Promise.resolve(value);
      }
      if (senders.length > 0) {
        const sender = senders.shift()!;
        sender.resolve();
        return Promise.resolve(sender.value);
      }
      if (closed) return Promise.reject(new Error("Channel is closed"));
      return new Promise((resolve) => {
        receivers.push(resolve);
      });
    },
    close: () => {
      closed = true;
      for (const receiver of receivers) {
        receiver(undefined as unknown as T);
      }
      receivers.length = 0;
      for (const sender of senders) {
        sender.resolve();
      }
      senders.length = 0;
    },
    isClosed: () => closed,
  };
}

export function generator<T>(fn: () => T, count: number = Infinity): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      for (let i = 0; i < count; i++) {
        yield fn();
      }
    },
  };
}

export function iterate2<T>(fn: (value: T) => T, initial: T, count: number = Infinity): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      let current = initial;
      yield current;
      for (let i = 0; i < count; i++) {
        current = fn(current);
        yield current;
      }
    },
  };
}

export function cycle<T>(iterable: Iterable<T>): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      while (true) {
        for (const item of iterable) {
          yield item;
        }
      }
    },
  };
}

export function interleave<A, B>(iterableA: Iterable<A>, iterableB: Iterable<B>): Iterable<A | B> {
  return {
    [Symbol.iterator]: function* () {
      const iterA = iterableA[Symbol.iterator]();
      const iterB = iterableB[Symbol.iterator]();
      while (true) {
        const a = iterA.next();
        const b = iterB.next();
        if (a.done && b.done) break;
        if (!a.done) yield a.value;
        if (!b.done) yield b.value;
      }
    },
  };
}

export function interpose<T>(iterable: Iterable<T>, separator: T): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      let first = true;
      for (const item of iterable) {
        if (!first) yield separator;
        yield item;
        first = false;
      }
    },
  };
}

export function concat2<T>(...iterables: Iterable<T>[]): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      for (const iterable of iterables) {
        for (const item of iterable) {
          yield item;
        }
      }
    },
  };
}

export function distinct<T>(iterable: Iterable<T>): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      const seen = new Set<T>();
      for (const item of iterable) {
        if (!seen.has(item)) {
          seen.add(item);
          yield item;
        }
      }
    },
  };
}

export function take2<T>(iterable: Iterable<T>, n: number): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      let count = 0;
      for (const item of iterable) {
        if (count >= n) break;
        yield item;
        count++;
      }
    },
  };
}

export function drop2<T>(iterable: Iterable<T>, n: number): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      let count = 0;
      for (const item of iterable) {
        if (count >= n) yield item;
        count++;
      }
    },
  };
}

export function filter2<T>(iterable: Iterable<T>, predicate: Predicate<T>): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      for (const item of iterable) {
        if (predicate(item)) yield item;
      }
    },
  };
}

export function map2<T, R>(iterable: Iterable<T>, mapper: Mapper<T, R>): Iterable<R> {
  return {
    [Symbol.iterator]: function* () {
      for (const item of iterable) {
        yield mapper(item);
      }
    },
  };
}

export function flatMap2<T, R>(iterable: Iterable<T>, mapper: (item: T) => Iterable<R>): Iterable<R> {
  return {
    [Symbol.iterator]: function* () {
      for (const item of iterable) {
        yield* mapper(item);
      }
    },
  };
}

export function reduce2<T, R>(iterable: Iterable<T>, reducer: Reducer<T, R>, initial: R): R {
  let acc = initial;
  for (const item of iterable) {
    acc = reducer(acc, item);
  }
  return acc;
}

export function toArray2<T>(iterable: Iterable<T>): T[] {
  return [...iterable];
}

export function toSet2<T>(iterable: Iterable<T>): Set<T> {
  return new Set(iterable);
}

export function toMap2<K, V>(iterable: Iterable<[K, V]>): Map<K, V> {
  return new Map(iterable);
}

export function toObject<K extends string, V>(iterable: Iterable<[K, V]>): Record<K, V> {
  return Object.fromEntries(iterable) as Record<K, V>;
}

export function size3<T>(iterable: Iterable<T>): number {
  let count = 0;
  for (const _ of iterable) count++;
  return count;
}

export function isEmpty2<T>(iterable: Iterable<T>): boolean {
  return iterable[Symbol.iterator]().next().done ?? false;
}

export function isNotEmpty<T>(iterable: Iterable<T>): boolean {
  return !isEmpty2(iterable);
}

export function first2<T>(iterable: Iterable<T>): T | undefined {
  return iterable[Symbol.iterator]().next().value;
}

export function last2<T>(iterable: Iterable<T>): T | undefined {
  let result: T | undefined;
  for (const item of iterable) result = item;
  return result;
}

export function nth2<T>(iterable: Iterable<T>, n: number): T | undefined {
  let index = 0;
  for (const item of iterable) {
    if (index === n) return item;
    index++;
  }
  return undefined;
}

export function contains2<T>(iterable: Iterable<T>, value: T): boolean {
  for (const item of iterable) {
    if (item === value) return true;
  }
  return false;
}

export function indexOf2<T>(iterable: Iterable<T>, value: T): number {
  let index = 0;
  for (const item of iterable) {
    if (item === value) return index;
    index++;
  }
  return -1;
}

export function forEach2<T>(iterable: Iterable<T>, consumer: Consumer<T>): void {
  for (const item of iterable) consumer(item);
}

export function forEachIndexed<T>(iterable: Iterable<T>, consumer: (item: T, index: number) => void): void {
  let index = 0;
  for (const item of iterable) {
    consumer(item, index);
    index++;
  }
}

export function reduce3<T, R>(iterable: Iterable<T>, reducer: Reducer<T, R>, initial: R): R {
  return reduce2(iterable, reducer, initial);
}

export function fold<T, R>(iterable: Iterable<T>, initial: R, reducer: Reducer<T, R>): R {
  return reduce2(iterable, reducer, initial);
}

export function scan2<T, R>(iterable: Iterable<T>, initial: R, reducer: Reducer<T, R>): R[] {
  const result: R[] = [initial];
  let acc = initial;
  for (const item of iterable) {
    acc = reducer(acc, item);
    result.push(acc);
  }
  return result;
}

export function collect<T, R>(iterable: Iterable<T>, mapper: Mapper<T, R | undefined>): R[] {
  const result: R[] = [];
  for (const item of iterable) {
    const mapped = mapper(item);
    if (mapped !== undefined) result.push(mapped);
  }
  return result;
}

export function collectFirst<T, R>(iterable: Iterable<T>, mapper: Mapper<T, R | undefined>): R | undefined {
  for (const item of iterable) {
    const mapped = mapper(item);
    if (mapped !== undefined) return mapped;
  }
  return undefined;
}

export function find2<T>(iterable: Iterable<T>, predicate: Predicate<T>): T | undefined {
  for (const item of iterable) {
    if (predicate(item)) return item;
  }
  return undefined;
}

export function findLast2<T>(iterable: Iterable<T>, predicate: Predicate<T>): T | undefined {
  let result: T | undefined;
  for (const item of iterable) {
    if (predicate(item)) result = item;
  }
  return result;
}

export function findAll<T>(iterable: Iterable<T>, predicate: Predicate<T>): T[] {
  const result: T[] = [];
  for (const item of iterable) {
    if (predicate(item)) result.push(item);
  }
  return result;
}

export function count2<T>(iterable: Iterable<T>, predicate?: Predicate<T>): number {
  let count = 0;
  for (const item of iterable) {
    if (!predicate || predicate(item)) count++;
  }
  return count;
}

export function any2<T>(iterable: Iterable<T>, predicate: Predicate<T>): boolean {
  for (const item of iterable) {
    if (predicate(item)) return true;
  }
  return false;
}

export function all2<T>(iterable: Iterable<T>, predicate: Predicate<T>): boolean {
  for (const item of iterable) {
    if (!predicate(item)) return false;
  }
  return true;
}

export function none<T>(iterable: Iterable<T>, predicate: Predicate<T>): boolean {
  return !any2(iterable, predicate);
}

export function minBy3<T, K>(iterable: Iterable<T>, keyFn: (item: T) => K): T | undefined {
  let minItem: T | undefined;
  let minKey: K | undefined;
  for (const item of iterable) {
    const key = keyFn(item);
    if (minKey === undefined || key < minKey) {
      minKey = key;
      minItem = item;
    }
  }
  return minItem;
}

export function maxBy3<T, K>(iterable: Iterable<T>, keyFn: (item: T) => K): T | undefined {
  let maxItem: T | undefined;
  let maxKey: K | undefined;
  for (const item of iterable) {
    const key = keyFn(item);
    if (maxKey === undefined || key > maxKey) {
      maxKey = key;
      maxItem = item;
    }
  }
  return maxItem;
}

export function sumBy3<T>(iterable: Iterable<T>, keyFn: (item: T) => number): number {
  let sum = 0;
  for (const item of iterable) sum += keyFn(item);
  return sum;
}

export function averageBy<T>(iterable: Iterable<T>, keyFn: (item: T) => number): number {
  let sum = 0;
  let count = 0;
  for (const item of iterable) {
    sum += keyFn(item);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

export function groupBy3<T, K extends string | number>(iterable: Iterable<T>, keyFn: (item: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const item of iterable) {
    const key = keyFn(item);
    if (!result.has(key)) result.set(key, []);
    result.get(key)!.push(item);
  }
  return result;
}

export function partition3<T>(iterable: Iterable<T>, predicate: Predicate<T>): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  for (const item of iterable) {
    if (predicate(item)) pass.push(item);
    else fail.push(item);
  }
  return [pass, fail];
}

export function chunk3<T>(iterable: Iterable<T>, size: number): T[][] {
  const result: T[][] = [];
  let current: T[] = [];
  for (const item of iterable) {
    current.push(item);
    if (current.length === size) {
      result.push(current);
      current = [];
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

export function windowed<T>(iterable: Iterable<T>, size: number, step: number = 1): T[][] {
  const result: T[][] = [];
  const items: T[] = [...iterable];
  for (let i = 0; i <= items.length - size; i += step) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export function grouped<T>(iterable: Iterable<T>, size: number): T[][] {
  return chunk3(iterable, size);
}

export function zip2<A, B>(iterableA: Iterable<A>, iterableB: Iterable<B>): Array<[A, B]> {
  const result: Array<[A, B]> = [];
  const iterA = iterableA[Symbol.iterator]();
  const iterB = iterableB[Symbol.iterator]();
  while (true) {
    const a = iterA.next();
    const b = iterB.next();
    if (a.done || b.done) break;
    result.push([a.value, b.value]);
  }
  return result;
}

export function zipAll<A, B>(iterableA: Iterable<A>, iterableB: Iterable<B>, defaultA?: A, defaultB?: B): Array<[A, B]> {
  const result: Array<[A, B]> = [];
  const iterA = iterableA[Symbol.iterator]();
  const iterB = iterableB[Symbol.iterator]();
  while (true) {
    const a = iterA.next();
    const b = iterB.next();
    if (a.done && b.done) break;
    result.push([
      a.done ? (defaultA as A) : a.value,
      b.done ? (defaultB as B) : b.value,
    ]);
  }
  return result;
}

export function unzip2<A, B>(pairs: Iterable<[A, B]>): [A[], B[]] {
  const resultA: A[] = [];
  const resultB: B[] = [];
  for (const [a, b] of pairs) {
    resultA.push(a);
    resultB.push(b);
  }
  return [resultA, resultB];
}

export function flatten2<T>(iterable: Iterable<Iterable<T>>): T[] {
  const result: T[] = [];
  for (const inner of iterable) {
    for (const item of inner) {
      result.push(item);
    }
  }
  return result;
}

export function flattenDeep2<T>(iterable: Iterable<unknown>): T[] {
  const result: T[] = [];
  const flatten = (items: Iterable<unknown>) => {
    for (const item of items) {
      if (item && typeof item === "object" && Symbol.iterator in item) {
        flatten(item as Iterable<unknown>);
      } else {
        result.push(item as T);
      }
    }
  };
  flatten(iterable);
  return result;
}

export function intersect<T>(...iterables: Iterable<T>[]): T[] {
  if (iterables.length === 0) return [];
  const sets = iterables.map((it) => new Set(it));
  const result: T[] = [];
  const seen = new Set<T>();
  for (const item of iterables[0]) {
    if (!seen.has(item) && sets.every((set) => set.has(item))) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

export function union2<T>(...iterables: Iterable<T>[]): T[] {
  const result: T[] = [];
  const seen = new Set<T>();
  for (const iterable of iterables) {
    for (const item of iterable) {
      if (!seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
  }
  return result;
}

export function difference2<T>(iterableA: Iterable<T>, iterableB: Iterable<T>): T[] {
  const setB = new Set(iterableB);
  const result: T[] = [];
  const seen = new Set<T>();
  for (const item of iterableA) {
    if (!seen.has(item) && !setB.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

export function symmetricDifference<T>(iterableA: Iterable<T>, iterableB: Iterable<T>): T[] {
  const setA = new Set(iterableA);
  const setB = new Set(iterableB);
  const result: T[] = [];
  const seen = new Set<T>();
  for (const item of setA) {
    if (!setB.has(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  for (const item of setB) {
    if (!setA.has(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

export function isSubset<T>(iterableA: Iterable<T>, iterableB: Iterable<T>): boolean {
  const setB = new Set(iterableB);
  for (const item of iterableA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

export function isSuperset<T>(iterableA: Iterable<T>, iterableB: Iterable<T>): boolean {
  return isSubset(iterableB, iterableA);
}

export function isDisjoint<T>(iterableA: Iterable<T>, iterableB: Iterable<T>): boolean {
  const setB = new Set(iterableB);
  for (const item of iterableA) {
    if (setB.has(item)) return false;
  }
  return true;
}

export function shuffle2<T>(iterable: Iterable<T>): T[] {
  const array = [...iterable];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function sample2<T>(iterable: Iterable<T>, n: number): T[] {
  return shuffle2(iterable).slice(0, n);
}

export function sampleOne<T>(iterable: Iterable<T>): T | undefined {
  const array = [...iterable];
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

export function reverse2<T>(iterable: Iterable<T>): T[] {
  return [...iterable].reverse();
}

export function sort2<T>(iterable: Iterable<T>, comparator?: (a: T, b: T) => number): T[] {
  return [...iterable].sort(comparator);
}

export function sortBy3<T, K>(iterable: Iterable<T>, keyFn: (item: T) => K, order: "asc" | "desc" = "asc"): T[] {
  const sorted = [...iterable].sort((a, b) => {
    const aKey = keyFn(a);
    const bKey = keyFn(b);
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    return 0;
  });
  return order === "desc" ? sorted.reverse() : sorted;
}

export function distinctBy<T, K>(iterable: Iterable<T>, keyFn: (item: T) => K): T[] {
  const seen = new Set<K>();
  const result: T[] = [];
  for (const item of iterable) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function adjacent<T>(iterable: Iterable<T>): Array<[T | undefined, T]> {
  const result: Array<[T | undefined, T]> = [];
  let prev: T | undefined;
  let first = true;
  for (const item of iterable) {
    result.push([first ? undefined : prev, item]);
    prev = item;
    first = false;
  }
  return result;
}

export function pairwise<T>(iterable: Iterable<T>): Array<[T, T]> {
  const result: Array<[T, T]> = [];
  let prev: T | undefined;
  let first = true;
  for (const item of iterable) {
    if (!first) {
      result.push([prev as T, item]);
    }
    prev = item;
    first = false;
  }
  return result;
}

export function sliding<T>(iterable: Iterable<T>, size: number, step: number = 1): T[][] {
  return windowed(iterable, size, step);
}

export function takeWhile2<T>(iterable: Iterable<T>, predicate: Predicate<T>): T[] {
  const result: T[] = [];
  for (const item of iterable) {
    if (!predicate(item)) break;
    result.push(item);
  }
  return result;
}

export function dropWhile2<T>(iterable: Iterable<T>, predicate: Predicate<T>): T[] {
  const result: T[] = [];
  let dropping = true;
  for (const item of iterable) {
    if (dropping && predicate(item)) continue;
    dropping = false;
    result.push(item);
  }
  return result;
}

export function takeUntil<T>(iterable: Iterable<T>, predicate: Predicate<T>): T[] {
  const result: T[] = [];
  for (const item of iterable) {
    if (predicate(item)) break;
    result.push(item);
  }
  return result;
}

export function dropUntil<T>(iterable: Iterable<T>, predicate: Predicate<T>): T[] {
  const result: T[] = [];
  let dropping = true;
  for (const item of iterable) {
    if (dropping) {
      if (predicate(item)) {
        dropping = false;
        result.push(item);
      }
      continue;
    }
    result.push(item);
  }
  return result;
}

export function elementAt<T>(iterable: Iterable<T>, index: number): T | undefined {
  let i = 0;
  for (const item of iterable) {
    if (i === index) return item;
    i++;
  }
  return undefined;
}

export function elementAtOrDefault<T>(iterable: Iterable<T>, index: number, defaultValue: T): T {
  const result = elementAt(iterable, index);
  return result === undefined ? defaultValue : result;
}

export function firstOrDefault<T>(iterable: Iterable<T>, defaultValue: T): T {
  for (const item of iterable) return item;
  return defaultValue;
}

export function lastOrDefault<T>(iterable: Iterable<T>, defaultValue: T): T {
  let result: T | undefined;
  for (const item of iterable) result = item;
  return result === undefined ? defaultValue : result;
}

export function single<T>(iterable: Iterable<T>): T {
  const array = [...iterable];
  if (array.length !== 1) {
    throw new Error(`Expected exactly one element, found ${array.length}`);
  }
  return array[0];
}

export function singleOrDefault<T>(iterable: Iterable<T>, defaultValue: T): T {
  const array = [...iterable];
  if (array.length === 0) return defaultValue;
  if (array.length === 1) return array[0];
  throw new Error(`Expected 0 or 1 element, found ${array.length}`);
}

export function aggregate<T, R>(iterable: Iterable<T>, initial: R, reducer: Reducer<T, R>): R {
  return reduce2(iterable, reducer, initial);
}

export function scan3<T, R>(iterable: Iterable<T>, initial: R, reducer: Reducer<T, R>): R[] {
  return scan2(iterable, initial, reducer);
}

export function batch<T>(iterable: Iterable<T>, size: number): T[][] {
  return chunk3(iterable, size);
}

export function paginate<T>(iterable: Iterable<T>, page: number, pageSize: number): { items: T[]; page: number; pageSize: number; hasMore: boolean } {
  const all = [...iterable];
  const start = (page - 1) * pageSize;
  const items = all.slice(start, start + pageSize);
  return {
    items,
    page,
    pageSize,
    hasMore: start + pageSize < all.length,
  };
}

export function window<T>(iterable: Iterable<T>, size: number): T[][] {
  return windowed(iterable, size, 1);
}

export function segment<T>(iterable: Iterable<T>, predicate: (a: T, b: T) => boolean): T[][] {
  const result: T[][] = [];
  let current: T[] = [];
  let prev: T | undefined;
  let first = true;
  for (const item of iterable) {
    if (first || predicate(prev as T, item)) {
      current.push(item);
    } else {
      if (current.length > 0) result.push(current);
      current = [item];
    }
    prev = item;
    first = false;
  }
  if (current.length > 0) result.push(current);
  return result;
}

export function splitAt<T>(iterable: Iterable<T>, index: number): [T[], T[]] {
  const array = [...iterable];
  return [array.slice(0, index), array.slice(index)];
}

export function splitWhen<T>(iterable: Iterable<T>, predicate: Predicate<T>): [T[], T[]] {
  const array = [...iterable];
  const index = array.findIndex(predicate);
  if (index === -1) return [array, []];
  return [array.slice(0, index), array.slice(index)];
}

export function splitBetween<T>(iterable: Iterable<T>, predicate: (a: T, b: T) => boolean): T[][] {
  const result: T[][] = [];
  let current: T[] = [];
  let prev: T | undefined;
  let first = true;
  for (const item of iterable) {
    if (!first && predicate(prev as T, item)) {
      if (current.length > 0) result.push(current);
      current = [];
    }
    current.push(item);
    prev = item;
    first = false;
  }
  if (current.length > 0) result.push(current);
  return result;
}

export function join2<T>(iterable: Iterable<T>, separator: string = ","): string {
  return [...iterable].join(separator);
}

export function joinWith<T>(iterable: Iterable<T>, separator: string, prefix: string = "", suffix: string = ""): string {
  return prefix + [...iterable].join(separator) + suffix;
}

export function stringify<T>(iterable: Iterable<T>): string {
  return JSON.stringify([...iterable]);
}

export function toObject2<T, K extends string, V>(iterable: Iterable<T>, keyFn: (item: T) => K, valueFn: (item: T) => V): Record<K, V> {
  const result = {} as Record<K, V>;
  for (const item of iterable) {
    result[keyFn(item)] = valueFn(item);
  }
  return result;
}

export function associate<T, K extends string | number, V>(iterable: Iterable<T>, transform: (item: T) => [K, V]): Map<K, V> {
  const result = new Map<K, V>();
  for (const item of iterable) {
    const [key, value] = transform(item);
    result.set(key, value);
  }
  return result;
}

export function associateBy<T, K extends string | number>(iterable: Iterable<T>, keyFn: (item: T) => K): Map<K, T> {
  const result = new Map<K, T>();
  for (const item of iterable) {
    result.set(keyFn(item), item);
  }
  return result;
}

export function associateWith<T, V>(iterable: Iterable<T>, valueFn: (item: T) => V): Map<T, V> {
  const result = new Map<T, V>();
  for (const item of iterable) {
    result.set(item, valueFn(item));
  }
  return result;
}

export function toList<T>(iterable: Iterable<T>): T[] {
  return [...iterable];
}

export function toHashSet<T>(iterable: Iterable<T>): Set<T> {
  return new Set(iterable);
}

export function toHashMap<K, V>(iterable: Iterable<[K, V]>): Map<K, V> {
  return new Map(iterable);
}

export function toPairList<K, V>(map: Map<K, V>): Array<[K, V]> {
  return [...map];
}

export function countBy3<T, K extends string | number>(iterable: Iterable<T>, keyFn: (item: T) => K): Map<K, number> {
  const result = new Map<K, number>();
  for (const item of iterable) {
    const key = keyFn(item);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

export function frequencies<T>(iterable: Iterable<T>): Map<T, number> {
  const result = new Map<T, number>();
  for (const item of iterable) {
    result.set(item, (result.get(item) ?? 0) + 1);
  }
  return result;
}

export function mode<T>(iterable: Iterable<T>): T | undefined {
  const freqs = frequencies(iterable);
  let maxCount = 0;
  let modeValue: T | undefined;
  for (const [value, count] of freqs) {
    if (count > maxCount) {
      maxCount = count;
      modeValue = value;
    }
  }
  return modeValue;
}

export function median<T>(iterable: Iterable<T>): T | undefined {
  const array = [...iterable];
  if (array.length === 0) return undefined;
  const sorted = array.sort();
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? sorted[mid - 1] : sorted[mid];
}

export function quantile<T>(iterable: Iterable<T>, q: number): T | undefined {
  const array = [...iterable].sort();
  if (array.length === 0) return undefined;
  const pos = (array.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return array[base + 1] !== undefined ? (array[base] as T) : array[base];
}

export function percentile<T>(iterable: Iterable<T>, p: number): T | undefined {
  return quantile(iterable, p / 100);
}

export function withIndex<T>(iterable: Iterable<T>): Array<[T, number]> {
  const result: Array<[T, number]> = [];
  let index = 0;
  for (const item of iterable) {
    result.push([item, index]);
    index++;
  }
  return result;
}

export function enumerate<T>(iterable: Iterable<T>): Array<{ value: T; index: number }> {
  const result: Array<{ value: T; index: number }> = [];
  let index = 0;
  for (const item of iterable) {
    result.push({ value: item, index });
    index++;
  }
  return result;
}

export function stepping<T>(iterable: Iterable<T>, step: number): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      let index = 0;
      for (const item of iterable) {
        if (index % step === 0) yield item;
        index++;
      }
    },
  };
}

export function cycling<T>(iterable: Iterable<T>, times: number): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      for (let i = 0; i < times; i++) {
        for (const item of iterable) {
          yield item;
        }
      }
    },
  };
}

export function repeating<T>(value: T, times: number): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      for (let i = 0; i < times; i++) {
        yield value;
      }
    },
  };
}

export function generating<T>(fn: (index: number) => T, count: number): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      for (let i = 0; i < count; i++) {
        yield fn(i);
      }
    },
  };
}

export function range2(start: number, end: number, step: number = 1): Iterable<number> {
  return {
    [Symbol.iterator]: function* () {
      if (step > 0) {
        for (let i = start; i < end; i += step) yield i;
      } else if (step < 0) {
        for (let i = start; i > end; i += step) yield i;
      }
    },
  };
}

export function rangeInclusive(start: number, end: number, step: number = 1): Iterable<number> {
  return {
    [Symbol.iterator]: function* () {
      if (step > 0) {
        for (let i = start; i <= end; i += step) yield i;
      } else if (step < 0) {
        for (let i = start; i >= end; i += step) yield i;
      }
    },
  };
}

export function rangeFrom(start: number, count: number, step: number = 1): Iterable<number> {
  return {
    [Symbol.iterator]: function* () {
      for (let i = 0; i < count; i++) {
        yield start + i * step;
      }
    },
  };
}

export function tabulate<T>(count: number, fn: (index: number) => T): T[] {
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    result.push(fn(i));
  }
  return result;
}

export function replicate2<T>(count: number, fn: () => T): T[] {
  return tabulate(count, () => fn());
}

export function repeatedly<T>(fn: () => T, count: number = Infinity): Iterable<T> {
  return {
    [Symbol.iterator]: function* () {
      for (let i = 0; i < count; i++) {
        yield fn();
      }
    },
  };
}

export function constantly<T>(value: T): (...args: unknown[]) => T {
  return () => value;
}

export function inc(value: number): number {
  return value + 1;
}

export function dec(value: number): number {
  return value - 1;
}

export function add2(a: number, b: number): number {
  return a + b;
}

export function subtract2(a: number, b: number): number {
  return a - b;
}

export function multiply2(a: number, b: number): number {
  return a * b;
}

export function divide2(a: number, b: number): number {
  return a / b;
}

export function modulo(a: number, b: number): number {
  return a % b;
}

export function power(a: number, b: number): number {
  return Math.pow(a, b);
}

export function negate2(value: number): number {
  return -value;
}

export function reciprocal(value: number): number {
  return 1 / value;
}

export function square(value: number): number {
  return value * value;
}

export function cube(value: number): number {
  return value * value * value;
}

export function sqrt(value: number): number {
  return Math.sqrt(value);
}

export function cbrt(value: number): number {
  return Math.cbrt(value);
}

export function abs(value: number): number {
  return Math.abs(value);
}

export function sign(value: number): number {
  return Math.sign(value);
}

export function floor2(value: number): number {
  return Math.floor(value);
}

export function ceil2(value: number): number {
  return Math.ceil(value);
}

export function round2(value: number): number {
  return Math.round(value);
}

export function trunc2(value: number): number {
  return Math.trunc(value);
}

export function clamp2(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function min2(a: number, b: number): number {
  return Math.min(a, b);
}

export function max2(a: number, b: number): number {
  return Math.max(a, b);
}

export function min3(...values: number[]): number {
  return Math.min(...values);
}

export function max3(...values: number[]): number {
  return Math.max(...values);
}

export function sum2(...values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function product(...values: number[]): number {
  return values.reduce((a, b) => a * b, 1);
}

export function average(...values: number[]): number {
  return values.length === 0 ? 0 : sum2(...values) / values.length;
}

export function median2(...values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function variance(...values: number[]): number {
  if (values.length === 0) return 0;
  const avg = average(...values);
  return values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
}

export function stdDev(...values: number[]): number {
  return Math.sqrt(variance(...values));
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b > 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

export function gcdAll(...values: number[]): number {
  return values.reduce((acc, v) => gcd(acc, v));
}

export function lcmAll(...values: number[]): number {
  return values.reduce((acc, v) => lcm(acc, v));
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

export function primes(max: number): number[] {
  const result: number[] = [];
  for (let i = 2; i <= max; i++) {
    if (isPrime(i)) result.push(i);
  }
  return result;
}

export function primeFactors(n: number): number[] {
  const factors: number[] = [];
  let num = n;
  for (let i = 2; i <= num; i++) {
    while (num % i === 0) {
      factors.push(i);
      num /= i;
    }
  }
  return factors;
}

export function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

export function fibonacci(n: number): number {
  if (n < 2) return n;
  let a = 0;
  let b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

export function fibonacciSequence(n: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    result.push(fibonacci(i));
  }
  return result;
}

export function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

export function nextPowerOf2(n: number): number {
  if (n <= 0) return 1;
  let power = 1;
  while (power < n) {
    power <<= 1;
  }
  return power;
}

export function prevPowerOf2(n: number): number {
  if (n <= 1) return 1;
  return nextPowerOf2(n) >> 1;
}

export function log2(n: number): number {
  return Math.log2(n);
}

export function log10(n: number): number {
  return Math.log10(n);
}

export function log(n: number, base: number = Math.E): number {
  return Math.log(n) / Math.log(base);
}

export function exp(n: number): number {
  return Math.exp(n);
}

export function sin(n: number): number {
  return Math.sin(n);
}

export function cos(n: number): number {
  return Math.cos(n);
}

export function tan(n: number): number {
  return Math.tan(n);
}

export function asin(n: number): number {
  return Math.asin(n);
}

export function acos(n: number): number {
  return Math.acos(n);
}

export function atan(n: number): number {
  return Math.atan(n);
}

export function atan2(y: number, x: number): number {
  return Math.atan2(y, x);
}

export function sinh(n: number): number {
  return Math.sinh(n);
}

export function cosh(n: number): number {
  return Math.cosh(n);
}

export function tanh(n: number): number {
  return Math.tanh(n);
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function normalizeAngle(angle: number): number {
  return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function inverseLerp(start: number, end: number, value: number): number {
  return (value - start) / (end - start);
}

export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return lerp(outMin, outMax, inverseLerp(inMin, inMax, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp2((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp2((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function bounce(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
  if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
  t -= 2.625 / 2.75;
  return 7.5625 * t * t + 0.984375;
}

export function approximately(a: number, b: number, epsilon: number = 0.0001): boolean {
  return Math.abs(a - b) < epsilon;
}

export function isEven(n: number): boolean {
  return n % 2 === 0;
}

export function isOdd(n: number): boolean {
  return n % 2 !== 0;
}

export function isInteger2(n: number): boolean {
  return Number.isInteger(n);
}

export function isFloat(n: number): boolean {
  return !Number.isInteger(n);
}

export function isPositive(n: number): boolean {
  return n > 0;
}

export function isNegative(n: number): boolean {
  return n < 0;
}

export function isZero(n: number): boolean {
  return n === 0;
}

export function isBetween(n: number, min: number, max: number, inclusive: boolean = true): boolean {
  return inclusive ? n >= min && n <= max : n > min && n < max;
}

export function isInRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

export function wrap(n: number, min: number, max: number): number {
  const range = max - min;
  return min + ((n - min) % range + range) % range;
}

export function modulo2(n: number, d: number): number {
  return ((n % d) + d) % d;
}

export function sign2(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

export function truncate(n: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.trunc(n * factor) / factor;
}

export function round3(n: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

export function floor3(n: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.floor(n * factor) / factor;
}

export function ceil3(n: number, decimals: number = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.ceil(n * factor) / factor;
}

export function random3(min: number = 0, max: number = 1): number {
  return Math.random() * (max - min) + min;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function randomGaussian(mean: number = 0, stdDev: number = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function randomChoice<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

export function randomChoices<T>(array: T[], count: number): T[] {
  return [...array].sort(() => Math.random() - 0.5).slice(0, count);
}

export function randomWeighted<T>(items: Array<{ item: T; weight: number }>): T | undefined {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  let random = Math.random() * totalWeight;
  for (const { item, weight } of items) {
    random -= weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1]?.item;
}

export function seedRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function shortUuid(): string {
  return uuid().replace(/-/g, "").slice(0, 12);
}

export function nanoid(size: number = 21): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  let result = "";
  for (let i = 0; i < size; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}
