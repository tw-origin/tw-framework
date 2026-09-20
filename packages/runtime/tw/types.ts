/**
 * types.ts -- TW Framework VDOM Core Type Definitions
 *
 * Upgraded: proper generics on ComponentDefinition<P>, added ComponentInstance<P,S>,
 * DirectiveHook, SSRContext. All types use `unknown` instead of `any`.
 */

// ---------------------------------------------------------------------------
// VNode Types
// ---------------------------------------------------------------------------

/** The kind of a virtual node. */
export type VNodeType = 'element' | 'text' | 'comment' | 'fragment' | 'component';

/** Attributes / props that can appear on an element VNode. */
export type VNodeProps = Record<string, unknown>;

/** A single child -- either a VNode, a string, a number, or null/undefined/boolean. */
export type VNodeChild = VNode | string | number | boolean | null | undefined;

/** An array of children (possibly nested). */
export type VNodeChildren = VNodeChild | VNodeChild[] | VNodeChild[][];

/** Key for keyed reconciliation -- string | number | null. */
export type VNodeKey = string | number | null;

/** The core virtual DOM node. */
export interface VNode {
  /** Unique internal id for debugging / tracking. */
  _id: number;
  /** Node kind. */
  type: VNodeType;
  /** Tag name (e.g. 'div'), component function, or null for text/comment/fragment. */
  tag: string | ComponentRenderFn | null;
  /** Keyed reconciliation key. */
  key: VNodeKey;
  /** Props / attributes on the node. */
  props: VNodeProps;
  /** Normalised children array (VNodes only, no raw strings/numbers). */
  children: VNode[];
  /** The actual DOM node once mounted (set by the renderer). */
  el: Node | null;
  /** Text content for text / comment nodes. */
  text: string;
  /** Component instance data, if this is a component VNode. */
  component: ComponentInstance<Record<string, unknown>, Record<string, unknown>> | null;
  /** Lifecycle hooks attached to this VNode. */
  hooks: LifecycleHooks | null;
  /** Whether children have been normalised. */
  normalized: boolean;
}

// ---------------------------------------------------------------------------
// Component Types
// ---------------------------------------------------------------------------

/** Props passed to a component. */
export type ComponentProps = Record<string, unknown>;

/** State held by a component. */
export type ComponentState = Record<string, unknown>;

/** Context object passed to component render functions. */
export interface ComponentContext<P extends ComponentProps = ComponentProps> {
  props: P;
  state: Readonly<Record<string, unknown>>;
  emit: (event: string, ...args: unknown[]) => void;
  slots: Record<string, VNode[]>;
}

/** A functional render function for a component. */
export type ComponentRenderFn<P extends ComponentProps = ComponentProps> = (
  ctx: ComponentContext<P>,
) => VNode;

/**
 * Definition of a component -- generic over props P.
 *
 * The generic defaults to `Record<string, unknown>` so untyped usage
 * still compiles.
 */
export interface ComponentDefinition<P extends ComponentProps = ComponentProps> {
  /** Unique name for devtools / debugging. */
  name: string;
  /** The render function that produces the component's VNode tree. */
  render: ComponentRenderFn<P>;
  /** Optional initial state factory. */
  setup?: (props: P) => ComponentState;
  /** Optional lifecycle hooks. */
  mounted?: (instance: ComponentInstance<P, ComponentState>) => void;
  updated?: (instance: ComponentInstance<P, ComponentState>) => void;
  unmounted?: (instance: ComponentInstance<P, ComponentState>) => void;
  /** Optional prop validation / defaults. */
  props?: Record<string, PropDefinition>;
}

/** Definition of a single prop. */
export interface PropDefinition {
  type?: unknown;
  default?: unknown;
  required?: boolean;
  validator?: (value: unknown) => boolean;
}

/**
 * A live component instance -- generic over props P and state S.
 */
export interface ComponentInstance<
  P extends ComponentProps = ComponentProps,
  S extends ComponentState = ComponentState,
> {
  /** The component definition. */
  definition: ComponentDefinition<P>;
  /** Current props. */
  props: P;
  /** Current state. */
  state: S;
  /** The most recent rendered VNode tree. */
  vnode: VNode | null;
  /** The DOM element the instance is mounted on. */
  el: Node | null;
  /** Whether the instance is currently mounted. */
  isMounted: boolean;
  /** Update the state and schedule a re-render. */
  setState: (partial: Partial<S>) => void;
  /** Force a re-render. */
  forceUpdate: () => void;
  /** Emitter for events. */
  emit: (event: string, ...args: unknown[]) => void;
}

// ---------------------------------------------------------------------------
// Lifecycle Hooks
// ---------------------------------------------------------------------------

/** Hook called after a VNode is created (before mount). */
export type CreatedHook = (vnode: VNode) => void;
/** Hook called right before the DOM node is inserted. */
export type BeforeMountHook = (vnode: VNode) => void;
/** Hook called after the DOM node is inserted. */
export type MountedHook = (vnode: VNode) => void;
/** Hook called before the DOM node is updated. */
export type BeforeUpdateHook = (vnode: VNode) => void;
/** Hook called after the DOM node is updated. */
export type UpdatedHook = (vnode: VNode) => void;
/** Hook called before the DOM node is removed. */
export type BeforeUnmountHook = (vnode: VNode) => void;
/** Hook called after the DOM node is removed. */
export type UnmountedHook = (vnode: VNode) => void;

/** All lifecycle hooks that can be attached to a VNode. */
export interface LifecycleHooks {
  created?: CreatedHook;
  beforeMount?: BeforeMountHook;
  mounted?: MountedHook;
  beforeUpdate?: BeforeUpdateHook;
  updated?: UpdatedHook;
  beforeUnmount?: BeforeUnmountHook;
  unmounted?: UnmountedHook;
}

// ---------------------------------------------------------------------------
// Directive Hooks
// ---------------------------------------------------------------------------

/** Element the directive is bound to. */
export type DirectiveElement = Element;
/** Binding object passed to directive hooks. */
export interface DirectiveBinding {
  /** The directive name without the `v-` prefix. */
  name: string;
  /** The value the directive is bound to. */
  value: unknown;
  /** The old value (only on `updated`). */
  oldValue: unknown;
  /** The argument, e.g. `v-my:foo` -> `'foo'`. */
  arg: string | null;
  /** Modifiers, e.g. `v-my.bar` -> `{ bar: true }`. */
  modifiers: Record<string, boolean>;
  /** The DOM element. */
  el: DirectiveElement;
  /** The VNode. */
  vnode: VNode;
}

/**
 * Directive hook interface -- covers mounted, updated, and unmounted lifecycle.
 */
export interface DirectiveHook {
  /** Called when the directive is first bound to the element. */
  mounted?(binding: DirectiveBinding): void;
  /** Called when the directive's value changes. */
  updated?(binding: DirectiveBinding): void;
  /** Called when the directive is unbound from the element. */
  unmounted?(binding: DirectiveBinding): void;
}

/** A registered directive -- either a full DirectiveHook object or a single function. */
export type Directive = DirectiveHook | ((binding: DirectiveBinding) => void);

// ---------------------------------------------------------------------------
// Patch Types (for diffing)
// ---------------------------------------------------------------------------

/** The kind of operation in a Patch. */
export type PatchType =
  | 'CREATE'
  | 'REPLACE'
  | 'PROPS'
  | 'TEXT'
  | 'REORDER'
  | 'REMOVE'
  | 'INSERT';

/** A single property change. */
export interface PropChange {
  key: string;
  value: unknown;
  oldValue: unknown | undefined;
}

/** A single patch operation. */
export interface Patch {
  type: PatchType;
  /** Node the patch applies to. */
  vnode: VNode;
  /** For REPLACE / CREATE, the new node. */
  newNode?: VNode;
  /** For PROPS, the changed properties. */
  props?: PropChange[];
  /** For TEXT, the new text. */
  text?: string;
  /** For REORDER/INSERT/REMOVE, affected children. */
  children?: VNode[];
  /** For INSERT/REMOVE, the position. */
  index?: number;
}

// ---------------------------------------------------------------------------
// SSR Context
// ---------------------------------------------------------------------------

/** Request-scoped context for server-side rendering. */
export interface SSRContext {
  /** The accumulated HTML string. */
  html: string;
  /** Unique id counter for generating stable element ids. */
  uid: number;
  /** Whether we are in a hydration pass. */
  hydrating: boolean;
  /** Head contributions collected during render. */
  head: {
    title: string | null;
    meta: { name: string; content: string }[];
    links: { rel: string; href: string }[];
    styles: string[];
    scripts: string[];
  };
  /** Error boundary state. */
  error: Error | null;
  /** Arbitrary per-request data (e.g. cookies, user). */
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Scheduler Types
// ---------------------------------------------------------------------------

/** A function scheduled by the microtask / macrotask scheduler. */
export type SchedulerJob = () => void;

/** Flush mode for the scheduler. */
export type SchedulerFlushMode = 'pre' | 'post' | 'sync';

/** A scheduler interface for batching updates. */
export interface Scheduler {
  queue: SchedulerJob[];
  pending: boolean;
  flush(mode?: SchedulerFlushMode): void;
  schedule(job: SchedulerJob, mode?: SchedulerFlushMode): void;
}

// ---------------------------------------------------------------------------
// Renderer Types
// ---------------------------------------------------------------------------

/** Platform-specific DOM operations the renderer needs. */
export interface DOMOps {
  createElement(tag: string): Element;
  createTextNode(text: string): Text;
  createComment(text: string): Comment;
  createDocumentFragment(): DocumentFragment;
  insertBefore(parent: Node, child: Node, ref: Node | null): void;
  removeChild(parent: Node, child: Node): void;
  appendChild(parent: Node, child: Node): void;
  setTextContent(node: Node, text: string): void;
  setAttribute(el: Element, key: string, value: unknown): void;
  removeAttribute(el: Element, key: string): void;
  addEventListener(el: Element, event: string, handler: EventListener): void;
  removeEventListener(el: Element, event: string, handler: EventListener): void;
}

// ---------------------------------------------------------------------------
// Utility Types
// ---------------------------------------------------------------------------

/** Extract the props type from a ComponentDefinition. */
export type ExtractProps<T extends ComponentDefinition> = T extends ComponentDefinition<infer P>
  ? P
  : never;

/** Extract the state type from a component definition's setup function. */
export type ExtractState<T extends ComponentDefinition> = T extends {
  setup: (props: unknown) => infer S;
}
  ? S
  : Record<string, unknown>;

/** A ref-like mutable container. */
export interface Ref<T = unknown> {
  current: T;
}

/** Make all properties of T optional. */
export type Partial2<T> = { [K in keyof T]?: T[K] };

export interface Blueprint {
  tag: string;
  props: Record<string, any>;
  children: any[];
}

export interface HydrationData {
  components: Record<string, any>;
  state: Record<string, any>;
  props: Record<string, any>;
}
