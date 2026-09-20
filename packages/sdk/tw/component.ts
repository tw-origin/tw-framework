/**
 * TW SDK -- Component System.
 *
 * defineComponent() with:
 * - Full generic type inference for props and state
 * - Props validation (type, required, default, validator)
 * - Lifecycle hooks (onMount, onUnmount, onUpdate, onError)
 * - Computed properties with lazy evaluation + caching
 * - Watchers for reactive side effects
 * - Methods bound to instance
 * - Setup function (composition API style)
 * - Instance creation with mount/unmount
 * - State management with setState + forceUpdate
 * - Error boundaries
 *
 * @example
 * const Counter = defineComponent({
 *   name: "Counter",
 *   props: {
 *     initialCount: { type: Number, default: 0 },
 *     step: { type: Number, default: 1, required: true },
 *   },
 *   state: () => ({ count: 0 }),
 *   computed: {
 *     doubled: (this) => this.state.count * 2,
 *   },
 *   methods: {
 *     increment(this) {
 *       this.setState({ count: this.state.count + this.props.step });
 *     },
 *   },
 *   lifecycle: {
 *     onMount() {
 *       console.log("Counter mounted");
 *     },
 *   },
 *   render(this) {
 *     return `<div>Count: ${this.state.count} (doubled: ${this.computed.doubled})</div>`;
 *   },
 * });
 */

import type {
  ComponentOptions,
  ComponentInstance,
  ComponentDefinition,
  PropsDefinition,
  PropDefinition,
  PropType,
  ComputedGetter,
  WatchCallback,
  MethodFn,
  LifecycleHook,
  ErrorInfo,
  ComponentSetupContext,
  ComponentSetupResult,
  VNode,
} from "./types";

// --- Prop Validation --------------------------------------------------

function getPropType(val: unknown): string {
  if (val === String) return "string";
  if (val === Number) return "number";
  if (val === Boolean) return "boolean";
  if (val === Object) return "object";
  if (val === Array) return "array";
  if (val === Function) return "function";
  if (val === Symbol) return "symbol";
  // Also accept string type names directly (e.g. `type: "string"`), not just
  // constructor references (e.g. `type: String`).
  if (typeof val === "string") return val.toLowerCase();
  if (typeof val === "function") return val.name.toLowerCase() || "unknown";
  return "unknown";
}

function checkPropType(value: unknown, type: PropType | PropType[]): boolean {
  const types = Array.isArray(type) ? type : [type];
  for (const t of types) {
    const expected = getPropType(t);
    const actual = Array.isArray(value) ? "array" : typeof value;

    if (expected === actual) return true;
    if (expected === "object" && value !== null && actual === "object") return true;
    if (expected === "function" && typeof value === "function") return true;
  }
  return false;
}

function resolveProp<P>(
  key: string,
  rawProps: Record<string, unknown>,
  def: PropType | PropType[] | PropDefinition<P>,
): { value: unknown; valid: boolean; error?: string } {
  const provided = key in rawProps;
  const value = rawProps[key];

  // Shorthand: just a type
  if (typeof def === "function" || Array.isArray(def)) {
    if (provided) {
      if (!checkPropType(value, def as PropType | PropType[])) {
        return { value, valid: false, error: `Prop '${key}' expected type ${Array.isArray(def) ? def.map(getPropType).join("|") : getPropType(def)}, got ${typeof value}` };
      }
    }
    return { value: provided ? value : undefined, valid: true };
  }

  // Full definition
  const propDef = def as PropDefinition<P>;

  if (!provided) {
    if (propDef.required) {
      return { value: undefined, valid: false, error: `Prop '${key}' is required` };
    }
    if (propDef.default !== undefined) {
      const defaultVal = typeof propDef.default === "function" ? (propDef.default as () => P)() : propDef.default;
      return { value: defaultVal, valid: true };
    }
    return { value: undefined, valid: true };
  }

  // Type check
  if (propDef.type && !checkPropType(value, propDef.type)) {
    const expected = Array.isArray(propDef.type) ? propDef.type.map(getPropType).join("|") : getPropType(propDef.type);
    return { value, valid: false, error: `Prop '${key}' expected type ${expected}, got ${typeof value}` };
  }

  // Validator
  if (propDef.validator && !propDef.validator(value)) {
    return { value, valid: false, error: `Prop '${key}' failed custom validator` };
  }

  return { value, valid: true };
}

// --- defineComponent --------------------------------------------------

export function defineComponent<
  P extends Record<string, unknown> = Record<string, unknown>,
  S extends Record<string, unknown> = Record<string, unknown>,
>(
  options: ComponentOptions<P, S>,
): ComponentDefinition<P, S> {
  const definition: ComponentDefinition<P, S> = {
    __isTWComponent: true,
    name: options.name,
    options,

    create(rawProps: Partial<P> = {}): ComponentInstance<P, S> {
      // -- Resolve & validate props ------------------------------------
      const props = {} as P;
      const propErrors: string[] = [];

      if (options.props) {
        const propsDef = options.props as PropsDefinition<P>;
        for (const key of Object.keys(propsDef) as (keyof P)[]) {
          const result = resolveProp(
            key as string,
            rawProps as Record<string, unknown>,
            propsDef[key] as PropType | PropType[] | PropDefinition<unknown>,
          );
          if (!result.valid && result.error) {
            propErrors.push(result.error);
          }
          (props as Record<string, unknown>)[key as string] = result.value;
        }
      }

      if (propErrors.length > 0) {
        console.warn(`Component '${options.name}' prop validation warnings:\n  ${propErrors.join("\n  ")}`);
      }

      // Copy unknown props that aren't in the definition
      for (const key of Object.keys(rawProps)) {
        if (!(key in (options.props ?? {}))) {
          (props as Record<string, unknown>)[key] = (rawProps as Record<string, unknown>)[key];
        }
      }

      // -- Initialize state --------------------------------------------
      // `state` may be provided either as a factory function (`state: () => ({...})`)
      // or as a plain object literal (`state: { clicks: 0 }`); support both.
      const state = (
        typeof options.state === "function"
          ? (options.state() as object)
          : options.state
            ? { ...(options.state as object) }
            : {}
      ) as S;

      // -- Instance object ----------------------------------------------
      const instance: ComponentInstance<P, S> = {
        name: options.name,
        props,
        state,
        methods: {},
        computed: {},
        isMounted: false,
        dom: null,

        render() {
          if (options.render) {
            return options.render.call(instance);
          }
          return "";
        },

        setState(updates, callback) {
          Object.assign(instance.state, updates);
          if (instance.isMounted) {
            instance.onUpdate?.();
            // Trigger re-render -- scheduler handles batching
            scheduleReRender(instance);
          }
          callback?.();
        },

        forceUpdate() {
          if (instance.isMounted) {
            scheduleReRender(instance);
          }
        },

        mount(el) {
          instance.dom = el;
          instance.isMounted = true;
          if (instance.onMount) {
            const cleanup = instance.onMount();
            if (typeof cleanup === "function") {
              instanceCleanup.set(instance, cleanup);
            }
          }
        },

        unmount() {
          const cleanup = instanceCleanup.get(instance);
          if (cleanup) cleanup();
          instanceCleanup.delete(instance);
          instance.isMounted = false;
          instance.dom = null;
          instance.onUnmount?.();
        },

        onMount: options.lifecycle?.onMount,
        onUnmount: options.lifecycle?.onUnmount,
        onUpdate: options.lifecycle?.onUpdate,
        onError: options.lifecycle?.onError,
        shouldUpdate: options.lifecycle?.shouldUpdate,
      };

      // -- Bind methods -------------------------------------------------
      if (options.methods) {
        for (const [name, fn] of Object.entries(options.methods)) {
          instance.methods[name] = (...args: unknown[]) =>
            (fn as MethodFn<P, S>).call(instance, ...args);
        }
      }

      // -- Setup computed properties ------------------------------------
      const computedCache = new Map<string, unknown>();
      const computedDirty = new Set<string>();

      if (options.computed) {
        // Mark all as dirty initially
        for (const key of Object.keys(options.computed)) {
          computedDirty.add(key);
        }

        for (const [name, getter] of Object.entries(options.computed)) {
          Object.defineProperty(instance.computed, name, {
            get() {
              if (computedDirty.has(name) || !computedCache.has(name)) {
                computedCache.set(name, (getter as ComputedGetter).call(instance));
                computedDirty.delete(name);
              }
              return computedCache.get(name);
            },
            enumerable: true,
          });
        }
      }

      // Invalidate computed when state changes
      const originalSetState = instance.setState.bind(instance);
      instance.setState = (updates: Partial<S>, callback?: () => void) => {
        for (const key of computedDirty) computedDirty.add(key);
        for (const k of Object.keys(options.computed ?? {})) computedDirty.add(k);
        originalSetState(updates, callback);
      };

      // -- Setup watchers -----------------------------------------------
      if (options.watch) {
        const watchUnsubscribers: Array<() => void> = [];

        for (const [key, callback] of Object.entries(options.watch)) {
          let prevVal: unknown = (instance.state as Record<string, unknown>)[key];

          const checkWatcher = () => {
            const newVal = (instance.state as Record<string, unknown>)[key];
            if (newVal !== prevVal) {
              (callback as WatchCallback)(newVal, prevVal as any);
              prevVal = newVal;
            }
          };

          // Hook into state changes
          const origSetState = instance.setState.bind(instance);
          instance.setState = (updates: Partial<S>, cb?: () => void) => {
            origSetState(updates, cb);
            if (key in updates) {
              checkWatcher();
            }
          };

          watchUnsubscribers.push(() => {});
        }
      }

      // -- Run setup function (composition API) ------------------------
      if (options.setup) {
        const setupCtx: ComponentSetupContext = {
          emit: (event: string, ...args: unknown[]) => {
            if (options.emits?.includes(event)) {
              // Emit to parent -- handled by renderer
            }
          },
          provide: <T>(key: string, value: T) => {
            providerMap.set(key, value);
          },
          inject: <T>(key: string, defaultValue?: T): T | undefined => {
            return providerMap.get(key) as T | undefined ?? defaultValue;
          },
          refs: {},
        };

        const setupResult = options.setup(props, setupCtx);

        if (setupResult) {
          // Merge setup result into instance
          if (setupResult.state) {
            Object.assign(instance.state, setupResult.state);
          }
          if (setupResult.methods) {
            for (const [name, fn] of Object.entries(setupResult.methods)) {
              instance.methods[name] = (...args: unknown[]) => fn(...args);
            }
          }
          if (setupResult.computed) {
            for (const [name, getter] of Object.entries(setupResult.computed)) {
              computedDirty.add(name);
              Object.defineProperty(instance.computed, name, {
                get() {
                  if (computedDirty.has(name) || !computedCache.has(name)) {
                    computedCache.set(name, getter.call(instance));
                    computedDirty.delete(name);
                  }
                  return computedCache.get(name);
                },
                enumerable: true,
              });
            }
          }
          if (setupResult.onMount) instance.onMount = setupResult.onMount;
          if (setupResult.onUnmount) instance.onUnmount = setupResult.onUnmount;
          if (setupResult.onUpdate) instance.onUpdate = setupResult.onUpdate;
        }
      }

      return instance;
    },
  };

  return definition;
}

// --- Component-level state --------------------------------------------

const instanceCleanup = new WeakMap<ComponentInstance, () => void>();
const providerMap = new Map<string, unknown>();
const renderQueue = new Set<ComponentInstance>();
let renderScheduled = false;

function scheduleReRender(instance: ComponentInstance): void {
  renderQueue.add(instance);
  if (!renderScheduled) {
    renderScheduled = true;
    // Microtask -- batch all state changes in the same tick
    queueMicrotask(() => {
      renderScheduled = false;
      const instances = Array.from(renderQueue);
      renderQueue.clear();
      for (const inst of instances) {
        if (inst.isMounted) {
          try {
            inst.render();
            inst.onUpdate?.();
          } catch (err) {
            const errorInfo: ErrorInfo = {
              componentStack: inst.name,
            };
            inst.onError?.(err as Error, errorInfo);
          }
        }
      }
    });
  }
}

// --- Helper: h() for VNode creation in render functions --------------

export function h(
  tag: string,
  props?: Record<string, unknown>,
  ...children: (VNode | string | number | null | undefined | (VNode | string | number | null | undefined)[])[]
): VNode {
  const flatChildren: VNode[] = [];
  for (const child of children) {
    if (child === null || child === undefined) continue;
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c === null || c === undefined) continue;
        flatChildren.push(typeof c === "string" || typeof c === "number" ? { type: "text", text: String(c) } : c);
      }
    } else if (typeof child === "string" || typeof child === "number") {
      flatChildren.push({ type: "text", text: String(child) });
    } else {
      flatChildren.push(child);
    }
  }

  return {
    type: "element",
    tag,
    props: props ?? {},
    children: flatChildren,
  };
}

// --- Fragment helper --------------------------------------------------

export function Fragment(...children: (VNode | string | number | null)[]): VNode {
  return {
    type: "fragment",
    children: children
      .filter((c): c is VNode | string | number => c !== null)
      .map((c) => (typeof c === "string" || typeof c === "number" ? { type: "text" as const, text: String(c) } : c)),
  };
}

// --- createRef --------------------------------------------------------

export function createRef<T = unknown>(): { current: T | null } {
  return { current: null };
}

// --- createComponent (alias for defineComponent) ---------------------

export const createComponent = defineComponent;
