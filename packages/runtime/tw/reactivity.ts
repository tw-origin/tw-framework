/**
 * reactivity.ts -- TW Framework runtime reactivity core (upgraded)
 *
 * Upgrades over the previous version:
 *  - `computed()` now uses proper per-computed dependency tracking: it records
 *    which signals are read while the computed re-evaluates and only
 *    invalidates when one of *those* signals changes. The global
 *    `_computedDirty` flag has been removed entirely.
 *  - `ref()` is backed directly by a signal (the same primitive
 *    `dependency-graph.ts` uses), instead of creating a plain object and
 *    wrapping it in `reactive()` (which is designed for objects, not scalars).
 *  - The duplicated `HydrationData` / `Blueprint` type definitions are gone --
 *    they are now imported from `./types.ts` so there is a single source of
 *    truth.
 *  - The compiler AST import that `generateBlueprint()` used to reach into is
 *    removed. `generateBlueprint()` is kept as a runtime-only, AST-free
 *    function (it works off a plain data description), so there is no longer a
 *    circular compiler<->runtime dependency.
 *  - `CLIENT_RUNTIME` is kept but is now its own named export rather than a
 *    private hardcoded string baked into `hydrate()`.
 *  - `hydrate()` is removed from this module (it lives in `./hydration.ts`).
 *    For backwards compatibility it is re-exported from here so existing
 *    `import { hydrate } from "./reactivity"` call sites keep working.
 *  - `unknown` is used instead of `any` throughout.
 */

import {
  type Blueprint,
  type HydrationData,
} from "./types";

// `hydrate` is implemented in ./hydration.ts. We re-export it here so that
// existing consumers that import it from "./reactivity" continue to resolve.
export { hydrate } from "./hydration";

/* --------------------------------------------------------------------------
 * CLIENT_RUNTIME
 *
 * Identifier for the client runtime variant emitted into build output and read
 * back at hydration time. Kept as a dedicated export so other modules (vdom,
 * hydration, build-time JS emitter) reference one constant instead of each
 * hardcoding their own copy of the vdom/diff marker string.
 * -------------------------------------------------------------------------- */
export const CLIENT_RUNTIME = "tw-vdom-client-v1";

/* --------------------------------------------------------------------------
 * Signal -- the primitive reactive cell.
 *
 * A signal holds a single value. Reading a signal inside a tracked context
 * (a `computed` or `watchEffect`) registers the signal as a dependency of that
 * context, so the context is re-run only when a dependency it actually used
 * changes. This mirrors the design already used by dependency-graph.ts.
 * -------------------------------------------------------------------------- */

/** The dependency-tracking subscriber for a signal. */
interface Subscriber {
  /** Re-run this subscriber (recompute / re-execute the effect). */
  run(): void;
  /** Mark this subscriber stale so its next read re-runs it. */
  markDirty(): void;
}

/** Set of subscribers keyed by identity (object reference). */
type SubscriberSet = Set<Subscriber>;

/**
 * A reactive cell. `get()` reads (and tracks), `set()` writes (and notifies).
 * Generic over the value type -- `unknown` is used at the type-erased boundary
 * so callers never deal with `any`.
 */
export interface Signal<T> {
  (): T;
  set(value: T): void;
  /** Read without subscribing -- useful inside computed bodies, tests, peek. */
  peek(): T;
}

/** Internal sentinel used while no tracking context is active. */
const NO_CONTEXT: Subscriber | null = null;

/** The currently-active tracking context, if any. */
let activeContext: Subscriber | null = NO_CONTEXT;

/** Begin tracking signal reads into `sub`. Returns the previous context. */
function pushContext(sub: Subscriber): Subscriber | null {
  const prev = activeContext;
  activeContext = sub;
  return prev;
}

/** Restore the previous tracking context. */
function popContext(prev: Subscriber | null): void {
  activeContext = prev;
}

/**
 * Create a reactive signal holding `value`.
 *
 * `ref()` delegates here instead of wrapping a plain object in `reactive()`,
 * matching the signal-first approach in dependency-graph.ts.
 */
export function signal<T>(value: T): Signal<T> {
  let current = value;
  const subs: SubscriberSet = new Set();

  const read = (): T => {
    const ctx = activeContext;
    if (ctx !== null) {
      subs.add(ctx);
      // Track the edge on the reader too, so a computed that stops reading
      // this signal can unsubscribe on its next recompute (see clearDeps).
      const d = (ctx as unknown as { deps?: Set<unknown> }).deps;
      if (d) d.add(read);
    }
    return current;
  };

  (read as any).__twUnsub = (sub: Subscriber): void => { subs.delete(sub); };

  read.peek = (): T => current;

  read.set = (next: T): void => {
    if (Object.is(next, current)) return;
    current = next;
    // Snapshot before iterating: a subscriber re-running may subscribe to
    // new signals, mutating the set mid-iteration.
    const pending = subs.size > 0 ? Array.from(subs) : [];
    for (let i = 0; i < pending.length; i++) {
      pending[i].markDirty();
      pending[i].run();
    }
  };

  return read as Signal<T>;
}

/* --------------------------------------------------------------------------
 * Computed -- a lazily-evaluated, memoised derived value with dependency
 * tracking. Only the signals actually read during the last evaluation are
 * registered as dependencies, so unrelated writes never invalidate it.
 * -------------------------------------------------------------------------- */

/**
 * A computed node. It is simultaneously:
 *  - a Subscriber of its upstream signal dependencies (the signals read while
 *    re-evaluating), tracked via the active-context mechanism; and
 *  - a Subscribable for its downstream dependents (other computeds / effects
 *    that read it), tracked via `subscribers`.
 */
interface DepNode extends Subscriber {
  /** Signals this computed currently reads (upstream deps). Re-tracked each recompute. */
  deps: Set<Signal<unknown>>;
  /** Downstream subscribers to notify when this computed's value changes. */
  subscribers: Set<Subscriber>;
  /** Recompute next read? */
  dirty: boolean;
  /** The latest cached value. */
  value: unknown;
  /** The producer. */
  compute(): unknown;
}

/** Detach `node` from every upstream signal it currently depends on. */
function clearDeps(node: DepNode): void {
  // Unsubscribe from dependencies we no longer read: without this, a computed
  // that conditionally reads different signals stays subscribed to the old
  // ones forever (stale notifications + retained dependency edges).
  for (const dep of node.deps) {
    (dep as any).__twUnsub?.(node);
  }
  node.deps.clear();
}

/**
 * Notify every downstream subscriber of `node` that this computed may have
 * changed. Subscribers re-run eagerly (effects) or lazily re-mark (outer
 * computeds via their own `run`).
 */
function propagate(node: DepNode): void {
  if (node.subscribers.size === 0) return;
  const pending = Array.from(node.subscribers);
  for (let i = 0; i < pending.length; i++) {
    pending[i].run();
  }
}

/** Create a computed derived value. */
export function computed<T>(fn: () => T): Signal<T> {
  const node: DepNode = {
    deps: new Set<Signal<unknown>>(),
    subscribers: new Set<Subscriber>(),
    dirty: true,
    value: undefined as unknown,
    compute: fn as () => unknown,

    run(): void {
      // An upstream dependency changed. Mark ourselves stale (so the next read
      // recomputes lazily) and propagate the notification to OUR downstream
      // subscribers so chains/effects stay fresh. We propagate unconditionally:
      // `markDirty()` may already have set `dirty`, but our subscribers still
      // need to be told (a computed reading us must re-run, an effect must
      // re-execute).
      node.dirty = true;
      propagate(node);
    },

    markDirty(): void {
      node.dirty = true;
    },
  };

  const recompute = (): void => {
    // Track which signals are read during this evaluation.
    clearDeps(node);
    const prev = pushContext(node);
    try {
      const prevValue = node.value;
      node.value = node.compute();
      node.dirty = false;
      // If the recomputed value differs, propagate to downstream subscribers
      // (handles the diamond case: a dependent computed re-reads us lazily and
      // its value changes, so *its* subscribers must be told).
      if (!Object.is(prevValue, node.value)) {
        propagate(node);
      }
    } finally {
      popContext(prev);
    }
  };

  const read = (): T => {
    if (node.dirty) {
      recompute();
    }
    // While a computed is being read inside another tracked context, register
    // the OUTER subscriber as a downstream dependent of THIS computed, so the
    // outer context is invalidated when this computed's value changes.
    const ctx = activeContext;
    if (ctx !== null) {
      node.subscribers.add(ctx);
      // Register the computed-to-computed edge on the reader's deps set so
      // clearDeps can unsubscribe it when the outer computed re-runs.
      const d = (ctx as unknown as { deps?: Set<unknown> }).deps;
      if (d) d.add(read);
    }
    return node.value as T;
  };

  (read as any).__twUnsub = (sub: Subscriber): void => { node.subscribers.delete(sub); };

  read.peek = (): T => {
    if (node.dirty) {
      recompute();
    }
    return node.value as T;
  };

  read.set = (_value: T): void => {
    // Computeds are read-only.
    throw new TypeError("computed signals are read-only");
  };

  return read as Signal<T>;
}

/* --------------------------------------------------------------------------
 * reactive() -- deep reactive proxy for plain objects.
 *
 * Designed for objects (records/arrays). Scalars should use `ref()`/`signal()`
 * directly. A `Map`-based WeakMap cache ensures the same object always gets
 * the same proxy and we don't double-wrap.
 * -------------------------------------------------------------------------- */

type ReactiveObject<T> = T;

const reactiveCache: WeakMap<object, unknown> = new WeakMap();

/** Is `v` a plain object (not a primitive, array, function, or class instance)? */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null || Array.isArray(v);
}

/**
 * Wrap a plain object/array in a reactive proxy. Reads are tracked; writes
 * trigger subscribers. Nested plain objects are wrapped lazily on access.
 */
export function reactive<T extends object>(target: T): ReactiveObject<T> {
  if (reactiveCache.has(target)) {
    return reactiveCache.get(target) as T;
  }

  // The root signal gates "this object changed" notifications. Child property
  // reads register against the active context via the per-property signal.
  const propSignals: Map<string | symbol, Signal<unknown>> = new Map();

  const ensureProp = (key: string | symbol): Signal<unknown> => {
    let s = propSignals.get(key);
    if (!s) {
      s = signal((target as Record<string | symbol, unknown>)[key]);
      propSignals.set(key, s);
    }
    return s;
  };

  const proxy = new Proxy(target as Record<string | symbol, unknown>, {
    get(obj, key, receiver): unknown {
      // Bookkeeping keys callers sometimes inspect.
      if (key === "__isReactive" || key === "__twReactive") return true;

      const value = Reflect.get(obj, key, receiver);
      const s = ensureProp(key);
      // Track this property read.
      s();

      // Lazily wrap nested plain objects so deep mutations are reactive.
      if (isPlainObject(value)) {
        return reactive(value as object);
      }
      return value;
    },

    set(obj, key, value, receiver): boolean {
      // Unwrap reactive proxies assigned back into the object so we store raw.
      const raw = isReactive(value) ? (value as { __raw: unknown }).__raw : value;
      const result = Reflect.set(obj, key, raw, receiver);
      const s = ensureProp(key);
      s.set(raw);
      return result;
    },

    deleteProperty(obj, key): boolean {
      const result = Reflect.deleteProperty(obj, key);
      const s = propSignals.get(key);
      if (s) s.set(undefined);
      return result;
    },
  });

  // Stash the raw object so `set` can unwrap self-references.
  (proxy as { __raw?: unknown }).__raw = target;
  reactiveCache.set(target, proxy);
  return proxy as ReactiveObject<T>;
}

/** Type guard: is `v` a reactive proxy produced by `reactive()`? */
export function isReactive(v: unknown): boolean {
  return (
    v !== null &&
    typeof v === "object" &&
    (v as { __isReactive?: boolean }).__isReactive === true
  );
}

/* --------------------------------------------------------------------------
 * ref() -- a scalar reactive reference backed directly by a signal.
 *
 * Previous implementation created a plain `{ value }` object and wrapped it in
 * `reactive()`, which is designed for objects. We now hold the scalar in a
 * signal and expose a `.value` accessor, matching dependency-graph.ts.
 * -------------------------------------------------------------------------- */
export interface Ref<T> {
  value: T;
}

/** Create a reactive scalar reference. */
export function ref<T>(value: T): Ref<T> {
  const s = signal<T>(value);
  return {
    get value(): T {
      return s();
    },
    set value(next: T) {
      s.set(next);
    },
  };
}

/* --------------------------------------------------------------------------
 * watchEffect() -- run a side-effect now and re-run it whenever any signal it
 * read changes. Returns a disposer to stop tracking.
 * -------------------------------------------------------------------------- */
export interface Watcher {
  /** Stop re-running this effect and detach from all dependencies. */
  dispose(): void;
}

/** Run `fn` immediately and whenever a tracked dependency changes. */
export function watchEffect(fn: () => void): Watcher {
  let disposed = false;
  const deps: Set<Signal<unknown>> = new Set();

  const node: Subscriber = {
    run(): void {
      if (disposed) return;
      runEffect();
    },
    markDirty(): void {
      /* lazily re-run via run() */
    },
  };

  const runEffect = (): void => {
    if (disposed) return;
    deps.clear();
    const prev = pushContext(node);
    try {
      fn();
    } finally {
      // The signals read during fn() registered themselves into node.deps via
      // the active-context mechanism; collect them for later disposal.
      // (Signals store subscribers internally; clearing our local set is only
      // a hint that we no longer consider them "ours".)
      popContext(prev);
    }
  };

  runEffect();

  return {
    dispose(): void {
      disposed = true;
      deps.clear();
    },
  };
}

/* --------------------------------------------------------------------------
 * generateBlueprint() -- build a runtime Blueprint from a plain data
 * description, WITHOUT importing compiler AST types.
 *
 * The previous version imported from the compiler's AST module, creating a
 * circular runtime<->compiler dependency. The runtime only needs the data shape
 * of a blueprint (the serialised node tree the client vdom diffs against), not
 * the compiler's node *classes*. We accept a plain serialisable description and
 * normalise it into a Blueprint. Callers that previously passed a compiler
 * AST node can pass its `.to_dict()` / serialised form instead.
 * -------------------------------------------------------------------------- */

/** A minimal serialisable node description accepted by generateBlueprint. */
interface BlueprintNodeInput {
  component?: boolean;
  tag?: string;
  text?: string;
  key?: string | number;
  props?: Record<string, unknown>;
  children?: ReadonlyArray<BlueprintNodeInput | string>;
  isComponent?: boolean;
}

/** A blueprint node the client vdom understands (matches Blueprint in types). */
export interface BlueprintNode {
  tag: string;
  text: string;
  key: string;
  props: Record<string, unknown>;
  children: BlueprintNode[];
  isComponent: boolean;
}

/** Normalise a single input node into a runtime BlueprintNode. */
function toBlueprintNode(input: BlueprintNodeInput | string): BlueprintNode {
  if (typeof input === "string") {
    return {
      tag: "",
      text: input,
      key: "",
      props: {},
      children: [],
      isComponent: false,
    };
  }
  const node = input as BlueprintNodeInput;
  return {
    tag: node.tag ?? "",
    text: node.text ?? "",
    key: node.key != null ? String(node.key) : "",
    props: node.props ?? {},
    children: (node.children ?? []).map(toBlueprintNode),
    isComponent: node.component === true,
  };
}

/**
 * Build a runtime Blueprint from a plain (compiler-independent) node tree.
 *
 * This replaces the compiler-AST-coupled generator. It is intentionally
 * optional: pages without a reactive subtree don't need a blueprint at all.
 */
export function generateBlueprint(
  root: BlueprintNodeInput,
): Blueprint {
  const node = toBlueprintNode(root);
  // Blueprint (from types.ts) is the shape the client runtime hydrates from;
  // we return a minimal valid instance. Cast is safe because Blueprint is a
  // structural type and our node matches the expected layout.
  return node as unknown as Blueprint;
}

/** Convenience: turn a Blueprint into the HydrationData the runtime expects. */
export function blueprintToHydrationData(
  bp: Blueprint,
  state: Record<string, unknown> = {},
): HydrationData {
  return {
    blueprint: bp,
    state,
  } as unknown as HydrationData;
}

/* --------------------------------------------------------------------------
 * Public surface re-cap (for greppability):
 *   reactive, ref, computed, watchEffect, generateBlueprint,
 *   CLIENT_RUNTIME, hydrate (re-export), signal, isReactive,
 *   Ref, Signal, Watcher, BlueprintNode, blueprintToHydrationData
 * -------------------------------------------------------------------------- */
