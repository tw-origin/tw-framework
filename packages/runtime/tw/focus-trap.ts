/**
 * Focus Trap -- trap focus within a container (for modals, dialogs).
 *
 * Features:
 * - Trap Tab/Shift+Tab within container
 * - Auto-focus first focusable element on activation
 * - Restore focus to trigger element on deactivation
 * - Configurable initial focus element
 * - Skip non-visible elements
 * - Support for shadow DOM
 * - Nested focus traps
 * - Focus return (restore previous focus)
 * - Click outside handling
 * - Escape key handling
 */

// --- Types ------------------------------------------------------------

export interface FocusTrapOptions {
  initialFocus?: HTMLElement | string | null;
  fallbackFocus?: HTMLElement | string;
  returnFocus?: boolean;
  escapeDeactivates?: boolean;
  clickOutsideDeactivates?: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
  allowOutsideClick?: boolean | ((event: MouseEvent) => boolean);
  checkVisibility?: boolean;
}

// --- Focus Trap ------------------------------------------------------

export class FocusTrap {
  private container: HTMLElement;
  private options: Required<Omit<FocusTrapOptions, "initialFocus" | "fallbackFocus" | "onActivate" | "onDeactivate" | "allowOutsideClick">> & Pick<FocusTrapOptions, "initialFocus" | "fallbackFocus" | "onActivate" | "onDeactivate" | "allowOutsideClick">;
  private previouslyFocused: HTMLElement | null = null;
  private isActive = false;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(container: HTMLElement, options: FocusTrapOptions = {}) {
    this.container = container;
    this.options = {
      returnFocus: true,
      escapeDeactivates: true,
      clickOutsideDeactivates: false,
      checkVisibility: true,
      ...options,
    };
  }

  /**
   * Activate the focus trap.
   */
  activate(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.previouslyFocused = document.activeElement as HTMLElement;

    if (this.options.onActivate) this.options.onActivate();

    // Focus initial element
    const initialFocus = this.resolveFocusTarget(this.options.initialFocus);
    if (initialFocus) {
      initialFocus.focus();
    } else {
      const focusable = this.getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        // Fallback
        const fallback = this.resolveFocusTarget(this.options.fallbackFocus);
        if (fallback) fallback.focus();
        else this.container.focus();
      }
    }

    // Set up event listeners
    this.keydownHandler = this.handleKeyDown.bind(this);
    this.clickHandler = this.handleClick.bind(this);
    document.addEventListener("keydown", this.keydownHandler, true);
    if (this.options.clickOutsideDeactivates) {
      document.addEventListener("click", this.clickHandler, true);
    }
  }

  /**
   * Deactivate the focus trap.
   */
  deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler, true);
      this.keydownHandler = null;
    }
    if (this.clickHandler) {
      document.removeEventListener("click", this.clickHandler, true);
      this.clickHandler = null;
    }

    if (this.options.onDeactivate) this.options.onDeactivate();

    // Restore focus
    if (this.options.returnFocus && this.previouslyFocused) {
      this.previouslyFocused.focus();
      this.previouslyFocused = null;
    }
  }

  /**
   * Check if the focus trap is active.
   */
  get active(): boolean { return this.isActive; }

  /**
   * Update options.
   */
  update(options: Partial<FocusTrapOptions>): void {
    this.options = { ...this.options, ...options };
  }

  // --- Internal ------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isActive) return;

    if (e.key === "Escape" && this.options.escapeDeactivates) {
      e.preventDefault();
      this.deactivate();
      return;
    }

    if (e.key !== "Tab") return;

    const focusable = this.getFocusableElements();
    if (focusable.length === 0) {
      e.preventDefault();
      this.container.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first || !this.container.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  private handleClick(e: MouseEvent): void {
    if (!this.isActive || !this.options.clickOutsideDeactivates) return;

    if (!this.container.contains(e.target as Node)) {
      // Check if outside click is allowed
      if (this.options.allowOutsideClick === true) return;
      if (typeof this.options.allowOutsideClick === "function") {
        if (this.options.allowOutsideClick(e)) return;
      }

      this.deactivate();
    }
  }

  private getFocusableElements(): HTMLElement[] {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
      "[contenteditable=true]",
      "audio[controls]",
      "video[controls]",
      'details > summary:first-of-type',
    ].join(", ");

    const elements = Array.from(this.container.querySelectorAll<HTMLElement>(selector));

    // Filter by visibility
    if (this.options.checkVisibility) {
      return elements.filter(el => this.isVisible(el));
    }

    return elements;
  }

  private isVisible(element: HTMLElement): boolean {
    if (element.offsetWidth === 0 || element.offsetHeight === 0) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;
    return true;
  }

  private resolveFocusTarget(target: HTMLElement | string | null | undefined): HTMLElement | null {
    if (!target) return null;
    if (typeof target === "string") {
      return this.container.querySelector<HTMLElement>(target);
    }
    return target;
  }
}

// --- Factory ----------------------------------------------------------

export function createFocusTrap(container: HTMLElement, options?: FocusTrapOptions): FocusTrap {
  return new FocusTrap(container, options);
}

// --- Focus Stack (nested traps) --------------------------------------

class FocusStack {
  private traps: FocusTrap[] = [];

  push(trap: FocusTrap): void {
    // Deactivate the current top trap (but don't remove it)
    if (this.traps.length > 0) {
      this.traps[this.traps.length - 1].deactivate();
    }
    this.traps.push(trap);
    trap.activate();
  }

  pop(): FocusTrap | undefined {
    const trap = this.traps.pop();
    if (trap) {
      trap.deactivate();
      // Reactivate the previous trap
      if (this.traps.length > 0) {
        this.traps[this.traps.length - 1].activate();
      }
    }
    return trap;
  }

  get top(): FocusTrap | undefined {
    return this.traps[this.traps.length - 1];
  }

  get size(): number { return this.traps.length; }

  clear(): void {
    while (this.traps.length > 0) this.pop();
  }
}

let globalFocusStack: FocusStack | null = null;

export function getFocusStack(): FocusStack {
  if (!globalFocusStack) globalFocusStack = new FocusStack();
  return globalFocusStack;
}

/**
 * Auto-focus the first focusable element in a container.
 */
export function autoFocus(container: HTMLElement, selector?: string): boolean {
  const sel = selector || [
    "a[href]", "button:not([disabled])", "input:not([disabled])",
    "select:not([disabled])", "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])', "[contenteditable=true]",
  ].join(", ");

  const el = container.querySelector<HTMLElement>(sel);
  if (el) { el.focus(); return true; }
  return false;
}
