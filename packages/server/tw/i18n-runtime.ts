/**
 * i18n runtime (per-request + client locale switching).
 *
 * The core `i18n.ts` module keeps one global locale, which is fine for a
 * single-tenant script but wrong for a server handling many visitors at once.
 * `createI18n()` builds an instance with its own locale state, so each request
 * can resolve its own locale and translate independently.
 *
 * On the client the same instance drives a switcher: `setLocale` updates
 * `<html lang>`, every `[data-i18n]` node, and anything subscribed via
 * `subscribe`. The `clientScript()` output is a self-contained snippet you can
 * inline into a page.
 */

export interface I18nRuntimeConfig {
  locales: string[];
  defaultLocale?: string;
  /** locale -> (key -> string). Loaded lazily per locale. */
  messages?: Record<string, Record<string, string>>;
  /** Cookie that remembers the visitor's choice. */
  cookieName?: string;
}

export interface I18nInstance {
  locales: string[];
  defaultLocale: string;
  getLocale(): string;
  setLocale(locale: string): void;
  /** Resolve the locale for a request: cookie -> Accept-Language -> default. */
  detect(request: { headers?: any; url?: string }): string;
  /** Load (or replace) a locale's messages. */
  load(locale: string, messages: Record<string, string>): void;
  t(key: string, vars?: Record<string, string | number>): string;
  /** Subscribe to locale changes; returns an unsubscribe fn. */
  subscribe(fn: (locale: string) => void): () => void;
  /** The cookie header value that remembers the chosen locale. */
  cookieHeader(locale: string): string;
  /** A self-contained client snippet that performs the switching in the browser. */
  clientScript(): string;
}

function interpolate(value: string, vars?: Record<string, string | number>): string {
  if (!vars) return value;
  let out = value;
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

/** Parse an Accept-Language header into locales, most-preferred first. */
export function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";");
      const quality = q ? Number(q.replace("q=", "")) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .filter((e) => e.tag)
    .sort((a, b) => b.quality - a.quality)
    .map((e) => e.tag);
}

function readCookie(headers: any, name: string): string | null {
  const raw = headers?.get?.("cookie") ?? headers?.cookie ?? "";
  for (const part of String(raw).split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function createI18n(config: I18nRuntimeConfig): I18nInstance {
  const locales = config.locales.slice();
  const defaultLocale = config.defaultLocale ?? locales[0] ?? "en";
  const cookieName = config.cookieName ?? "locale";
  const cache = new Map<string, Record<string, string>>();
  for (const [locale, messages] of Object.entries(config.messages ?? {})) cache.set(locale, messages);

  let current = defaultLocale;
  const listeners = new Set<(locale: string) => void>();

  const instance: I18nInstance = {
    locales,
    defaultLocale,
    getLocale: () => current,
    setLocale(locale) {
      if (!locales.includes(locale) || locale === current) return;
      current = locale;
      for (const fn of listeners) { try { fn(locale); } catch { /* a listener must not break the switch */ } }
    },
    detect(request) {
      const fromCookie = readCookie(request?.headers, cookieName);
      if (fromCookie && locales.includes(fromCookie)) return fromCookie;
      const header = request?.headers?.get?.("accept-language") ?? request?.headers?.["accept-language"] ?? "";
      for (const tag of parseAcceptLanguage(String(header))) {
        if (locales.includes(tag)) return tag;
        const base = tag.split("-")[0];
        if (locales.includes(base)) return base;
      }
      return defaultLocale;
    },
    load(locale, messages) { cache.set(locale, messages); },
    t(key, vars) {
      const value = cache.get(current)?.[key] ?? cache.get(defaultLocale)?.[key];
      if (value === undefined) return key;
      return interpolate(value, vars);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    cookieHeader(locale) {
      return `${cookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    },
    clientScript() {
      const localesJson = JSON.stringify(locales);
      const messagesJson = JSON.stringify(Object.fromEntries(cache));
      const defaultJson = JSON.stringify(defaultLocale);
      return `<script>(function(){
  var LOCALES=${localesJson}, MSGS=${messagesJson}, DEF=${defaultJson};
  var cur = document.documentElement.getAttribute("lang") || DEF;
  function tr(key, vars){ var m=MSGS[cur]||{}, d=MSGS[DEF]||{}; var v=m[key]!==undefined?m[key]:d[key]; if(v===undefined) return key;
    if(vars) for(var k in vars) v=v.split("{"+k+"}").join(vars[k]); return v; }
  function apply(){ document.documentElement.setAttribute("lang", cur);
    document.querySelectorAll("[data-i18n]").forEach(function(el){ el.textContent = tr(el.getAttribute("data-i18n")); }); }
  window.twI18n = { get locale(){ return cur; }, locales: LOCALES,
    setLocale: function(l){ if(LOCALES.indexOf(l)<0) return; cur=l;
      document.cookie="locale="+encodeURIComponent(l)+";path=/;max-age=31536000;samesite=lax"; apply(); },
    t: tr };
  apply();
})();</script>`;
    },
  };
  return instance;
}
