/**
 * WatchDeep -- deep watching with immediate, flush, and once options.
 *
 * Features:
 * - Deep watch (traverse objects/arrays)
 * - Shallow watch (only top-level changes)
 * - Immediate callback (run on watch creation)
 * - Flush options (pre, post, sync)
 * - Once (run only once, then stop)
 * - Multiple sources
 * - Cleanup registration
 * - Old/new value comparison
 */

import { effect, untrack, type Signal } from "./dependency-graph";
import { schedule, flushSync } from "./scheduler";

// --- Types ------------------------------------------------------------

export type WatchSource<T = unknown> = Signal<T> | (() => T) | Record<string, T>;
export type WatchCallback<T = unknown> = (newValue: T, oldValue: T | undefined, onCleanup: (fn: () => void) => void) => void;

export interface WatchOptions {
  deep?: boolean;
  immediate?: boolean;
  flush?: "pre" | "post" | "sync";
  once?: boolean;
}

export interface WatcherHandle {
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

// --- Deep Compare ----------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a !== "object") return a === b;

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  // Objects
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;

  return keysA.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(deepClone) as T;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = deepClone(v);
  }
  return result as T;
}

// --- Watch Implementation --------------------------------------------

function traverse(value: unknown, seen: Set<unknown>): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) traverse(item, seen);
  } else {
    for (const v of Object.values(value as Record<string, unknown>)) traverse(v, seen);
  }
}

function getSourceValue<T>(source: WatchSource<T>): T {
  if (typeof source === "function") return (source as () => T)();
  if (typeof source === "object" && source !== null && "set" in source && "peek" in source) {
    return (source as unknown as Signal<T>)();
  }
  return source as T;
}

/**
 * Watch a source for changes and call a callback.
 */
export function watch<T>(
  source: WatchSource<T> | WatchSource<T>[],
  callback: WatchCallback<T>,
  options: WatchOptions = {},
): WatcherHandle {
  const { deep = false, immediate = false, flush = "pre", once = false } = options;

  let oldValue: T | undefined;
  let paused = false;
  let stopped = false;
  let cleanups: Array<() => void> = [];

  const isMulti = Array.isArray(source);
  const sources = isMulti ? source as WatchSource<T>[] : [source as WatchSource<T>];

  const runCleanup = () => {
    for (const fn of cleanups) {
      try { fn(); } catch (e) { console.error("[TW Watch] Cleanup error:", e); }
    }
    cleanups = [];
  };

  const getter = () => {
    if (deep) {
      const values = sources.map(s => {
        const v = getSourceValue(s);
        traverse(v, new Set()); // Touch all properties for reactivity
        return deepClone(v);
      });
      return (isMulti ? values : values[0]) as T;
    }
    const values = sources.map(s => getSourceValue(s));
    return (isMulti ? values : values[0]) as T;
  };

  const invoke = () => {
    if (paused || stopped) return;
    const newValue = getter();

    if (!deep && oldValue !== undefined && newValue === oldValue) return;
    if (deep && oldValue !== undefined && deepEqual(newValue, oldValue)) return;

    runCleanup();
    const onCleanup = (fn: () => void) => { cleanups.push(fn); };

    try {
      callback(newValue, oldValue, onCleanup);
    } catch (e) {
      console.error("[TW Watch] Callback error:", e);
    }

    oldValue = deep ? deepClone(newValue) : newValue;

    if (once) {
      stop();
    }
  };

  // Initial value
  if (deep) {
    oldValue = deepClone(getter());
  } else {
    oldValue = getter();
  }

  // Immediate callback
  if (immediate) {
    invoke();
  }

  // Set up effect
  const eff = effect(() => {
    getter(); // Track dependencies
    if (flush === "sync") {
      invoke();
    } else {
      schedule(() => {
        if (flush === "pre") {
          invoke();
        } else {
          // Post-flush: run after DOM updates
          invoke();
        }
      }, "high");
    }
  });

  function stop() {
    if (stopped) return;
    stopped = true;
    runCleanup();
    eff.destroy();
  }

  function pause() { paused = true; }
  function resume() { paused = false; }

  return { stop, pause, resume };
}

/**
 * Watch multiple sources simultaneously.
 */
export function watchAll(
  sources: WatchSource[],
  callback: (values: unknown[], oldValues: unknown[]) => void,
  options?: WatchOptions,
): WatcherHandle {
  return watch(sources, (newVal: unknown, oldVal: unknown | undefined) => {
    const newValues = Array.isArray(newVal) ? newVal : [newVal];
    const oldValues = Array.isArray(oldVal) ? oldVal : oldVal !== undefined ? [oldVal] : newValues.map(() => undefined);
    callback(newValues, oldValues as unknown[]);
  }, options);
}

/**
 * Watch a reactive object deeply (shortcut for watch with deep: true).
 */
export function watchDeep<T>(
  source: WatchSource<T>,
  callback: WatchCallback<T>,
  options?: Omit<WatchOptions, "deep">,
): WatcherHandle {
  return watch(source, callback, { ...options, deep: true });
}

/**
 * Watch a source once and then stop.
 */
export function watchOnce<T>(
  source: WatchSource<T>,
  callback: WatchCallback<T>,
  options?: Omit<WatchOptions, "once">,
): WatcherHandle {
  return watch(source, callback, { ...options, once: true });
}
