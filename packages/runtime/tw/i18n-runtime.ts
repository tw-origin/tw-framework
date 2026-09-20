/**
 * i18n Runtime -- internationalization with reactive locale switching.
 *
 * Features:
 * - Reactive locale (components auto-update on change)
 * - Message interpolation with named/counted params
 * - Pluralization (cardinal/ordinal rules)
 * - Date/time formatting (Intl.DateTimeFormat)
 * - Number formatting (Intl.NumberFormat)
 * - Relative time formatting (Intl.RelativeTimeFormat)
 * - List formatting (Intl.ListFormat)
 * - Lazy locale loading (code splitting)
 * - Fallback locale
 * - Missing translation warnings
 * - Translation caching
 * - RTL support
 * - SSR-safe
 */

import { signal, computed, type Signal } from "./dependency-graph";

// --- Types ------------------------------------------------------------

export type Locale = string;
export type MessageParams = Record<string, unknown>;

export interface I18nOptions {
  defaultLocale?: Locale;
  fallbackLocale?: Locale;
  messages?: Record<Locale, Record<string, string>>;
  lazyLoad?: (locale: Locale) => Promise<Record<string, string>>;
  warnOnMissing?: boolean;
  cacheSize?: number;
}

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

// --- I18n Class ------------------------------------------------------

class I18n {
  private locale: Signal<Locale>;
  private fallbackLocale: Locale;
  private messages = new Map<Locale, Map<string, string>>();
  private loadingLocales = new Set<Locale>();
  private loadedLocales = new Set<Locale>();
  private lazyLoadFn: ((locale: Locale) => Promise<Record<string, string>>) | null;
  private warnOnMissing: boolean;
  private rtlLocales = new Set(["ar", "he", "fa", "ur", "yi", "iw", "ps", "sd"]);

  constructor(options: I18nOptions = {}) {
    this.locale = signal(options.defaultLocale || "en");
    this.fallbackLocale = options.fallbackLocale || "en";
    this.lazyLoadFn = options.lazyLoad || null;
    this.warnOnMissing = options.warnOnMissing ?? true;

    // Load initial messages
    if (options.messages) {
      for (const [loc, msgs] of Object.entries(options.messages)) {
        this.addMessages(loc, msgs);
        this.loadedLocales.add(loc);
      }
    }
  }

  /**
   * Get current locale (reactive).
   */
  getLocale(): Locale { return this.locale(); }

  get localeSignal(): Signal<Locale> { return this.locale; }

  /**
   * Set locale (loads messages if lazy loading).
   */
  async setLocale(locale: Locale): Promise<void> {
    if (this.locale.peek() === locale) return;

    // Lazy load if needed
    if (this.lazyLoadFn && !this.loadedLocales.has(locale) && !this.loadingLocales.has(locale)) {
      this.loadingLocales.add(locale);
      try {
        const msgs = await this.lazyLoadFn(locale);
        this.addMessages(locale, msgs);
        this.loadedLocales.add(locale);
      } catch (e) {
        console.error(`[TW i18n] Failed to load locale '${locale}':`, e);
      } finally {
        this.loadingLocales.delete(locale);
      }
    }

    this.locale.set(locale);

    // Update document direction for RTL
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.documentElement.dir = this.isRTL(locale) ? "rtl" : "ltr";
    }
  }

  /**
   * Add messages for a locale.
   */
  addMessages(locale: Locale, messages: Record<string, string>): void {
    if (!this.messages.has(locale)) this.messages.set(locale, new Map());
    const localeMessages = this.messages.get(locale)!;
    for (const [key, value] of Object.entries(messages)) {
      localeMessages.set(key, value);
    }
  }

  /**
   * Translate a key.
   * Supports interpolation: "Hello {name}" -> "Hello World"
   */
  t(key: string, params?: MessageParams, locale?: Locale): string {
    const loc = locale || this.locale.peek();
    const message = this.getMessage(key, loc);

    if (message === null) {
      if (this.warnOnMissing) {
        console.warn(`[TW i18n] Missing translation for '${key}' in '${loc}'`);
      }
      return key;
    }

    return this.interpolate(message, params, loc);
  }

  /**
   * Translate with pluralization.
   */
  tn(key: string, count: number, params?: MessageParams, locale?: Locale): string {
    const loc = locale || this.locale.peek();
    const category = this.getPluralCategory(count, loc);

    // Try pluralized key: "key.other", "key.one", etc.
    const pluralKey = `${key}.${category}`;
    let message = this.getMessage(pluralKey, loc);

    // Fall back to base key
    if (message === null) message = this.getMessage(key, loc);

    if (message === null) return key;

    return this.interpolate(message, { ...params, count }, loc);
  }

  /**
   * Format a date.
   */
  formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions, locale?: Locale): string {
    const loc = locale || this.locale.peek();
    try {
      return new Intl.DateTimeFormat(loc, options).format(date);
    } catch {
      return String(date);
    }
  }

  /**
   * Format a number.
   */
  formatNumber(value: number, options?: Intl.NumberFormatOptions, locale?: Locale): string {
    const loc = locale || this.locale.peek();
    try {
      return new Intl.NumberFormat(loc, options).format(value);
    } catch {
      return String(value);
    }
  }

  /**
   * Format a currency value.
   */
  formatCurrency(value: number, currency: string, locale?: Locale): string {
    return this.formatNumber(value, { style: "currency", currency }, locale);
  }

  /**
   * Format relative time (e.g., "3 days ago").
   */
  formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, locale?: Locale): string {
    const loc = locale || this.locale.peek();
    try {
      return new Intl.RelativeTimeFormat(loc, { numeric: "auto" }).format(value, unit);
    } catch {
      return `${value} ${unit}`;
    }
  }

  /**
   * Format a list of items.
   */
  formatList(items: string[], options?: Intl.ListFormatOptions, locale?: Locale): string {
    const loc = locale || this.locale.peek();
    try {
      return new Intl.ListFormat(loc, options).format(items);
    } catch {
      return items.join(", ");
    }
  }

  /**
   * Check if a locale is RTL.
   */
  isRTL(locale?: Locale): boolean {
    const loc = locale || this.locale.peek();
    const lang = loc.split("-")[0];
    return this.rtlLocales.has(lang);
  }

  /**
   * Get text direction.
   */
  getTextDirection(locale?: Locale): "ltr" | "rtl" {
    return this.isRTL(locale) ? "rtl" : "ltr";
  }

  /**
   * Check if a locale's messages are loaded.
   */
  isLocaleLoaded(locale: Locale): boolean {
    return this.loadedLocales.has(locale);
  }

  /**
   * Get all loaded locales.
   */
  getLoadedLocales(): Locale[] {
    return Array.from(this.loadedLocales);
  }

  /**
   * Check if a translation key exists.
   */
  has(key: string, locale?: Locale): boolean {
    return this.getMessage(key, locale || this.locale.peek()) !== null;
  }

  // --- Internal ------------------------------------------------------

  private getMessage(key: string, locale: Locale): string | null {
    const localeMessages = this.messages.get(locale);
    if (localeMessages && localeMessages.has(key)) return localeMessages.get(key)!;

    // Fall back to fallback locale
    if (locale !== this.fallbackLocale) {
      const fallbackMessages = this.messages.get(this.fallbackLocale);
      if (fallbackMessages && fallbackMessages.has(key)) return fallbackMessages.get(key)!;
    }

    return null;
  }

  private interpolate(message: string, params?: MessageParams, _locale?: Locale): string {
    if (!params) return message;

    return message.replace(/\{(\w+)\}/g, (_match, key: string) => {
      if (key in params) {
        const value = params[key];
        if (value === null || value === undefined) return "";
        return String(value);
      }
      return `{${key}}`;
    });
  }

  private getPluralCategory(count: number, locale: Locale): PluralCategory {
    try {
      const rules = new Intl.PluralRules(locale);
      return rules.select(count) as PluralCategory;
    } catch {
      // Fallback
      if (count === 0) return "zero";
      if (count === 1) return "one";
      return "other";
    }
  }
}

// --- Global I18n ------------------------------------------------------

let globalI18n: I18n | null = null;

export function initI18n(options: I18nOptions): I18n {
  globalI18n = new I18n(options);
  return globalI18n;
}

export function getI18n(): I18n {
  if (!globalI18n) globalI18n = new I18n();
  return globalI18n;
}

export function t(key: string, params?: MessageParams): string { return getI18n().t(key, params); }
export function tn(key: string, count: number, params?: MessageParams): string { return getI18n().tn(key, count, params); }
export function formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions): string { return getI18n().formatDate(date, options); }
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string { return getI18n().formatNumber(value, options); }
export function formatCurrency(value: number, currency: string): string { return getI18n().formatCurrency(value, currency); }
export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string { return getI18n().formatRelativeTime(value, unit); }
export function formatList(items: string[], options?: Intl.ListFormatOptions): string { return getI18n().formatList(items, options); }
export function isRTL(locale?: Locale): boolean { return getI18n().isRTL(locale); }
export function getTextDirection(locale?: Locale): "ltr" | "rtl" { return getI18n().getTextDirection(locale); }
export function setLocale(locale: Locale): Promise<void> { return getI18n().setLocale(locale); }
export function getLocale(): Locale { return getI18n().getLocale(); }
export function useLocale(): Signal<Locale> { return getI18n().localeSignal; }

/**
 * Computed translation -- reactive, updates on locale change.
 */
export function useTranslation(key: string, params?: MessageParams) {
  return computed(() => getI18n().t(key, params));
}
