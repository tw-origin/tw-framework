/**
 * diff-engine.ts -- High-level Diff Engine.
 *
 * Upgraded:
 *   - DiffEngine class with proper diff/apply methods.
 *   - Handles ALL PatchTypes (CREATE, REPLACE, PROPS, TEXT, REORDER, REMOVE, INSERT).
 *   - No `any` -- uses `unknown` with proper casts.
 *   - Integrates keyed diff from diff-optimized.ts.
 *   - Integrates event listener management from diff.ts.
 */

import type {
  VNode,
  VNodeKey,
  VNodeProps,
  Patch,
  PatchType,
  PropChange,
  DOMOps,
  LifecycleHooks,
  ComponentDefinition,
  ComponentInstance,
  ComponentProps,
  ComponentState,
} from './types';
import {
  isSameVNode,
  getKey,
  normalizeChildren,
  createTextVNode,
} from './vdom';
import {
  diffProps,
  setProp,
  removeProp,
  diffChildren,
  removeAllEventListeners,
} from './diff';
import {
  diffKeyed,
  releaseVNode,
} from './diff-optimized';

// ---------------------------------------------------------------------------
// Default DOM operations (browser environment)
// ---------------------------------------------------------------------------

/** Default browser DOM operations. */
const defaultDOMOps: DOMOps = {
  createElement: (tag: string) => document.createElement(tag),
  createTextNode: (text: string) => document.createTextNode(text),
  createComment: (text: string) => document.createComment(text),
  createDocumentFragment: () => document.createDocumentFragment(),
  insertBefore: (parent: Node, child: Node, ref: Node | null) =>
    parent.insertBefore(child, ref),
  removeChild: (parent: Node, child: Node) => parent.removeChild(child),
  appendChild: (parent: Node, child: Node) => parent.appendChild(child),
  setTextContent: (node: Node, text: string) => {
    node.textContent = text;
  },
  setAttribute: (el: Element, key: string, value: unknown) => {
    el.setAttribute(key, String(value));
  },
  removeAttribute: (el: Element, key: string) => {
    el.removeAttribute(key);
  },
  addEventListener: (el: Element, event: string, handler: EventListener) => {
    el.addEventListener(event, handler);
  },
  removeEventListener: (el: Element, event: string, handler: EventListener) => {
    el.removeEventListener(event, handler);
  },
};

// ---------------------------------------------------------------------------
// Patch result
// ---------------------------------------------------------------------------

/** Result of applying a patch. */
export interface PatchResult {
  /** Whether the patch was applied successfully. */
  success: boolean;
  /** The DOM node after applying the patch. */
  node: Node | null;
  /** Error message if the patch failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// DiffEngine class
// ---------------------------------------------------------------------------

/**
 * The Diff Engine coordinates VNode creation, diffing, and DOM patching.
 *
 * It maintains the current VNode tree and applies patches to the real DOM
 * through the configured DOMOps.
 */
export class DiffEngine {
  private dom: DOMOps;
  private current: VNode | null = null;
  private root: Node | null = null;
  private componentRegistry: Map<string, ComponentDefinition> = new Map();

  constructor(domOps?: Partial<DOMOps>) {
    this.dom = { ...defaultDOMOps, ...domOps };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Mount the initial VNode tree onto a container element.
   */
  mount(vnode: VNode, container: Node): PatchResult {
    this.root = container;
    this.current = vnode;

    try {
      const el = this.createDOMNode(vnode);
      if (el) {
        this.dom.appendChild(container, el);
        this.callMountedHook(vnode);
      }
      return { success: true, node: el };
    } catch (err) {
      return {
        success: false,
        node: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Unmount the current tree and clean up.
   */
  unmount(): PatchResult {
    if (!this.current || !this.root) {
      return { success: true, node: null };
    }

    try {
      this.callBeforeUnmountHook(this.current);
      this.removeDOMNode(this.current, this.root);
      this.releaseVNodeTree(this.current);
      this.current = null;
      this.root = null;
      return { success: true, node: null };
    } catch (err) {
      return {
        success: false,
        node: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Diff the current tree against a new VNode and apply patches.
   *
   * @param newVNode The new VNode tree.
   * @returns The result of applying patches.
   */
  diff(newVNode: VNode): PatchResult {
    if (!this.current) {
      // Nothing mounted yet -- this is a mount, not a diff
      if (this.root) {
        return this.mount(newVNode, this.root);
      }
      return { success: false, node: null, error: 'No root container' };
    }

    try {
      const patches = this.computePatches(this.current, newVNode);
      const result = this.apply(patches);
      // Release old VNode tree nodes that were replaced
      this.current = newVNode;
      return result;
    } catch (err) {
      return {
        success: false,
        node: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Compute the patches between two VNode trees.
   *
   * @param oldVNode The old tree.
   * @param newVNode The new tree.
   * @returns An ordered array of patches.
   */
  computePatches(oldVNode: VNode, newVNode: VNode): Patch[] {
    const patches: Patch[] = [];
    this.computePatchesRecursive(oldVNode, newVNode, patches);
    return patches;
  }

  /**
   * Apply a list of patches to the DOM.
   *
   * Handles all PatchTypes: CREATE, REPLACE, PROPS, TEXT, REORDER, REMOVE, INSERT.
   *
   * @param patches The patches to apply.
   * @returns The result of the last patch operation.
   */
  apply(patches: Patch[]): PatchResult {
    let lastNode: Node | null = null;
    let success = true;
    let error: string | undefined;

    for (const patch of patches) {
      try {
        const result = this.applyPatch(patch);
        if (result.node) {
          lastNode = result.node;
        }
        if (!result.success) {
          success = false;
          error = result.error;
          break;
        }
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : String(err);
        break;
      }
    }

    return { success, node: lastNode, error };
  }

  /**
   * Get the current VNode tree.
   */
  getCurrentVNode(): VNode | null {
    return this.current;
  }

  /**
   * Get the root container element.
   */
  getRoot(): Node | null {
    return this.root;
  }

  /**
   * Register a component definition.
   */
  registerComponent(def: ComponentDefinition): void {
    this.componentRegistry.set(def.name, def);
  }

  /**
   * Look up a registered component by name.
   */
  getComponent(name: string): ComponentDefinition | undefined {
    return this.componentRegistry.get(name);
  }

  // -------------------------------------------------------------------------
  // Patch computation (recursive)
  // -------------------------------------------------------------------------

  /**
   * Recursively compute patches between old and new VNode trees.
   */
  private computePatchesRecursive(
    oldVNode: VNode,
    newVNode: VNode,
    patches: Patch[],
  ): void {
    // If different types/tags -> REPLACE
    if (!isSameVNode(oldVNode, newVNode)) {
      patches.push({
        type: 'REPLACE',
        vnode: oldVNode,
        newNode: newVNode,
      });
      return;
    }

    // Text / comment -> TEXT patch if content changed
    if (oldVNode.type === 'text' || oldVNode.type === 'comment') {
      if (oldVNode.text !== newVNode.text) {
        patches.push({
          type: 'TEXT',
          vnode: oldVNode,
          newNode: newVNode,
          text: newVNode.text,
        });
      }
      return;
    }

    // Element / component / fragment -> diff props and children
    const propChanges = this.diffPropsForVNode(oldVNode, newVNode);

    // Diff children using keyed algorithm
    const childOps = this.diffChildrenForVNode(oldVNode, newVNode);

    if (propChanges.length > 0 || childOps.length > 0) {
      patches.push({
        type: 'PROPS',
        vnode: oldVNode,
        newNode: newVNode,
        props: propChanges,
        children: newVNode.children,
      });
    }

    // Recursively diff children that were matched
    const oldChildren = oldVNode.children;
    const newChildren = newVNode.children;

    // Build a quick lookup of old children by key for recursion
    const oldChildMap = new Map<VNodeKey, VNode>();
    for (const child of oldChildren) {
      const key = getKey(child);
      if (key !== null) {
        oldChildMap.set(key, child);
      }
    }

    for (const newChild of newChildren) {
      const key = getKey(newChild);
      if (key !== null) {
        const oldChild = oldChildMap.get(key);
        if (oldChild && isSameVNode(oldChild, newChild)) {
          this.computePatchesRecursive(oldChild, newChild, patches);
        }
      } else {
        // Unkeyed -- try positional match
        const idx = newChildren.indexOf(newChild);
        const oldChild = oldChildren[idx];
        if (oldChild && isSameVNode(oldChild, newChild)) {
          this.computePatchesRecursive(oldChild, newChild, patches);
        }
      }
    }
  }

  /**
   * Diff props between two VNodes, returning prop changes.
   * Uses the diffProps function from diff.ts if the old node has a DOM element.
   */
  private diffPropsForVNode(
    oldVNode: VNode,
    newVNode: VNode,
  ): PropChange[] {
    if (oldVNode.el && oldVNode.el instanceof Element) {
      return diffProps(oldVNode.el, oldVNode.props, newVNode.props);
    }

    // No DOM element yet -- compute changes structurally
    const changes: PropChange[] = [];
    const allKeys = new Set<string>([
      ...Object.keys(oldVNode.props),
      ...Object.keys(newVNode.props),
    ]);

    for (const key of allKeys) {
      if (key === 'key' || key === 'ref') continue;
      const oldValue = oldVNode.props[key];
      const newValue = newVNode.props[key];
      if (oldValue !== newValue) {
        changes.push({ key, value: newValue, oldValue });
      }
    }

    return changes;
  }

  /**
   * Diff children between two VNodes using the keyed algorithm.
   */
  private diffChildrenForVNode(
    oldVNode: VNode,
    newVNode: VNode,
  ): Array<{ type: string; newNode: VNode; index: number }> {
    const parentEl = oldVNode.el ?? null;
    if (!parentEl) return [];

    const ops = diffKeyed(oldVNode.children, newVNode.children);
    return ops.map((op) => ({
      type: op.type,
      newNode: op.newNode,
      index: op.index,
    }));
  }

  // -------------------------------------------------------------------------
  // Patch application (per PatchType)
  // -------------------------------------------------------------------------

  /**
   * Apply a single patch.
   * Handles all PatchTypes.
   */
  private applyPatch(patch: Patch): PatchResult {
    switch (patch.type) {
      case 'CREATE':
        return this.applyCreate(patch);
      case 'REPLACE':
        return this.applyReplace(patch);
      case 'PROPS':
        return this.applyProps(patch);
      case 'TEXT':
        return this.applyText(patch);
      case 'REORDER':
        return this.applyReorder(patch);
      case 'REMOVE':
        return this.applyRemove(patch);
      case 'INSERT':
        return this.applyInsert(patch);
      default:
        return {
          success: false,
          node: null,
          error: `Unknown patch type: ${patch.type as string}`,
        };
    }
  }

  /** CREATE -- create a new DOM node and attach it. */
  private applyCreate(patch: Patch): PatchResult {
    const vnode = patch.newNode ?? patch.vnode;
    const el = this.createDOMNode(vnode);
    if (el && this.root) {
      this.dom.appendChild(this.root, el);
      this.callMountedHook(vnode);
    }
    vnode.el = el;
    return { success: true, node: el };
  }

  /** REPLACE -- replace an old DOM node with a new one. */
  private applyReplace(patch: Patch): PatchResult {
    const oldVNode = patch.vnode;
    const newVNode = patch.newNode!;

    if (!oldVNode.el || !oldVNode.el.parentNode) {
      return { success: false, node: null, error: 'Cannot replace: old node has no parent' };
    }

    const parent = oldVNode.el.parentNode;
    const newEl = this.createDOMNode(newVNode);

    if (newEl) {
      this.dom.insertBefore(parent, newEl, oldVNode.el);
      this.callBeforeUnmountHook(oldVNode);
      this.dom.removeChild(parent, oldVNode.el);
      this.callMountedHook(newVNode);
    }

    // Clean up old node
    this.callUnmountedHook(oldVNode);
    removeAllEventListeners(oldVNode);
    releaseVNode(oldVNode);

    newVNode.el = newEl;
    return { success: true, node: newEl };
  }

  /** PROPS -- update props and children on an existing DOM node. */
  private applyProps(patch: Patch): PatchResult {
    const oldVNode = patch.vnode;
    const newVNode = patch.newNode!;
    const el = oldVNode.el;

    if (!el || !(el instanceof Element)) {
      return { success: false, node: null, error: 'Cannot apply props: no DOM element' };
    }

    // Call beforeUpdate hook
    this.callBeforeUpdateHook(oldVNode);

    // Apply prop changes
    if (patch.props) {
      for (const change of patch.props) {
        if (change.value === undefined) {
          removeProp(el, change.key, change.oldValue);
        } else {
          setProp(el, change.key, change.value, change.oldValue);
        }
      }
    }

    // Update children if present
    if (patch.children) {
      this.patchChildren(el, oldVNode.children, newVNode.children);
    }

    // Transfer state to old VNode (so it stays current)
    oldVNode.props = newVNode.props;
    oldVNode.children = newVNode.children;
    oldVNode.text = newVNode.text;

    // Call updated hook
    this.callUpdatedHook(oldVNode);

    return { success: true, node: el };
  }

  /** TEXT -- update text content of a text/comment node. */
  private applyText(patch: Patch): PatchResult {
    const vnode = patch.vnode;
    const newText = patch.text ?? '';

    if (!vnode.el) {
      return { success: false, node: null, error: 'Cannot apply text: no DOM element' };
    }

    this.dom.setTextContent(vnode.el, newText);
    vnode.text = newText;

    return { success: true, node: vnode.el };
  }

  /** REORDER -- reorder children of a parent node. */
  private applyReorder(patch: Patch): PatchResult {
    const vnode = patch.vnode;
    if (!vnode.el) {
      return { success: false, node: null, error: 'Cannot reorder: no parent element' };
    }

    const parentEl = vnode.el;
    const newChildren = patch.children ?? [];

    // Simple approach: remove all children and re-append in new order
    while (parentEl.firstChild) {
      this.dom.removeChild(parentEl, parentEl.firstChild);
    }

    for (const child of newChildren) {
      const childEl = this.createDOMNode(child);
      if (childEl) {
        this.dom.appendChild(parentEl, childEl);
      }
    }

    vnode.children = newChildren;
    return { success: true, node: parentEl };
  }

  /** REMOVE -- remove a DOM node. */
  private applyRemove(patch: Patch): PatchResult {
    const vnode = patch.vnode;

    if (!vnode.el || !vnode.el.parentNode) {
      return { success: true, node: null };
    }

    const parent = vnode.el.parentNode;

    this.callBeforeUnmountHook(vnode);
    this.dom.removeChild(parent, vnode.el);
    this.callUnmountedHook(vnode);
    removeAllEventListeners(vnode);
    releaseVNode(vnode);

    return { success: true, node: null };
  }

  /** INSERT -- insert a new DOM node at a specific position. */
  private applyInsert(patch: Patch): PatchResult {
    const vnode = patch.newNode ?? patch.vnode;
    const index = patch.index ?? 0;

    // Find the parent from the old node (if available) or use root
    const parentEl = patch.vnode.el?.parentNode ?? this.root;
    if (!parentEl) {
      return { success: false, node: null, error: 'No parent for insert' };
    }

    const newEl = this.createDOMNode(vnode);
    if (!newEl) {
      return { success: false, node: null, error: 'Failed to create DOM node' };
    }

    // Find the reference node (the child currently at `index`)
    const ref = parentEl.childNodes[index] ?? null;
    this.dom.insertBefore(parentEl, newEl, ref);

    this.callMountedHook(vnode);
    vnode.el = newEl;

    return { success: true, node: newEl };
  }

  // -------------------------------------------------------------------------
  // DOM node creation
  // -------------------------------------------------------------------------

  /**
   * Create the real DOM node for a VNode (recursively for children).
   */
  private createDOMNode(vnode: VNode): Node | null {
    switch (vnode.type) {
      case 'element': {
        const tag = vnode.tag as string;
        const el = this.dom.createElement(tag);
        vnode.el = el;

        // Apply props
        for (const [key, value] of Object.entries(vnode.props)) {
          if (key !== 'key' && key !== 'ref') {
            setProp(el, key, value);
          }
        }

        // Create and append children
        for (const child of vnode.children) {
          const childEl = this.createDOMNode(child);
          if (childEl) {
            this.dom.appendChild(el, childEl);
          }
        }

        return el;
      }

      case 'text': {
        const el = this.dom.createTextNode(vnode.text);
        vnode.el = el;
        return el;
      }

      case 'comment': {
        const el = this.dom.createComment(vnode.text);
        vnode.el = el;
        return el;
      }

      case 'fragment': {
        const el = this.dom.createDocumentFragment();
        vnode.el = el;

        for (const child of vnode.children) {
          const childEl = this.createDOMNode(child);
          if (childEl) {
            this.dom.appendChild(el, childEl);
          }
        }

        return el;
      }

      case 'component': {
        // Component rendering is handled elsewhere -- for now create a placeholder
        const el = this.dom.createComment(`component:${String(vnode.tag)}`);
        vnode.el = el;
        return el;
      }

      default:
        return null;
    }
  }

  /**
   * Remove a DOM node and all its children.
   */
  private removeDOMNode(vnode: VNode, parent: Node): void {
    if (vnode.el) {
      removeAllEventListeners(vnode);
      if (vnode.el.parentNode) {
        this.dom.removeChild(vnode.el.parentNode, vnode.el);
      }
      vnode.el = null;
    }

    // Recursively remove children
    for (const child of vnode.children) {
      this.removeDOMNode(child, parent);
    }
  }

  /**
   * Patch children of an element using keyed diff.
   */
  private patchChildren(
    parentEl: Node,
    oldChildren: VNode[],
    newChildren: VNode[],
  ): void {
    // Use the keyed diff from diff-optimized.ts
    const ops = diffKeyed(oldChildren, newChildren);

    for (const op of ops) {
      switch (op.type) {
        case 'INSERT': {
          const newEl = this.createDOMNode(op.newNode);
          if (newEl) {
            const ref = parentEl.childNodes[op.index] ?? null;
            this.dom.insertBefore(parentEl, newEl, ref);
            this.callMountedHook(op.newNode);
          }
          break;
        }
        case 'REMOVE': {
          const toRemove = op.removedNodes ?? (op.oldNode ? [op.oldNode] : []);
          for (const node of toRemove) {
            if (node?.el) {
              this.callBeforeUnmountHook(node);
              this.dom.removeChild(parentEl, node.el);
              this.callUnmountedHook(node);
              removeAllEventListeners(node);
              releaseVNode(node);
            }
          }
          break;
        }
        case 'MOVE': {
          if (op.oldNode?.el) {
            const ref = parentEl.childNodes[op.index] ?? null;
            this.dom.insertBefore(parentEl, op.oldNode.el, ref);
            op.newNode.el = op.oldNode.el;
          }
          break;
        }
        case 'UPDATE': {
          if (op.oldNode?.el && op.oldNode.el instanceof Element) {
            // Diff props for the updated child
            diffProps(op.oldNode.el, op.oldNode.props, op.newNode.props);
            // Recursively patch children
            this.patchChildren(op.oldNode.el, op.oldNode.children, op.newNode.children);
            op.newNode.el = op.oldNode.el;
          }
          break;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle hooks
  // -------------------------------------------------------------------------

  private callMountedHook(vnode: VNode): void {
    if (vnode.hooks?.mounted) {
      vnode.hooks.mounted(vnode);
    }
  }

  private callBeforeUpdateHook(vnode: VNode): void {
    if (vnode.hooks?.beforeUpdate) {
      vnode.hooks.beforeUpdate(vnode);
    }
  }

  private callUpdatedHook(vnode: VNode): void {
    if (vnode.hooks?.updated) {
      vnode.hooks.updated(vnode);
    }
  }

  private callBeforeUnmountHook(vnode: VNode): void {
    if (vnode.hooks?.beforeUnmount) {
      vnode.hooks.beforeUnmount(vnode);
    }
  }

  private callUnmountedHook(vnode: VNode): void {
    if (vnode.hooks?.unmounted) {
      vnode.hooks.unmounted(vnode);
    }
  }

  // -------------------------------------------------------------------------
  // Memory management
  // -------------------------------------------------------------------------

  /**
   * Release an entire VNode tree back to the memory pool.
   */
  private releaseVNodeTree(vnode: VNode): void {
    for (const child of vnode.children) {
      this.releaseVNodeTree(child);
    }
    releaseVNode(vnode);
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a new DiffEngine instance.
 *
 * @param domOps Optional custom DOM operations (for SSR or testing).
 * @returns A new DiffEngine instance.
 */
export function createDiffEngine(domOps?: Partial<DOMOps>): DiffEngine {
  return new DiffEngine(domOps);
}

// (All exports are already declared inline above -- no re-export block needed.)
