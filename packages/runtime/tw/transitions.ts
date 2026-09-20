/**
 * Transitions -- FLIP-based animation system.
 *
 * FLIP = First, Last, Invert, Play.
 * When the DOM changes: record positions BEFORE (First), apply change and
 * record new positions (Last), invert with transform (Invert), animate
 * back to zero (Play).
 *
 * Features:
 * - CSS transition-based animations (GPU-accelerated)
 * - JS-based animation hooks (for complex sequences)
 * - Enter/leave transitions for elements
 * - List transitions with stagger
 * - Route transitions
 * - 10 built-in transition presets (fade, slide, scale, zoom, bounce, etc.)
 * - Mode: in-out, out-in, simultaneous
 * - Appear: transitions on initial render
 * - Group transitions with coordinated timing
 */

// --- Types ------------------------------------------------------------

export type TransitionMode = "in-out" | "out-in" | "default";

export interface TransitionDefinition {
  enter?: Record<string, string>;
  enterActive?: Record<string, string>;
  enterTo?: Record<string, string>;
  leave?: Record<string, string>;
  leaveActive?: Record<string, string>;
  leaveTo?: Record<string, string>;
  appear?: boolean;
  duration?: number;
  delay?: number;
  stagger?: number;
  mode?: TransitionMode;
  onBeforeEnter?: (el: HTMLElement) => void;
  onEnter?: (el: HTMLElement, done: () => void) => void;
  onAfterEnter?: (el: HTMLElement) => void;
  onBeforeLeave?: (el: HTMLElement) => void;
  onLeave?: (el: HTMLElement, done: () => void) => void;
  onAfterLeave?: (el: HTMLElement) => void;
}

export interface FlipRecord {
  element: HTMLElement;
  firstRect: DOMRect;
  firstStyle: CSSStyleDeclaration;
}

export interface TransitionState {
  active: boolean;
  element: HTMLElement;
  name: string;
  phase: "enter" | "leave" | "none";
  startTime: number;
  finishTime: number;
}

// --- Transition Manager ----------------------------------------------

export class TransitionManager {
  private root: HTMLElement;
  private definitions = new Map<string, TransitionDefinition>();
  private activeTransitions = new Map<HTMLElement, TransitionState>();
  private flipRecords = new Map<string, FlipRecord[]>();
  private transitionId = 0;

  constructor(root: HTMLElement) { this.root = root; }

  define(name: string, definition: TransitionDefinition): void { this.definitions.set(name, definition); }
  undefine(name: string): void { this.definitions.delete(name); }
  has(name: string): boolean { return this.definitions.has(name); }

  applyEnter(element: HTMLElement, name: string, appearing = false): Promise<void> {
    const def = this.definitions.get(name);
    if (!def) return Promise.resolve();

    return new Promise<void>((resolve) => {
      if (def.onBeforeEnter) def.onBeforeEnter(element);
      const styles = appearing && !def.appear ? null : def;
      if (!styles) { resolve(); return; }

      const state: TransitionState = {
        active: true, element, name, phase: "enter",
        startTime: typeof performance !== "undefined" ? performance.now() : Date.now(),
        finishTime: (typeof performance !== "undefined" ? performance.now() : Date.now()) + (def.duration || 300),
      };
      this.activeTransitions.set(element, state);

      this.applyStyles(element, def.enter);
      void element.offsetHeight; // Force reflow
      this.applyStyles(element, def.enterActive);

      requestAnimationFrame(() => {
        this.applyStyles(element, def.enterTo);
        this.removeStyles(element, def.enter);
        const duration = def.duration || 300;
        const delay = def.delay || 0;
        setTimeout(() => {
          this.removeStyles(element, def.enterActive);
          this.removeStyles(element, def.enterTo);
          if (def.onAfterEnter) def.onAfterEnter(element);
          this.activeTransitions.delete(element);
          resolve();
        }, duration + delay);
      });

      if (def.onEnter) def.onEnter(element, () => { this.activeTransitions.delete(element); resolve(); });
    });
  }

  applyLeave(element: HTMLElement, name: string): Promise<void> {
    const def = this.definitions.get(name);
    if (!def) return Promise.resolve();

    return new Promise<void>((resolve) => {
      if (def.onBeforeLeave) def.onBeforeLeave(element);

      const state: TransitionState = {
        active: true, element, name, phase: "leave",
        startTime: typeof performance !== "undefined" ? performance.now() : Date.now(),
        finishTime: (typeof performance !== "undefined" ? performance.now() : Date.now()) + (def.duration || 300),
      };
      this.activeTransitions.set(element, state);

      this.applyStyles(element, def.leaveActive);
      requestAnimationFrame(() => {
        this.applyStyles(element, def.leave);
        this.applyStyles(element, def.leaveTo);
        const duration = def.duration || 300;
        setTimeout(() => {
          this.removeStyles(element, def.leaveActive);
          this.removeStyles(element, def.leave);
          this.removeStyles(element, def.leaveTo);
          if (def.onAfterLeave) def.onAfterLeave(element);
          this.activeTransitions.delete(element);
          resolve();
        }, duration);
      });

      if (def.onLeave) def.onLeave(element, () => { this.activeTransitions.delete(element); resolve(); });
    });
  }

  async swap(oldEl: HTMLElement, newEl: HTMLElement, name: string, mode: TransitionMode = "default"): Promise<void> {
    const def = this.definitions.get(name);
    if (!def) {
      oldEl.remove();
      if (oldEl.parentElement) oldEl.parentElement.insertBefore(newEl, oldEl);
      return;
    }

    if (mode === "out-in") {
      await this.applyLeave(oldEl, name);
      oldEl.remove();
      if (oldEl.parentElement) oldEl.parentElement.insertBefore(newEl, oldEl);
      await this.applyEnter(newEl, name);
    } else if (mode === "in-out") {
      if (oldEl.parentElement) oldEl.parentElement.insertBefore(newEl, oldEl);
      await this.applyEnter(newEl, name);
      await this.applyLeave(oldEl, name);
      oldEl.remove();
    } else {
      if (oldEl.parentElement) oldEl.parentElement.insertBefore(newEl, oldEl.nextSibling);
      await Promise.all([this.applyEnter(newEl, name), this.applyLeave(oldEl, name)]);
      oldEl.remove();
    }
  }

  // --- FLIP Animation ------------------------------------------------

  recordFirst(elements: HTMLElement[], id: string): void {
    const records: FlipRecord[] = [];
    for (const el of elements) {
      records.push({ element: el, firstRect: el.getBoundingClientRect(), firstStyle: window.getComputedStyle(el) });
    }
    this.flipRecords.set(id, records);
  }

  playFlip(id: string, duration = 300, easing = "cubic-bezier(0.2, 0, 0.2, 1)"): void {
    const records = this.flipRecords.get(id);
    if (!records) return;

    records.forEach((record) => {
      const { element, firstRect } = record;
      const lastRect = element.getBoundingClientRect();
      const dx = firstRect.left - lastRect.left;
      const dy = firstRect.top - lastRect.top;
      const dw = firstRect.width / lastRect.width;
      const dh = firstRect.height / lastRect.height;

      if (dx === 0 && dy === 0 && dw === 1 && dh === 1) return;

      element.style.transformOrigin = "top left";
      element.style.transform = `translate(${dx}px, ${dy}px) scale(${dw}, ${dh})`;
      element.style.transition = "none";

      requestAnimationFrame(() => {
        element.style.transition = `transform ${duration}ms ${easing}`;
        element.style.transform = "";
      });

      setTimeout(() => {
        element.style.transition = "";
        element.style.transform = "";
        element.style.transformOrigin = "";
      }, duration + 50);
    });
    this.flipRecords.delete(id);
  }

  playFlipStagger(id: string, staggerDelay = 50, duration = 300): void {
    const records = this.flipRecords.get(id);
    if (!records) return;

    records.forEach((record, index) => {
      setTimeout(() => {
        const { element, firstRect } = record;
        const lastRect = element.getBoundingClientRect();
        const dx = firstRect.left - lastRect.left;
        const dy = firstRect.top - lastRect.top;
        if (dx === 0 && dy === 0) return;

        element.style.transition = "none";
        element.style.transform = `translate(${dx}px, ${dy}px)`;

        requestAnimationFrame(() => {
          element.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0, 0.2, 1)`;
          element.style.transform = "";
        });

        setTimeout(() => { element.style.transition = ""; element.style.transform = ""; }, duration + 50);
      }, index * staggerDelay);
    });
    this.flipRecords.delete(id);
  }

  // --- List Transitions ----------------------------------------------

  async transitionList(container: HTMLElement, newEls: HTMLElement[], oldEls: HTMLElement[], name: string, stagger = 0): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < newEls.length; i++) {
      container.appendChild(newEls[i]);
      if (stagger > 0) await new Promise(r => setTimeout(r, stagger));
      promises.push(this.applyEnter(newEls[i], name));
    }
    for (let i = 0; i < oldEls.length; i++) {
      if (stagger > 0) await new Promise(r => setTimeout(r, stagger));
      promises.push(this.applyLeave(oldEls[i], name).then(() => oldEls[i].remove()));
    }
    await Promise.all(promises);
  }

  async transitionRoute(container: HTMLElement, newView: HTMLElement, name: string, mode: TransitionMode = "out-in"): Promise<void> {
    const oldView = container.firstElementChild as HTMLElement | null;
    if (!oldView) {
      container.appendChild(newView);
      await this.applyEnter(newView, name);
      return;
    }
    await this.swap(oldView, newView, name, mode);
  }

  // --- CSS Class-based -----------------------------------------------

  applyClassEnter(element: HTMLElement, name: string): Promise<void> {
    return new Promise(resolve => {
      element.classList.add(`${name}-enter`);
      void element.offsetHeight;
      element.classList.add(`${name}-enter-active`);
      requestAnimationFrame(() => {
        element.classList.remove(`${name}-enter`);
        element.classList.add(`${name}-enter-to`);
        const onEnd = () => {
          element.classList.remove(`${name}-enter-active`);
          element.classList.remove(`${name}-enter-to`);
          element.removeEventListener("transitionend", onEnd);
          resolve();
        };
        element.addEventListener("transitionend", onEnd, { once: true });
        setTimeout(onEnd, 1000);
      });
    });
  }

  applyClassLeave(element: HTMLElement, name: string): Promise<void> {
    return new Promise(resolve => {
      element.classList.add(`${name}-leave`);
      void element.offsetHeight;
      element.classList.add(`${name}-leave-active`);
      requestAnimationFrame(() => {
        element.classList.remove(`${name}-leave`);
        element.classList.add(`${name}-leave-to`);
        const onEnd = () => {
          element.classList.remove(`${name}-leave-active`);
          element.classList.remove(`${name}-leave-to`);
          element.removeEventListener("transitionend", onEnd);
          resolve();
        };
        element.addEventListener("transitionend", onEnd, { once: true });
        setTimeout(onEnd, 1000);
      });
    });
  }

  isTransitioning(element: HTMLElement): boolean { return this.activeTransitions.has(element); }

  cancel(element: HTMLElement): void {
    if (this.activeTransitions.has(element)) {
      element.style.transition = "";
      element.style.transform = "";
      this.activeTransitions.delete(element);
    }
  }

  cancelAll(): void {
    for (const [el] of this.activeTransitions) { el.style.transition = ""; el.style.transform = ""; }
    this.activeTransitions.clear();
  }

  getActive(): TransitionState[] { return Array.from(this.activeTransitions.values()); }

  destroy(): void { this.cancelAll(); this.definitions.clear(); this.flipRecords.clear(); }

  // --- Private ------------------------------------------------------

  private applyStyles(el: HTMLElement, styles?: Record<string, string>): void {
    if (!styles) return;
    for (const [key, value] of Object.entries(styles)) el.style.setProperty(this.camelToKebab(key), value);
  }

  private removeStyles(el: HTMLElement, styles?: Record<string, string>): void {
    if (!styles) return;
    for (const key of Object.keys(styles)) el.style.removeProperty(this.camelToKebab(key));
  }

  private camelToKebab(str: string): string { return str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`); }
}

// --- Built-in Transitions --------------------------------------------

export function createBuiltinTransitions(): Record<string, TransitionDefinition> {
  return {
    fade: {
      enter: { opacity: "0" }, enterActive: { transition: "opacity 0.3s ease" }, enterTo: { opacity: "1" },
      leave: { opacity: "1" }, leaveActive: { transition: "opacity 0.3s ease" }, leaveTo: { opacity: "0" }, appear: true,
    },
    "fade-slide": {
      enter: { opacity: "0", transform: "translateY(20px)" }, enterActive: { transition: "opacity 0.3s ease, transform 0.3s ease" }, enterTo: { opacity: "1", transform: "translateY(0)" },
      leave: { opacity: "1", transform: "translateY(0)" }, leaveActive: { transition: "opacity 0.3s ease, transform 0.3s ease" }, leaveTo: { opacity: "0", transform: "translateY(-20px)" }, appear: true,
    },
    scale: {
      enter: { opacity: "0", transform: "scale(0.9)" }, enterActive: { transition: "opacity 0.3s ease, transform 0.3s ease" }, enterTo: { opacity: "1", transform: "scale(1)" },
      leave: { opacity: "1", transform: "scale(1)" }, leaveActive: { transition: "opacity 0.3s ease, transform 0.3s ease" }, leaveTo: { opacity: "0", transform: "scale(1.1)" }, appear: true,
    },
    slide: {
      enter: { transform: "translateX(100%)" }, enterActive: { transition: "transform 0.3s ease" }, enterTo: { transform: "translateX(0)" },
      leave: { transform: "translateX(0)" }, leaveActive: { transition: "transform 0.3s ease" }, leaveTo: { transform: "translateX(-100%)" },
    },
    "slide-left": {
      enter: { transform: "translateX(100%)" }, enterActive: { transition: "transform 0.3s ease" }, enterTo: { transform: "translateX(0)" },
      leave: { transform: "translateX(0)" }, leaveActive: { transition: "transform 0.3s ease" }, leaveTo: { transform: "translateX(-100%)" },
    },
    "slide-right": {
      enter: { transform: "translateX(-100%)" }, enterActive: { transition: "transform 0.3s ease" }, enterTo: { transform: "translateX(0)" },
      leave: { transform: "translateX(0)" }, leaveActive: { transition: "transform 0.3s ease" }, leaveTo: { transform: "translateX(100%)" },
    },
    "slide-up": {
      enter: { transform: "translateY(100%)" }, enterActive: { transition: "transform 0.3s ease" }, enterTo: { transform: "translateY(0)" },
      leave: { transform: "translateY(0)" }, leaveActive: { transition: "transform 0.3s ease" }, leaveTo: { transform: "translateY(-100%)" },
    },
    "slide-down": {
      enter: { transform: "translateY(-100%)" }, enterActive: { transition: "transform 0.3s ease" }, enterTo: { transform: "translateY(0)" },
      leave: { transform: "translateY(0)" }, leaveActive: { transition: "transform 0.3s ease" }, leaveTo: { transform: "translateY(100%)" },
    },
    zoom: {
      enter: { opacity: "0", transform: "scale(0)" }, enterActive: { transition: "opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)" }, enterTo: { opacity: "1", transform: "scale(1)" },
      leave: { opacity: "1", transform: "scale(1)" }, leaveActive: { transition: "opacity 0.3s ease, transform 0.3s ease" }, leaveTo: { opacity: "0", transform: "scale(0)" }, appear: true,
    },
    collapse: {
      enter: { maxHeight: "0", overflow: "hidden" }, enterActive: { transition: "max-height 0.3s ease" }, enterTo: { maxHeight: "1000px" },
      leave: { maxHeight: "1000px", overflow: "hidden" }, leaveActive: { transition: "max-height 0.3s ease" }, leaveTo: { maxHeight: "0" },
    },
    bounce: {
      enter: { opacity: "0", transform: "scale(0.3)" }, enterActive: { animation: "tw-bounce-in 0.6s ease", opacity: "1", transform: "scale(1)" },
      leave: { opacity: "1", transform: "scale(1)" }, leaveActive: { animation: "tw-bounce-out 0.4s ease", opacity: "0" }, appear: true,
    },
  };
}

export function createTransitionManager(root: HTMLElement): TransitionManager {
  const manager = new TransitionManager(root);
  for (const [name, def] of Object.entries(createBuiltinTransitions())) manager.define(name, def);
  return manager;
}

let globalTransitionManager: TransitionManager | null = null;
export function getTransitionManager(): TransitionManager | null { return globalTransitionManager; }
export function initTransitionManager(root: HTMLElement): TransitionManager {
  if (globalTransitionManager) globalTransitionManager.destroy();
  globalTransitionManager = createTransitionManager(root);
  return globalTransitionManager;
}
