/**
 * Slots -- named and scoped slots system.
 *
 * Allows parent components to inject content into child components.
 * - Default slot
 * - Named slots (header, footer, sidebar)
 * - Scoped slots (child passes data to parent's slot content)
 * - Slot fallback content
 * - Dynamic slot names
 * - Slot props with defaults
 * - Conditional rendering based on slot availability
 */

import type { VNode } from "./types";

// --- Types ------------------------------------------------------------

export type SlotRenderFn = (props?: Record<string, unknown>) => VNode | VNode[] | null;

export interface SlotDefinition {
  name: string;
  render: SlotRenderFn;
  fallback?: VNode | VNode[] | null;
  props?: Record<string, unknown>;
}

export interface SlotContext {
  slots: Map<string, SlotDefinition>;
  hasSlot(name: string): boolean;
  renderSlot(name: string, props?: Record<string, unknown>): VNode | VNode[] | null;
  getSlotProps(name: string): Record<string, unknown>;
}

// --- Slot Registry --------------------------------------------------

class SlotRegistry {
  private slots = new Map<string, Map<string, SlotDefinition>>();
  private currentComponent = "";

  setComponent(componentId: string): void {
    this.currentComponent = componentId;
    if (!this.slots.has(componentId)) this.slots.set(componentId, new Map());
  }

  register(name: string, render: SlotRenderFn, fallback?: VNode | VNode[] | null): void {
    const componentSlots = this.slots.get(this.currentComponent);
    if (!componentSlots) return;
    componentSlots.set(name, { name, render, fallback });
  }

  registerScoped(name: string, render: SlotRenderFn, defaultProps?: Record<string, unknown>): void {
    const componentSlots = this.slots.get(this.currentComponent);
    if (!componentSlots) return;
    componentSlots.set(name, { name, render, props: defaultProps });
  }

  renderSlot(name: string, props?: Record<string, unknown>): VNode | VNode[] | null {
    const componentSlots = this.slots.get(this.currentComponent);
    if (!componentSlots) return null;
    const slot = componentSlots.get(name);
    if (!slot) return null;
    try {
      const mergedProps = { ...slot.props, ...props };
      const result = slot.render(mergedProps);
      return result ?? slot.fallback;
    } catch (e) {
      console.error(`[TW Slots] Error rendering slot '${name}':`, e);
      return slot.fallback ?? null;
    }
  }

  hasSlot(name: string): boolean {
    const componentSlots = this.slots.get(this.currentComponent);
    return componentSlots ? componentSlots.has(name) : false;
  }

  getSlot(name: string): SlotDefinition | undefined {
    const componentSlots = this.slots.get(this.currentComponent);
    return componentSlots ? componentSlots.get(name) : undefined;
  }

  getSlotNames(): string[] {
    const componentSlots = this.slots.get(this.currentComponent);
    return componentSlots ? Array.from(componentSlots.keys()) : [];
  }

  clearComponent(componentId: string): void { this.slots.delete(componentId); }
  clearAll(): void { this.slots.clear(); }

  createContext(componentId: string): SlotContext {
    this.setComponent(componentId);
    return {
      slots: this.slots.get(componentId) || new Map(),
      hasSlot: (name: string) => this.hasSlot(name),
      renderSlot: (name: string, props?: Record<string, unknown>) => this.renderSlot(name, props),
      getSlotProps: (name: string) => {
        const slot = this.getSlot(name);
        return slot?.props || {};
      },
    };
  }
}

// --- Global Registry & API ------------------------------------------

const globalRegistry = new SlotRegistry();

export function getSlotRegistry(): SlotRegistry { return globalRegistry; }
export function useSlots(componentId: string): SlotContext { return globalRegistry.createContext(componentId); }
export function defineSlot(name: string, render: SlotRenderFn, fallback?: VNode | VNode[] | null): void { globalRegistry.register(name, render, fallback); }
export function defineScopedSlot(name: string, render: SlotRenderFn, defaultProps?: Record<string, unknown>): void { globalRegistry.registerScoped(name, render, defaultProps); }
export function renderSlot(name: string, props?: Record<string, unknown>): VNode | VNode[] | null { return globalRegistry.renderSlot(name, props); }
export function hasSlot(name: string): boolean { return globalRegistry.hasSlot(name); }
export function getSlotNames(): string[] { return globalRegistry.getSlotNames(); }

// --- VNode Helpers ---------------------------------------------------

export function createSlotNode(name: string = "default", props?: Record<string, unknown>): VNode {
  return { type: "element", tag: "slot", props: { name, ...props }, children: [] } as any;
}

export function createSlotContent(name: string = "default", content: VNode | VNode[]): VNode {
  const children = Array.isArray(content) ? content : [content];
  return { type: "element", tag: "template", props: { slot: name }, children } as any;
}

export function resolveSlots(children: VNode[]): Record<string, VNode[]> {
  const slots: Record<string, VNode[]> = { default: [] };
  for (const child of children) {
    const slotName = (child.props?.slot as string) || "default";
    if (!slots[slotName]) slots[slotName] = [];
    slots[slotName].push(child);
  }
  return slots;
}

export function createFallback(text: string): VNode {
  return { type: "text", text } as any;
}
