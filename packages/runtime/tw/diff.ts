/**
 * diff.ts -- TW Framework VDOM Diffing (props + children).
 *
 * Upgraded:
 *   - Fixed event-listener leak: store old handler, removeEventListener before add.
 *   - Proper types: Record<string, unknown> instead of `any`.
 *   - Proper O(n) keyed diff using Map-based lookup (not just positional).
 *   - escapeHtml: kept and exported (used in SSR contexts).
 *   - diffChildren exported separately.
 */

import type {
  VNode,
  VNodeKey,
  VNodeProps,
  PropChange,
  Patch,
} from './types';
import { isSameVNode, getKey } from './vdom';

// ---------------------------------------------------------------------------
// Fast-path text diff
// ---------------------------------------------------------------------------

/**
 * Fast-path diff for a text VNode against a plain new text string.
 * Returns a lowercase-`kind` patch object (`{ kind: "text", text }`) when the
 * text changed, or `null` when it's identical -- distinct from the
 * uppercase-`type` `Patch` shape used elsewhere in this file, matching the
 * lightweight object other fast-path diff helpers (e.g. `diffKeyed`) return.
 */
export function diffTextNode(
  oldNode: VNode,
  newText: string,
): { kind: 'text'; text: string } | null {
  if (oldNode.text === newText) return null;
  return { kind: 'text', text: newText };
}

// ---------------------------------------------------------------------------
// HTML escaping (exported -- used by SSR renderer and text interpolation)
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&',
  '<': '<',
  '>': '>',
  '"': '"',
  "'": '&#39;',
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;

/**
 * Escape a string for safe insertion into HTML.
 * @param str The raw string.
 * @returns The escaped string.
 */
export function escapeHtml(str: string): string {
  return str.replace(HTML_ESCAPE_REGEX, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

// ---------------------------------------------------------------------------
// Event handler storage
// ---------------------------------------------------------------------------

/**
 * String key used on DOM elements to store the set of old event handlers
 * so they can be removed on the next update.
 */
const EVENT_HANDLERS_KEY = '__tw_event_handlers__';

type HandlerMap = Map<string, EventListener>;

/** Get the handler map stored on a DOM element (or create one). */
function getHandlerMap(el: Element): HandlerMap {
  const stored = (el as unknown as Record<string, unknown>)[EVENT_HANDLERS_KEY];
  if (stored) return stored as HandlerMap;
  const map: HandlerMap = new Map();
  (el as unknown as Record<string, unknown>)[EVENT_HANDLERS_KEY] = map;
  return map;
}

// ---------------------------------------------------------------------------
// Property / attribute diffing
// ---------------------------------------------------------------------------

/** Determine whether a prop key is an event handler (starts with `on` + uppercase). */
function isEventKey(key: string): boolean {
  return key.length > 2 && key[0] === 'o' && key[1] === 'n' && key[2] === key[2].toUpperCase();
}

/** Convert `onClick` -> `click`. */
function eventNameFromKey(key: string): string {
  return key.slice(2).toLowerCase();
}

/** Determine whether a value is an event listener (function). */
function isEventListener(value: unknown): value is EventListener {
  return typeof value === 'function';
}

/**
 * Set a single property / attribute / event handler on a DOM element.
 *
 * @param el      The DOM element.
 * @param key     The prop name (e.g. `class`, `id`, `onClick`).
 * @param value   The new value.
 * @param oldValue The previous value (for event-handler swap).
 */
export function setProp(
  el: Element,
  key: string,
  value: unknown,
  oldValue?: unknown,
): void {
  // --- Event handlers ---
  if (isEventKey(key)) {
    const event = eventNameFromKey(key);
    const handlers = getHandlerMap(el);

    // Remove the old handler if it exists
    const oldHandler = handlers.get(event);
    if (oldHandler) {
      el.removeEventListener(event, oldHandler);
      handlers.delete(event);
    }

    // Add the new handler if it's a function
    if (isEventListener(value)) {
      el.addEventListener(event, value);
      handlers.set(event, value);
    }
    return;
  }

  // --- class ---
  if (key === 'class' || key === 'className') {
    if (value == null || value === false) {
      el.removeAttribute('class');
    } else if (Array.isArray(value)) {
      el.setAttribute('class', value.filter(Boolean).join(' '));
    } else if (typeof value === 'object' && value !== null) {
      // Object syntax: { active: true, hidden: false }
      const classes: string[] = [];
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v) classes.push(k);
      }
      el.setAttribute('class', classes.join(' '));
    } else {
      el.setAttribute('class', String(value));
    }
    return;
  }

  // --- style ---
  if (key === 'style') {
    if (value == null || value === '') {
      el.removeAttribute('style');
    } else if (typeof value === 'string') {
      el.setAttribute('style', value);
    } else if (typeof value === 'object' && value !== null) {
      const style = (el as HTMLElement).style;
      // Clear old inline styles if old value was an object
      if (typeof oldValue === 'object' && oldValue !== null) {
        for (const k of Object.keys(oldValue as Record<string, unknown>)) {
          if (!(k in (value as Record<string, unknown>))) {
            style.removeProperty(k);
          }
        }
      }
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v == null || v === false) {
          style.removeProperty(k);
        } else {
          style.setProperty(k, String(v));
        }
      }
    }
    return;
  }

  // --- boolean-ish attributes ---
  if (typeof value === 'boolean') {
    if (value) {
      el.setAttribute(key, '');
    } else {
      el.removeAttribute(key);
    }
    return;
  }

  // --- ref (handled elsewhere) ---
  if (key === 'ref') {
    return;
  }

  // --- key (already extracted by VNode creation) ---
  if (key === 'key') {
    return;
  }

  // --- regular attributes ---
  if (value == null || value === undefined || value === false) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, String(value));
  }
}

/**
 * Remove a property / attribute / event handler from a DOM element.
 */
export function removeProp(el: Element, key: string, oldValue?: unknown): void {
  if (isEventKey(key)) {
    const event = eventNameFromKey(key);
    const handlers = getHandlerMap(el);
    const oldHandler = handlers.get(event);
    if (oldHandler) {
      el.removeEventListener(event, oldHandler);
      handlers.delete(event);
    }
    return;
  }

  if (key === 'class' || key === 'className') {
    el.removeAttribute('class');
    return;
  }

  if (key === 'style') {
    if (typeof oldValue === 'object' && oldValue !== null) {
      const style = (el as HTMLElement).style;
      for (const k of Object.keys(oldValue as Record<string, unknown>)) {
        style.removeProperty(k);
      }
    } else {
      el.removeAttribute('style');
    }
    return;
  }

  if (key === 'ref' || key === 'key') return;

  el.removeAttribute(key);
}

/**
 * Diff old props against new props and apply changes to the DOM element.
 *
 * @returns An array of PropChange objects (empty if no changes).
 */
export function diffProps(
  el: Element,
  oldProps: VNodeProps,
  newProps: VNodeProps,
): PropChange[] {
  const changes: PropChange[] = [];

  // Collect all keys from both old and new
  const allKeys = new Set<string>([...Object.keys(oldProps), ...Object.keys(newProps)]);

  for (const key of allKeys) {
    if (key === 'key' || key === 'ref') continue;

    const oldValue = oldProps[key];
    const newValue = newProps[key];

    if (oldValue === newValue) continue;

    if (newValue === undefined || newValue === null) {
      // Property was removed
      removeProp(el, key, oldValue);
      changes.push({ key, value: undefined, oldValue });
    } else if (oldValue === undefined || oldValue === null) {
      // Property was added
      setProp(el, key, newValue, oldValue);
      changes.push({ key, value: newValue, oldValue: undefined });
    } else {
      // Property changed
      setProp(el, key, newValue, oldValue);
      changes.push({ key, value: newValue, oldValue });
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Children diffing
// ---------------------------------------------------------------------------

/**
 * Result of a single child reconciliation step.
 */
export interface ChildPatch {
  type: 'INSERT' | 'REMOVE' | 'REPLACE' | 'UPDATE' | 'MOVE';
  oldNode?: VNode;
  newNode: VNode;
  index: number;
}

/**
 * O(n) keyed children diff using Map-based lookup.
 *
 * Algorithm:
 *   1. Build a map of old children keyed by their key (or positional index if no key).
 *   2. Walk the new children, looking each one up in the old map.
 *   3. If found -> patch in place (and record a move if the position changed).
 *   4. If not found -> insert.
 *   5. Old children not visited -> remove.
 *
 * This is O(n + m) where n = old length, m = new length.
 *
 * @param parentEl  The DOM parent element.
 * @param oldChildren The previous children array.
 * @param newChildren The new children array.
 * @returns An array of child patches.
 */
export function diffChildren(
  parentEl: Node,
  oldChildren: VNode[],
  newChildren: VNode[],
): ChildPatch[] {
  const patches: ChildPatch[] = [];
  const oldLen = oldChildren.length;
  const newLen = newChildren.length;

  // Fast path: all new -> insert
  if (oldLen === 0) {
    for (let i = 0; i < newLen; i++) {
      patches.push({ type: 'INSERT', newNode: newChildren[i], index: i });
    }
    return patches;
  }

  // Fast path: all removed
  if (newLen === 0) {
    for (let i = 0; i < oldLen; i++) {
      patches.push({ type: 'REMOVE', oldNode: oldChildren[i], newNode: oldChildren[i], index: i });
    }
    return patches;
  }

  // Build a map of old children by key (falling back to positional index).
  // We use a Map<string | number, { vnode, index }> for O(1) lookup.
  const oldKeyMap = new Map<VNodeKey, { vnode: VNode; index: number }>();
  const oldIndexList: (VNode | null)[] = []; // positional fallback

  for (let i = 0; i < oldLen; i++) {
    const oldChild = oldChildren[i];
    const key = getKey(oldChild);
    if (key !== null) {
      // Keyed child -- store in map (last one wins if duplicate keys)
      oldKeyMap.set(key, { vnode: oldChild, index: i });
    }
    oldIndexList.push(oldChild);
  }

  // Track which old children have been visited (matched)
  const visited = new Set<number>();

  // Process new children
  let positionalCursor = 0; // for unkeyed fallback matching

  for (let i = 0; i < newLen; i++) {
    const newChild = newChildren[i];
    const newKey = getKey(newChild);

    let matched: VNode | null = null;
    let matchedOldIndex = -1;

    if (newKey !== null) {
      // Keyed lookup
      const entry = oldKeyMap.get(newKey);
      if (entry && !visited.has(entry.index)) {
        // Check it's actually the same node type
        if (isSameVNode(entry.vnode, newChild)) {
          matched = entry.vnode;
          matchedOldIndex = entry.index;
          visited.add(matchedOldIndex);
        }
      }
    }

    if (matched === null) {
      // Try positional fallback for unkeyed children
      // Find the next unvisited old child at or after the cursor
      while (positionalCursor < oldLen) {
        const candidate = oldIndexList[positionalCursor];
        if (candidate && !visited.has(positionalCursor) && getKey(candidate) === null) {
          if (isSameVNode(candidate, newChild)) {
            matched = candidate;
            matchedOldIndex = positionalCursor;
            visited.add(matchedOldIndex);
            positionalCursor++;
            break;
          }
        }
        positionalCursor++;
      }
    }

    if (matched !== null) {
      // Same node -- check if it moved
      if (matchedOldIndex !== i) {
        patches.push({ type: 'MOVE', oldNode: matched, newNode: newChild, index: i });
      } else {
        patches.push({ type: 'UPDATE', oldNode: matched, newNode: newChild, index: i });
      }
    } else {
      // No match -- insert new child
      patches.push({ type: 'INSERT', newNode: newChild, index: i });
    }
  }

  // Remove any old children that were never visited
  for (let i = 0; i < oldLen; i++) {
    if (!visited.has(i)) {
      patches.push({ type: 'REMOVE', oldNode: oldChildren[i], newNode: oldChildren[i], index: i });
    }
  }

  return patches;
}

// ---------------------------------------------------------------------------
// VNode diffing (single node)
// ---------------------------------------------------------------------------

/**
 * Diff a single old VNode against a new VNode and produce a Patch.
 *
 * - If they are the same node -> PROPS patch (props/children will be diffed during apply).
 * - If they are different -> REPLACE.
 * - If new is null -> REMOVE.
 * - If old is null -> CREATE.
 */
/**
 * One detached element reused whenever a VNode has no live DOM node yet.
 * Creating a fresh `document.createElement('div')` per diff call wasted DOM
 * mutations on an element nobody ever mounts.
 */
let _detachedDiffEl: Element | null = null;
function detachedDiffElement(): Element {
  if (_detachedDiffEl === null) _detachedDiffEl = document.createElement('div');
  return _detachedDiffEl;
}

export function diffVNode(oldVNode: VNode | null, newVNode: VNode | null): Patch | null {
  // Both null -- nothing to do
  if (oldVNode === null && newVNode === null) {
    return null;
  }

  // Old exists, new doesn't -> REMOVE
  if (oldVNode !== null && newVNode === null) {
    return {
      type: 'REMOVE',
      vnode: oldVNode,
    };
  }

  // New exists, old doesn't -> CREATE
  if (oldVNode === null && newVNode !== null) {
    return {
      type: 'CREATE',
      vnode: newVNode,
      newNode: newVNode,
    };
  }

  // Both exist -- check if they're the same node
  const old = oldVNode as VNode;
  const next = newVNode as VNode;

  if (!isSameVNode(old, next)) {
    // Different type or tag -> REPLACE
    return {
      type: 'REPLACE',
      vnode: old,
      newNode: next,
    };
  }

  // Same node -- diff props and text
  if (old.type === 'text' || old.type === 'comment') {
    if (old.text !== next.text) {
      return {
        type: 'TEXT',
        vnode: old,
        newNode: next,
        text: next.text,
      };
    }
    return null;
  }

  // Element / component / fragment -- diff props. Children are NOT diffed
  // here: the top-level diff() owns the child walk, so diffing them here
  // would do the work twice (and the PROPS patch's `children` slot is
  // documented for REORDER/INSERT/REMOVE payloads, not VNode lists).
  const target = old.el instanceof Element ? old.el : detachedDiffElement();

  const propChanges = diffProps(target, old.props, next.props);

  if (propChanges.length === 0) {
    return null;
  }

  return {
    type: 'PROPS',
    vnode: old,
    newNode: next,
    props: propChanges,
  };
}

// ---------------------------------------------------------------------------
// Top-level diff
// ---------------------------------------------------------------------------

/**
 * Diff two VNode trees and return a list of patches.
 *
 * @param oldVNode The previous VNode (or null for initial render).
 * @param newVNode The new VNode (or null for removal).
 * @returns An array of Patch objects to apply.
 */
export function diff(oldVNode: VNode | null, newVNode: VNode | null): Patch[] {
  const patches: Patch[] = [];

  const rootPatch = diffVNode(oldVNode, newVNode);
  if (rootPatch) {
    patches.push(rootPatch);
  }

  // Children are diffed exactly once, here. This runs whether or not the
  // root produced a PROPS patch -- a node whose own props are unchanged can
  // still have changed children.
  if (oldVNode && newVNode) {
    const childPatches = diffChildren(
      oldVNode.el instanceof Element ? oldVNode.el : detachedDiffElement(),
      oldVNode.children,
      newVNode.children,
    );
    for (const cp of childPatches) {
      if (cp.type === 'REMOVE') {
        // A removed child has no "new" side to diff -- emit the removal
        // directly (diffing old against itself would drop it).
        patches.push({ type: 'REMOVE', vnode: cp.oldNode!, index: cp.index });
        continue;
      }
      const childPatch = diffVNode(cp.oldNode ?? null, cp.newNode);
      if (childPatch) {
        patches.push(childPatch);
      }
    }
  }

  return patches;
}

// ---------------------------------------------------------------------------
// Cleanup: remove all event listeners from a VNode's DOM element
// ---------------------------------------------------------------------------

/**
 * Remove all event listeners from a VNode's DOM element.
 * Called during unmount to prevent leaks.
 */
export function removeAllEventListeners(vnode: VNode): void {
  if (!vnode.el || vnode.el instanceof Element === false) return;
  const el = vnode.el as Element;
  const handlers = (el as unknown as Record<string, unknown>)[EVENT_HANDLERS_KEY];
  if (handlers) {
    const map = handlers as HandlerMap;
    for (const [event, handler] of map) {
      el.removeEventListener(event, handler);
    }
    map.clear();
    delete (el as unknown as Record<string, unknown>)[EVENT_HANDLERS_KEY];
  }
}
