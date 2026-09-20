/**
 * store.ts -- TW Framework runtime: reactive state management.
 *
 * Upgraded from the hardened19 baseline:
 *  - `defineStore` is fully generic with proper return-type inference.
 *  - `StoreContext` typing fixed (no `any` for `this` binding).
 *  - `useStore` / `useStoreAction` implemented as real hooks that throw when
 *    called outside a component render context.
 *  - `unknown` used instead of `any` everywhere.
 */

import { createContext, resolveContext, type Context } from './component';
import type { TWComponent } from './component';

// ---------------------------------------------------------------------------
// Core reactive primitives
// ---------------------------------------------------------------------------

export type Listener = () => void;
export type Unsubscribe = () => void;

export interface Subscription {
  unsubscribe: Unsubscribe;
}

/** Base reactive value: holds a value and notifies subscribers on change. */
export class ReactiveValue<T> {
  private _value: T;
  private _listeners: Set<Listener> = new Set();

  constructor(initial: T) {
    this._value = initial;
  }

  get value(): T {
    return this._value;
  }

  set(next: T): void {
    if (Object.is(this._value, next)) return;
    this._value = next;
    this._notify();
  }

  update(updater: (prev: T) => T): void {
    this.set(updater(this._value));
  }

  subscribe(listener: Listener): Unsubscribe {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private _notify(): void {
    for (const l of this._listeners) {
      try {
        l();
      } catch {
        // A failing listener should not break other subscribers.
      }
    }
  }
}

/** Read-only view of a reactive value (computed). */
export type ComputedValue<T> = Readonly<ReactiveValue<T>>;

export function computed<T>(deps: ReactiveValue<unknown>[], fn: () => T): ComputedValue<T> {
  const rv = new ReactiveValue<T>(fn());
  for (const dep of deps) {
    dep.subscribe(() => rv.update(fn));
  }
  return rv;
}

// ---------------------------------------------------------------------------
// Store definition (Pinia/Vue-style with full type inference)
// ---------------------------------------------------------------------------

/** Helpers used inside a store's setup function. */
export interface StoreContext {
  readonly state: Record<string, unknown>;
  /** Read-only accessor for a reactive value created via `ref()`. */
  readonly: <T>(rv: ReactiveValue<T>) => T;
  /** Subscribe to reactive changes; returns an unsubscribe fn. */
  watch: <T>(rv: ReactiveValue<T>, cb: (value: T) => void) => Unsubscribe;
  /** Emit a custom store event to listeners. */
  emit: (event: string, payload?: unknown) => void;
  /** Subscribe to store events. */
  on: (event: string, cb: (payload: unknown) => void) => Unsubscribe;
}

/** A store's setup function returns state + getters + actions. */
export interface StoreDefinition<
  Id extends string = string,
  S extends Record<string, unknown> = Record<string, unknown>,
  G extends Record<string, unknown> = Record<string, unknown>,
  A extends Record<string, (...args: never[]) => unknown> = Record<string, (...args: never[]) => unknown>,
> {
  id: Id;
  state?: () => S;
  getters?: G;
  actions?: A;
}

/** A store instance, with state/getters flattened onto the result. */
export type StoreInstance<
  Id extends string,
  S extends Record<string, unknown>,
  G extends Record<string, unknown>,
  A extends Record<string, (...args: never[]) => unknown>,
> = {
  readonly $id: Id;
  readonly $state: S;
  $reset(): void;
  $subscribe(listener: Listener): Unsubscribe;
  $onAction(cb: (info: { name: string; args: unknown[] }) => void): Unsubscribe;
} & S &
  { [K in keyof G]: G[K] } &
  { [K in keyof A]: (...args: Parameters<A[K]>) => ReturnType<A[K]> };

/** Registry of active store instances (module-local, not global). */
const storeRegistry = new Map<string, StoreInstance<string, Record<string, unknown>, Record<string, unknown>, Record<string, (...args: never[]) => unknown>>>();

/**
 * Define a store with full type inference. The returned function, when called,
 * yields a fully-typed store instance whose state, getters, and actions are all
 * available directly as properties.
 */
export function defineStore<
  Id extends string,
  S extends Record<string, unknown> = Record<string, unknown>,
  G extends Record<string, unknown> = Record<string, unknown>,
  A extends Record<string, (...args: never[]) => unknown> = Record<string, (...args: never[]) => unknown>,
>(
  idOrDefinition: Id | StoreDefinition<Id, S, G, A>,
  maybeDefinition?: Omit<StoreDefinition<Id, S, G, A>, 'id'>,
): (() => StoreInstance<Id, S, G, A>) {
  // Support both `defineStore({ id, state, ... })` and the Pinia/Zustand-style
  // `defineStore(id, { state, ... })` calling conventions.
  let id: Id;
  let stateFn: (() => S) | undefined;
  let getters: G;
  let actions: A;
  if (typeof idOrDefinition === 'string') {
    id = idOrDefinition;
    stateFn = maybeDefinition?.state;
    getters = (maybeDefinition?.getters ?? {}) as G;
    actions = (maybeDefinition?.actions ?? {}) as A;
  } else {
    id = idOrDefinition.id;
    stateFn = idOrDefinition.state;
    getters = (idOrDefinition.getters ?? {}) as G;
    actions = (idOrDefinition.actions ?? {}) as A;
  }

  const useStore = (): StoreInstance<Id, S, G, A> => {
    const existing = storeRegistry.get(id);
    if (existing) {
      return existing as unknown as StoreInstance<Id, S, G, A>;
    }

    // --- state ---
    const initialState = (stateFn ? stateFn() : {}) as S;
    const reactiveState: Record<string, ReactiveValue<unknown>> = {};
    for (const key of Object.keys(initialState)) {
      reactiveState[key] = new ReactiveValue(initialState[key]);
    }

    // --- getters (computed) ---
    const getterValues: Record<string, unknown> = {};
    const getterDeps: ReactiveValue<unknown>[] = Object.values(reactiveState);
    for (const key of Object.keys(getters)) {
      const getter = (getters as Record<string, () => unknown>)[key];
      getterValues[key] = computed(getterDeps, getter);
    }

    // --- listeners ---
    const subscribers = new Set<Listener>();
    const actionListeners = new Set<(info: { name: string; args: unknown[] }) => void>();
    const eventListeners = new Map<string, Set<(payload: unknown) => void>>();

    // --- actions (bound context) ---
    const ctx: StoreContext = {
      get state() {
        return reactiveState;
      },
      readonly: <T>(rv: ReactiveValue<T>): T => rv.value,
      watch: <T>(rv: ReactiveValue<T>, cb: (value: T) => void): Unsubscribe => rv.subscribe(() => cb(rv.value)),
      emit: (event: string, payload?: unknown) => {
        const set = eventListeners.get(event);
        if (set) for (const cb of set) cb(payload);
      },
      on: (event: string, cb: (payload: unknown) => void): Unsubscribe => {
        let set = eventListeners.get(event);
        if (!set) {
          set = new Set();
          eventListeners.set(event, set);
        }
        set.add(cb);
        return () => set!.delete(cb);
      },
    };

    // Mutable state proxy: lets actions mutate state directly via
    // `(state) => { state.count++ }`-style handlers while still routing
    // reads/writes through the reactive values (so subscribers fire).
    const stateProxy = new Proxy({} as S, {
      get(_target, prop: string) {
        return reactiveState[prop]?.value;
      },
      set(_target, prop: string, value: unknown) {
        if (reactiveState[prop]) {
          reactiveState[prop]!.set(value);
        } else {
          reactiveState[prop] = new ReactiveValue(value);
        }
        return true;
      },
    }) as S;

    const boundActions: Record<string, (...args: unknown[]) => unknown> = {};
    for (const key of Object.keys(actions)) {
      const fn = (actions as unknown as Record<string, (this: StoreContext, ...args: unknown[]) => unknown>)[key];
      boundActions[key] = (...args: unknown[]) => {
        actionListeners.forEach((cb) => cb({ name: key, args }));
        return fn.call(ctx, stateProxy, ...args);
      };
    }

    // --- subscribe to all reactive values ---
    for (const rv of Object.values(reactiveState)) {
      rv.subscribe(() => {
        subscribers.forEach((l) => l());
      });
    }

    // --- build the instance object ---
    const instance = {
      $id: id,
      $state: initialState,
      $reset: () => {
        const fresh = (stateFn ? stateFn() : {}) as S;
        for (const key of Object.keys(fresh)) {
          reactiveState[key]?.set(fresh[key]);
        }
      },
      $subscribe: (listener: Listener): Unsubscribe => {
        subscribers.add(listener);
        return () => subscribers.delete(listener);
      },
      $onAction: (cb: (info: { name: string; args: unknown[] }) => void): Unsubscribe => {
        actionListeners.add(cb);
        return () => actionListeners.delete(cb);
      },
    } as StoreInstance<Id, S, G, A>;

    // Flatten state (proxied to reactive values) onto instance.
    for (const key of Object.keys(reactiveState)) {
      Object.defineProperty(instance, key, {
        get: () => reactiveState[key]!.value,
        set: (v: unknown) => reactiveState[key]!.set(v),
        enumerable: true,
        configurable: true,
      });
    }
    // Flatten getters.
    for (const key of Object.keys(getterValues)) {
      Object.defineProperty(instance, key, {
        get: () => (getterValues[key] as ComputedValue<unknown>).value,
        enumerable: true,
        configurable: true,
      });
    }
    // Flatten actions.
    for (const key of Object.keys(boundActions)) {
      Object.defineProperty(instance, key, {
        value: (...args: unknown[]) => boundActions[key](...args),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }

    storeRegistry.set(id, instance as unknown as StoreInstance<string, Record<string, unknown>, Record<string, unknown>, Record<string, (...args: never[]) => unknown>>);
    return instance;
  };

  return useStore;
}

/** Snapshot the current `$state` of every active store, keyed by store id. */
export function snapshotAllStores(): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, instance] of storeRegistry) {
    const snap: Record<string, unknown> = {};
    for (const key of Object.keys(instance.$state)) {
      snap[key] = (instance as unknown as Record<string, unknown>)[key];
    }
    out[id] = snap;
  }
  return out;
}

// ---------------------------------------------------------------------------
// StoreContext (context for providing a store via the component tree)
// ---------------------------------------------------------------------------

/** A context carrying a store instance down the component tree. */
export type StoreState = Record<string, unknown>;

export interface StoreSnapshot {
  name: string;
  state: Record<string, unknown>;
}

export interface StoreProviderContext<S extends Record<string, unknown> = Record<string, unknown>> {
  storeId: string;
  instance: StoreInstance<string, S, Record<string, unknown>, Record<string, (...args: never[]) => unknown>>;
}

const storeContextMap = new Map<string, Context<StoreProviderContext>>();

/**
 * Create (or fetch) a typed context for a given store id.
 * Replaces the old global `StoreContext` which had `any` for `this` binding.
 */

// ---------------------------------------------------------------------------
// Hooks: useStore / useStoreAction
// ---------------------------------------------------------------------------

/** Render-context sentinel: set when inside a component render, else null. */
let currentRenderingComponent: TWComponent | null = null;

/** Internal: mark the start/end of a component render. */
export function __setRenderingComponent(instance: TWComponent | null): void {
  currentRenderingComponent = instance;
}

function assertInComponent(hookName: string): void {
  if (currentRenderingComponent === null) {
    throw new Error(
      `${hookName}() must be called inside a component render function. ` +
        `It was called outside of any component's render context.`,
    );
  }
}

/**
 * Use a store inside a component. Returns the fully-typed store instance.
 * Throws if called outside a component render.
 */
export function useStore<
  Id extends string,
  S extends Record<string, unknown> = Record<string, unknown>,
  G extends Record<string, unknown> = Record<string, unknown>,
  A extends Record<string, (...args: never[]) => unknown> = Record<string, (...args: never[]) => unknown>,
>(useStoreFn: () => StoreInstance<Id, S, G, A>): StoreInstance<Id, S, G, A> {
  assertInComponent('useStore');
  return useStoreFn();
}

/**
 * Bind a store action for use inside a component, preserving its type.
 * Throws if called outside a component render.
 */
export function useStoreAction<
  Id extends string,
  S extends Record<string, unknown>,
  G extends Record<string, unknown>,
  A extends Record<string, (...args: never[]) => unknown>,
  K extends keyof A,
>(
  useStoreFn: () => StoreInstance<Id, S, G, A>,
  actionName: K,
): (...args: Parameters<A[K]>) => ReturnType<A[K]> {
  assertInComponent('useStoreAction');
  const store = useStoreFn();
  const action = store[actionName] as unknown as (...args: Parameters<A[K]>) => ReturnType<A[K]>;
  if (typeof action !== 'function') {
    throw new Error(`Action "${String(actionName)}" not found on store.`);
  }
  return action;
}

// ---------------------------------------------------------------------------
// createGlobalState -- standalone reactive singleton (no store ceremony)
// ---------------------------------------------------------------------------

export function createGlobalState<T>(initial: T): {
  get: () => T;
  set: (v: T) => void;
  subscribe: (listener: Listener) => Unsubscribe;
} {
  const rv = new ReactiveValue<T>(initial);
  return {
    get: () => rv.value,
    set: (v: T) => rv.set(v),
    subscribe: (listener: Listener) => rv.subscribe(listener),
  };
}

/** Type alias for the `StoreContext` interface (for consumers who want to
 *  distinguish it from the `StoreContext` factory function). */
export type StoreContextType = StoreContext;
