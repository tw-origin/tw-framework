/**
 * i18n -- internationalization with locale routing, translations, formatting.
 *
 * TW's i18n is built-in (no external dependency).
 * Next.js requires next-intl or react-i18next.
 *
 * Features:
 * - Locale-based routing (/en/about, /hi/about)
 * - Translation file loading (lazy -- only loads needed locale)
 * - Date/number formatting (Intl API)
 * - RTL support (right-to-left)
 * - Subpath routing (/about -> /hi/about)
 * - Domain-based routing (example.com -> en, example.in -> hi)
 *
 * Usage in tw.config.ts:
 *   i18n: {
 *     locales: ["en", "hi", "bn", "ta"],
 *     defaultLocale: "en",
 *     strategy: "subpath",
 *   }
 *
 * Usage in .tw files:
 *   <p>{t("hello")}</p>
 *   <p>{t("welcome", { name: "Raj" })}</p>
 */

export interface I18nConfig {
  locales: string[];
  defaultLocale: string;
  strategy: "subpath" | "domain" | "cookie" | "header";
  domains?: Record<string, string>;
  fallback?: string;
  loading?: "lazy" | "eager";
  interpolation: { prefix: string; suffix: string };
}

export const DEFAULT_I18N_CONFIG: I18nConfig = {
  locales: ["en"],
  defaultLocale: "en",
  strategy: "subpath",
  interpolation: { prefix: "{", suffix: "}" },
  loading: "lazy",
};

// --- Translation Store -----------------------------------------------

const translationCache = new Map<string, Record<string, string>>();
let currentLocale = "en";

export function setLocale(locale: string) {
  currentLocale = locale;
}

export function getLocale(): string {
  return currentLocale;
}

export function loadTranslations(locale: string, messages: Record<string, string>) {
  translationCache.set(locale, messages);
}

/**
 * Translate a key with interpolation.
 *
 *   t("hello") -> "Hello"
 *   t("welcome", { name: "Raj" }) -> "Welcome, Raj"
 *   t("count", { n: 5 }) -> "5 items"
 *
 * Falls back to default locale, then to the key itself.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const messages = translationCache.get(currentLocale);
  let value = messages?.[key];

  // Fallback to default locale
  if (!value && currentLocale !== "en") {
    const fallback = translationCache.get("en");
    value = fallback?.[key];
  }

  // Fallback to key
  if (!value) return key;

  // Interpolation
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value!.replace(`{${k}}`, String(v));
    }
  }

  return value!;
}

// --- Locale Routing --------------------------------------------------

export interface LocaleRouteResult {
  locale: string;
  pathname: string;
  isLocalized: boolean;
}

/**
 * Parse a URL pathname to detect locale and strip it.
 *
 *   /en/about -> { locale: "en", pathname: "/about", isLocalized: true }
 *   /hi/about -> { locale: "hi", pathname: "/about", isLocalized: true }
 *   /about   -> { locale: "en", pathname: "/about", isLocalized: false }
 */
export function parseLocalePath(
  pathname: string,
  config: I18nConfig
): LocaleRouteResult {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length > 0 && config.locales.includes(segments[0])) {
    return {
      locale: segments[0],
      pathname: "/" + segments.slice(1).join("/"),
      isLocalized: true,
    };
  }

  return {
    locale: config.defaultLocale,
    pathname,
    isLocalized: false,
  };
}

/**
 * Generate a localized URL.
 *
 *   localizePath("/about", "hi") -> "/hi/about"
 *   localizePath("/about", "en") -> "/en/about"
 */
export function localizePath(pathname: string, locale: string, config: I18nConfig): string {
  if (locale === config.defaultLocale && config.strategy !== "subpath") {
    return pathname;
  }
  return `/${locale}${pathname}`;
}

// --- Formatting (Intl API) -------------------------------------------

export function formatDate(
  date: Date | string | number,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const loc = locale ?? currentLocale;
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat(loc, options).format(d);
}

export function formatNumber(
  num: number,
  locale?: string,
  options?: Intl.NumberFormatOptions
): string {
  const loc = locale ?? currentLocale;
  return new Intl.NumberFormat(loc, options).format(num);
}

export function formatCurrency(
  amount: number,
  currency: string = "INR",
  locale?: string
): string {
  const loc = locale ?? currentLocale;
  return new Intl.NumberFormat(loc, {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatRelative(
  date: Date | string | number,
  locale?: string
): string {
  const loc = locale ?? currentLocale;
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });
  const diff = d.getTime() - Date.now();
  const absDiff = Math.abs(diff);

  if (absDiff < 60000) return rtf.format(Math.round(diff / 1000), "second");
  if (absDiff < 3600000) return rtf.format(Math.round(diff / 60000), "minute");
  if (absDiff < 86400000) return rtf.format(Math.round(diff / 3600000), "hour");
  if (absDiff < 604800000) return rtf.format(Math.round(diff / 86400000), "day");
  if (absDiff < 2592000000) return rtf.format(Math.round(diff / 604800000), "week");
  if (absDiff < 31536000000) return rtf.format(Math.round(diff / 2592000000), "month");
  return rtf.format(Math.round(diff / 31536000000), "year");
}

// --- RTL Support ------------------------------------------------------

const RTL_LOCALES = ["ar", "he", "fa", "ur", "ps", "sd"];

export function isRTL(locale: string): boolean {
  return RTL_LOCALES.includes(locale.split("-")[0]);
}

export function getTextDirection(locale: string): "rtl" | "ltr" {
  return isRTL(locale) ? "rtl" : "ltr";
}

// --- HTML Lang Tag ---------------------------------------------------

export function getHtmlLang(locale: string): string {
  return locale;
}

export function getHtmlDir(locale: string): string {
  return getTextDirection(locale);
}
