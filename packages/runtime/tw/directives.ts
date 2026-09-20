/**
 * Custom Directives -- user-defined directives for DOM manipulation.
 *
 * Lifecycle hooks:
 * - created: before element attributes/event listeners are applied
 * - beforeMount: before element is inserted into DOM
 * - mounted: element is in the DOM
 * - beforeUpdate: before VNode updates
 * - updated: VNode has updated
 * - beforeUnmount: before element is removed from DOM
 * - unmounted: element has been removed
 *
 * Built-in directives:
 * - tw-focus: auto-focus an element
 * - tw-intersection: IntersectionObserver wrapper
 * - tw-click-outside: detect clicks outside element
 * - tw-resize: ResizeObserver wrapper
 * - tw-mutation: MutationObserver wrapper
 * - tw-clipboard: copy to clipboard
 * - tw-scroll: scroll handling with throttling
 * - tw-longpress: long press detection
 * - tw-debounce: debounce input
 * - tw-lazy: lazy load images
 */

import type { VNode } from "./types";

// --- Types ------------------------------------------------------------

export interface DirectiveBinding {
  value: unknown;
  oldValue: unknown | null;
  arg: string | null;
  modifiers: Record<string, boolean>;
  expression: string | null;
  instance: unknown;
}

export interface DirectiveHooks {
  created?: (el: HTMLElement, binding: DirectiveBinding) => void;
  beforeMount?: (el: HTMLElement, binding: DirectiveBinding) => void;
  mounted?: (el: HTMLElement, binding: DirectiveBinding) => void;
  beforeUpdate?: (el: HTMLElement, binding: DirectiveBinding) => void;
  updated?: (el: HTMLElement, binding: DirectiveBinding) => void;
  beforeUnmount?: (el: HTMLElement, binding: DirectiveBinding) => void;
  unmounted?: (el: HTMLElement, binding: DirectiveBinding) => void;
}

export type Directive = DirectiveHooks | ((el: HTMLElement, binding: DirectiveBinding) => void);

// --- Directive Registry ----------------------------------------------

class DirectiveRegistry {
  private directives = new Map<string, DirectiveHooks>();
  private instances = new Map<HTMLElement, Map<string, { binding: DirectiveBinding; cleanup: (() => void)[] }>>();

  /**
   * Register a directive.
   */
  register(name: string, directive: Directive): void {
    const hooks: DirectiveHooks = typeof directive === "function"
      ? { mounted: directive }
      : directive;
    this.directives.set(name, hooks);
  }

  /**
   * Unregister a directive.
   */
  unregister(name: string): void {
    this.directives.delete(name);
  }

  /**
   * Check if a directive is registered.
   */
  has(name: string): boolean {
    return this.directives.has(name);
  }

  /**
   * Get a directive by name.
   */
  get(name: string): DirectiveHooks | undefined {
    return this.directives.get(name);
  }

  /**
   * Apply a directive to an element.
   */
  apply(name: string, el: HTMLElement, binding: DirectiveBinding, hook: keyof DirectiveHooks): void {
    const directive = this.directives.get(name);
    if (!directive) return;

    const fn = directive[hook];
    if (!fn) return;

    try {
      fn(el, binding);
    } catch (e) {
      console.error(`[TW Directive] Error in '${name}.${hook}':`, e);
    }

    // Track instance for cleanup
    if (hook === "mounted") {
      if (!this.instances.has(el)) this.instances.set(el, new Map());
      const elInstances = this.instances.get(el)!;
      elInstances.set(name, { binding, cleanup: [] });
    }

    // Cleanup on unmount
    if (hook === "unmounted") {
      const elInstances = this.instances.get(el);
      if (elInstances) {
        const instance = elInstances.get(name);
        if (instance) {
          for (const cleanup of instance.cleanup) {
            try { cleanup(); } catch (e) { console.error("[TW Directive] Cleanup error:", e); }
          }
          elInstances.delete(name);
        }
        if (elInstances.size === 0) this.instances.delete(el);
      }
    }
  }

  /**
   * Register a cleanup function for a directive instance.
   */
  registerCleanup(el: HTMLElement, name: string, cleanup: () => void): void {
    const elInstances = this.instances.get(el);
    if (elInstances) {
      const instance = elInstances.get(name);
      if (instance) instance.cleanup.push(cleanup);
    }
  }

  /**
   * Remove all directives from an element.
   */
  removeAll(el: HTMLElement): void {
    const elInstances = this.instances.get(el);
    if (elInstances) {
      for (const [name, instance] of elInstances) {
        for (const cleanup of instance.cleanup) {
          try { cleanup(); } catch (e) { console.error("[TW Directive] Cleanup error:", e); }
        }
        const directive = this.directives.get(name);
        if (directive?.unmounted) {
          try { directive.unmounted(el, instance.binding); } catch (e) { console.error("[TW Directive] Unmount error:", e); }
        }
      }
      this.instances.delete(el);
    }
  }

  /**
   * Get all registered directive names.
   */
  names(): string[] { return Array.from(this.directives.keys()); }
}

// --- Global Registry --------------------------------------------------

const globalRegistry = new DirectiveRegistry();

export function getDirectiveRegistry(): DirectiveRegistry { return globalRegistry; }

export function registerDirective(name: string, directive: Directive): void {
  globalRegistry.register(name, directive);
}

export function unregisterDirective(name: string): void {
  globalRegistry.unregister(name);
}

// --- Built-in Directives ---------------------------------------------

/**
 * tw-focus -- automatically focus an element when mounted.
 */
export const focusDirective: DirectiveHooks = {
  mounted: (el) => { el.focus(); },
};

/**
 * tw-intersection -- IntersectionObserver wrapper.
 * Calls the binding value with (entry, element) when intersection changes.
 */
export const intersectionDirective: DirectiveHooks = {
  mounted: (el, binding) => {
    const callback = binding.value as (entry: IntersectionObserverEntry, el: HTMLElement) => void;
    if (typeof callback !== "function") return;

    const options: IntersectionObserverInit = {
      rootMargin: (binding.modifiers.rootMargin as unknown as string) || "0px",
      threshold: (binding.modifiers.threshold as unknown as number) || 0,
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) callback(entry, el);
    }, options);

    observer.observe(el);
    globalRegistry.registerCleanup(el, "tw-intersection", () => observer.disconnect());
  },
};

/**
 * tw-click-outside -- detect clicks outside an element.
 */
export const clickOutsideDirective: DirectiveHooks = {
  mounted: (el, binding) => {
    const handler = binding.value as (event: MouseEvent) => void;
    if (typeof handler !== "function") return;

    const listener = (event: MouseEvent) => {
      if (!el.contains(event.target as Node)) {
        handler(event);
      }
    };

    document.addEventListener("click", listener, true);
    globalRegistry.registerCleanup(el, "tw-click-outside", () => {
      document.removeEventListener("click", listener, true);
    });
  },
};

/**
 * tw-resize -- ResizeObserver wrapper.
 */
export const resizeDirective: DirectiveHooks = {
  mounted: (el, binding) => {
    const handler = binding.value as (entry: ResizeObserverEntry, el: HTMLElement) => void;
    if (typeof handler !== "function") return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) handler(entry, el);
    });

    observer.observe(el);
    globalRegistry.registerCleanup(el, "tw-resize", () => observer.disconnect());
  },
};

/**
 * tw-mutation -- MutationObserver wrapper.
 */
export const mutationDirective: DirectiveHooks = {
  mounted: (el, binding) => {
    const handler = binding.value as (mutations: MutationRecord[], el: HTMLElement) => void;
    if (typeof handler !== "function") return;

    const observer = new MutationObserver((mutations) => {
      handler(mutations, el);
    });

    observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
    globalRegistry.registerCleanup(el, "tw-mutation", () => observer.disconnect());
  },
};

/**
 * tw-clipboard -- copy text to clipboard on click.
 */
export const clipboardDirective: DirectiveHooks = {
  mounted: (el, binding) => {
    const text = binding.value as string;
    el.style.cursor = "pointer";

    const handler = async () => {
      try {
        await navigator.clipboard.writeText(text);
        el.dispatchEvent(new CustomEvent("tw-copied", { detail: { text } }));
      } catch (e) {
        console.error("[TW Directive] Clipboard error:", e);
      }
    };

    el.addEventListener("click", handler);
    globalRegistry.registerCleanup(el, "tw-clipboard", () => {
      el.removeEventListener("click", handler);
    });
  },
};

/**
 * tw-debounce -- debounce input events.
 */
export const debounceDirective: DirectiveHooks = {
  mounted: (el, binding) => {
    const handler = binding.value as (value: string) => void;
    const delay = (binding.arg ? parseInt(binding.arg, 10) : 300);
    if (typeof handler !== "function") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const input = el as HTMLInputElement;

    const listener = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => handler(input.value), delay);
    };

    el.addEventListener("input", listener);
    globalRegistry.registerCleanup(el, "tw-debounce", () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener("input", listener);
    });
  },
};

/**
 * tw-longpress -- detect long press on element.
 */
export const longpressDirective: DirectiveHooks = {
  mounted: (el, binding) => {
    const handler = binding.value as () => void;
    const duration = binding.arg ? parseInt(binding.arg, 10) : 500;
    if (typeof handler !== "function") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const start = () => {
      timer = setTimeout(() => {
        handler();
        timer = null;
      }, duration);
    };

    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };

    el.addEventListener("mousedown", start);
    el.addEventListener("touchstart", start);
    el.addEventListener("mouseup", cancel);
    el.addEventListener("mouseleave", cancel);
    el.addEventListener("touchend", cancel);

    globalRegistry.registerCleanup(el, "tw-longpress", () => {
      el.removeEventListener("mousedown", start);
      el.removeEventListener("touchstart", start);
      el.removeEventListener("mouseup", cancel);
      el.removeEventListener("mouseleave", cancel);
      el.removeEventListener("touchend", cancel);
    });
  },
};

/**
 * tw-lazy -- lazy load images with IntersectionObserver.
 */
export const lazyDirective: DirectiveHooks = {
  mounted: (el, binding) => {
    const img = el as HTMLImageElement;
    const src = binding.value as string;
    if (!src) return;

    img.style.opacity = "0";
    img.style.transition = "opacity 0.3s ease";

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          img.src = src;
          img.onload = () => { img.style.opacity = "1"; };
          observer.disconnect();
        }
      }
    });

    observer.observe(img);
    globalRegistry.registerCleanup(el, "tw-lazy", () => observer.disconnect());
  },
};

/**
 * Register all built-in directives.
 */
export function registerBuiltinDirectives(): void {
  registerDirective("tw-focus", focusDirective);
  registerDirective("tw-intersection", intersectionDirective);
  registerDirective("tw-click-outside", clickOutsideDirective);
  registerDirective("tw-resize", resizeDirective);
  registerDirective("tw-mutation", mutationDirective);
  registerDirective("tw-clipboard", clipboardDirective);
  registerDirective("tw-debounce", debounceDirective);
  registerDirective("tw-longpress", longpressDirective);
  registerDirective("tw-lazy", lazyDirective);
}
