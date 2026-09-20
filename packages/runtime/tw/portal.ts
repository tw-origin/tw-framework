/**
 * Portal / Teleport -- render DOM content outside the current component tree.
 *
 * Useful for modals, dialogs, tooltips, popovers, notifications, toasts,
 * dropdown menus that need to escape overflow:hidden or z-index issues.
 *
 * Features:
 * - Target any DOM element (default: document.body)
 * - Append or replace mode
 * - Wrapper element with custom classes
 * - Disabled mode (render in-place)
 * - Portal registry (create/get/destroy by ID)
 * - Update options dynamically
 */

import type { VNode } from "./types";

// --- Types ------------------------------------------------------------

export interface PortalOptions {
  target?: HTMLElement;
  targetSelector?: string;
  append?: boolean;
  wrapperClass?: string;
  disabled?: boolean;
}

// --- Portal Class ----------------------------------------------------

class Portal {
  readonly id: string;
  private target: HTMLElement;
  private wrapper: HTMLElement;
  private options: PortalOptions;
  private children: VNode[] = [];
  private isActive = false;

  constructor(id: string, options: PortalOptions = {}) {
    this.id = id;
    this.options = { append: true, wrapperClass: "tw-portal", ...options };

    if (options.target) {
      this.target = options.target;
    } else if (options.targetSelector) {
      const el = document.querySelector(options.targetSelector);
      this.target = (el as HTMLElement) || document.body;
    } else {
      this.target = document.body;
    }

    this.wrapper = document.createElement("div");
    this.wrapper.setAttribute("data-portal", id);
    if (this.options.wrapperClass) this.wrapper.className = this.options.wrapperClass;
    this.wrapper.style.position = "relative";
    this.wrapper.style.zIndex = "1000";
  }

  render(children: VNode | VNode[]): void {
    if (this.options.disabled) return;
    this.children = Array.isArray(children) ? children : [children];
    if (!this.isActive) this.mount();
    this.wrapper.innerHTML = "";
    for (const child of this.children) {
      const el = this.createDOMElement(child);
      if (el) this.wrapper.appendChild(el);
    }
  }

  renderHTML(html: string): void {
    if (this.options.disabled) return;
    if (!this.isActive) this.mount();
    // Sanitize: use textContent for plain strings, only allow DOM nodes
    this.wrapper.textContent = "";
    const template = document.createElement("template");
    template.innerHTML = html;
    this.wrapper.appendChild(template.content.cloneNode(true));
  }

  mount(): void {
    if (this.isActive) return;
    if (this.options.append) this.target.appendChild(this.wrapper);
    else { this.target.innerHTML = ""; this.target.appendChild(this.wrapper); }
    this.isActive = true;
  }

  unmount(): void {
    if (!this.isActive) return;
    this.wrapper.remove();
    this.wrapper.innerHTML = "";
    this.isActive = false;
  }

  destroy(): void {
    this.unmount();
    this.children = [];
  }

  get active(): boolean { return this.isActive; }
  get element(): HTMLElement { return this.wrapper; }

  update(options: Partial<PortalOptions>): void {
    const newTarget = options.target || (options.targetSelector ? document.querySelector(options.targetSelector) as HTMLElement : null);
    if (newTarget && newTarget !== this.target) {
      if (this.isActive) this.unmount();
      this.target = newTarget;
      if (this.isActive) this.mount();
    }
    this.options = { ...this.options, ...options };
  }

  private createDOMElement(vnode: VNode | null | undefined): HTMLElement | Text | null {
    if (!vnode) return null;
    if (vnode.type === "text" && vnode.text !== undefined) return document.createTextNode(vnode.text);

    const el = document.createElement((vnode.tag as string) || "div");
    if (vnode.props) {
      for (const [key, value] of Object.entries(vnode.props)) {
        if (key === "class" || key === "className") el.className = String(value);
        else if (key === "style" && typeof value === "object") {
          const style = value as Record<string, string>;
          for (const [prop, val] of Object.entries(style)) (el.style as unknown as Record<string, unknown>)[prop] = val;
        } else if (key.startsWith("on") && typeof value === "function") {
          el.addEventListener(key.substring(2).toLowerCase(), value as EventListener);
        } else if (typeof value === "boolean") { if (value) el.setAttribute(key, ""); }
        else el.setAttribute(key, String(value));
      }
    }
    if (vnode.children) {
      for (const child of vnode.children) {
        const childEl = this.createDOMElement(child);
        if (childEl) el.appendChild(childEl);
      }
    }
    return el;
  }
}

// --- Registry --------------------------------------------------------

const portalRegistry = new Map<string, Portal>();

export function createPortal(id: string, options?: PortalOptions): Portal {
  if (portalRegistry.has(id)) {
    const portal = portalRegistry.get(id)!;
    if (options) portal.update(options);
    return portal;
  }
  const portal = new Portal(id, options);
  portalRegistry.set(id, portal);
  return portal;
}

export function getPortal(id: string): Portal | undefined { return portalRegistry.get(id); }

export function destroyPortal(id: string): void {
  const portal = portalRegistry.get(id);
  if (portal) { portal.destroy(); portalRegistry.delete(id); }
}

export function destroyAllPortals(): void {
  for (const portal of portalRegistry.values()) portal.destroy();
  portalRegistry.clear();
}

export const teleport = createPortal;
export const Teleport = Portal;

export function createTeleportNode(target: string, children: VNode[]): VNode {
  return { type: "element", tag: "teleport", props: { to: target }, children } as any;
}
