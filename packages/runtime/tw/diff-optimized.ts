/**
 * diff-optimized.ts -- Optimised keyed diff + memory pool integration.
 *
 * Upgraded:
 *   - diffKeyed is a proper O(n) algorithm using key maps (no positional fallback).
 *   - releaseVNode for memory pool integration (recycle VNode objects).
 *   - All types exported properly.
 *   - No `any` -- uses `unknown` with proper casts.
 */

import type {
  VNode,
  VNodeKey,
  VNodeProps,
  Patch,
  PropChange,
} from './types';
import { isSameVNode, getKey } from './vdom';
import { diffProps } from './diff';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A move/insert/remove operation in a keyed list reconciliation. */
export interface KeyedDiffOp {
  type: 'INSERT' | 'REMOVE' | 'MOVE' | 'UPDATE';
  /** Lowercase alias of `type` ('create' | 'remove' | 'move' | 'update'), kept for API parity with other diff helpers. */
  kind?: 'create' | 'remove' | 'move' | 'update';
  index: number;
  newNode: VNode;
  oldNode?: VNode;
  fromIndex?: number;
  /**
   * Present only on the "remove everything" fast-path op (new list is empty):
   * all removed nodes, so a consumer can clear the parent in one DOM
   * operation while still running per-node unmount cleanup for each entry.
   */
  removedNodes?: VNode[];
}

const KEYED_OP_KIND: Record<KeyedDiffOp['type'], NonNullable<KeyedDiffOp['kind']>> = {
  INSERT: 'create',
  REMOVE: 'remove',
  MOVE: 'move',
  UPDATE: 'update',
};

/** Options for the keyed diff. */
export interface KeyedDiffOptions {
  /** Whether to diff props for matched nodes (default true). */
  diffProps?: boolean;
  /** Whether to recursively diff children of matched nodes (default true). */
  diffChildren?: boolean;
}

/** Configuration for the VNode memory pool. */
export interface VNodePoolConfig {
  /** Maximum number of VNodes to keep in the pool. */
  maxSize: number;
  /** Whether to reset VNode fields on release. */
  resetOnRelease: boolean;
}

// ---------------------------------------------------------------------------
// Keyed Diff -- O(n) algorithm using key maps
// ---------------------------------------------------------------------------

/**
 * O(n) keyed diff using Map-based lookups.
 *
 * This is a proper keyed reconciliation that:
 *   1. Builds a Map of old children by key.
 *   2. Walks the new children, looking each up in the map.
 *   3. Emits INSERT for new keys, UPDATE for matched keys, MOVE for reordered keys.
 *   4. Emits REMOVE for keys in old but not in new.
 *
 * This is O(n + m) time and O(n) space, where n = |old|, m = |new|.
 *
 * @param oldChildren The previous children array.
 * @param newChildren The new children array.
 * @returns An ordered array of KeyedDiffOp operations.
 */
export function diffKeyed(
  oldChildren: VNode[],
  newChildren: VNode[],
  _options?: KeyedDiffOptions,
): KeyedDiffOp[] {
  const oldLen = oldChildren.length;
  const newLen = newChildren.length;
  const ops: KeyedDiffOp[] = [];

  // Fast paths
  if (oldLen === 0) {
    for (let i = 0; i < newLen; i++) {
      ops.push({ type: 'INSERT', kind: KEYED_OP_KIND.INSERT, index: i, newNode: newChildren[i] });
    }
    return ops;
  }

  if (newLen === 0) {
    // Fast path: the whole list was cleared. Emit a single consolidated
    // REMOVE op (rather than one per child) so a consumer can clear the
    // parent in one DOM operation; `removedNodes` carries every old child
    // for per-node unmount cleanup.
    return [{
      type: 'REMOVE',
      kind: KEYED_OP_KIND.REMOVE,
      index: 0,
      newNode: oldChildren[0],
      oldNode: oldChildren[0],
      removedNodes: oldChildren.slice(),
    }];
  }

  // Step 1: Build a map of old children keyed by their key.
  // If a child has no key, we skip it -- this function is strictly for keyed lists.
  const oldKeyMap = new Map<VNodeKey, { vnode: VNode; index: number }>();
  for (let i = 0; i < oldLen; i++) {
    const child = oldChildren[i];
    const key = getKey(child);
    if (key !== null) {
      // First occurrence wins -- duplicate keys are ignored after the first
      if (!oldKeyMap.has(key)) {
        oldKeyMap.set(key, { vnode: child, index: i });
      }
    }
  }

  // Step 2: Track which old nodes have been matched (so we can remove the rest).
  const matchedOldIndices = new Set<number>();

  // Step 3: Walk new children and build operations.
  for (let i = 0; i < newLen; i++) {
    const newChild = newChildren[i];
    const newKey = getKey(newChild);

    if (newKey !== null) {
      const entry = oldKeyMap.get(newKey);
      if (entry && !matchedOldIndices.has(entry.index)) {
        // Key exists in old -- check type/tag compatibility
        if (isSameVNode(entry.vnode, newChild)) {
          matchedOldIndices.add(entry.index);

          if (entry.index !== i) {
            // Position changed -> MOVE
            ops.push({
              type: 'MOVE',
              kind: KEYED_OP_KIND.MOVE,
              index: i,
              newNode: newChild,
              oldNode: entry.vnode,
              fromIndex: entry.index,
            });
          } else {
            // Same position -> UPDATE
            ops.push({
              type: 'UPDATE',
              kind: KEYED_OP_KIND.UPDATE,
              index: i,
              newNode: newChild,
              oldNode: entry.vnode,
            });
          }
          continue;
        }
      }
      // Key not found in old, or type mismatch -> INSERT
      ops.push({ type: 'INSERT', kind: KEYED_OP_KIND.INSERT, index: i, newNode: newChild });
    } else {
      // No key on new child -> INSERT (keyed diff treats unkeyed as always-new)
      ops.push({ type: 'INSERT', kind: KEYED_OP_KIND.INSERT, index: i, newNode: newChild });
    }
  }

  // Step 4: Remove any old children that were never matched.
  for (let i = 0; i < oldLen; i++) {
    if (!matchedOldIndices.has(i)) {
      ops.push({ type: 'REMOVE', kind: KEYED_OP_KIND.REMOVE, index: i, newNode: oldChildren[i], oldNode: oldChildren[i] });
    }
  }

  return ops;
}

// ---------------------------------------------------------------------------
// Full keyed diff (including prop changes for matched nodes)
// ---------------------------------------------------------------------------

/**
 * Full keyed diff that also computes prop changes for UPDATE/MOVE operations.
 *
 * @param oldChildren The previous children array.
 * @param newChildren The new children array.
 * @returns An object with operations and prop-change patches.
 */
export function diffKeyedFull(
  oldChildren: VNode[],
  newChildren: VNode[],
): {
  ops: KeyedDiffOp[];
  propPatches: Map<number, PropChange[]>;
} {
  const ops = diffKeyed(oldChildren, newChildren);
  const propPatches = new Map<number, PropChange[]>();

  for (const op of ops) {
    if ((op.type === 'UPDATE' || op.type === 'MOVE') && op.oldNode && op.oldNode.el instanceof Element) {
      const changes = diffProps(op.oldNode.el, op.oldNode.props, op.newNode.props);
      if (changes.length > 0) {
        propPatches.set(op.index, changes);
      }
    }
  }

  return { ops, propPatches };
}

// ---------------------------------------------------------------------------
// Unkeyed (positional) diff -- for children without keys
// ---------------------------------------------------------------------------

/**
 * Positional diff for children without keys.
 *
 * This is a simple left-to-right walk:
 *   - Same position, same type -> UPDATE
 *   - Same position, different type -> REPLACE
 *   - New has more -> INSERT the extras
 *   - Old has more -> REMOVE the extras
 *
 * O(n) where n = max(old, new).
 */
export function diffUnkeyed(
  oldChildren: VNode[],
  newChildren: VNode[],
): KeyedDiffOp[] {
  const oldLen = oldChildren.length;
  const newLen = newChildren.length;
  const ops: KeyedDiffOp[] = [];
  const max = Math.max(oldLen, newLen);

  for (let i = 0; i < max; i++) {
    const oldChild = oldChildren[i];
    const newChild = newChildren[i];

    if (oldChild && newChild) {
      if (isSameVNode(oldChild, newChild)) {
        ops.push({ type: 'UPDATE', index: i, newNode: newChild, oldNode: oldChild });
      } else {
        // Different type -- treat as REPLACE (REMOVE + INSERT)
        ops.push({ type: 'REMOVE', index: i, newNode: oldChild, oldNode: oldChild });
        ops.push({ type: 'INSERT', index: i, newNode: newChild });
      }
    } else if (oldChild && !newChild) {
      ops.push({ type: 'REMOVE', index: i, newNode: oldChild, oldNode: oldChild });
    } else if (!oldChild && newChild) {
      ops.push({ type: 'INSERT', index: i, newNode: newChild });
    }
  }

  return ops;
}

// ---------------------------------------------------------------------------
// Memory Pool -- VNode recycling
// ---------------------------------------------------------------------------

/** The default pool configuration. */
const DEFAULT_POOL_CONFIG: VNodePoolConfig = {
  maxSize: 256,
  resetOnRelease: true,
};

/** The VNode memory pool. */
class VNodePool {
  private pool: VNode[] = [];
  private config: VNodePoolConfig;

  constructor(config: Partial<VNodePoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }

  /**
   * Release a VNode back to the pool for reuse.
   * Recursively releases children too.
   */
  release(vnode: VNode): void {
    if (this.pool.length >= this.config.maxSize) {
      // Pool is full -- just detach the DOM references
      vnode.el = null;
      vnode.component = null;
      return;
    }

    // Recursively release children first
    for (const child of vnode.children) {
      this.release(child);
    }

    if (this.config.resetOnRelease) {
      this.resetVNode(vnode);
    }

    this.pool.push(vnode);
  }

  /**
   * Try to acquire a VNode from the pool, or return null if empty.
   */
  acquire(): VNode | null {
    return this.pool.pop() ?? null;
  }

  /** Reset a VNode to a blank state (keeping the object reference for reuse). */
  private resetVNode(vnode: VNode): void {
    vnode.type = 'fragment';
    vnode.tag = null;
    vnode.key = null;
    vnode.props = {};
    vnode.children = [];
    vnode.el = null;
    vnode.text = '';
    vnode.component = null;
    vnode.hooks = null;
    vnode.normalized = false;
  }

  /** Clear the pool entirely. */
  clear(): void {
    this.pool.length = 0;
  }

  /** Current pool size. */
  get size(): number {
    return this.pool.length;
  }

  /** Current pool config. */
  get poolConfig(): VNodePoolConfig {
    return this.config;
  }

  /** Update pool configuration. */
  configure(config: Partial<VNodePoolConfig>): void {
    this.config = { ...this.config, ...config };
    // Trim pool if new max is smaller
    if (this.pool.length > this.config.maxSize) {
      this.pool.length = this.config.maxSize;
    }
  }
}

/** The global VNode pool instance. */
const globalPool = new VNodePool();

/**
 * Release a VNode back to the memory pool.
 * Recursively releases children, allowing VNode objects to be recycled.
 *
 * @param vnode The VNode to release.
 */
export function releaseVNode(vnode: VNode): void {
  globalPool.release(vnode);
}

/**
 * Acquire a VNode from the memory pool, or return null if empty.
 * The returned VNode will have been reset to a blank state.
 */
export function acquireVNode(): VNode | null {
  return globalPool.acquire();
}

/**
 * Configure the global VNode memory pool.
 */
export function configurePool(config: Partial<VNodePoolConfig>): void {
  globalPool.configure(config);
}

/**
 * Clear the global VNode memory pool.
 */
export function clearPool(): void {
  globalPool.clear();
}

/**
 * Get the current size of the global VNode memory pool.
 */
export function poolSize(): number {
  return globalPool.size;
}

// ---------------------------------------------------------------------------
// Patch generation (high-level)
// ---------------------------------------------------------------------------

/**
 * Generate a list of Patch objects from a keyed diff.
 *
 * @param oldChildren The previous children array.
 * @param newChildren The new children array.
 * @returns An array of Patch objects.
 */
export function generateKeyedPatches(
  oldChildren: VNode[],
  newChildren: VNode[],
): Patch[] {
  const { ops } = diffKeyedFull(oldChildren, newChildren);
  const patches: Patch[] = [];

  for (const op of ops) {
    switch (op.type) {
      case 'INSERT':
        patches.push({
          type: 'INSERT',
          vnode: op.newNode,
          newNode: op.newNode,
          index: op.index,
        });
        break;
      case 'REMOVE':
        if (op.oldNode) {
          patches.push({
            type: 'REMOVE',
            vnode: op.oldNode,
          });
        }
        break;
      case 'UPDATE':
      case 'MOVE':
        if (op.oldNode) {
          patches.push({
            type: 'PROPS',
            vnode: op.oldNode,
            newNode: op.newNode,
          });
        }
        break;
    }
  }

  return patches;
}

// (All exports are already declared inline above -- no re-export block needed.)
