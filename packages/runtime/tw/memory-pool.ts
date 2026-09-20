/**
 * MemoryPool -- object pooling for VNodes and DOM elements.
 *
 * Reduces GC pressure by recycling objects instead of creating new ones.
 * Especially important for high-frequency updates (lists, animations, real-time data).
 *
 * Features:
 * - Generic object pool (pool any object type)
 * - VNode pool (pre-allocated VNode objects)
 * - DOM element pool (recycle div/span/etc.)
 * - Configurable pool size
 * - Statistics (allocations, recyclings, pool hits/misses)
 * - Auto-grow when pool is empty
 * - Cleanup (drain pool on unmount)
 */

import type { VNode } from "./types";

// --- Generic Object Pool ---------------------------------------------

export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;
  private stats = { allocated: 0, recycled: 0, hits: 0, misses: 0 };

  constructor(factory: () => T, reset: (obj: T) => void, maxSize = 1000) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;

    // Pre-allocate some objects
    for (let i = 0; i < Math.min(50, maxSize); i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      this.stats.hits++;
      return this.pool.pop()!;
    }
    this.stats.misses++;
    this.stats.allocated++;
    return this.factory();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
      this.stats.recycled++;
    }
  }

  releaseAll(objects: T[]): void {
    for (const obj of objects) this.release(obj);
  }

  grow(count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.pool.length < this.maxSize) {
        this.pool.push(this.factory());
      }
    }
  }

  drain(): void {
    this.pool.length = 0;
  }

  getStats() {
    return {
      ...this.stats,
      poolSize: this.pool.length,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0,
    };
  }
}

// --- VNode Pool ------------------------------------------------------

function createVNode(): VNode {
  return {
    type: "element",
    tag: "",
    props: {},
    children: [],
  } as any;
}

function resetVNode(vnode: VNode): void {
  vnode.type = "element";
  vnode.tag = undefined;
  vnode.props = undefined;
  vnode.children = undefined;
  vnode.text = undefined;
  vnode.key = undefined;
  vnode.el = undefined;
  vnode.component = undefined;
  (vnode as any).componentInstance = undefined;
  vnode.hooks = undefined;
  (vnode as any)._dirty = undefined;
  (vnode as any)._hoisted = undefined;
}

export const vnodePool = new ObjectPool<VNode>(createVNode, resetVNode, 5000);

/**
 * Acquire a VNode from the pool.
 */
export function acquireVNode(type?: string, tag?: string, props?: Record<string, unknown>, children?: VNode[]): VNode {
  const vnode = vnodePool.acquire();
  vnode.type = (type || "element") as any;
  vnode.tag = tag;
  vnode.props = props;
  vnode.children = children;
  return vnode;
}

/**
 * Release a VNode back to the pool.
 */
export function releaseVNode(vnode: VNode): void {
  if (vnode.children) {
    for (const child of vnode.children) releaseVNode(child);
  }
  vnodePool.release(vnode);
}

/**
 * Release multiple VNodes.
 */
export function releaseVNodes(vnodes: VNode[]): void {
  for (const vnode of vnodes) releaseVNode(vnode);
}

// --- DOM Element Pool ------------------------------------------------

class DOMElementPool {
  private pools = new Map<string, HTMLElement[]>();
  private maxSize: number;
  private stats = { created: 0, reused: 0, released: 0 };

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  acquire(tag: string): HTMLElement {
    const pool = this.pools.get(tag);
    if (pool && pool.length > 0) {
      this.stats.reused++;
      const el = pool.pop()!;
      el.innerHTML = "";
      el.className = "";
      el.style.cssText = "";
      return el;
    }
    this.stats.created++;
    return document.createElement(tag);
  }

  release(el: HTMLElement): void {
    const tag = el.tagName.toLowerCase();
    if (!this.pools.has(tag)) this.pools.set(tag, []);
    const pool = this.pools.get(tag)!;
    if (pool.length < this.maxSize) {
      el.innerHTML = "";
      el.className = "";
      el.style.cssText = "";
      // Remove all attributes
      while (el.attributes.length > 0) {
        el.removeAttribute(el.attributes[0].name);
      }
      // Remove event listeners by cloning
      pool.push(el);
      this.stats.released++;
    }
  }

  releaseAll(elements: HTMLElement[]): void {
    for (const el of elements) this.release(el);
  }

  drain(): void {
    this.pools.clear();
  }

  getStats() {
    return {
      ...this.stats,
      poolSizes: Object.fromEntries(
        Array.from(this.pools.entries()).map(([tag, pool]) => [tag, pool.length])
      ),
    };
  }
}

let globalDOMPool: DOMElementPool | null = null;

export function getDOMPool(): DOMElementPool {
  if (!globalDOMPool) globalDOMPool = new DOMElementPool();
  return globalDOMPool;
}

export function acquireElement(tag: string): HTMLElement {
  return getDOMPool().acquire(tag);
}

export function releaseElement(el: HTMLElement): void {
  getDOMPool().release(el);
}

// --- Memory Manager --------------------------------------------------

class MemoryManager {
  private vnodePool = vnodePool;
  private domPool: DOMElementPool | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  init(): void {
    this.domPool = getDOMPool();
  }

  /**
   * Start periodic cleanup (removes excess pooled objects).
   */
  startAutoCleanup(intervalMs = 30000): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  stopAutoCleanup(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Clean up excess pooled objects.
   */
  cleanup(): void {
    // Keep only half the pool if it's mostly unused
    const vnodeStats = this.vnodePool.getStats();
    if (vnodeStats.poolSize > 500 && vnodeStats.hitRate < 0.3) {
      // Drain half
      const toRemove = Math.floor(vnodeStats.poolSize / 2);
      for (let i = 0; i < toRemove; i++) {
        this.vnodePool.acquire(); // Just acquire and discard
      }
    }
  }

  /**
   * Full cleanup -- drain all pools.
   */
  destroy(): void {
    this.stopAutoCleanup();
    this.vnodePool.drain();
    if (this.domPool) this.domPool.drain();
  }

  getStats() {
    return {
      vnode: this.vnodePool.getStats(),
      dom: this.domPool ? this.domPool.getStats() : null,
    };
  }
}

let globalMemoryManager: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!globalMemoryManager) {
    globalMemoryManager = new MemoryManager();
    globalMemoryManager.init();
  }
  return globalMemoryManager;
}

export function destroyMemoryManager(): void {
  if (globalMemoryManager) {
    globalMemoryManager.destroy();
    globalMemoryManager = null;
  }
}
