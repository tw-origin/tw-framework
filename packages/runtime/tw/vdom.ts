/**
 * vdom.ts -- TW Framework VDOM creation and normalisation.
 *
 * Upgraded:
 *   - VNode normalization (flatten children, normalise text/number -> text VNodes)
 *   - cloneVNode, isSameVNode, getKey helper
 *   - createVNode accepts children as variadic args OR array
 *   - createCommentVNode
 *   - createElement alias
 *   - No `any` -- uses `unknown` with proper casts.
 */

import type {
  VNode,
  VNodeChild,
  VNodeChildren,
  VNodeKey,
  VNodeProps,
  VNodeType,
  ComponentRenderFn,
  LifecycleHooks,
  ComponentInstance,
  ComponentProps,
} from './types';

// ---------------------------------------------------------------------------
// Internal id counter
// ---------------------------------------------------------------------------

let _vnodeId = 0;

/** Generate the next unique VNode id. */
function nextId(): number {
  return ++_vnodeId;
}

// ---------------------------------------------------------------------------
// VNode creation
// ---------------------------------------------------------------------------

/** Arguments shared by all createVNode overloads. */
interface CreateVNodeOptions {
  key?: VNodeKey;
  props?: VNodeProps;
  hooks?: LifecycleHooks;
  ref?: unknown;
}

/**
 * Create a VNode for an element, component, or fragment.
 *
 * `children` can be passed as a variadic spread or as a single array.
 *
 * @example
 *   createVNode('div', { class: 'container' }, createVNode('span', null, 'Hello'))
 *   createVNode('ul', null, [createVNode('li', null, 'a'), createVNode('li', null, 'b')])
 */
export function createVNode(
  tag: string | ComponentRenderFn | null,
  props?: VNodeProps | null,
  ...rest: VNodeChild[] | [VNodeChild[], VNodeKey]
): VNode {
  let children: VNodeChild[];
  let key: VNodeKey = null;

  // Support the explicit `createVNode(tag, props, childrenArray, key)` form
  // (used for keyed-list construction) in addition to the variadic
  // `createVNode(tag, props, ...children)` form shown above.
  if (
    rest.length === 2 &&
    Array.isArray(rest[0]) &&
    (typeof rest[1] === "string" || typeof rest[1] === "number")
  ) {
    children = rest[0] as VNodeChild[];
    key = rest[1] as VNodeKey;
  } else {
    children = rest as VNodeChild[];
  }

  return _createVNodeInternal(tag, (props ?? {}) as VNodeProps, key, null, children);
}

/**
 * Internal: build the actual VNode object.
 */
function _createVNodeInternal(
  tag: string | ComponentRenderFn | null,
  props: VNodeProps,
  key: VNodeKey,
  hooks: LifecycleHooks | null,
  children: VNodeChild[],
): VNode {
  let type: VNodeType;
  let text = '';
  let component: ComponentInstance<ComponentProps, Record<string, unknown>> | null = null;

  // Determine the VNode type
  if (tag === null || tag === undefined) {
    // Fragment if children is an array, otherwise comment
    type = 'fragment';
  } else if (typeof tag === 'function') {
    type = 'component';
  } else {
    type = 'element';
  }

  // Extract key from props if not explicitly provided
  if (key === null && props !== null && typeof props === 'object' && 'key' in props) {
    const propKey = props.key;
    if (propKey !== undefined) {
      key = typeof propKey === 'number' || typeof propKey === 'string' ? propKey : null;
    }
    // Don't let 'key' leak into the DOM attributes
    const { key: _discardedKey, ...restProps } = props as VNodeProps;
    props = restProps;
  }

  // Extract ref from props
  if (props !== null && typeof props === 'object' && 'ref' in props) {
    const { ref: _discardedRef, ...restProps } = props as VNodeProps;
    props = restProps;
  }

  // Normalise children: flatten nested arrays, convert strings/numbers -> text VNodes
  const normalizedChildren = normalizeChildren(children);

  const vnode: VNode = {
    _id: nextId(),
    type,
    tag,
    key,
    props: props ?? {},
    children: normalizedChildren,
    el: null,
    text,
    component,
    hooks,
    normalized: true,
  };

  // Call created hook
  if (hooks && hooks.created) {
    hooks.created(vnode);
  }

  return vnode;
}

// ---------------------------------------------------------------------------
// Text / Comment VNodes
// ---------------------------------------------------------------------------

/**
 * Create a text VNode.
 */
export function createTextVNode(text: string | number): VNode {
  const vnode: VNode = {
    _id: nextId(),
    type: 'text',
    tag: null,
    key: null,
    props: {},
    children: [],
    el: null,
    text: String(text),
    component: null,
    hooks: null,
    normalized: true,
  };
  return vnode;
}

/**
 * Create a comment VNode.
 *
 * @param text The comment text.
 */
export function createCommentVNode(text: string = ''): VNode {
  const vnode: VNode = {
    _id: nextId(),
    type: 'comment',
    tag: null,
    key: null,
    props: {},
    children: [],
    el: null,
    text,
    component: null,
    hooks: null,
    normalized: true,
  };
  return vnode;
}

/**
 * Create a fragment VNode that renders its children without a wrapping element.
 */
export function createFragment(children: VNodeChild[]): VNode {
  const vnode: VNode = {
    _id: nextId(),
    type: 'fragment',
    tag: null,
    key: null,
    props: {},
    children: normalizeChildren(children),
    el: null,
    text: '',
    component: null,
    hooks: null,
    normalized: true,
  };
  return vnode;
}

// ---------------------------------------------------------------------------
// VNode Normalisation
// ---------------------------------------------------------------------------

/**
 * Check whether a value is a VNode.
 */
export function isVNode(value: unknown): value is VNode {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as VNode)._id === 'number' &&
    typeof (value as VNode).type === 'string'
  );
}

/**
 * Normalise a raw child value into a VNode.
 *
 * - Strings and numbers become text VNodes.
 * - Booleans, null, undefined become comment VNodes (placeholders).
 * - Existing VNodes are returned as-is.
 * - Arrays are flattened.
 */
export function normalizeChild(child: VNodeChild): VNode | null {
  if (child === null || child === undefined || typeof child === 'boolean') {
    // Use a comment placeholder so position is preserved in keyed diff
    return null;
  }
  if (isVNode(child)) {
    return child;
  }
  if (typeof child === 'string' || typeof child === 'number') {
    return createTextVNode(child);
  }
  return null;
}

/**
 * Normalise a list of children:
 *   - Flatten nested arrays.
 *   - Convert raw strings/numbers to text VNodes.
 *   - Skip null/undefined/boolean placeholders (but keep their slots null for position).
 */
export function normalizeChildren(children: VNodeChild[]): VNode[] {
  if (children.length === 0) return [];

  const result: VNode[] = [];
  const stack: VNodeChild[] = [...children].reverse();

  while (stack.length > 0) {
    const child = stack.pop();

    if (child === null || child === undefined || typeof child === 'boolean') {
      continue;
    }

    if (Array.isArray(child)) {
      // Push nested array items onto the stack in reverse
      for (let i = child.length - 1; i >= 0; i--) {
        stack.push(child[i]);
      }
      continue;
    }

    if (isVNode(child)) {
      result.push(child);
      continue;
    }

    if (typeof child === 'string' || typeof child === 'number') {
      // Merge consecutive text nodes
      const last = result[result.length - 1];
      if (last && last.type === 'text') {
        last.text = String(child);
      } else {
        result.push(createTextVNode(child));
      }
      continue;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Clone / Compare / Key helpers
// ---------------------------------------------------------------------------

/**
 * Deep clone a VNode -- creates a new VNode with a fresh id but same structure.
 * Children are cloned recursively.
 *
 * @param vnode The VNode to clone.
 * @param overrideProps Optional props to merge into the clone.
 * @param overrideChildren Optional children to replace the original children.
 */
export function cloneVNode(
  vnode: VNode,
  overrideProps?: VNodeProps,
  overrideChildren?: VNodeChild[],
): VNode {
  const props: VNodeProps = { ...vnode.props, ...(overrideProps ?? {}) };
  const children =
    overrideChildren !== undefined
      ? normalizeChildren(overrideChildren)
      : vnode.children.map((c) => cloneVNode(c));

  return {
    _id: nextId(),
    type: vnode.type,
    tag: vnode.tag,
    key: vnode.key,
    props,
    children,
    el: null, // Cloned nodes are not mounted
    text: vnode.text,
    component: null, // Cloned instances are fresh
    hooks: vnode.hooks,
    normalized: true,
  };
}

/**
 * Check whether two VNodes represent the same node (can be patched in place).
 *
 * Two nodes are "the same" if they have the same type and the same tag.
 * For keyed children, the key must also match.
 */
export function isSameVNode(n1: VNode, n2: VNode): boolean {
  return (
    n1.type === n2.type &&
    n1.tag === n2.tag &&
    n1.key === n2.key
  );
}

/**
 * Get the key of a VNode (null if none).
 */
export function getKey(vnode: VNode): VNodeKey {
  return vnode.key;
}

// ---------------------------------------------------------------------------
// createElement alias
// ---------------------------------------------------------------------------

/**
 * Alias for createVNode -- provides a familiar JSX-like API.
 *
 * @example
 *   const el = createElement('div', { class: 'hero' }, 'Hello');
 */
export const createElement = createVNode;

/**
 * Alias for createVNode -- provides an `h`-like API for hyperscript.
 */
export const h = createVNode;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Re-export types for convenience
  type VNode,
  type VNodeChild,
  type VNodeChildren,
  type VNodeKey,
  type VNodeProps,
  type VNodeType,
};

// Marker symbol so VNodes can be detected even with instanceof checks
export const VNODE_SYMBOL = Symbol('vnode');

/** Attach the VNODE_SYMBOL to a VNode for brand checks. */
export function markVNode(vnode: VNode): VNode {
  // Store the symbol as a non-enumerable property for brand detection
  Object.defineProperty(vnode, '__v_isVNode', {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return vnode;
}
