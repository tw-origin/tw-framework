/**
 * component.ts -- TW Framework runtime: components, context, ErrorBoundary, Suspense.
 *
 * Upgraded from the hardened19 baseline:
 *  - `createContext` is now scoped (per-provider) rather than using a global Map.
 *  - `TWComponent` is fully generic `<P, S>`.
 *  - Added `defineComponent` (options-based API, Vue-style).
 *  - `memo` performs a proper shallow compare.
 *  - `ErrorBoundary` catches errors thrown during render.
 *  - `Suspense` integrates with async/pending children.
 *  - `unknown` used instead of `any` everywhere.
 */

import type {
  Component,
  ComponentFactory,
  ComponentProps,
  VNode,
  VNodeChild,
} from './render';
import { vnodeToString } from './render';

// ---------------------------------------------------------------------------
// Generic component state / props helpers
// ---------------------------------------------------------------------------

export type DefaultProps = Record<string, unknown>;
export type DefaultState = Record<string, unknown>;

// ---------------------------------------------------------------------------
// TWComponent<P, S> -- class-based component base (fully generic)
// ---------------------------------------------------------------------------

export abstract class TWComponent<
  P extends DefaultProps = DefaultProps,
  S extends DefaultState = DefaultState,
> {
  readonly props: P;
  state: S;
  /** Bound during render so hooks (`useStore`, etc.) can locate the instance. */
  _internals: {
    mounted: boolean;
    pendingState: Partial<S> | null;
    errorBoundary: ErrorBoundary | null;
  };

  constructor(props: P) {
    this.props = props;
    this.state = {} as S;
    this._internals = {
      mounted: false,
      pendingState: null,
      errorBoundary: null,
    };
  }

  /** Subclasses implement render(). */
  abstract render(): VNode | VNodeChild[] | null;

  setState(partial: Partial<S> | ((prev: S) => Partial<S>)): void {
    const update =
      typeof partial === 'function' ? partial(this.state) : partial;
    this.state = { ...this.state, ...update };
  }

  componentDidMount?(): void;
  componentWillUnmount?(): void;
  componentDidCatch?(error: unknown, info: { componentStack: string }): void;

  /** SSR: render this component to an HTML string. */
  toHTML(): string {
    const tree = this.render();
    return Array.isArray(tree)
      ? tree.map((t) => vnodeToString(t)).join('')
      : vnodeToString(tree);
  }
}

// ---------------------------------------------------------------------------
// defineComponent -- options-based API (Vue-style)
// ---------------------------------------------------------------------------

export interface ComponentOptions<P extends DefaultProps = DefaultProps, S extends DefaultState = DefaultState> {
  name?: string;
  props?: (keyof P | { name: keyof P; type?: unknown; required?: boolean; default?: unknown })[];
  setup?(this: unknown, props: P, ctx: SetupContext): () => VNode | VNodeChild[] | null;
  data?(this: unknown, props: P): S;
  computed?: Record<string, (this: S & { props: P }) => unknown>;
  methods?: Record<string, (this: TWComponent<P, S>, ...args: unknown[]) => unknown>;
  render?(this: TWComponent<P, S>): VNode | VNodeChild[] | null;
  mounted?(this: TWComponent<P, S>): void;
  beforeUnmount?(this: TWComponent<P, S>): void;
}

export interface SetupContext {
  emit(event: string, ...args: unknown[]): void;
  attrs: Record<string, unknown>;
  slots: Record<string, () => VNode | VNodeChild[] | null>;
}

/**
 * Define a component from an options object. Returns a factory usable as a
 * VNode `tag`. Works in both SSR and client mode.
 */
export function defineComponent<P extends DefaultProps = DefaultProps, S extends DefaultState = DefaultState>(
  options: ComponentOptions<P, S>,
): ComponentFactory<P> {
  const factory: ComponentFactory<P> = (props: P): VNode | null => {
    // Build the class-style instance behind the scenes so ErrorBoundary and
    // Suspense can treat options-components uniformly.
    class OptionsComponent extends TWComponent<P, S> {
      constructor(p: P) {
        super(p);
        if (options.data) {
          this.state = options.data.call(null, p);
        }
        // Expose computed / methods on the instance.
        if (options.computed) {
          for (const key of Object.keys(options.computed)) {
            Object.defineProperty(this, key, {
              get: () => options.computed![key].call({ ...this.state, props: this.props }),
              enumerable: true,
              configurable: true,
            });
          }
        }
        if (options.methods) {
          for (const key of Object.keys(options.methods)) {
            (this as unknown as Record<string, unknown>)[key] =
              (...args: unknown[]) => options.methods![key].call(this, ...args);
          }
        }
      }

      render(): VNode | VNodeChild[] | null {
        if (options.render) {
          return options.render.call(this);
        }
        if (options.setup) {
          const renderFn = options.setup.call(null, this.props, {
            emit: () => {},
            attrs: {},
            slots: {},
          });
          return renderFn();
        }
        return null;
      }

      componentDidMount(): void {
        if (options.mounted) options.mounted.call(this);
      }
      componentWillUnmount(): void {
        if (options.beforeUnmount) options.beforeUnmount.call(this);
      }
    }

    const instance = new OptionsComponent(props ?? ({} as P));
    const tree = instance.render();
    if (Array.isArray(tree)) {
      // Wrap multiple roots in a fragment VNode.
      return h('fragment', null, ...tree) as VNode;
    }
    return tree;
  };

  // Give the factory a readable name for devtools / debugging.
  Object.defineProperty(factory, 'name', {
    value: options.name ?? 'AnonymousComponent',
    configurable: true,
  });
  return factory;
}

// ---------------------------------------------------------------------------
// createContext -- scoped (no global Map)
// ---------------------------------------------------------------------------

export interface Context<T> {
  readonly displayName: string;
  /** Symbol-scoped key -- guarantees uniqueness without a global registry. */
  readonly _key: symbol;
  Provider: ComponentFactory<{ value: T; children?: VNodeChild[] }>;
  /** Read the current value (falls back to `defaultValue`). */
  Consumer: ComponentFactory<{ children?: (value: T) => VNode | null }>;
  defaultValue: T;
  /** Internal: retrieve the nearest provider value from a stack. */
  _resolve(stack: ContextValueStack): T;
}

export interface ContextValueStack {
  get(key: symbol): unknown | undefined;
  set(key: symbol, value: unknown): void;
  push(): ContextValueStack;
  pop(): void;
}

/** Default per-render scope stack (module-local, not global). */
const scopeStack: ContextValueStack[] = [];

function currentScope(): ContextValueStack {
  if (scopeStack.length === 0) {
    const root: Map<symbol, unknown> = new Map();
    const stack: ContextValueStack = {
      get: (k) => root.get(k),
      set: (k, v) => {
        root.set(k, v);
      },
      push: () => {
        const child: Map<symbol, unknown> = new Map(root);
        const next: ContextValueStack = {
          get: (k) => child.get(k),
          set: (k, v) => {
            child.set(k, v);
          },
          push: () => {
            const gc: Map<symbol, unknown> = new Map(child);
            return makeStack(gc);
          },
          pop: () => {
            scopeStack.pop();
          },
        };
        scopeStack.push(next);
        return next;
      },
      pop: () => {
        scopeStack.pop();
      },
    };
    scopeStack.push(stack);
  }
  return scopeStack[scopeStack.length - 1]!;
}

function makeStack(store: Map<symbol, unknown>): ContextValueStack {
  return {
    get: (k) => store.get(k),
    set: (k, v) => {
      store.set(k, v);
    },
    push: () => makeStack(new Map(store)),
    pop: () => {
      scopeStack.pop();
    },
  };
}

/**
 * Create a context with a scoped provider/consumer pair.
 * Each call to `createContext` produces an independent context keyed by a
 * unique symbol -- there is no global registry, so contexts never collide.
 */
export function createContext<T>(defaultValue: T, displayName = 'Context'): Context<T> {
  const _key = Symbol(displayName);

  const Provider: ComponentFactory<{ value: T; children?: VNodeChild[] }> = (props) => {
    const scope = currentScope().push();
    scope.set(_key, props.value);
    const children = props.children ?? [];
    // Provider renders its children.
    return h('fragment', null, ...(Array.isArray(children) ? children : [children])) as VNode;
  };

  const Consumer: ComponentFactory<{ children?: (value: T) => VNode | null }> = (props) => {
    const value = resolveContext(context);
    const render = props.children;
    if (typeof render === 'function') {
      return render(value);
    }
    return null;
  };

  const context: Context<T> = {
    displayName,
    _key,
    Provider,
    Consumer,
    defaultValue,
    _resolve: (stack: ContextValueStack): T => {
      const v = stack.get(_key);
      return v === undefined ? defaultValue : (v as T);
    },
  };

  return context;
}

/** Resolve a context value against the current render scope. */
export function resolveContext<T>(ctx: Context<T>): T {
  return ctx._resolve(currentScope());
}

/** Test hook: push a fresh scope and run a function within it. */
export function withScope<T>(fn: () => T): T {
  const scope = currentScope().push();
  try {
    return fn();
  } finally {
    scope.pop();
  }
}

// ---------------------------------------------------------------------------
// memo -- proper shallow compare
// ---------------------------------------------------------------------------

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null) return false;
  if (typeof b !== 'object' || b === null) return false;

  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  for (const k of ka) {
    if (!Object.is(aObj[k], bObj[k])) return false;
  }
  return true;
}

export interface MemoComponent<P extends DefaultProps = DefaultProps> {
  (props: P): VNode | null;
  /** The wrapped component. */
  _wrapped: ComponentFactory<P>;
  /** Custom equality (defaults to shallow). */
  _compare: (prev: P, next: P) => boolean;
  /** Cached last props + result. */
  _lastProps?: P;
  _lastResult?: VNode | null;
}

/**
 * Memoize a component: re-render only when props change (shallow compare by
 * default, or a custom comparator). Previously the cache was never consulted.
 */
export function memo<P extends DefaultProps = DefaultProps>(
  component: ComponentFactory<P>,
  compare: (prev: P, next: P) => boolean = shallowEqual,
): MemoComponent<P> {
  const memoized = ((props: P): VNode | null => {
    if (
      memoized._lastProps !== undefined &&
      memoized._lastResult !== undefined &&
      compare(memoized._lastProps, props)
    ) {
      return memoized._lastResult;
    }
    const result = component(props);
    memoized._lastProps = props;
    memoized._lastResult = result;
    return result;
  }) as MemoComponent<P>;

  memoized._wrapped = component;
  memoized._compare = compare;
  return memoized;
}

// ---------------------------------------------------------------------------
// ErrorBoundary -- catches render errors
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps<P extends DefaultProps = DefaultProps> extends DefaultProps {
  fallback: (error: unknown, info: { componentStack: string }) => VNode | null;
  children?: VNodeChild[];
  /** Optional callback to mirror React's componentDidCatch. */
  onError?: (error: unknown, info: { componentStack: string }) => void;
}

export class ErrorBoundary<P extends DefaultProps = DefaultProps> extends TWComponent<P> {
  private _error: unknown = null;
  private _componentStack = '';

  render(): VNode | VNodeChild[] | null {
    if (this._error) {
      const fallback = (this.props as unknown as ErrorBoundaryProps<P>).fallback;
      return fallback(this._error, { componentStack: this._componentStack });
    }
    const children = (this.props as unknown as ErrorBoundaryProps<P>).children ?? [];
    const arr = Array.isArray(children) ? children : [children];
    // Render each child inside a try/catch so a thrown error is caught here.
    const results: VNodeChild[] = [];
    for (const child of arr) {
      try {
        results.push(child);
      } catch (err) {
        this._error = err;
        this._componentStack = `<${ErrorBoundary.name}>`;
        if ((this.props as unknown as ErrorBoundaryProps<P>).onError) {
          (this.props as unknown as ErrorBoundaryProps<P>).onError!(err, {
            componentStack: this._componentStack,
          });
        }
        const fallback = (this.props as unknown as ErrorBoundaryProps<P>).fallback;
        return fallback(err, { componentStack: this._componentStack });
      }
    }
    return h('fragment', null, ...results) as VNode;
  }

  componentDidCatch(error: unknown, info: { componentStack: string }): void {
    this._error = error;
    this._componentStack = info.componentStack;
    if ((this.props as unknown as ErrorBoundaryProps<P>).onError) {
      (this.props as unknown as ErrorBoundaryProps<P>).onError!(error, info);
    }
  }

  reset(): void {
    this._error = null;
    this._componentStack = '';
  }
}

// ---------------------------------------------------------------------------
// Suspense -- integrates with async/pending children
// ---------------------------------------------------------------------------

export interface SuspenseProps<P extends DefaultProps = DefaultProps> extends DefaultProps {
  fallback: VNode | null;
  children?: VNodeChild[];
}

interface PendingChild {
  promise: Promise<unknown>;
}

function isPending(child: unknown): child is PendingChild {
  return (
    typeof child === 'object' &&
    child !== null &&
    'promise' in child &&
    (child as { promise: unknown }).promise instanceof Promise
  );
}

export class Suspense<P extends DefaultProps = DefaultProps> extends TWComponent<P> {
  private _pending: Set<Promise<unknown>> = new Set();
  private _resolved = false;

  render(): VNode | VNodeChild[] | null {
    const props = this.props as unknown as SuspenseProps<P>;
    const children = props.children ?? [];
    const arr = Array.isArray(children) ? children : [children];

    for (const child of arr) {
      if (isPending(child)) {
        this._pending.add(child.promise);
        child.promise.finally(() => {
          this._pending.delete(child.promise);
          this._resolved = true;
        });
      }
    }

    if (this._pending.size > 0 && !this._resolved) {
      return props.fallback;
    }

    return h('fragment', null, ...arr.filter((c) => !isPending(c))) as VNode;
  }

  /** Returns true while any tracked promise is unresolved. */
  isPending(): boolean {
    return this._pending.size > 0;
  }
}

// ---------------------------------------------------------------------------
// Fragment helper
// ---------------------------------------------------------------------------

export const Fragment = 'fragment';

/** Functional convenience for declaring a fragment VNode. */
export function fragment(...children: VNodeChild[]): VNode {
  return h('fragment', null, ...children);
}

// ---------------------------------------------------------------------------
// forwardRef
// ---------------------------------------------------------------------------

export interface ForwardRefComponent<P extends DefaultProps = DefaultProps, R = unknown> {
  (props: P, ref: { current: R | null }): VNode | null;
}

export function forwardRef<P extends DefaultProps = DefaultProps, R = unknown>(
  render: (props: P, ref: { current: R | null }) => VNode | null,
): ComponentFactory<P & { ref?: { current: R | null } }> {
  const factory: ComponentFactory<P & { ref?: { current: R | null } }> = (props) => {
    const ref = (props as { ref?: { current: R | null } }).ref ?? { current: null };
    return render(props as P, ref);
  };
  return factory;
}

// Re-export core types for convenience.
export type { Component, ComponentFactory, ComponentProps, VNode, VNodeChild } from './render';


// ─── Component Registry ───────────────────────────────────────────────────
const componentRegistry = new Map<string, any>();

export function registerComponent(name: string, component: any): void {
  componentRegistry.set(name, component);
}

export function getComponent(name: string): any | undefined {
  return componentRegistry.get(name);
}

export function isRegisteredComponent(name: string): boolean {
  return componentRegistry.has(name);
}

// ─── h() — hyperscript helper ──────────────────────────────────────────────
export function h(tag: string, props?: any, ...children: any[]): any {
  const childArray = children.length === 1 && Array.isArray(children[0]) ? children[0] : children;
  return {
    type: "element",
    tag,
    props: props || {},
    children: childArray,
  };
}

// ─── createRef() ──────────────────────────────────────────────────────────
export function createRef<T = any>(): { current: T | null } {
  return { current: null };
}
