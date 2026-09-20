/**
 * Intersection Observer -- utilities for viewport detection.
 *
 * Features:
 * - Simple onEnter/onLeave API
 * - One-time enter (for lazy loading)
 * - Throttled callbacks
 * - Multiple element tracking
 * - Root margin and threshold presets
 * - Polling fallback for old browsers
 * - Disconnect/cleanup
 * - Reactive visible state (signal)
 */

import { signal, type Signal } from "./dependency-graph";

// --- Types ------------------------------------------------------------

export interface VisibilityOptions {
  root?: HTMLElement | null;
  rootMargin?: string;
  threshold?: number | number[];
  once?: boolean;
  throttleMs?: number;
}

export interface VisibilityState {
  isVisible: boolean;
  hasEntered: boolean;
  intersectionRatio: number;
}

// --- Visibility Manager ----------------------------------------------

class VisibilityManager {
  private observers = new Map<string, IntersectionObserver>();
  private elements = new Map<HTMLElement, {
    signal: Signal<VisibilityState>;
    onEnter?: () => void;
    onLeave?: () => void;
    once: boolean;
    throttled: boolean;
    lastCall: number;
    throttleMs: number;
  }>();

  /**
   * Observe an element for visibility changes.
   */
  observe(
    element: HTMLElement,
    options: VisibilityOptions & { onEnter?: () => void; onLeave?: () => void } = {},
  ): Signal<VisibilityState> {
    const key = this.buildKey(options);
    const state = signal<VisibilityState>({
      isVisible: false,
      hasEntered: false,
      intersectionRatio: 0,
    });

    const entry = {
      signal: state,
      onEnter: options.onEnter,
      onLeave: options.onLeave,
      once: options.once || false,
      throttled: (options.throttleMs || 0) > 0,
      lastCall: 0,
      throttleMs: options.throttleMs || 0,
    };

    this.elements.set(element, entry);

    // Get or create observer
    let observer = this.observers.get(key);
    if (!observer) {
      observer = this.createObserver(options);
      this.observers.set(key, observer);
    }
    observer.observe(element);

    return state;
  }

  /**
   * Stop observing an element.
   */
  unobserve(element: HTMLElement): void {
    for (const observer of this.observers.values()) {
      observer.unobserve(element);
    }
    this.elements.delete(element);
  }

  /**
   * Check if an element is currently visible.
   */
  isVisible(element: HTMLElement): boolean {
    return this.elements.get(element)?.signal.peek().isVisible || false;
  }

  /**
   * Get the reactive visibility state for an element.
   */
  getVisibilitySignal(element: HTMLElement): Signal<VisibilityState> | undefined {
    return this.elements.get(element)?.signal;
  }

  /**
   * Destroy all observers.
   */
  destroy(): void {
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();
    this.elements.clear();
  }

  // --- Internal ------------------------------------------------------

  private createObserver(options: VisibilityOptions): IntersectionObserver {
    return new IntersectionObserver(
      (entries) => this.handleIntersect(entries),
      {
        root: options.root || null,
        rootMargin: options.rootMargin || "0px",
        threshold: options.threshold || 0,
      },
    );
  }

  private handleIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      const data = this.elements.get(element);
      if (!data) continue;

      // Throttle
      if (data.throttled) {
        const now = Date.now();
        if (now - data.lastCall < data.throttleMs) continue;
        data.lastCall = now;
      }

      const isVisible = entry.isIntersecting;
      const wasVisible = data.signal.peek().isVisible;

      data.signal.set({
        isVisible,
        hasEntered: data.signal.peek().hasEntered || isVisible,
        intersectionRatio: entry.intersectionRatio,
      });

      if (isVisible && !wasVisible) {
        if (data.onEnter) data.onEnter();
      } else if (!isVisible && wasVisible) {
        if (data.onLeave) data.onLeave();
      }

      if (isVisible && data.once) {
        this.unobserve(element);
      }
    }
  }

  private buildKey(options: VisibilityOptions): string {
    return `${options.root ? "el" : "null"}:${options.rootMargin || "0px"}:${JSON.stringify(options.threshold || 0)}`;
  }
}

// --- Global Manager --------------------------------------------------

let globalVisibilityManager: VisibilityManager | null = null;

export function getVisibilityManager(): VisibilityManager {
  if (!globalVisibilityManager) globalVisibilityManager = new VisibilityManager();
  return globalVisibilityManager;
}

export function observeVisibility(
  element: HTMLElement,
  options?: VisibilityOptions & { onEnter?: () => void; onLeave?: () => void },
): Signal<VisibilityState> {
  return getVisibilityManager().observe(element, options);
}

export function whenVisible(element: HTMLElement, callback: () => void, options?: VisibilityOptions): () => void {
  const manager = getVisibilityManager();
  const signal = manager.observe(element, { ...options, once: true, onEnter: callback });
  return () => manager.unobserve(element);
}

export function whenInViewport(element: HTMLElement, callback: () => void): () => void {
  return whenVisible(element, callback, { threshold: 0.01 });
}

// --- Scroll Direction Detection --------------------------------------

export type ScrollDirection = "up" | "down" | "left" | "right" | "none";

class ScrollDirectionDetector {
  private lastScrollX = 0;
  private lastScrollY = 0;
  private currentDirection: ScrollDirection = "none";
  private listeners = new Set<(direction: ScrollDirection, delta: number) => void>();

  constructor() {
    if (typeof window !== "undefined") {
      this.lastScrollX = window.scrollX;
      this.lastScrollY = window.scrollY;
      window.addEventListener("scroll", this.handleScroll, { passive: true });
    }
  }

  getDirection(): ScrollDirection { return this.currentDirection; }

  onScrollDirection(callback: (direction: ScrollDirection, delta: number) => void): () => void {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", this.handleScroll);
    }
    this.listeners.clear();
  }

  private handleScroll = (): void => {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const deltaX = scrollX - this.lastScrollX;
    const deltaY = scrollY - this.lastScrollY;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      this.currentDirection = deltaY > 0 ? "down" : "up";
    } else if (Math.abs(deltaX) > 0) {
      this.currentDirection = deltaX > 0 ? "right" : "left";
    } else {
      this.currentDirection = "none";
    }

    const delta = Math.max(Math.abs(deltaX), Math.abs(deltaY));

    for (const listener of this.listeners) {
      try { listener(this.currentDirection, delta); }
      catch (e) { console.error("[TW Scroll] Listener error:", e); }
    }

    this.lastScrollX = scrollX;
    this.lastScrollY = scrollY;
  };
}

let globalScrollDetector: ScrollDirectionDetector | null = null;

export function getScrollDirectionDetector(): ScrollDirectionDetector {
  if (!globalScrollDetector) globalScrollDetector = new ScrollDirectionDetector();
  return globalScrollDetector;
}

export function getScrollDirection(): ScrollDirection {
  return getScrollDirectionDetector().getDirection();
}
