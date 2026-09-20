/**
 * Event emitter -- typed event system with wildcard support.
 * @module shared/utils
 */

export type EventHandler<T = any> = (payload: T) => void | Promise<void>;
export type WildcardHandler = (event: string, payload: any) => void | Promise<void>;

export interface EventEmitterOptions {
  maxListeners?: number;
  captureRejections?: boolean;
  wildcard?: boolean;
  delimiter?: string;
  ignoreErrors?: boolean;
}

export interface EventListener {
  event: string;
  handler: EventHandler;
  once: boolean;
  context?: unknown;
}

export class TypedEventEmitter<Events extends Record<string, any> = Record<string, any>> {
  private listenerMap: Map<string, Set<EventListener>> = new Map();
  private wildcardListeners: Set<WildcardHandler> = new Set();
  private options: Required<EventEmitterOptions>;
  private maxListenersReached: Set<string> = new Set();

  constructor(options: EventEmitterOptions = {}) {
    this.options = {
      maxListeners: options.maxListeners ?? 10,
      captureRejections: options.captureRejections ?? false,
      wildcard: options.wildcard ?? false,
      delimiter: options.delimiter ?? ".",
      ignoreErrors: options.ignoreErrors ?? false,
    };
  }

  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    return this.addListener(event as string, handler, false);
  }

  once<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    return this.addListener(event as string, handler, true);
  }

  off<K extends keyof Events>(event: K, handler?: EventHandler<Events[K]>): this {
    if (!handler) {
      this.listenerMap.delete(event as string);
    } else {
      const set = this.listenerMap.get(event as string);
      if (set) {
        for (const listener of set) {
          if (listener.handler === handler) {
            set.delete(listener);
            break;
          }
        }
        if (set.size === 0) {
          this.listenerMap.delete(event as string);
        }
      }
    }
    return this;
  }

  offAll(): this {
    this.listenerMap.clear();
    this.wildcardListeners.clear();
    this.maxListenersReached.clear();
    return this;
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): boolean {
    let hasListeners = false;
    const listeners = this.listenerMap.get(event as string);
    if (listeners && listeners.size > 0) {
      hasListeners = true;
      const toRemove: EventListener[] = [];
      const toCall = [...listeners];
      for (const listener of toCall) {
        try {
          const result = listener.handler.call(listener.context, payload);
          if (result instanceof Promise && this.options.captureRejections) {
            result.catch((error) => {
              if (!this.options.ignoreErrors) {
                console.error(`Event handler error for "${event as string}":`, error);
              }
            });
          }
          if (listener.once) {
            toRemove.push(listener);
          }
        } catch (error) {
          if (!this.options.ignoreErrors) {
            console.error(`Event handler error for "${event as string}":`, error);
          }
        }
      }
      for (const listener of toRemove) {
        listeners.delete(listener);
      }
      if (listeners.size === 0) {
        this.listenerMap.delete(event as string);
      }
    }
    if (this.wildcardListeners.size > 0) {
      hasListeners = true;
      for (const handler of this.wildcardListeners) {
        try {
          handler(event as string, payload);
        } catch (error) {
          if (!this.options.ignoreErrors) {
            console.error(`Wildcard handler error for "${event as string}":`, error);
          }
        }
      }
    }
    return hasListeners;
  }

  emitAsync<K extends keyof Events>(event: K, payload: Events[K]): Promise<boolean> {
    return this.emitAsyncInternal(event as string, payload);
  }

  private async emitAsyncInternal(event: string, payload: any): Promise<boolean> {
    let hasListeners = false;
    const listeners = this.listenerMap.get(event);
    if (listeners && listeners.size > 0) {
      hasListeners = true;
      const toRemove: EventListener[] = [];
      const toCall = [...listeners];
      for (const listener of toCall) {
        try {
          await listener.handler.call(listener.context, payload);
          if (listener.once) {
            toRemove.push(listener);
          }
        } catch (error) {
          if (!this.options.ignoreErrors) {
            console.error(`Event handler error for "${event}":`, error);
          }
        }
      }
      for (const listener of toRemove) {
        listeners.delete(listener);
      }
      if (listeners.size === 0) {
        this.listenerMap.delete(event);
      }
    }
    if (this.wildcardListeners.size > 0) {
      hasListeners = true;
      for (const handler of this.wildcardListeners) {
        try {
          await handler(event, payload);
        } catch (error) {
          if (!this.options.ignoreErrors) {
            console.error(`Wildcard handler error for "${event}":`, error);
          }
        }
      }
    }
    return hasListeners;
  }

  onAny(handler: WildcardHandler): () => void {
    this.wildcardListeners.add(handler);
    return () => {
      this.wildcardListeners.delete(handler);
    };
  }

  offAny(handler: WildcardHandler): this {
    this.wildcardListeners.delete(handler);
    return this;
  }

  private addListener(event: string, handler: EventHandler, once: boolean): () => void {
    if (!this.listenerMap.has(event)) {
      this.listenerMap.set(event, new Set());
    }
    const set = this.listenerMap.get(event)!;
    if (set.size >= this.options.maxListeners && !this.maxListenersReached.has(event)) {
      console.warn(`Max listeners (${this.options.maxListeners}) reached for event "${event}"`);
      this.maxListenersReached.add(event);
    }
    const listener: EventListener = { event, handler, once };
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listenerMap.delete(event);
      }
      this.maxListenersReached.delete(event);
    };
  }

  listenerCount<K extends keyof Events>(event: K): number {
    return this.listenerMap.get(event as string)?.size ?? 0;
  }

  getTotalListenerCount(): number {
    let count = 0;
    for (const set of this.listenerMap.values()) {
      count += set.size;
    }
    return count;
  }

  eventNames(): string[] {
    return [...this.listenerMap.keys()];
  }

  hasListeners<K extends keyof Events>(event: K): boolean {
    return this.listenerCount(event) > 0;
  }

  hasAnyListeners(): boolean {
    return this.getTotalListenerCount() > 0 || this.wildcardListeners.size > 0;
  }

  setMaxListeners(max: number): this {
    this.options.maxListeners = max;
    return this;
  }

  getMaxListeners(): number {
    return this.options.maxListeners;
  }

  prependListener<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    return this.addListener(event as string, handler, false);
  }

  prependOnceListener<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    return this.addListener(event as string, handler, true);
  }

  rawListeners<K extends keyof Events>(event: K): EventListener[] {
    return [...(this.listenerMap.get(event as string) ?? [])];
  }

  listeners<K extends keyof Events>(event: K): EventHandler[] {
    return this.rawListeners(event).map((l) => l.handler);
  }

  getWildcardListeners(): WildcardHandler[] {
    return [...this.wildcardListeners];
  }

  getWildcardListenerCount(): number {
    return this.wildcardListeners.size;
  }

  removeAllListeners<K extends keyof Events>(event?: K): this {
    if (event) {
      this.listenerMap.delete(event as string);
    } else {
      this.listenerMap.clear();
    }
    return this;
  }

  setOptions(options: Partial<EventEmitterOptions>): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  getOptions(): Required<EventEmitterOptions> {
    return { ...this.options };
  }

  waitFor<K extends keyof Events>(event: K, timeout?: number): Promise<Events[K]> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = timeout ? setTimeout(() => {
        if (!settled) {
          settled = true;
          this.off(event, handler);
          reject(new Error(`Event "${event as string}" timed out after ${timeout}ms`));
        }
      }, timeout) : null;
      const handler: EventHandler<Events[K]> = (payload) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          this.off(event, handler);
          resolve(payload);
        }
      };
      this.on(event, handler);
    });
  }

  pipe<OtherEvents extends Record<string, any>>(target: TypedEventEmitter<OtherEvents>, events?: string[]): () => void {
    const eventList = events ?? this.eventNames();
    const unsubs: Array<() => void> = [];
    for (const event of eventList) {
      const unsub = this.addListener(event, (payload) => {
        target.emit(event as keyof OtherEvents, payload as OtherEvents[keyof OtherEvents]);
      }, false);
      unsubs.push(unsub);
    }
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }

  filter<K extends keyof Events>(event: K, predicate: (payload: Events[K]) => boolean): TypedEventEmitter<Events> {
    const filtered = new TypedEventEmitter<Events>(this.options);
    this.on(event, (payload) => {
      if (predicate(payload)) {
        filtered.emit(event, payload);
      }
    });
    return filtered;
  }

  map<K extends keyof Events, K2 extends string, V2>(event: K, mapper: (payload: Events[K]) => { event: K2; payload: V2 }): TypedEventEmitter<Record<string, any>> {
    const mapped = new TypedEventEmitter<Record<string, any>>(this.options);
    this.on(event, (payload) => {
      const result = mapper(payload);
      mapped.emit(result.event, result.payload);
    });
    return mapped;
  }

  reduce<K extends keyof Events, R>(event: K, reducer: (acc: R, payload: Events[K]) => R, initial: R): { get: () => R; dispose: () => void } {
    let acc = initial;
    const unsub = this.on(event, (payload) => {
      acc = reducer(acc, payload);
    });
    return {
      get: () => acc,
      dispose: unsub,
    };
  }

  debounce<K extends keyof Events>(event: K, delay: number): TypedEventEmitter<Events> {
    const debounced = new TypedEventEmitter<Events>(this.options);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastPayload: Events[K];
    this.on(event, (payload) => {
      lastPayload = payload;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        debounced.emit(event, lastPayload);
        timer = null;
      }, delay);
    });
    return debounced;
  }

  throttle<K extends keyof Events>(event: K, delay: number): TypedEventEmitter<Events> {
    const throttled = new TypedEventEmitter<Events>(this.options);
    let lastCall = 0;
    let lastPayload: Events[K];
    let timer: ReturnType<typeof setTimeout> | null = null;
    this.on(event, (payload) => {
      lastPayload = payload;
      const now = Date.now();
      const remaining = delay - (now - lastCall);
      if (remaining <= 0) {
        lastCall = now;
        throttled.emit(event, lastPayload);
      } else if (!timer) {
        timer = setTimeout(() => {
          lastCall = Date.now();
          throttled.emit(event, lastPayload);
          timer = null;
        }, remaining);
      }
    });
    return throttled;
  }

  take<K extends keyof Events>(event: K, count: number): TypedEventEmitter<Events> {
    const taken = new TypedEventEmitter<Events>(this.options);
    let remaining = count;
    const unsub = this.on(event, (payload) => {
      if (remaining > 0) {
        taken.emit(event, payload);
        remaining--;
        if (remaining === 0) {
          unsub();
        }
      }
    });
    return taken;
  }

  takeUntil<K extends keyof Events>(event: K, stopEvent: string): TypedEventEmitter<Events> {
    const taken = new TypedEventEmitter<Events>(this.options);
    const unsub1 = this.on(event, (payload) => {
      taken.emit(event, payload);
    });
    const unsub2 = this.on(stopEvent as keyof Events, () => {
      unsub1();
      unsub2();
    });
    return taken;
  }

  buffer<K extends keyof Events>(event: K, size: number): { flush: () => void; get: () => Events[K][]; clear: () => void } {
    const buffer: Events[K][] = [];
    const unsub = this.on(event, (payload) => {
      buffer.push(payload);
      if (buffer.length >= size) {
        buffer.shift();
      }
    });
    return {
      flush: () => {
        unsub();
      },
      get: () => [...buffer],
      clear: () => {
        buffer.length = 0;
      },
    };
  }

  window<K extends keyof Events>(event: K, timeMs: number): TypedEventEmitter<Events> {
    const windowed = new TypedEventEmitter<Events>(this.options);
    let buffer: Events[K][] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    this.on(event, (payload) => {
      buffer.push(payload);
      if (!timer) {
        timer = setTimeout(() => {
          for (const p of buffer) {
            windowed.emit(event, p);
          }
          buffer = [];
          timer = null;
        }, timeMs);
      }
    });
    return windowed;
  }

  toJSON(): string {
    return JSON.stringify({
      events: this.eventNames(),
      totalListeners: this.getTotalListenerCount(),
      wildcardListeners: this.wildcardListeners.size,
      maxListeners: this.options.maxListeners,
    }, null, 2);
  }
}

export function createEventEmitter<Events extends Record<string, any> = Record<string, any>>(options?: EventEmitterOptions): TypedEventEmitter<Events> {
  return new TypedEventEmitter<Events>(options);
}

export class PromiseQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing: boolean = false;
  private concurrency: number;
  private active: number = 0;
  private completed: number = 0;
  private failed: number = 0;
  private paused: boolean = false;

  constructor(concurrency: number = 1) {
    this.concurrency = concurrency;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrapped = async () => {
        try {
          const result = await fn();
          this.completed++;
          resolve(result);
        } catch (error) {
          this.failed++;
          reject(error);
        } finally {
          this.active--;
          this.process();
        }
      };
      this.queue.push(wrapped);
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing || this.paused) return;
    this.processing = true;
    while (this.queue.length > 0 && this.active < this.concurrency) {
      const fn = this.queue.shift()!;
      this.active++;
      fn();
    }
    this.processing = false;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.process();
  }

  isPaused(): boolean {
    return this.paused;
  }

  size(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.active;
  }

  getCompletedCount(): number {
    return this.completed;
  }

  getFailedCount(): number {
    return this.failed;
  }

  getConcurrency(): number {
    return this.concurrency;
  }

  setConcurrency(concurrency: number): void {
    this.concurrency = concurrency;
    this.process();
  }

  clear(): void {
    this.queue = [];
  }

  isIdle(): boolean {
    return this.queue.length === 0 && this.active === 0;
  }

  isProcessing(): boolean {
    return this.active > 0;
  }

  async drain(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.isIdle()) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }

  getStats(): { queued: number; active: number; completed: number; failed: number; concurrency: number } {
    return {
      queued: this.queue.length,
      active: this.active,
      completed: this.completed,
      failed: this.failed,
      concurrency: this.concurrency,
    };
  }
}

export function createPromiseQueue(concurrency?: number): PromiseQueue {
  return new PromiseQueue(concurrency);
}

export function memoize<T extends (...args: any[]) => any>(fn: T, options: { maxCacheSize?: number; ttl?: number; keyGenerator?: (...args: Parameters<T>) => string } = {}): T & { cache: Map<string, { value: ReturnType<T>; timestamp: number }>; clear: () => void; size: () => number } {
  const cache = new Map<string, { value: ReturnType<T>; timestamp: number }>();
  const maxCacheSize = options.maxCacheSize ?? 100;
  const ttl = options.ttl ?? 0;
  const keyGenerator = options.keyGenerator ?? ((...args: any[]) => JSON.stringify(args));
  const memoized = ((...args: any[]) => {
    const key = (keyGenerator as any)(...args);
    const cached = cache.get(key);
    if (cached) {
      if (ttl === 0 || Date.now() - cached.timestamp < ttl) {
        return cached.value;
      }
      cache.delete(key);
    }
    const result = fn(...args);
    cache.set(key, { value: result, timestamp: Date.now() });
    if (cache.size > maxCacheSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    return result;
  }) as T & { cache: typeof cache; clear: () => void; size: () => number };
  memoized.cache = cache;
  memoized.clear = () => cache.clear();
  memoized.size = () => cache.size;
  return memoized;
}

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number = 300): T & { cancel: () => void; flush: () => void; pending: () => boolean } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[];
  const debounced = ((...args: any[]) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...lastArgs);
    }, delay);
  }) as T & { cancel: () => void; flush: () => void; pending: () => boolean };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      fn(...lastArgs);
    }
  };
  debounced.pending = () => timer !== null;
  return debounced;
}

export function throttle<T extends (...args: any[]) => any>(fn: T, delay: number = 300): T & { cancel: () => void; flush: () => void } {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[];
  const throttled = ((...args: any[]) => {
    lastArgs = args;
    const now = Date.now();
    const remaining = delay - (now - lastCall);
    if (remaining <= 0) {
      lastCall = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now();
        timer = null;
        fn(...lastArgs);
      }, remaining);
    }
  }) as T & { cancel: () => void; flush: () => void };
  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      fn(...lastArgs);
    }
  };
  return throttled;
}

export function curry<T extends (...args: any[]) => any>(fn: T): (...args: any[]) => any {
  const arity = fn.length;
  const curried = (...args: any[]): any => {
    if (args.length >= arity) {
      return fn(...args);
    }
    return (...next: any[]) => curried(...args, ...next);
  };
  return curried;
}

export function partial<T extends (...args: any[]) => any>(fn: T, ...presetArgs: any[]): (...args: any[]) => ReturnType<T> {
  return (...args: any[]) => fn(...presetArgs, ...args);
}

export function compose<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduceRight((acc, fn) => fn(acc), arg);
}

export function pipe<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduce((acc, fn) => fn(acc), arg);
}

export function once<T extends (...args: any[]) => any>(fn: T): T & { reset: () => void } {
  let called = false;
  let result: ReturnType<T>;
  const onced = ((...args: any[]) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  }) as T & { reset: () => void };
  onced.reset = () => {
    called = false;
  };
  return onced;
}

export function after<T extends (...args: any[]) => any>(count: number, fn: T): T {
  let calls = 0;
  return ((...args: any[]) => {
    calls++;
    if (calls >= count) {
      return fn(...args);
    }
    return undefined;
  }) as T;
}

export function before<T extends (...args: any[]) => any>(count: number, fn: T): T {
  let calls = 0;
  return ((...args: any[]) => {
    calls++;
    if (calls < count) {
      return fn(...args);
    }
    return undefined;
  }) as T;
}

export function wrap<T extends (...args: any[]) => any>(fn: T, wrapper: (fn: T, ...args: any[]) => any): T {
  return ((...args: any[]) => wrapper(fn, ...args)) as T;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function timeout<T>(promise: Promise<T>, ms: number, message: string = "Timeout"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then((result) => {
      clearTimeout(timer);
      resolve(result);
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function retry<T>(fn: () => Promise<T>, options: { retries?: number; delay?: number; backoff?: number; maxDelay?: number } = {}): Promise<T> {
  const { retries = 3, delay: initialDelay = 1000, backoff = 2, maxDelay = 30000 } = options;
  let attempt = 0;
  let currentDelay = initialDelay;
  const execute = async (): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * backoff, maxDelay);
      return execute();
    }
  };
  return execute();
}

export function withRetry<T extends (...args: any[]) => Promise<any>>(fn: T, options?: { retries?: number; delay?: number; backoff?: number; maxDelay?: number }): T {
  return ((...args: any[]) => retry(() => fn(...args), options)) as T;
}

export function promisify<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => Promise<any> {
  return (...args: Parameters<T>) => {
    return new Promise((resolve, reject) => {
      fn(...args, (error: Error | null, result?: any) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  };
}

export function promisifyAll<T extends Record<string, any>>(obj: T): T & Record<`async${string}`, (...args: any[]) => Promise<any>> {
  const result: any = { ...obj };
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "function") {
      const asyncKey = `async${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      result[asyncKey] = promisify(obj[key].bind(obj));
    }
  }
  return result;
}

export function attempt<T>(fn: () => T): { success: boolean; value?: T; error?: Error } {
  try {
    return { success: true, value: fn() };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

export function attemptAsync<T>(fn: () => Promise<T>): Promise<{ success: boolean; value?: T; error?: Error }> {
  return fn()
    .then((value) => ({ success: true, value }))
    .catch((error) => ({ success: false, error: error as Error }));
}

export class PubSub<Events extends Record<string, any> = Record<string, any>> {
  private emitter: TypedEventEmitter<Events>;

  constructor() {
    this.emitter = new TypedEventEmitter<Events>();
  }

  publish<K extends keyof Events>(event: K, payload: Events[K]): boolean {
    return this.emitter.emit(event, payload);
  }

  subscribe<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    return this.emitter.on(event, handler);
  }

  subscribeOnce<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    return this.emitter.once(event, handler);
  }

  unsubscribe<K extends keyof Events>(event: K, handler?: EventHandler<Events[K]>): this {
    this.emitter.off(event, handler);
    return this;
  }

  subscriberCount<K extends keyof Events>(event: K): number {
    return this.emitter.listenerCount(event);
  }

  hasSubscribers<K extends keyof Events>(event: K): boolean {
    return this.emitter.hasListeners(event);
  }

  clear(): void {
    this.emitter.offAll();
  }

  getEmitter(): TypedEventEmitter<Events> {
    return this.emitter;
  }
}

export function createPubSub<Events extends Record<string, any> = Record<string, any>>(): PubSub<Events> {
  return new PubSub<Events>();
}

export class Observable<T> {
  private subscribers: Set<(value: T) => void> = new Set();
  private errorSubscribers: Set<(error: Error) => void> = new Set();
  private completeSubscribers: Set<() => void> = new Set();
  private isComplete: boolean = false;
  private hasError: boolean = false;
  private lastValue: T | undefined;
  private hasValue: boolean = false;

  constructor(private producer: (observer: { next: (value: T) => void; error: (error: Error) => void; complete: () => void }) => () => void) {}

  subscribe(observer: { next?: (value: T) => void; error?: (error: Error) => void; complete?: () => void }): () => void {
    if (this.isComplete) {
      if (this.hasValue && observer.next) observer.next(this.lastValue!);
      if (observer.complete) observer.complete();
      return () => {};
    }
    if (this.hasError) {
      if (observer.error) observer.error(new Error("Observable already errored"));
      return () => {};
    }
    if (this.hasValue && observer.next) {
      observer.next(this.lastValue!);
    }
    if (observer.next) this.subscribers.add(observer.next);
    if (observer.error) this.errorSubscribers.add(observer.error);
    if (observer.complete) this.completeSubscribers.add(observer.complete);
    const teardown = this.producer({
      next: (value: T) => {
        this.lastValue = value;
        this.hasValue = true;
        this.subscribers.forEach((sub) => sub(value));
      },
      error: (error: Error) => {
        this.hasError = true;
        this.errorSubscribers.forEach((sub) => sub(error));
        this.subscribers.clear();
        this.errorSubscribers.clear();
        this.completeSubscribers.clear();
      },
      complete: () => {
        this.isComplete = true;
        this.completeSubscribers.forEach((sub) => sub());
        this.subscribers.clear();
        this.errorSubscribers.clear();
        this.completeSubscribers.clear();
      },
    });
    return () => {
      if (observer.next) this.subscribers.delete(observer.next);
      if (observer.error) this.errorSubscribers.delete(observer.error);
      if (observer.complete) this.completeSubscribers.delete(observer.complete);
      teardown();
    };
  }

  map<R>(mapper: (value: T) => R): Observable<R> {
    return new Observable<R>((observer) => {
      const unsub = this.subscribe({
        next: (value) => observer.next(mapper(value)),
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      });
      return unsub;
    });
  }

  filter(predicate: (value: T) => boolean): Observable<T> {
    return new Observable<T>((observer) => {
      const unsub = this.subscribe({
        next: (value) => {
          if (predicate(value)) observer.next(value);
        },
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      });
      return unsub;
    });
  }

  reduce<R>(reducer: (acc: R, value: T) => R, initial: R): Observable<R> {
    return new Observable<R>((observer) => {
      let acc = initial;
      const unsub = this.subscribe({
        next: (value) => {
          acc = reducer(acc, value);
        },
        error: (error) => observer.error(error),
        complete: () => {
          observer.next(acc);
          observer.complete();
        },
      });
      return unsub;
    });
  }

  take(count: number): Observable<T> {
    return new Observable<T>((observer) => {
      let taken = 0;
      const unsub = this.subscribe({
        next: (value) => {
          if (taken < count) {
            taken++;
            observer.next(value);
            if (taken >= count) {
              observer.complete();
            }
          }
        },
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      });
      return unsub;
    });
  }

  skip(count: number): Observable<T> {
    return new Observable<T>((observer) => {
      let skipped = 0;
      const unsub = this.subscribe({
        next: (value) => {
          if (skipped < count) {
            skipped++;
          } else {
            observer.next(value);
          }
        },
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      });
      return unsub;
    });
  }

  debounce(delay: number): Observable<T> {
    return new Observable<T>((observer) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let lastValue: T;
      const unsub = this.subscribe({
        next: (value) => {
          lastValue = value;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            observer.next(lastValue);
            timer = null;
          }, delay);
        },
        error: (error) => observer.error(error),
        complete: () => {
          if (timer) {
            clearTimeout(timer);
            observer.next(lastValue);
          }
          observer.complete();
        },
      });
      return unsub;
    });
  }

  throttle(delay: number): Observable<T> {
    return new Observable<T>((observer) => {
      let lastCall = 0;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let lastValue: T;
      const unsub = this.subscribe({
        next: (value) => {
          lastValue = value;
          const now = Date.now();
          const remaining = delay - (now - lastCall);
          if (remaining <= 0) {
            lastCall = now;
            observer.next(value);
          } else if (!timer) {
            timer = setTimeout(() => {
              lastCall = Date.now();
              timer = null;
              observer.next(lastValue);
            }, remaining);
          }
        },
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      });
      return unsub;
    });
  }

  distinctUntilChanged(compare?: (a: T, b: T) => boolean): Observable<T> {
    return new Observable<T>((observer) => {
      let lastValue: T;
      let hasLast = false;
      const unsub = this.subscribe({
        next: (value) => {
          if (!hasLast || (compare ? !compare(lastValue, value) : lastValue !== value)) {
            lastValue = value;
            hasLast = true;
            observer.next(value);
          }
        },
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      });
      return unsub;
    });
  }

  merge<R>(other: Observable<R>): Observable<T | R> {
    return new Observable<T | R>((observer) => {
      const unsub1 = this.subscribe({
        next: (value) => observer.next(value),
        error: (error) => observer.error(error),
        complete: () => {},
      });
      const unsub2 = other.subscribe({
        next: (value) => observer.next(value),
        error: (error) => observer.error(error),
        complete: () => {},
      });
      return () => {
        unsub1();
        unsub2();
      };
    });
  }

  combine<R>(other: Observable<R>): Observable<[T, R]> {
    return new Observable<[T, R]>((observer) => {
      let lastT: T;
      let lastR: R;
      let hasT = false;
      let hasR = false;
      const unsub1 = this.subscribe({
        next: (value) => {
          lastT = value;
          hasT = true;
          if (hasR) observer.next([lastT, lastR]);
        },
        error: (error) => observer.error(error),
        complete: () => {},
      });
      const unsub2 = other.subscribe({
        next: (value) => {
          lastR = value;
          hasR = true;
          if (hasT) observer.next([lastT, lastR]);
        },
        error: (error) => observer.error(error),
        complete: () => {},
      });
      return () => {
        unsub1();
        unsub2();
      };
    });
  }

  static from<T>(values: T[]): Observable<T> {
    return new Observable<T>((observer) => {
      for (const value of values) {
        observer.next(value);
      }
      observer.complete();
      return () => {};
    });
  }

  static interval(ms: number): Observable<number> {
    return new Observable<number>((observer) => {
      let count = 0;
      const timer = setInterval(() => {
        observer.next(count++);
      }, ms);
      return () => clearInterval(timer);
    });
  }

  static fromEvent(target: EventTarget, event: string): Observable<Event> {
    return new Observable<Event>((observer) => {
      const handler = (e: Event) => observer.next(e);
      target.addEventListener(event, handler);
      return () => target.removeEventListener(event, handler);
    });
  }

  static fromPromise<T>(promise: Promise<T>): Observable<T> {
    return new Observable<T>((observer) => {
      promise.then((value) => {
        observer.next(value);
        observer.complete();
      }).catch((error) => {
        observer.error(error);
      });
      return () => {};
    });
  }
}

export function createObservable<T>(producer: (observer: { next: (value: T) => void; error: (error: Error) => void; complete: () => void }) => () => void): Observable<T> {
  return new Observable(producer);
}

export class Subject<T> extends Observable<T> {
  private observers: Set<{ next?: (value: T) => void; error?: (error: Error) => void; complete?: () => void }> = new Set();

  constructor() {
    super((observer) => {
      this.observers.add(observer);
      return () => {
        this.observers.delete(observer);
      };
    });
  }

  next(value: T): void {
    this.observers.forEach((observer) => {
      observer.next?.(value);
    });
  }

  error(error: Error): void {
    this.observers.forEach((observer) => {
      observer.error?.(error);
    });
    this.observers.clear();
  }

  complete(): void {
    this.observers.forEach((observer) => {
      observer.complete?.();
    });
    this.observers.clear();
  }

  getObserverCount(): number {
    return this.observers.size;
  }

  hasObservers(): boolean {
    return this.observers.size > 0;
  }
}

export function createSubject<T>(): Subject<T> {
  return new Subject<T>();
}

export class BehaviorSubject<T> extends Subject<T> {
  private currentValue: T;

  constructor(initial: T) {
    super();
    this.currentValue = initial;
  }

  next(value: T): void {
    this.currentValue = value;
    super.next(value);
  }

  getValue(): T {
    return this.currentValue;
  }

  subscribe(observer: { next?: (value: T) => void; error?: (error: Error) => void; complete?: () => void }): () => void {
    if (observer.next) {
      observer.next(this.currentValue);
    }
    return super.subscribe(observer);
  }
}

export function createBehaviorSubject<T>(initial: T): BehaviorSubject<T> {
  return new BehaviorSubject<T>(initial);
}

export class ReplaySubject<T> extends Subject<T> {
  private bufferSize: number;
  private buffer: T[] = [];

  constructor(bufferSize: number = Infinity) {
    super();
    this.bufferSize = bufferSize;
  }

  next(value: T): void {
    this.buffer.push(value);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }
    super.next(value);
  }

  subscribe(observer: { next?: (value: T) => void; error?: (error: Error) => void; complete?: () => void }): () => void {
    for (const value of this.buffer) {
      observer.next?.(value);
    }
    return super.subscribe(observer);
  }

  getBufferSize(): number {
    return this.bufferSize;
  }

  getBuffer(): T[] {
    return [...this.buffer];
  }

  clearBuffer(): void {
    this.buffer = [];
  }
}

export function createReplaySubject<T>(bufferSize?: number): ReplaySubject<T> {
  return new ReplaySubject<T>(bufferSize);
}
