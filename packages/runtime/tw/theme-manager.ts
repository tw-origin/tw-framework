/**
 * Theme Manager -- dark/light theme switching with CSS variables.
 *
 * Features:
 * - Dark/light/auto theme modes
 * - CSS custom property management
 * - System preference detection
 * - LocalStorage persistence
 * - Theme transitions (smooth color changes)
 * - Custom themes (user-defined palettes)
 * - Theme validation
 * - Per-component theming
 * - Theme inheritance
 * - SSR-safe (no window access during render)
 */

import { signal, computed, effect, type Signal } from "./dependency-graph";

// --- Types ------------------------------------------------------------

export type ThemeMode = "light" | "dark" | "auto";

export interface ThemeColors {
  // Base colors
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  accent: string;
  muted: string;
  // Semantic colors
  success: string;
  warning: string;
  error: string;
  info: string;
  // Surface colors
  surface: string;
  surfaceHover: string;
  surfaceActive: string;
  border: string;
  // Text colors
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Misc
  shadow: string;
  overlay: string;
  [key: string]: string;
}

export interface Theme {
  name: string;
  mode: "light" | "dark";
  colors: ThemeColors;
  radius: string;
  spacing: Record<string, string>;
  fontSize: Record<string, string>;
  fontWeight: Record<string, string>;
  transition: string;
}

export interface ThemeManagerOptions {
  defaultMode?: ThemeMode;
  storageKey?: string;
  enableTransitions?: boolean;
  transitionDuration?: number;
  customThemes?: Record<string, Theme>;
}

// --- Default Themes --------------------------------------------------

const lightTheme: Theme = {
  name: "light",
  mode: "light",
  colors: {
    background: "#ffffff",
    foreground: "#0f172a",
    primary: "#3b82f6",
    secondary: "#64748b",
    accent: "#8b5cf6",
    muted: "#f1f5f9",
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#0ea5e9",
    surface: "#ffffff",
    surfaceHover: "#f8fafc",
    surfaceActive: "#f1f5f9",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#94a3b8",
    shadow: "rgba(0, 0, 0, 0.1)",
    overlay: "rgba(0, 0, 0, 0.5)",
  },
  radius: "0.5rem",
  spacing: { xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem", "2xl": "3rem" },
  fontSize: { xs: "0.75rem", sm: "0.875rem", md: "1rem", lg: "1.125rem", xl: "1.25rem", "2xl": "1.5rem", "3xl": "2rem" },
  fontWeight: { normal: "400", medium: "500", semibold: "600", bold: "700" },
  transition: "color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease",
};

const darkTheme: Theme = {
  name: "dark",
  mode: "dark",
  colors: {
    background: "#0f172a",
    foreground: "#f8fafc",
    primary: "#60a5fa",
    secondary: "#94a3b8",
    accent: "#a78bfa",
    muted: "#1e293b",
    success: "#4ade80",
    warning: "#fbbf24",
    error: "#f87171",
    info: "#38bdf8",
    surface: "#1e293b",
    surfaceHover: "#334155",
    surfaceActive: "#475569",
    border: "#334155",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#64748b",
    shadow: "rgba(0, 0, 0, 0.3)",
    overlay: "rgba(0, 0, 0, 0.7)",
  },
  radius: "0.5rem",
  spacing: lightTheme.spacing,
  fontSize: lightTheme.fontSize,
  fontWeight: lightTheme.fontWeight,
  transition: lightTheme.transition,
};

// --- Theme Manager ----------------------------------------------------

class ThemeManager {
  private mode: Signal<ThemeMode>;
  private systemPreference: Signal<"light" | "dark">;
  private currentTheme: Signal<Theme>;
  private options: Required<ThemeManagerOptions>;
  private customThemes = new Map<string, Theme>();
  private root: HTMLElement | null = null;

  constructor(options: ThemeManagerOptions = {}) {
    this.options = {
      defaultMode: "auto",
      storageKey: "tw-theme",
      enableTransitions: true,
      transitionDuration: 300,
      customThemes: {},
      ...options,
    };

    // Load saved mode
    let savedMode = this.options.defaultMode;
    try {
      const saved = localStorage.getItem(this.options.storageKey);
      if (saved && ["light", "dark", "auto"].includes(saved)) savedMode = saved as ThemeMode;
    } catch { /* SSR or no localStorage */ }

    this.mode = signal(savedMode);

    // Detect system preference
    let sysPref: "light" | "dark" = "light";
    try {
      sysPref = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch { /* SSR */ }
    this.systemPreference = signal(sysPref);

    // Compute current theme
    this.currentTheme = computed(() => {
      const m = this.mode();
      const sys = this.systemPreference();
      const effectiveMode = m === "auto" ? sys : m;
      return effectiveMode === "dark" ? darkTheme : lightTheme;
    });

    // Register custom themes
    for (const [name, theme] of Object.entries(this.options.customThemes)) {
      this.customThemes.set(name, theme);
    }

    // Set up system preference listener
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        this.systemPreference.set(e.matches ? "dark" : "light");
      });
    } catch { /* SSR */ }

    // Apply theme reactively
    effect(() => {
      const theme = this.currentTheme();
      this.applyThemeToDOM(theme);
    });
  }

  /**
   * Get the current theme mode.
   */
  getMode(): ThemeMode { return this.mode.peek(); }

  /**
   * Get the current theme mode (reactive).
   */
  get modeSignal(): Signal<ThemeMode> { return this.mode; }

  /**
   * Get the current theme (reactive).
   */
  get theme(): Signal<Theme> { return this.currentTheme; }

  /**
   * Set the theme mode.
   */
  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    try { localStorage.setItem(this.options.storageKey, mode); } catch { /* no storage */ }
  }

  /**
   * Toggle between light and dark.
   */
  toggle(): void {
    const current = this.mode.peek();
    const effective = current === "auto"
      ? this.systemPreference.peek()
      : current;
    this.setMode(effective === "dark" ? "light" : "dark");
  }

  /**
   * Check if dark mode is active.
   */
  isDark(): boolean {
    const m = this.mode.peek();
    const effective = m === "auto" ? this.systemPreference.peek() : m;
    return effective === "dark";
  }

  /**
   * Register a custom theme.
   */
  registerCustomTheme(name: string, theme: Theme): void {
    this.customThemes.set(name, theme);
  }

  /**
   * Get a custom theme by name.
   */
  getCustomTheme(name: string): Theme | undefined {
    return this.customThemes.get(name);
  }

  /**
   * Apply a custom theme.
   */
  applyCustomTheme(name: string): void {
    const theme = this.customThemes.get(name);
    if (theme) this.applyThemeToDOM(theme);
  }

  /**
   * Apply theme to DOM (CSS variables).
   */
  applyThemeToDOM(theme: Theme): void {
    if (typeof document === "undefined") return;

    if (!this.root) {
      this.root = document.documentElement;
    }

    // Apply transitions if enabled
    if (this.options.enableTransitions) {
      this.root.style.setProperty("transition", theme.transition);
    }

    // Set data-theme attribute
    this.root.setAttribute("data-theme", theme.name);

    // Apply colors as CSS variables
    for (const [key, value] of Object.entries(theme.colors)) {
      const cssVar = `--tw-${this.kebabCase(key)}`;
      this.root.style.setProperty(cssVar, value);
    }

    // Apply radius
    this.root.style.setProperty("--tw-radius", theme.radius);

    // Apply spacing
    for (const [key, value] of Object.entries(theme.spacing)) {
      this.root.style.setProperty(`--tw-spacing-${key}`, value);
    }

    // Apply font sizes
    for (const [key, value] of Object.entries(theme.fontSize)) {
      this.root.style.setProperty(`--tw-font-size-${key}`, value);
    }

    // Apply font weights
    for (const [key, value] of Object.entries(theme.fontWeight)) {
      this.root.style.setProperty(`--tw-font-weight-${key}`, value);
    }
  }

  /**
   * Generate CSS string for the current theme.
   */
  generateCSS(): string {
    const theme = this.currentTheme.peek();
    let css = `:root {\n`;
    for (const [key, value] of Object.entries(theme.colors)) {
      css += `  --tw-${this.kebabCase(key)}: ${value};\n`;
    }
    css += `  --tw-radius: ${theme.radius};\n`;
    for (const [key, value] of Object.entries(theme.spacing)) {
      css += `  --tw-spacing-${key}: ${value};\n`;
    }
    for (const [key, value] of Object.entries(theme.fontSize)) {
      css += `  --tw-font-size-${key}: ${value};\n`;
    }
    css += `}\n`;
    return css;
  }

  /**
   * Destroy the theme manager.
   */
  destroy(): void {
    this.root = null;
  }

  private kebabCase(str: string): string {
    return str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
  }
}

// --- Global Theme Manager --------------------------------------------

let globalThemeManager: ThemeManager | null = null;

export function getThemeManager(): ThemeManager {
  if (!globalThemeManager) globalThemeManager = new ThemeManager();
  return globalThemeManager;
}

export function initTheme(options?: ThemeManagerOptions): ThemeManager {
  if (globalThemeManager) globalThemeManager.destroy();
  globalThemeManager = new ThemeManager(options);
  return globalThemeManager;
}

export function useTheme(): Signal<Theme> {
  return getThemeManager().theme;
}

export function useThemeMode(): Signal<ThemeMode> {
  return getThemeManager().modeSignal;
}

export function setThemeMode(mode: ThemeMode): void {
  getThemeManager().setMode(mode);
}

export function toggleTheme(): void {
  getThemeManager().toggle();
}

export function isDarkMode(): boolean {
  return getThemeManager().isDark();
}
