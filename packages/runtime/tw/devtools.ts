/**
 * DevTools -- inspection API for browser devtools extension.
 *
 * Exposes the framework's internal state for debugging:
 * - Component tree inspection
 * - State inspection and time-travel
 * - Event log
 * - Performance profiling data
 * - Reactivity dependency graph
 * - Router state
 * - Store state
 *
 * Connects via window.__TW_DEVTOOLS__ bridge.
 */

import type { VNode } from "./types";

// --- Types ------------------------------------------------------------

export interface ComponentTreeNode {
  id: string;
  name: string;
  tag: string;
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  children: ComponentTreeNode[];
  isMounted: boolean;
  renderCount: number;
  lastRenderTime: number;
}

export interface DevtoolsState {
  components: ComponentTreeNode[];
  stores: Array<{ id: string; state: Record<string, unknown> }>;
  events: Array<{ name: string; data: unknown; timestamp: number }>;
  router: { current: string; history: string[] } | null;
  reactivity: { signalCount: number; effectCount: number };
  memory: { vnodePool: number; domPool: number };
}

// --- DevTools Class --------------------------------------------------

class TWDevTools {
  private enabled = false;
  private componentTree = new Map<string, ComponentTreeNode>();
  private eventLog: Array<{ name: string; data: unknown; timestamp: number }> = [];
  private maxEvents = 500;
  private bridge: ((type: string, data: unknown) => void) | null = null;

  /**
   * Enable devtools.
   */
  enable(): void {
    this.enabled = true;
    if (typeof globalThis !== "undefined") {
      (globalThis as Record<string, unknown>).__TW_DEVTOOLS__ = {
        inspect: () => this.getState(),
        getComponents: () => this.getComponents(),
        getEvents: () => this.getEvents(),
        enable: () => this.enable(),
        disable: () => this.disable(),
      };
    }
  }

  /**
   * Disable devtools.
   */
  disable(): void {
    this.enabled = false;
    if (typeof globalThis !== "undefined") {
      delete (globalThis as Record<string, unknown>).__TW_DEVTOOLS__;
    }
  }

  get isEnabled(): boolean { return this.enabled; }

  /**
   * Register a component in the tree.
   */
  registerComponent(node: ComponentTreeNode): void {
    if (!this.enabled) return;
    this.componentTree.set(node.id, node);
    this.notifyBridge("component:registered", node);
  }

  /**
   * Update a component.
   */
  updateComponent(id: string, updates: Partial<ComponentTreeNode>): void {
    if (!this.enabled) return;
    const node = this.componentTree.get(id);
    if (node) {
      Object.assign(node, updates);
      node.renderCount++;
      node.lastRenderTime = Date.now();
      this.notifyBridge("component:updated", node);
    }
  }

  /**
   * Unregister a component.
   */
  unregisterComponent(id: string): void {
    if (!this.enabled) return;
    this.componentTree.delete(id);
    this.notifyBridge("component:unregistered", { id });
  }

  /**
   * Log an event.
   */
  logEvent(name: string, data: unknown): void {
    if (!this.enabled) return;
    this.eventLog.push({ name, data, timestamp: Date.now() });
    if (this.eventLog.length > this.maxEvents) this.eventLog.shift();
    this.notifyBridge("event", { name, data });
  }

  /**
   * Get the full devtools state.
   */
  getState(): DevtoolsState {
    return {
      components: this.getComponents(),
      stores: [],
      events: this.getEvents(),
      router: null,
      reactivity: { signalCount: 0, effectCount: 0 },
      memory: { vnodePool: 0, domPool: 0 },
    };
  }

  /**
   * Get all registered components.
   */
  getComponents(): ComponentTreeNode[] {
    return Array.from(this.componentTree.values());
  }

  /**
   * Get component by ID.
   */
  getComponent(id: string): ComponentTreeNode | undefined {
    return this.componentTree.get(id);
  }

  /**
   * Get event log.
   */
  getEvents(): Array<{ name: string; data: unknown; timestamp: number }> {
    return [...this.eventLog];
  }

  /**
   * Set the bridge callback (for devtools extension).
   */
  setBridge(cb: (type: string, data: unknown) => void): void {
    this.bridge = cb;
  }

  /**
   * Clear all data.
   */
  clear(): void {
    this.componentTree.clear();
    this.eventLog = [];
  }

  private notifyBridge(type: string, data: unknown): void {
    if (this.bridge) {
      try { this.bridge(type, data); }
      catch (e) { console.error("[TW DevTools] Bridge error:", e); }
    }
  }
}

// --- Global DevTools --------------------------------------------------

let globalDevTools: TWDevTools | null = null;

export function getDevTools(): TWDevTools {
  if (!globalDevTools) globalDevTools = new TWDevTools();
  return globalDevTools;
}

export function enableDevTools(): void { getDevTools().enable(); }
export function disableDevTools(): void { getDevTools().disable(); }
export function isDevToolsEnabled(): boolean { return globalDevTools?.isEnabled ?? false; }
