/**
 * Provide / Inject -- dependency injection across component tree.
 *
 * Parent components "provide" values that descendant components can "inject"
 * without prop drilling. Values can be reactive signals.
 *
 * Features:
 * - Hierarchical (child can override parent's value for its descendants)
 * - Reactive (if a signal is provided, injecting it creates a dependency)
 * - Type-safe keys (Symbol or string)
 * - Default values
 * - Factory functions
 * - Scoped providers (per-component-instance)
 */

import { signal, type Signal } from "./dependency-graph";

// --- Types ------------------------------------------------------------

export type InjectionKey<T = unknown> = symbol | string;

export interface ProviderEntry {
  value: unknown;
  isFactory: boolean;
  factory?: () => unknown;
  isReactive: boolean;
}

// --- Provider Tree ----------------------------------------------------

class ProviderNode {
  readonly id: string;
  private providers = new Map<InjectionKey, ProviderEntry>();
  private parent: ProviderNode | null;
  private children = new Set<ProviderNode>();

  constructor(id: string, parent: ProviderNode | null = null) {
    this.id = id;
    this.parent = parent;
  }

  provide<T>(key: InjectionKey<T>, value: T): void {
    this.providers.set(key, {
      value,
      isFactory: false,
      isReactive: false,
    });
  }

  provideReactive<T>(key: InjectionKey<T>, value: Signal<T>): void {
    this.providers.set(key, {
      value,
      isFactory: false,
      isReactive: true,
    });
  }

  provideFactory<T>(key: InjectionKey<T>, factory: () => T): void {
    this.providers.set(key, {
      value: null,
      isFactory: true,
      factory,
      isReactive: false,
    });
  }

  inject<T>(key: InjectionKey<T>, defaultValue?: T): T | undefined {
    const entry = this.findProvider(key);
    if (!entry) return defaultValue;

    if (entry.isFactory && entry.factory) {
      const value = entry.factory();
      // Cache the result
      entry.value = value;
      entry.isFactory = false;
      return value as T;
    }

    return entry.value as T;
  }

  injectReactive<T>(key: InjectionKey<T>, defaultValue?: T): Signal<T> | undefined {
    const entry = this.findProvider(key);
    if (!entry) {
      return defaultValue !== undefined ? signal(defaultValue) : undefined;
    }
    return entry.value as Signal<T>;
  }

  has(key: InjectionKey): boolean {
    return this.findProvider(key) !== null;
  }

  createChild(id: string): ProviderNode {
    const child = new ProviderNode(id, this);
    this.children.add(child);
    return child;
  }

  removeChild(child: ProviderNode): void {
    this.children.delete(child);
  }

  dispose(): void {
    this.providers.clear();
    if (this.parent) this.parent.removeChild(this);
    for (const child of this.children) child.dispose();
    this.children.clear();
  }

  get providerCount(): number { return this.providers.size; }
  get childCount(): number { return this.children.size; }

  private findProvider(key: InjectionKey): ProviderEntry | null {
    if (this.providers.has(key)) return this.providers.get(key)!;
    if (this.parent) return this.parent.findProvider(key);
    return null;
  }
}

// --- Global Provider Tree --------------------------------------------

let rootNode: ProviderNode | null = null;
let currentNode: ProviderNode | null = null;
const nodeStack: ProviderNode[] = [];

/**
 * Initialize the provider tree.
 */
export function initProviderTree(): ProviderNode {
  rootNode = new ProviderNode("root");
  currentNode = rootNode;
  return rootNode;
}

/**
 * Get the root provider node.
 */
export function getRootProvider(): ProviderNode | null {
  return rootNode;
}

/**
 * Get the current provider node.
 */
export function getCurrentProvider(): ProviderNode | null {
  return currentNode;
}

/**
 * Enter a component scope (push a new provider node).
 */
export function enterScope(componentId: string): ProviderNode {
  if (!currentNode) initProviderTree();
  const child = currentNode!.createChild(componentId);
  nodeStack.push(currentNode!);
  currentNode = child;
  return child;
}

/**
 * Exit a component scope (pop the provider node).
 */
export function exitScope(): void {
  if (nodeStack.length > 0) {
    currentNode = nodeStack.pop() || rootNode;
  }
}

/**
 * Provide a value to descendants.
 */
export function provide<T>(key: InjectionKey<T>, value: T): void {
  if (!currentNode) initProviderTree();
  currentNode!.provide(key, value);
}

/**
 * Provide a reactive signal to descendants.
 */
export function provideReactive<T>(key: InjectionKey<T>, value: Signal<T>): void {
  if (!currentNode) initProviderTree();
  currentNode!.provideReactive(key, value);
}

/**
 * Provide a factory function to descendants (lazy initialization).
 */
export function provideFactory<T>(key: InjectionKey<T>, factory: () => T): void {
  if (!currentNode) initProviderTree();
  currentNode!.provideFactory(key, factory);
}

/**
 * Inject a value from ancestors.
 */
export function inject<T>(key: InjectionKey<T>, defaultValue?: T): T | undefined {
  if (!currentNode) return defaultValue;
  return currentNode.inject(key, defaultValue);
}

/**
 * Inject a reactive signal from ancestors.
 */
export function injectReactive<T>(key: InjectionKey<T>, defaultValue?: T): Signal<T> | undefined {
  if (!currentNode) return defaultValue !== undefined ? signal(defaultValue) : undefined;
  return currentNode.injectReactive(key, defaultValue);
}

/**
 * Create a typed injection key.
 */
export function createInjectionKey<T>(description: string): InjectionKey<T> {
  return Symbol(description);
}

/**
 * Dispose the entire provider tree.
 */
export function disposeProviderTree(): void {
  if (rootNode) {
    rootNode.dispose();
    rootNode = null;
    currentNode = null;
    nodeStack.length = 0;
  }
}
