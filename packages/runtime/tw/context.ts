/**
 * Context -- lightweight context API for passing data through component tree.
 *
 * Simpler than provide/inject -- uses a flat map with hierarchical lookup.
 * Good for: themes, locale, current user, feature flags.
 *
 * Features:
 * - createContext() with default value
 * - useContext() to consume
 * - Provider components
 * - Reactive context values
 * - Context transformation (map/derive)
 * - Context validation
 */

import { signal, type Signal } from "./dependency-graph";

// --- Types ------------------------------------------------------------

export interface Context<T> {
  readonly key: string;
  readonly defaultValue: T | undefined;
  Provider: (props: { value: T; children: unknown }) => unknown;
}

export interface ContextEntry<T = unknown> {
  value: T;
  signal: Signal<T>;
}

// --- Context Registry ------------------------------------------------

const contextRegistry = new Map<string, ContextEntry>();
const contextStack: Array<Map<string, ContextEntry>> = [];

/**
 * Create a context with a default value.
 */
export function createContext<T>(defaultValue?: T): Context<T> {
  const key = `ctx-${contextRegistry.size + 1}-${Math.random().toString(36).substring(2, 8)}`;

  const context: Context<T> = {
    key,
    defaultValue,
    Provider: (props: { value: T; children: unknown }) => {
      setContextValue(key, props.value);
      return props.children;
    },
  };

  return context;
}

/**
 * Get the current value of a context.
 */
export function useContext<T>(context: Context<T>): T | undefined {
  // Search stack from top to bottom
  for (let i = contextStack.length - 1; i >= 0; i--) {
    const layer = contextStack[i];
    if (layer.has(context.key)) {
      const entry = layer.get(context.key)!;
      return entry.signal() as T;
    }
  }

  // Fall back to global registry
  if (contextRegistry.has(context.key)) {
    return contextRegistry.get(context.key)!.signal() as T;
  }

  return context.defaultValue;
}

/**
 * Get the reactive signal for a context (for watch/computed).
 */
export function useContextSignal<T>(context: Context<T>): Signal<T | undefined> {
  const getSignal = (): Signal<T | undefined> => {
    for (let i = contextStack.length - 1; i >= 0; i--) {
      const layer = contextStack[i];
      if (layer.has(context.key)) {
        return layer.get(context.key)!.signal as Signal<T | undefined>;
      }
    }
    if (contextRegistry.has(context.key)) {
      return contextRegistry.get(context.key)!.signal as Signal<T | undefined>;
    }
    return signal(context.defaultValue) as Signal<T | undefined>;
  };
  return getSignal();
}

/**
 * Set a context value (pushes a new scope).
 */
export function setContextValue<T>(key: string, value: T): void {
  if (contextStack.length === 0) {
    // Global scope
    contextRegistry.set(key, { value, signal: signal(value) });
  } else {
    contextStack[contextStack.length - 1].set(key, { value, signal: signal(value) });
  }
}

/**
 * Push a new context scope.
 */
export function pushContextScope(): Map<string, ContextEntry> {
  const scope = new Map<string, ContextEntry>();
  contextStack.push(scope);
  return scope;
}

/**
 * Pop the current context scope.
 */
export function popContextScope(): void {
  contextStack.pop();
}

/**
 * Run a function within a context scope.
 */
export function withContextScope<T>(fn: () => T): T {
  pushContextScope();
  try {
    return fn();
  } finally {
    popContextScope();
  }
}

/**
 * Provide a context value within a scope.
 */
export function provideContext<T>(context: Context<T>, value: T): void {
  setContextValue(context.key, value);
}

/**
 * Consume a context value (alias for useContext).
 */
export function consumeContext<T>(context: Context<T>): T | undefined {
  return useContext(context);
}

/**
 * Transform a context value.
 */
export function mapContext<T, R>(
  context: Context<T>,
  transform: (value: T | undefined) => R,
): R {
  return transform(useContext(context));
}

/**
 * Validate a context value.
 */
export function validateContext<T>(
  context: Context<T>,
  validator: (value: T | undefined) => boolean,
): boolean {
  return validator(useContext(context));
}

/**
 * Clear all context values (for testing).
 */
export function clearAllContexts(): void {
  contextRegistry.clear();
  contextStack.length = 0;
}
