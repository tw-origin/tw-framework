/**
 * React-style hooks for TW components (strategies.state.model = "hooks").
 *
 * `runWithHooks(instance, fn)` marks a component render; inside it the usual
 * hooks are available and are keyed to that component instance, so calling
 * them in the same order every render behaves exactly as React's do.
 * Called outside a render they throw, the same way `useStore` does.
 */
import type { TWComponent } from "./component";

interface HookState {
  slots: unknown[];
  cursor: number;
  /** Effects queued this render; run after it commits. */
  pending: Array<() => void | (() => void)>;
  /** Cleanups from the previous render, keyed by slot. */
  cleanups: Map<number, () => void>;
}

const states = new WeakMap<object, HookState>();
let current: object | null = null;

function stateFor(instance: object): HookState {
  let st = states.get(instance);
  if (!st) { st = { slots: [], cursor: 0, pending: [], cleanups: new Map() }; states.set(instance, st); }
  return st;
}

function slot<T>(instance: object, init: () => T): { st: HookState; index: number; value: T } {
  const st = stateFor(instance);
  const index = st.cursor++;
  if (index >= st.slots.length) st.slots[index] = init();
  return { st, index, value: st.slots[index] as T };
}

function assertInRender(name: string): object {
  if (current === null) {
    throw new Error(`${name}() must be called inside a component render function.`);
  }
  return current;
}

/**
 * Mark a component render. Hooks called inside `fn` belong to `instance`;
 * effects queued during the render run when it returns.
 */
export function runWithHooks<T>(instance: object, fn: () => T, opts: { effects?: boolean } = {}): T {
  const prev = current;
  current = instance;
  const st = stateFor(instance);
  st.cursor = 0;
  st.pending = [];
  try {
    return fn();
  } finally {
    current = prev;
    // SSR must not run effects -- they belong to the browser. A client mount
    // passes { effects: true } (the default) so effects commit after render.
    if (opts.effects !== false) runEffects(instance);
  }
}

/** Run (and then clear) the effects queued by the last render of `instance`. */
export function runEffects(instance: object): void {
  const st = states.get(instance);
  if (!st || st.pending.length === 0) return;
  const queued = st.pending;
  st.pending = [];
  queued.forEach((effect, i) => {
    const prevCleanup = st.cleanups.get(i);
    if (prevCleanup) { try { prevCleanup(); } catch { /* a cleanup must not break the render */ } }
    const cleanup = effect();
    if (typeof cleanup === "function") st.cleanups.set(i, cleanup);
    else st.cleanups.delete(i);
  });
}

/** Run the cleanups for a component that is going away. */
export function disposeHooks(instance: object): void {
  const st = states.get(instance);
  if (!st) return;
  for (const cleanup of st.cleanups.values()) { try { cleanup(); } catch { /* ignore */ } }
  states.delete(instance);
}

export function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const instance = assertInRender("useState");
  const { value } = slot<T>(instance, () => (typeof initial === "function" ? (initial as () => T)() : initial));
  const set = (next: T | ((prev: T) => T)): void => {
    const st = stateFor(instance);
    const index = st.slots.indexOf(value);
    const resolved = typeof next === "function" ? (next as (p: T) => T)(st.slots[index] as T) : next;
    st.slots[index] = resolved;
    (instance as any).__twRerender?.();
  };
  return [value, set];
}

export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S,
): [S, (action: A) => void] {
  const instance = assertInRender("useReducer");
  const { value } = slot<S>(instance, () => initial);
  const dispatch = (action: A): void => {
    const st = stateFor(instance);
    const index = st.slots.indexOf(value);
    st.slots[index] = reducer(st.slots[index] as S, action);
    (instance as any).__twRerender?.();
  };
  return [value, dispatch];
}

export function useMemo<T>(factory: () => T, deps: unknown[]): T {
  const instance = assertInRender("useMemo");
  const st = stateFor(instance);
  const index = st.cursor++;
  const prev = st.slots[index] as { deps: unknown[]; value: T } | undefined;
  if (prev && sameDeps(prev.deps, deps)) return prev.value;
  const value = factory();
  st.slots[index] = { deps, value };
  return value;
}

export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: unknown[]): T {
  return useMemo(() => fn, deps);
}

export function useRef<T>(initial: T): { current: T } {
  const instance = assertInRender("useRef");
  const { value } = slot<{ current: T }>(instance, () => ({ current: initial }));
  return value;
}

export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void {
  const instance = assertInRender("useEffect");
  const st = stateFor(instance);
  const index = st.cursor++;
  const prev = st.slots[index] as unknown[] | undefined;
  const skip = deps !== undefined && prev !== undefined && sameDeps(prev, deps);
  st.slots[index] = deps ?? [];
  if (!skip) st.pending.push(effect);
}

export function useContext<T>(context: { _currentValue?: T; defaultValue?: T }): T {
  assertInRender("useContext");
  if (context && "_currentValue" in context) return (context as any)._currentValue as T;
  return (context as any).defaultValue as T;
}

function sameDeps(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

export type { TWComponent };
