/**
 * Reactivity Dependency Graph -- fine-grained reactivity tracking.
 *
 * This is TW's answer to Vue 3's reactivity system and MobX.
 * It tracks which reactive properties are accessed inside which effects,
 * and only re-runs effects whose dependencies actually changed.
 *
 * Key concepts:
 * - Signal: A reactive value. Reading it inside an effect creates a dependency.
 * - Effect: A function that auto-re-runs when its dependencies change.
 * - Computed: A signal derived from other signals. Cached until deps change.
 * - Batch: Multiple signal updates -> one effect re-run.
 *
 * Why this is faster than React:
 * - No virtual DOM diff needed for state-driven updates
 * - Only the exact DOM nodes that depend on changed state are updated
 * - O(1) dependency tracking (just a Set add per read)
 * - Effects run synchronously (no async scheduling overhead for simple updates)
 *
 * Usage:
 *   const count = signal(0);
 *   const double = computed(() => count() * 2);
 *   effect(() => console.log("count is", count()));
 *   count.set(5); // logs "count is 5"
 */

// --- Types ------------------------------------------------------------

export interface Signal<T> {
  (): T;
  set(value: T): void;
  update(fn: (prev: T) => T): void;
  peek(): T;
}

export interface ComputedSignal<T> extends Signal<T> {
  readonly dependencies: Set<Signal<unknown>>;
}

export interface Effect {
  (): void;
  destroy(): void;
}

type Subscriber = () => void;

// --- Dependency Tracking ----------------------------------------------

let currentEffect: Subscriber | null = null;
let batchDepth = 0;
const batchedEffects = new Set<Subscriber>();

/**
 * Start a batch -- all signal updates inside are collected and run together.
 */
export function startBatch(): void {
  batchDepth++;
}

/**
 * End a batch -- run all collected effects.
 */
export function endBatch(): void {
  batchDepth--;
  if (batchDepth <= 0) {
    batchDepth = 0;
    const effects = Array.from(batchedEffects);
    batchedEffects.clear();
    for (const eff of effects) {
      try {
        eff();
      } catch (e) {
        console.error("[TW Reactivity] Batch effect error:", e);
      }
    }
  }
}

/**
 * Run a function in a batch.
 */
export function batch(fn: () => void): void {
  startBatch();
  try {
    fn();
  } finally {
    endBatch();
  }
}

// --- Signal Implementation -------------------------------------------

class SignalImpl<T> {
  private value: T;
  private subscribers = new Set<Subscriber>();
  private equals: (a: T, b: T) => boolean;

  constructor(value: T, equals?: (a: T, b: T) => boolean) {
    this.value = value;
    this.equals = equals || ((a, b) => a === b);
  }

  get(): T {
    // Track dependency
    if (currentEffect) {
      this.subscribers.add(currentEffect);
    }
    return this.value;
  }

  set(value: T): void {
    if (this.equals(this.value, value)) return;

    this.value = value;

    // Notify subscribers
    if (batchDepth > 0) {
      for (const sub of this.subscribers) {
        batchedEffects.add(sub);
      }
    } else {
      // Clone to avoid issues with modifications during iteration
      const subs = Array.from(this.subscribers);
      for (const sub of subs) {
        try {
          sub();
        } catch (e) {
          console.error("[TW Reactivity] Signal subscriber error:", e);
        }
      }
    }
  }

  update(fn: (prev: T) => T): void {
    this.set(fn(this.value));
  }

  peek(): T {
    // Read without tracking dependency
    return this.value;
  }

  unsubscribe(sub: Subscriber): void {
    this.subscribers.delete(sub);
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

/**
 * Create a reactive signal.
 *
 * Reading the signal inside an effect creates a dependency.
 * Setting the signal triggers all dependent effects.
 */
export function signal<T>(value: T, equals?: (a: T, b: T) => boolean): Signal<T> {
  const impl = new SignalImpl(value, equals);

  const getter = (() => impl.get()) as Signal<T>;
  getter.set = (v: T) => impl.set(v);
  getter.update = (fn: (prev: T) => T) => impl.update(fn);
  getter.peek = () => impl.peek();

  return getter;
}

// --- Computed Implementation -----------------------------------------

class ComputedImpl<T> {
  private cachedValue: T | undefined = undefined;
  private cached = false;
  private subscribers = new Set<Subscriber>();
  private deps = new Set<Signal<unknown>>();
  private fn: () => T;
  private equals: (a: T, b: T) => boolean;

  constructor(fn: () => T, equals?: (a: T, b: T) => boolean) {
    this.fn = fn;
    this.equals = equals || ((a, b) => a === b);
  }

  get(): T {
    if (!this.cached) {
      // Track dependencies of this computed
      const prevDeps = new Set(this.deps);
      this.deps.clear();

      const prevEffect = currentEffect;
      currentEffect = () => {
        this.cached = false;
        // Notify our subscribers
        this.notify();
      };

      // Track which signals this computed reads
      const trackSignal = (s: Signal<unknown>) => {
        this.deps.add(s);
      };

      try {
        this.cachedValue = this.fn();
        this.cached = true;
      } catch (e) {
        console.error("[TW Reactivity] Computed error:", e);
        this.cachedValue = undefined;
        this.cached = true;
      } finally {
        currentEffect = prevEffect;
      }

      // Subscribe to new deps
      for (const dep of this.deps) {
        if (!prevDeps.has(dep)) {
          // New dependency -- subscribe
          const depImpl = dep as unknown as { subscribers: Set<Subscriber> };
          if (depImpl.subscribers) {
            depImpl.subscribers.add(() => {
              this.cached = false;
              this.notify();
            });
          }
        }
      }
    }

    // Track this computed as a dependency of the current effect
    if (currentEffect) {
      this.subscribers.add(currentEffect);
    }

    return this.cachedValue as T;
  }

  private notify(): void {
    const subs = Array.from(this.subscribers);
    for (const sub of subs) {
      try {
        sub();
      } catch (e) {
        console.error("[TW Reactivity] Computed subscriber error:", e);
      }
    }
  }

  set(_value: T): void {
    throw new Error("Cannot set a computed signal");
  }

  update(_fn: (prev: T) => T): void {
    throw new Error("Cannot update a computed signal");
  }

  peek(): T {
    if (!this.cached) {
      return this.get();
    }
    return this.cachedValue as T;
  }

  get dependencies(): Set<Signal<unknown>> {
    return new Set(this.deps);
  }
}

/**
 * Create a computed signal -- a signal derived from other signals.
 * The value is cached and only recomputed when dependencies change.
 */
export function computed<T>(fn: () => T, equals?: (a: T, b: T) => boolean): ComputedSignal<T> {
  const impl = new ComputedImpl(fn, equals);

  const getter = (() => impl.get()) as ComputedSignal<T>;
  getter.set = (v: T) => impl.set(v);
  getter.update = (fn: (prev: T) => T) => impl.update(fn);
  getter.peek = () => impl.peek();
  Object.defineProperty(getter, "dependencies", {
    get: () => impl.dependencies,
  });

  return getter;
}

// --- Effect Implementation -------------------------------------------

/**
 * Create an effect that auto-re-runs when its dependencies change.
 */
export function effect(fn: Subscriber): Effect {
  let cleanup: (() => void) | null = null;
  let destroyed = false;

  const run = () => {
    if (destroyed) return;

    // Run cleanup from previous run
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        console.error("[TW Reactivity] Effect cleanup error:", e);
      }
      cleanup = null;
    }

    const prevEffect = currentEffect;
    currentEffect = run;

    try {
      const result = fn();
      if (typeof result === "function") {
        cleanup = result;
      }
    } catch (e) {
      console.error("[TW Reactivity] Effect error:", e);
    } finally {
      currentEffect = prevEffect;
    }
  };

  // Initial run
  run();

  const destroy = () => {
    destroyed = true;
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        console.error("[TW Reactivity] Effect destroy error:", e);
      }
    }
  };

  const eff = run as Effect;
  eff.destroy = destroy;
  return eff;
}

// --- Watch ------------------------------------------------------------

/**
 * Watch a signal or computed and call a callback when it changes.
 * Returns an unwatch function.
 */
export function watch<T>(
  source: Signal<T> | ComputedSignal<T>,
  callback: (newValue: T, oldValue: T) => void,
): () => void {
  let oldValue = source.peek();

  const eff = effect(() => {
    const newValue = source();
    if (newValue !== oldValue) {
      callback(newValue, oldValue);
      oldValue = newValue;
    }
  });

  return () => eff.destroy();
}

// --- WatchEffect (alias) ---------------------------------------------

/**
 * Alias for effect() -- matches Vue 3 API.
 */
export const watchEffect = effect;

// --- Reactive Object --------------------------------------------------

/**
 * Create a reactive object -- every property becomes a signal.
 * Reading/writing properties auto-tracks dependencies.
 *
 * Usage:
 *   const state = reactive({ count: 0, name: "TW" });
 *   effect(() => console.log(state.count));
 *   state.count = 5; // triggers effect
 */
export function reactive<T extends Record<string, unknown>>(obj: T): T {
  const signals = new Map<string, Signal<unknown>>();

  // Initialize signals for each property
  for (const key of Object.keys(obj)) {
    signals.set(key, signal(obj[key]));
  }

  const proxy = new Proxy(obj, {
    get(target, prop: string) {
      if (signals.has(prop)) {
        return (signals.get(prop) as Signal<unknown>)();
      }
      return target[prop as keyof T];
    },

    set(target, prop: string, value: unknown): boolean {
      if (signals.has(prop)) {
        (signals.get(prop) as Signal<unknown>).set(value);
      } else {
        signals.set(prop, signal(value));
      }
      target[prop as keyof T] = value as T[keyof T];
      return true;
    },

    has(target, prop: string): boolean {
      return signals.has(prop) || prop in target;
    },

    ownKeys(target): ArrayLike<string | symbol> {
      return Reflect.ownKeys(target);
    },

    getOwnPropertyDescriptor(target, prop: string) {
      if (signals.has(prop)) {
        return {
          enumerable: true,
          configurable: true,
          get() {
            return (signals.get(prop) as Signal<unknown>)();
          },
          set(value: unknown) {
            (signals.get(prop) as Signal<unknown>).set(value);
          },
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });

  return proxy;
}

// --- Ref -------------------------------------------------------------

/**
 * Create a ref -- like signal but with .value property.
 * Matches Vue 3 ref API.
 *
 * Usage:
 *   const count = ref(0);
 *   console.log(count.value); // 0
 *   count.value = 5;
 */
export function ref<T>(value: T): { value: T } {
  const s = signal(value);
  return {
    get value() {
      return s();
    },
    set value(v: T) {
      s.set(v);
    },
  };
}

// --- ToRef / ToRefs --------------------------------------------------

/**
 * Create a ref from a reactive object property.
 */
export function toRef<T extends Record<string, unknown>>(
  obj: T,
  key: keyof T,
): { value: T[keyof T] } {
  return {
    get value() {
      return obj[key];
    },
    set value(v: T[keyof T]) {
      obj[key] = v;
    },
  };
}

/**
 * Convert all properties of a reactive object to refs.
 */
export function toRefs<T extends Record<string, unknown>>(obj: T): { [K in keyof T]: { value: T[K] } } {
  const result = {} as { [K in keyof T]: { value: T[K] } };
  for (const key of Object.keys(obj) as Array<keyof T>) {
    result[key] = toRef(obj, key);
  }
  return result;
}

// --- Untrack ---------------------------------------------------------

/**
 * Run a function without tracking dependencies.
 */
export function untrack<T>(fn: () => T): T {
  const prev = currentEffect;
  currentEffect = null;
  try {
    return fn();
  } finally {
    currentEffect = prev;
  }
}

// --- OnCleanup --------------------------------------------------------

let currentCleanup: ((fn: () => void) => void) | null = null;

/**
 * Register a cleanup function for the current effect.
 * Must be called inside an effect.
 */
export function onCleanup(fn: () => void): void {
  if (currentCleanup) {
    currentCleanup(fn);
  }
}

// --- Debug Utilities -------------------------------------------------

/**
 * Get the number of subscribers for a signal.
 */
export function getSubscriberCount(s: Signal<unknown>): number {
  const impl = s as unknown as { subscriberCount?: number };
  return impl.subscriberCount || 0;
}

/**
 * Check if a value is a signal.
 */
export function isSignal(value: unknown): value is Signal<unknown> {
  return typeof value === "function" && "set" in value && "peek" in value;
}

/**
 * Check if a value is a computed signal.
 */
export function isComputed(value: unknown): value is ComputedSignal<unknown> {
  return isSignal(value) && "dependencies" in value;
}

// --- Scope -----------------------------------------------------------

/**
 * Create a reactive scope -- all effects created inside are tracked
 * and can be disposed together.
 */
export class ReactiveScope {
  private effects: Effect[] = [];

  run<T>(fn: () => T): T {
    const prevCleanup = currentCleanup;
    const collectedCleanups: Array<() => void> = [];

    currentCleanup = (cleanupFn: () => void) => {
      collectedCleanups.push(cleanupFn);
    };

    try {
      const result = fn();
      return result;
    } finally {
      currentCleanup = prevCleanup;
    }
  }

  track(eff: Effect): void {
    this.effects.push(eff);
  }

  dispose(): void {
    for (const eff of this.effects) {
      try {
        eff.destroy();
      } catch (e) {
        console.error("[TW Reactivity] Scope dispose error:", e);
      }
    }
    this.effects = [];
  }
}

/**
 * Create a reactive scope.
 */
export function createScope(): ReactiveScope {
  return new ReactiveScope();
}
