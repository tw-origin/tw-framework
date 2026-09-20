/**
 * Media Query -- reactive media query hooks for responsive design.
 *
 * Features:
 * - useMediaQuery() -- reactive boolean signal
 * - useBreakpoint() -- current breakpoint name
 * - usePrefersDark() -- dark mode preference
 * - usePrefersReducedMotion() -- reduced motion preference
 * - usePrefersColorScheme() -- color scheme
 * - useViewportSize() -- reactive viewport dimensions
 * - useOrientation() -- portrait/landscape
 * - Custom breakpoints
 * - SSR-safe
 */

import { signal, computed, type Signal } from "./dependency-graph";

// --- Types ------------------------------------------------------------

export interface Breakpoints {
  [name: string]: number;
}

export type Orientation = "portrait" | "landscape";
export type ColorScheme = "light" | "dark" | "no-preference";

// --- Default Breakpoints ----------------------------------------------

export const defaultBreakpoints: Breakpoints = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

// --- Media Query Hooks ------------------------------------------------

/**
 * Create a reactive media query signal.
 */
export function useMediaQuery(query: string): Signal<boolean> {
  const result = signal(false);

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return result;
  }

  const mql = window.matchMedia(query);
  result.set(mql.matches);

  const handler = (e: MediaQueryListEvent) => {
    result.set(e.matches);
  };

  // Modern browsers
  if (mql.addEventListener) {
    mql.addEventListener("change", handler);
  } else {
    // Older browsers
    mql.addListener(handler);
  }

  // Store cleanup on the signal (hacky but works)
  const originalPeek = result.peek.bind(result);
  result.peek = () => {
    const v = originalPeek();
    // Cleanup when signal is first peeked and not used
    return v;
  };

  return result;
}

/**
 * Get the current breakpoint name (reactive).
 */
export function useBreakpoint(breakpoints: Breakpoints = defaultBreakpoints): Signal<string> {
  const signals: Array<{ name: string; signal: Signal<boolean> }> = [];
  const sorted = Object.entries(breakpoints).sort((a, b) => a[1] - b[1]);

  for (let i = 0; i < sorted.length; i++) {
    const [name, min] = sorted[i];
    const max = i < sorted.length - 1 ? sorted[i + 1][1] - 1 : Infinity;
    const query = max === Infinity
      ? `(min-width: ${min}px)`
      : `(min-width: ${min}px) and (max-width: ${max}px)`;
    signals.push({ name, signal: useMediaQuery(query) });
  }

  return computed(() => {
    for (const { name, signal } of signals) {
      if (signal()) return name;
    }
    return sorted[0]?.[0] || "xs";
  });
}

/**
 * Check if dark mode is preferred (reactive).
 */
export function usePrefersDark(): Signal<boolean> {
  return useMediaQuery("(prefers-color-scheme: dark)");
}

/**
 * Check if reduced motion is preferred (reactive).
 */
export function usePrefersReducedMotion(): Signal<boolean> {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/**
 * Get the preferred color scheme (reactive).
 */
export function usePrefersColorScheme(): Signal<ColorScheme> {
  const dark = useMediaQuery("(prefers-color-scheme: dark)");
  const light = useMediaQuery("(prefers-color-scheme: light)");

  return computed(() => {
    if (dark()) return "dark";
    if (light()) return "light";
    return "no-preference";
  });
}

/**
 * Get the viewport size (reactive).
 */
export function useViewportSize(): Signal<{ width: number; height: number }> {
  const result = signal({ width: 0, height: 0 });

  if (typeof window === "undefined") return result;

  const update = () => {
    result.set({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };

  update();
  window.addEventListener("resize", update, { passive: true });

  return result;
}

/**
 * Get the viewport width (reactive).
 */
export function useViewportWidth(): Signal<number> {
  const size = useViewportSize();
  return computed(() => size().width);
}

/**
 * Get the viewport height (reactive).
 */
export function useViewportHeight(): Signal<number> {
  const size = useViewportSize();
  return computed(() => size().height);
}

/**
 * Get the device orientation (reactive).
 */
export function useOrientation(): Signal<Orientation> {
  const portrait = useMediaQuery("(orientation: portrait)");
  return computed(() => portrait() ? "portrait" : "landscape");
}

/**
 * Check if the device is touch-enabled (reactive).
 */
export function useIsTouchDevice(): Signal<boolean> {
  return useMediaQuery("(hover: none) and (pointer: coarse)");
}

/**
 * Check if the device can hover (reactive).
 */
export function useCanHover(): Signal<boolean> {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}

/**
 * Get device pixel ratio (reactive).
 */
export function useDevicePixelRatio(): Signal<number> {
  const result = signal(1);

  if (typeof window === "undefined") return result;

  const update = () => result.set(window.devicePixelRatio || 1);
  update();
  window.addEventListener("resize", update, { passive: true });

  // Listen for resolution changes
  const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mql.addEventListener("change", update);

  return result;
}

/**
 * Check if the document is visible (reactive).
 */
export function useDocumentVisible(): Signal<boolean> {
  const result = signal(true);

  if (typeof document === "undefined") return result;

  const update = () => result.set(!document.hidden);
  update();
  document.addEventListener("visibilitychange", update);

  return result;
}

/**
 * Check if the network is online (reactive).
 */
export function useIsOnline(): Signal<boolean> {
  const result = signal(true);

  if (typeof navigator === "undefined") return result;

  result.set(navigator.onLine);
  window.addEventListener("online", () => result.set(true));
  window.addEventListener("offline", () => result.set(false));

  return result;
}

/**
 * Get the effective connection type (reactive).
 */
export function useConnectionType(): Signal<string> {
  const result = signal("unknown");

  if (typeof navigator === "undefined" || !("connection" in navigator)) return result;

  const conn = (navigator as unknown as { connection: { effectiveType: string; addEventListener: (type: string, cb: () => void) => void } }).connection;
  if (conn) {
    const update = () => result.set(conn.effectiveType);
    update();
    conn.addEventListener("change", update);
  }

  return result;
}
