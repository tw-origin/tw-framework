/**
 * Promise and async utilities.
 * @module shared/utils/promise
 */

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function timeout<T>(promise: Promise<T>, ms: number, message: string = "Timeout"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

export function retry<T>(fn: () => Promise<T>, options: { maxRetries?: number; delay?: number; backoff?: number; onRetry?: (error: Error, attempt: number) => void } = {}): Promise<T> {
  const { maxRetries = 3, delay: initialDelay = 1000, backoff = 2, onRetry } = options;
  let attempt = 0;
  const execute = async (): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > maxRetries) throw error;
      if (onRetry) onRetry(error as Error, attempt);
      const waitTime = initialDelay * Math.pow(backoff, attempt - 1);
      await delay(waitTime);
      return execute();
    }
  };
  return execute();
}

export async function retryAsync<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries) await delay(100 * Math.pow(2, i));
    }
  }
  throw lastError;
}

export function allSettled<T>(promises: Promise<T>[]): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(promises);
}

export async function settle<T>(promise: Promise<T>): Promise<[T | null, Error | null]> {
  try {
    const value = await promise;
    return [value, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function props<T extends Record<string, Promise<unknown>>>(obj: T): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const entries = Object.entries(obj);
  return Promise.all(entries.map(([key, promise]) => promise.then((value) => [key, value])))
    .then((results) => Object.fromEntries(results) as { [K in keyof T]: Awaited<T[K]> });
}

export function mapSeries<T, R>(items: T[], mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  return items.reduce(async (acc, item, index) => {
    const results = await acc;
    results.push(await mapper(item, index));
    return results;
  }, Promise.resolve([] as R[]));
}

export function mapParallel<T, R>(items: T[], mapper: (item: T, index: number) => Promise<R>, concurrency: number = Infinity): Promise<R[]> {
  if (concurrency >= items.length) return Promise.all(items.map(mapper));
  return new Promise((resolve, reject) => {
    const results: R[] = new Array(items.length);
    let index = 0;
    let completed = 0;
    let hasError = false;
    const runNext = () => {
      if (hasError) return;
      if (index >= items.length) {
        if (completed === items.length) resolve(results);
        return;
      }
      const currentIndex = index++;
      mapper(items[currentIndex], currentIndex)
        .then((result) => {
          if (hasError) return;
          results[currentIndex] = result;
          completed++;
          runNext();
        })
        .catch((error) => {
          if (!hasError) {
            hasError = true;
            reject(error);
          }
        });
    };
    for (let i = 0; i < Math.min(concurrency, items.length); i++) runNext();
  });
}

export function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  return mapParallel(items, mapper, limit);
}

export function filterAsync<T>(items: T[], predicate: (item: T, index: number) => Promise<boolean>, concurrency: number = Infinity): Promise<T[]> {
  return mapParallel(items, predicate, concurrency).then((results) => items.filter((_, i) => results[i]));
}

export function eachSeries<T>(items: T[], iteratee: (item: T, index: number) => Promise<void>): Promise<void> {
  return items.reduce(async (acc, item, index) => {
    await acc;
    await iteratee(item, index);
  }, Promise.resolve());
}

export function eachParallel<T>(items: T[], iteratee: (item: T, index: number) => Promise<void>, concurrency: number = Infinity): Promise<void> {
  return mapParallel(items, iteratee, concurrency).then(() => undefined);
}

export function reduceAsync<T, R>(items: T[], reducer: (acc: R, item: T, index: number) => Promise<R>, initialValue: R): Promise<R> {
  return items.reduce(async (acc, item, index) => {
    const results = await acc;
    return reducer(results, item, index);
  }, Promise.resolve(initialValue));
}

export function whilst<T>(test: () => boolean, fn: () => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  const execute = async (): Promise<T[]> => {
    if (!test()) return results;
    results.push(await fn());
    return execute();
  };
  return execute();
}

export function until<T>(test: () => boolean, fn: () => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  const execute = async (): Promise<T[]> => {
    if (test()) return results;
    results.push(await fn());
    return execute();
  };
  return execute();
}

export function doWhilst<T>(fn: () => Promise<T>, test: () => boolean): Promise<T[]> {
  const results: T[] = [];
  const execute = async (): Promise<T[]> => {
    results.push(await fn());
    if (test()) return execute();
    return results;
  };
  return execute();
}

export function doUntil<T>(fn: () => Promise<T>, test: () => boolean): Promise<T[]> {
  const results: T[] = [];
  const execute = async (): Promise<T[]> => {
    results.push(await fn());
    if (!test()) return execute();
    return results;
  };
  return execute();
}

export function forever<T>(fn: () => Promise<T>): Promise<never> {
  return fn().then(() => forever(fn));
}

export function race<T>(promises: Promise<T>[]): Promise<T> {
  return Promise.race(promises);
}

export function any<T>(promises: Promise<T>[]): Promise<T> {
  return Promise.any(promises);
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason: Error) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function promisify<T>(fn: (...args: unknown[]) => void): (...args: unknown[]) => Promise<T> {
  return (...args: unknown[]) => {
    return new Promise<T>((resolve, reject) => {
      fn(...args, (error: Error | null, result: T) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  };
}

export function callbackify<T>(fn: (...args: unknown[]) => Promise<T>): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    const callback = args[args.length - 1] as (error: Error | null, result?: T) => void;
    fn(...args.slice(0, -1))
      .then((result) => callback(null, result))
      .catch((error) => callback(error));
  };
}

export function queue<T>(concurrency: number = 1): {
  push: (task: () => Promise<T>) => Promise<T>;
  size: () => number;
  running: () => number;
  idle: () => boolean;
  pause: () => void;
  resume: () => void;
  drain: () => Promise<void>;
} {
  let paused = false;
  let running = 0;
  const waiting: Array<{ task: () => Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void }> = [];
  let drainPromise: { resolve: () => void; promise: Promise<void> } | undefined;

  const checkDrain = () => {
    if (waiting.length === 0 && running === 0 && drainPromise) {
      drainPromise.resolve();
      drainPromise = undefined;
    }
  };

  const runNext = () => {
    if (paused || running >= concurrency || waiting.length === 0) return;
    const { task, resolve, reject } = waiting.shift()!;
    running++;
    task()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        running--;
        checkDrain();
        runNext();
      });
  };

  return {
    push: (task) => {
      return new Promise<T>((resolve, reject) => {
        waiting.push({ task, resolve, reject });
        runNext();
      });
    },
    size: () => waiting.length,
    running: () => running,
    idle: () => waiting.length === 0 && running === 0,
    pause: () => { paused = true; },
    resume: () => { paused = false; for (let i = 0; i < concurrency; i++) runNext(); },
    drain: () => {
      if (waiting.length === 0 && running === 0) return Promise.resolve();
      if (!drainPromise) {
        const deferred = { resolve: () => {}, promise: Promise.resolve() };
        drainPromise = {
          resolve: () => {},
          promise: new Promise<void>((resolve) => { drainPromise!.resolve = resolve; }),
        };
      }
      return drainPromise!.promise;
    },
  };
}

export function cargo<T>(payload: number = 10): {
  push: (task: () => Promise<T>) => Promise<T>;
  size: () => number;
  idle: () => boolean;
} {
  let running = false;
  const waiting: Array<{ task: () => Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void }> = [];
  const run = async () => {
    if (running) return;
    running = true;
    while (waiting.length > 0) {
      const batch = waiting.splice(0, payload);
      await Promise.all(batch.map(({ task, resolve, reject }) => task().then(resolve).catch(reject)));
    }
    running = false;
  };
  return {
    push: (task) => {
      return new Promise<T>((resolve, reject) => {
        waiting.push({ task, resolve, reject });
        run();
      });
    },
    size: () => waiting.length,
    idle: () => waiting.length === 0 && !running,
  };
}

export function memoizeAsync<T>(fn: (...args: unknown[]) => Promise<T>, keyFn?: (...args: unknown[]) => string): (...args: unknown[]) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  const getKey = keyFn ?? ((...args) => JSON.stringify(args));
  return (...args: unknown[]) => {
    const key = getKey(...args);
    if (cache.has(key)) return cache.get(key)!;
    const promise = fn(...args);
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
    return promise;
  };
}

export function debounceAsync<T>(fn: (...args: unknown[]) => Promise<T>, wait: number): (...args: unknown[]) => Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { resolve: (value: T) => void; reject: (error: Error) => void } | undefined;
  return (...args: unknown[]) => {
    return new Promise<T>((resolve, reject) => {
      if (timer) clearTimeout(timer);
      if (pending) pending.reject(new Error("Debounced"));
      pending = { resolve, reject };
      timer = setTimeout(async () => {
        try {
          const result = await fn(...args);
          pending?.resolve(result);
        } catch (error) {
          pending?.reject(error as Error);
        }
        pending = undefined;
        timer = undefined;
      }, wait);
    });
  };
}

export function throttleAsync<T>(fn: (...args: unknown[]) => Promise<T>, limit: number): (...args: unknown[]) => Promise<T> {
  let inFlight = 0;
  const queue: Array<{ args: unknown[]; resolve: (value: T) => void; reject: (error: Error) => void }> = [];
  const process = () => {
    while (inFlight < limit && queue.length > 0) {
      const { args, resolve, reject } = queue.shift()!;
      inFlight++;
      fn(...args)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          inFlight--;
          process();
        });
    }
  };
  return (...args: unknown[]) => {
    return new Promise<T>((resolve, reject) => {
      queue.push({ args, resolve, reject });
      process();
    });
  };
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  return timeout(promise, ms, message);
}

export function withRetry<T>(fn: () => Promise<T>, maxRetries?: number): Promise<T> {
  return retryAsync(fn, maxRetries);
}

export function withFallback<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  return fn().catch(fallback);
}

export function withCache<T>(fn: () => Promise<T>, ttl: number = 0): () => Promise<T> {
  let cached: { value: T; timestamp: number } | undefined;
  return () => {
    if (cached && (ttl === 0 || Date.now() - cached.timestamp < ttl)) {
      return Promise.resolve(cached.value);
    }
    return fn().then((value) => {
      cached = { value, timestamp: Date.now() };
      return value;
    });
  };
}

export function withLock<T>(fn: () => Promise<T>, lock: { acquire: () => Promise<void>; release: () => void }): Promise<T> {
  return lock.acquire().then(() => fn().finally(() => lock.release()));
}

export function withFinally<T>(promise: Promise<T>, onFinally: () => void): Promise<T> {
  return promise.finally(onFinally);
}

export function withTap<T>(promise: Promise<T>, onFulfilled: (value: T) => void, onRejected?: (error: Error) => void): Promise<T> {
  return promise.then(
    (value) => { onFulfilled(value); return value; },
    (error) => { if (onRejected) onRejected(error); throw error; },
  );
}

export function withLog<T>(promise: Promise<T>, logger: (message: string) => void, label: string = "Promise"): Promise<T> {
  logger(`${label}: started`);
  return promise.then(
    (value) => { logger(`${label}: resolved`); return value; },
    (error) => { logger(`${label}: rejected: ${error.message}`); throw error; },
  );
}

export function withMeasure<T>(promise: Promise<T>, callback: (duration: number) => void): Promise<T> {
  const start = performance.now();
  return promise.finally(() => callback(performance.now() - start));
}

export function poll<T>(fn: () => Promise<T>, options: { interval: number; maxAttempts?: number; shouldContinue?: (result: T) => boolean; timeout?: number }): Promise<T> {
  const { interval, maxAttempts = Infinity, shouldContinue = () => true, timeout: timeoutMs = Infinity } = options;
  const startTime = Date.now();
  let attempts = 0;
  const pollOnce = async (): Promise<T> => {
    if (Date.now() - startTime > timeoutMs) throw new Error("Polling timeout");
    if (attempts >= maxAttempts) throw new Error("Max polling attempts reached");
    attempts++;
    const result = await fn();
    if (!shouldContinue(result)) return result;
    await delay(interval);
    return pollOnce();
  };
  return pollOnce();
}

export function defer<T>(): Promise<T> {
  return delay(0).then(() => undefined as unknown as T);
}

export function nextTick(fn: () => void): void {
  Promise.resolve().then(fn);
}

export function microtask(fn: () => void): void {
  Promise.resolve().then(fn);
}

export function macrotask(fn: () => void, delay: number = 0): void {
  setTimeout(fn, delay);
}

export function immediate(fn: () => void): void {
  setImmediate(fn);
}

export function sleep(ms: number): Promise<void> {
  return delay(ms);
}

export function idle(ms: number): Promise<void> {
  return delay(ms);
}

export function waitFor<T>(condition: () => T | Promise<T>, options: { interval?: number; timeout?: number; message?: string } = {}): Promise<T> {
  const { interval = 100, timeout: timeoutMs = 30000, message = "Condition timeout" } = options;
  const start = Date.now();
  const check = async (): Promise<T> => {
    const result = await condition();
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error(message);
    await delay(interval);
    return check();
  };
  return check();
}

export function waitForCondition(condition: () => boolean, options: { interval?: number; timeout?: number } = {}): Promise<void> {
  return waitFor(() => condition(), options).then(() => undefined);
}

export function waitForElement(selector: string, options: { interval?: number; timeout?: number } = {}): Promise<Element> {
  return waitFor(() => typeof document !== "undefined" ? document.querySelector(selector) : null, options) as Promise<Element>;
}

export function waitForProperty<T extends object>(obj: T, prop: keyof T, options: { interval?: number; timeout?: number } = {}): Promise<void> {
  return waitForCondition(() => obj[prop] !== undefined, options);
}

export function tryCatch<T>(fn: () => Promise<T>): Promise<[T | null, Error | null]> {
  return settle(fn());
}

export function tryFinally<T>(fn: () => Promise<T>, finallyFn: () => void): Promise<T> {
  return fn().finally(finallyFn);
}

export function composeAsync<T>(...fns: Array<(arg: T) => Promise<T>>): (initial: T) => Promise<T> {
  return (initial: T) => fns.reduce((promise, fn) => promise.then(fn), Promise.resolve(initial));
}

export function pipeAsync<T>(...fns: Array<(arg: T) => Promise<T>>): (initial: T) => Promise<T> {
  return composeAsync(...fns);
}

export function parallel<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(tasks.map((task) => task()));
}

export function serial<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  return tasks.reduce(async (acc, task) => {
    const results = await acc;
    results.push(await task());
    return results;
  }, Promise.resolve([] as T[]));
}

export function waterfall<T>(tasks: Array<(arg: T) => Promise<T>>, initial: T): Promise<T> {
  return tasks.reduce((promise, task) => promise.then(task), Promise.resolve(initial));
}

export function auto<T extends Record<string, (...args: unknown[]) => Promise<unknown>>>(tasks: T, dependencies?: Record<string, string[]>): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: Record<string, unknown> = {};
  const taskEntries = Object.entries(tasks);
  const execute = async (): Promise<void> => {
    let progress = true;
    while (progress) {
      progress = false;
      for (const [name, task] of taskEntries) {
        if (name in results) continue;
        const deps = dependencies?.[name] ?? [];
        if (deps.every((dep) => dep in results)) {
          results[name] = await task(...deps.map((dep) => results[dep]));
          progress = true;
        }
      }
    }
    for (const [name] of taskEntries) {
      if (!(name in results)) throw new Error(`Could not resolve task: ${name}`);
    }
  };
  return execute().then(() => results as { [K in keyof T]: Awaited<ReturnType<T[K]>> });
}

export function ensureAsync<T>(value: T | Promise<T>): Promise<T> {
  return Promise.resolve(value);
}

export function constant<T>(value: T): () => Promise<T> {
  return () => Promise.resolve(value);
}

export function noop(): Promise<void> {
  return Promise.resolve();
}

export function passThrough<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export function reject<T>(error: Error): Promise<T> {
  return Promise.reject(error);
}

export function resolve<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}
