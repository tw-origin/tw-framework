/**
 * @tw/RouterLink — the TW Framework link engine.
 *
 * `RouterLink` compiles to a plain SEO-friendly <a> tag with the right
 * attributes; the client runtime (already on every page) turns same-origin
 * links into no-reload SPA navigation with hover prefetch. Nothing from
 * this package is shipped to the browser.
 */

export type PrefetchValue =
  | true          // prefetch immediately on page load
  | "true"        // same as true
  | "viewport"    // prefetch when the link scrolls into view
  | "hover"       // prefetch on hover (the default)
  | false         // never prefetch
  | "false";      // same as false

export interface LinkTagOptions {
  href: string;
  class?: string;
  id?: string;
  rel?: string;
  target?: string;
  /** highlight this link when its route is active */
  activeClass?: string;
  /** force external handling (auto-detected otherwise) */
  external?: boolean;
  /** opt out of SPA navigation — plain full-page load */
  native?: boolean;
  /** opt out of hover prefetch (SPA navigation stays on) */
  noPrefetch?: boolean;
  /**
   * Prefetch strategy. Omitted (or null) = "hover" — the default.
   * true = immediately on page load, "viewport" = when scrolled into
   * view, "hover" = on hover, false = never.
   */
  prefetch?: PrefetchValue;
}

export interface LinkAttributes {
  href: string;
  external: boolean;
  /** key=value pairs for the <a> tag */
  attrs: Record<string, string>;
}

/**
 * Is this an external (non-app) URL? Both web URLs (https://example.com)
 * and browser-native scheme URLs (mailto:, tel:, sms:, ftp:) are external —
 * they never take part in SPA navigation.
 */
export function isExternalHref(href: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(href) || // any scheme: http(s), mailto, tel, ...
    href.startsWith("//")                  // protocol-relative
  );
}

/**
 * Web-navigation URLs open with target="_blank" + a safe rel. Browser-native
 * schemes (mailto:, tel:, sms:, ftp:) are handed to the browser as-is —
 * forcing a new tab on them is unnecessary.
 */
function isWebExternal(href: string): boolean {
  if (/^(mailto:|tel:|sms:|ftp:)/i.test(href)) return false;
  return true; // remaining external forms: scheme:// and //...
}

/**
 * Compute every attribute for a RouterLink. Internal links get SPA
 * navigation markers for the client runtime; external links get safe
 * defaults (new tab + noopener) unless the caller overrides them.
 */
export function linkAttributesFor(opts: LinkTagOptions): LinkAttributes {
  const href = (opts.href ?? "").trim();
  const external = opts.external === true || isExternalHref(href);

  const attrs: Record<string, string> = {};

  if (external) {
    // Web URLs (https://, //): safe defaults. Browser-native schemes
    // (mailto:, tel:, sms:, ftp:) get no markers — the browser handles them.
    if (isWebExternal(href)) {
      if (!opts.target) attrs["target"] = "_blank";
      if (!opts.rel) attrs["rel"] = "noopener noreferrer";
    }
  } else {
    // Client runtime: SPA navigation for same-origin links
    attrs["data-tw-link"] = "";
    if (opts.activeClass) attrs["data-tw-active-class"] = opts.activeClass;
    if (opts.native) attrs["data-tw-native"] = "";

    // Prefetch strategy markers for the client runtime. No marker at all
    // means the default (hover). Both boolean and string forms are accepted.
    const p = opts.noPrefetch === true ? false : opts.prefetch;
    if (p === false || p === "false") {
      attrs["data-tw-no-prefetch"] = "";
    } else if (p === true || p === "true") {
      attrs["data-tw-prefetch"] = "always";
    } else if (p === "viewport") {
      attrs["data-tw-prefetch"] = "viewport";
    } else if (p === "hover") {
      attrs["data-tw-prefetch"] = "hover";
    }
  }

  if (opts.target) attrs["target"] = opts.target;
  if (opts.rel) attrs["rel"] = opts.rel;
  if (opts.class) attrs["class"] = opts.class;
  if (opts.id) attrs["id"] = opts.id;

  return { href, external, attrs };
}
