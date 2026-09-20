/**
 * Function utilities -- debounce, throttle, memoize, partial, compose, etc.
 * @module shared/utils/function
 */

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, wait: number, immediate: boolean = false): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;
  let result: ReturnType<T>;
  const debounced = (...args: Parameters<T>): ReturnType<T> => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    if (immediate && !timer) {
      result = fn(...args) as ReturnType<T>;
    }
    timer = setTimeout(() => {
      if (!immediate && lastArgs) {
        result = fn(...lastArgs) as ReturnType<T>;
      }
      timer = undefined;
    }, wait);
    return result;
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  debounced.flush = () => {
    if (timer) clearTimeout(timer);
    if (lastArgs) {
      result = fn(...lastArgs) as ReturnType<T>;
    }
    timer = undefined;
  };
  return debounced as unknown as T;
}

export function throttle<T extends (...args: unknown[]) => unknown>(fn: T, limit: number): T {
  let inThrottle = false;
  let lastArgs: Parameters<T> | undefined;
  let lastResult: ReturnType<T>;
  const throttled = (...args: Parameters<T>): ReturnType<T> => {
    if (!inThrottle) {
      lastResult = fn(...args) as ReturnType<T>;
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          lastResult = fn(...lastArgs) as ReturnType<T>;
          lastArgs = undefined;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
    return lastResult;
  };
  throttled.cancel = () => { inThrottle = false; lastArgs = undefined; };
  return throttled as unknown as T;
}

export function memoize<T extends (...args: unknown[]) => unknown>(fn: T, keyFn?: (...args: Parameters<T>) => string): T {
  const cache = new Map<string, ReturnType<T>>();
  const getKey = keyFn ?? ((...args: Parameters<T>) => JSON.stringify(args));
  const memoized = (...args: Parameters<T>): ReturnType<T> => {
    const key = getKey(...args);
    if (cache.has(key)) return cache.get(key)!;
    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  };
  memoized.cache = cache;
  return memoized as unknown as T;
}

export function once<T extends (...args: unknown[]) => unknown>(fn: T): T {
  let called = false;
  let result: ReturnType<T>;
  const onceFn = (...args: Parameters<T>): ReturnType<T> => {
    if (called) return result;
    called = true;
    result = fn(...args) as ReturnType<T>;
    return result;
  };
  return onceFn as T;
}

export function partial<T extends (...args: unknown[]) => unknown>(fn: T, ...partialArgs: unknown[]): (...args: unknown[]) => ReturnType<T> {
  return (...args: unknown[]) => fn(...partialArgs, ...args) as ReturnType<T>;
}

export function partialRight<T extends (...args: unknown[]) => unknown>(fn: T, ...partialArgs: unknown[]): (...args: unknown[]) => ReturnType<T> {
  return (...args: unknown[]) => fn(...args, ...partialArgs) as ReturnType<T>;
}

export function curry<T extends (...args: unknown[]) => unknown>(fn: T, arity: number = fn.length): (...args: unknown[]) => ReturnType<T> {
  const curried = (...args: unknown[]): ReturnType<T> => {
    if (args.length >= arity) {
      return fn(...args) as ReturnType<T>;
    }
    return ((...next: unknown[]) => curried(...args, ...next)) as unknown as ReturnType<T>;
  };
  return curried as unknown as any;
}

export function curryRight<T extends (...args: unknown[]) => unknown>(fn: T, arity: number = fn.length): (...args: unknown[]) => ReturnType<T> {
  const curried = (...args: unknown[]): ReturnType<T> => {
    if (args.length >= arity) {
      return fn(...args.reverse()) as ReturnType<T>;
    }
    return ((...next: unknown[]) => curryRight(fn, arity)(...next, ...args)) as unknown as ReturnType<T>;
  };
  return curried as any;
}

export function compose<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduceRight((acc, fn) => fn(acc), arg);
}

export function pipe<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduce((acc, fn) => fn(acc), arg);
}

export function flow<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return pipe(...fns);
}

export function flowRight<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return compose(...fns);
}

export function after<T extends (...args: unknown[]) => unknown>(n: number, fn: T): T {
  let count = 0;
  return ((...args: Parameters<T>) => {
    count++;
    if (count >= n) return fn(...args) as ReturnType<T>;
    return undefined as ReturnType<T>;
  }) as T;
}

export function before<T extends (...args: unknown[]) => unknown>(n: number, fn: T): T {
  let count = 0;
  let result: ReturnType<T>;
  return ((...args: Parameters<T>) => {
    count++;
    if (count < n) {
      result = fn(...args) as ReturnType<T>;
    }
    return result;
  }) as T;
}

export function ary<T extends (...args: unknown[]) => unknown>(fn: T, n: number): T {
  return ((...args: Parameters<T>) => fn(...args.slice(0, n) as Parameters<T>)) as T;
}

export function unary<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return ary(fn, 1);
}

export function binary<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return ary(fn, 2);
}

export function ternary<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return ary(fn, 3);
}

export function flip<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return ((...args: Parameters<T>) => fn(...args.reverse() as Parameters<T>)) as T;
}

export function negate<T extends (...args: unknown[]) => boolean>(predicate: T): T {
  return ((...args: Parameters<T>) => !predicate(...args)) as T;
}

export function complement<T extends (...args: unknown[]) => boolean>(predicate: T): T {
  return negate(predicate);
}

export function wrap<T extends (...args: unknown[]) => unknown, R>(fn: T, wrapper: (fn: T, ...args: unknown[]) => R): (...args: unknown[]) => R {
  return (...args: unknown[]) => wrapper(fn, ...args);
}

export function negatePredicate<T>(predicate: (value: T) => boolean): (value: T) => boolean {
  return (value: T) => !predicate(value);
}

export function identity<T>(value: T): T {
  return value;
}

export function noop(): void {
}

export function constant<T>(value: T): () => T {
  return () => value;
}

export function noopReturn<T>(value: T): T {
  return value;
}

export function stubTrue(): boolean {
  return true;
}

export function stubFalse(): boolean {
  return false;
}

export function stubUndefined(): undefined {
  return undefined;
}

export function stubNull(): null {
  return null;
}

export function stubArray<T>(): T[] {
  return [];
}

export function stubObject(): Record<string, never> {
  return {};
}

export function stubString(): string {
  return "";
}

export function times<T>(n: number, iteratee: (index: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => iteratee(i));
}

export function range(start: number, end: number, step: number = 1): number[] {
  const result: number[] = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) result.push(i);
  } else {
    for (let i = start; i > end; i += step) result.push(i);
  }
  return result;
}

export function iteratee(value: unknown): (...args: unknown[]) => unknown {
  if (typeof value === "function") return value as (...args: unknown[]) => unknown;
  if (typeof value === "string" || typeof value === "symbol") return (obj: unknown) => (obj as Record<string | symbol, unknown>)?.[value as string | symbol];
  if (Array.isArray(value)) {
    const [path, matchValue] = value;
    return (obj: unknown) => getPath(obj, path) === matchValue;
  }
  if (typeof value === "object" && value !== null) {
    return (obj: unknown) => isMatch(obj as object, value as object);
  }
  return () => true;
}

function getPath(obj: unknown, path: string): unknown {
  return (obj as Record<string, unknown>)?.[path];
}

function isMatch(obj: object, source: object): boolean {
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if ((source as Record<string, unknown>)[key] !== (obj as Record<string, unknown>)[key]) return false;
    }
  }
  return true;
}

export function attempt<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): T | Error {
  try {
    return fn(...args);
  } catch (error) {
    return error as Error;
  }
}

export function attemptAsync<T>(fn: (...args: unknown[]) => Promise<T>, ...args: unknown[]): Promise<T> {
  return fn(...args).catch((error) => {
    throw error;
  });
}

export function bind<T extends (...args: unknown[]) => unknown>(fn: T, thisArg: unknown, ...partialArgs: unknown[]): T {
  return fn.bind(thisArg, ...partialArgs);
}

export function bindKey<T extends (...args: unknown[]) => unknown>(obj: unknown, key: string, ...partialArgs: unknown[]): T {
  return ((obj as Record<string, (...args: unknown[]) => unknown>)[key]).bind(obj, ...partialArgs) as T;
}

export function bindAll<T extends object>(obj: T, ...keys: (keyof T)[]): T {
  for (const key of keys) {
    if (typeof obj[key] === "function") {
      obj[key] = (obj[key] as unknown as (...args: unknown[]) => unknown).bind(obj) as T[keyof T];
    }
  }
  return obj;
}

export function spread<T extends (...args: unknown[]) => unknown>(fn: T): (args: unknown[]) => ReturnType<T> {
  return (args: unknown[]) => fn(...args) as ReturnType<T>;
}

export function rearg<T extends (...args: unknown[]) => unknown>(fn: T, ...indexes: number[]): T {
  return ((...args: Parameters<T>) => {
    const reordered = indexes.map((i) => args[i]);
    return fn(...reordered);
  }) as T;
}

export function unary2<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return ((...args: Parameters<T>) => fn(args[0])) as T;
}

export function delay(fn: (...args: unknown[]) => void, wait: number, ...args: unknown[]): ReturnType<typeof setTimeout> {
  return setTimeout(() => fn(...args), wait);
}

export function defer(fn: (...args: unknown[]) => void, ...args: unknown[]): ReturnType<typeof setTimeout> {
  return setTimeout(() => fn(...args), 0);
}

export function now(): number {
  return Date.now();
}

export function timestamp(): number {
  return Date.now();
}

export function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let uniqueCounter = 0;
export function uniqueId(prefix: string = ""): string {
  return `${prefix}${++uniqueCounter}`;
}

export function uniqueIdFactory(prefix: string = ""): () => string {
  let id = 0;
  return () => `${prefix}${++id}`;
}

export function methodOf<T extends object>(obj: T, ...args: unknown[]): (path: keyof T) => unknown {
  return (path: keyof T) => {
    const fn = obj[path];
    if (typeof fn === "function") {
      return (fn as (...args: unknown[]) => unknown)(...args);
    }
  };
}

export function propertyOf<T extends object>(obj: T): (path: keyof T) => T[keyof T] {
  return (path: keyof T) => obj[path];
}

export function conjoin<T>(predicates: Array<(value: T) => boolean>): (value: T) => boolean {
  return (value: T) => predicates.every((pred) => pred(value));
}

export function disjoin<T>(predicates: Array<(value: T) => boolean>): (value: T) => boolean {
  return (value: T) => predicates.some((pred) => pred(value));
}

export function juxt<T, R>(fns: Array<(value: T) => R>): (value: T) => R[] {
  return (value: T) => fns.map((fn) => fn(value));
}

export function over<T, R>(fns: Array<(value: T) => R>): (value: T) => R[] {
  return juxt(fns);
}

export function overEvery<T>(predicates: Array<(value: T) => boolean>): (value: T) => boolean {
  return conjoin(predicates);
}

export function overSome<T>(predicates: Array<(value: T) => boolean>): (value: T) => boolean {
  return disjoin(predicates);
}

export function cond<T, R>(pairs: Array<[((value: T) => boolean), ((value: T) => R)]>): (value: T) => R | undefined {
  return (value: T) => {
    for (const [predicate, transform] of pairs) {
      if (predicate(value)) return transform(value);
    }
    return undefined;
  };
}

export function conformsTo<T extends object>(obj: T, source: Record<string, (value: unknown) => boolean>): boolean {
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (!source[key]((obj as Record<string, unknown>)[key])) return false;
    }
  }
  return true;
}

export function conforms<T extends Record<string, (value: unknown) => boolean>>(source: T): (obj: Record<string, unknown>) => boolean {
  return (obj) => conformsTo(obj, source);
}

export function defaultTo<T>(value: T, defaultValue: T): T {
  return value === null || value === undefined || Number.isNaN(value) ? defaultValue : value;
}

export function defaultToAny<T>(value: T, ...defaultValues: T[]): T {
  if (value !== null && value !== undefined && !Number.isNaN(value)) return value;
  for (const def of defaultValues) {
    if (def !== null && def !== undefined && !Number.isNaN(def)) return def;
  }
  return value;
}

export function overArgs<T extends (...args: unknown[]) => unknown>(fn: T, transforms: Array<(arg: unknown) => unknown>): T {
  return ((...args: Parameters<T>) => {
    const transformed = args.map((arg, i) => (transforms[i] ? transforms[i](arg) : arg));
    return fn(...transformed);
  }) as T;
}

export function flipArgs<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return ((...args: Parameters<T>) => fn(...args.reverse() as Parameters<T>)) as T;
}

export function onlyOnce<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return once(fn);
}

export function ensureAsync<T>(fn: (...args: unknown[]) => T | Promise<T>): (...args: unknown[]) => Promise<T> {
  return (...args: unknown[]) => {
    return new Promise<T>((resolve, reject) => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          result.then(resolve, reject);
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(error);
      }
    });
  };
}

export function syncify<T>(fn: (...args: unknown[]) => Promise<T>): (...args: unknown[]) => T {
  let cached: T;
  let resolved = false;
  return (...args: unknown[]) => {
    if (!resolved) {
      fn(...args).then((result) => {
        cached = result;
        resolved = true;
      });
      throw new Error("Not resolved yet");
    }
    return cached;
  };
}

export function limit<T extends (...args: unknown[]) => unknown>(fn: T, maxCalls: number): T {
  let calls = 0;
  return ((...args: Parameters<T>) => {
    if (calls >= maxCalls) {
      throw new Error(`Function exceeded max calls of ${maxCalls}`);
    }
    calls++;
    return fn(...args) as ReturnType<T>;
  }) as T;
}

export function rateLimit<T extends (...args: unknown[]) => unknown>(fn: T, maxCalls: number, perMs: number): T {
  const timestamps: number[] = [];
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    while (timestamps.length > 0 && now - timestamps[0] > perMs) {
      timestamps.shift();
    }
    if (timestamps.length >= maxCalls) {
      throw new Error(`Rate limit exceeded: ${maxCalls} calls per ${perMs}ms`);
    }
    timestamps.push(now);
    return fn(...args) as ReturnType<T>;
  }) as T;
}

export function cycle<T>(...fns: Array<() => T>): () => T {
  let index = 0;
  return () => {
    const fn = fns[index];
    index = (index + 1) % fns.length;
    return fn();
  };
}

export function sequence<T>(...fns: Array<() => T>): () => T {
  let index = 0;
  return () => {
    const fn = fns[index];
    index = Math.min(index + 1, fns.length - 1);
    return fn();
  };
}

export function tap<T>(value: T, interceptor: (value: T) => void): T {
  interceptor(value);
  return value;
}

export function thru<T, R>(value: T, interceptor: (value: T) => R): R {
  return interceptor(value);
}

export function pipeline<T>(value: T): T {
  return value;
}

export function chain<T>(value: T): { value: T; thru: <R>(fn: (value: T) => R) => { value: R; thru: <R2>(fn2: (value: R) => R2) => { value: R2 } } } {
  return {
    value,
    thru: <R>(fn: (value: T) => R) => ({
      value: fn(value),
      thru: <R2>(fn2: (value: R) => R2) => ({
        value: fn2(fn(value)),
      }),
    }),
  };
}
