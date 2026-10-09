/**
 * @tw/Head — the TW Framework document-head engine.
 *
 * Next.js has no App-Router component for this (you pass a `metadata` object)
 * and the pages router version is a wrapper over raw tags. TW gives you a typed
 * component whose props compile to the right `<meta>` / `<link>` set, plus
 * `og()`, `twitter()` and `jsonLd()` builders so you never hand-write the
 * OpenGraph block again.
 *
 * Nothing from this package ships to the browser.
 */

export interface HeadOptions {
  title?: string;
  description?: string;
  canonical?: string;
  /** `<html lang>` -- emitted as an attribute hint on the head. */
  lang?: string;
  robots?: string;
  viewport?: string;
  themeColor?: string;
  charset?: string;

  // OpenGraph
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  ogType?: string;
  ogSiteName?: string;
  ogLocale?: string;

  // Twitter
  twitterCard?: string;
  twitterSite?: string;
  twitterCreator?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;

  /** Raw JSON-LD -- a string or an object. */
  jsonLd?: string | Record<string, unknown>;
  /** Extra raw tags, appended verbatim. */
  extra?: string;
}

export interface MetaTag {
  /** The full tag, e.g. `<meta property="og:title" content="x">`. */
  html: string;
  kind: "title" | "meta" | "link" | "script";
}

/** The OpenGraph block, as meta entries. */
export function og(values: {
  title?: string; description?: string; image?: string; url?: string;
  type?: string; siteName?: string; locale?: string;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (values.title) out["og:title"] = values.title;
  if (values.description) out["og:description"] = values.description;
  if (values.image) out["og:image"] = values.image;
  if (values.url) out["og:url"] = values.url;
  if (values.type) out["og:type"] = values.type;
  if (values.siteName) out["og:site_name"] = values.siteName;
  if (values.locale) out["og:locale"] = values.locale;
  return out;
}

/** The Twitter card block, as meta entries. */
export function twitter(values: {
  card?: string; site?: string; creator?: string;
  title?: string; description?: string; image?: string;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (values.card) out["twitter:card"] = values.card;
  if (values.site) out["twitter:site"] = values.site;
  if (values.creator) out["twitter:creator"] = values.creator;
  if (values.title) out["twitter:title"] = values.title;
  if (values.description) out["twitter:description"] = values.description;
  if (values.image) out["twitter:image"] = values.image;
  return out;
}

/** A JSON-LD payload, as a `<script type="application/ld+json">` entry. */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Every head tag, in the order a browser wants them. */
export function headTagsFor(opts: HeadOptions): MetaTag[] {
  const tags: MetaTag[] = [];
  const meta = (attr: "name" | "property", key: string, value?: string) => {
    if (value === undefined || value === "") return;
    tags.push({ html: `<meta ${attr}="${esc(key)}" content="${esc(value)}">`, kind: "meta" });
  };

  if (opts.charset !== "") {
    tags.push({ html: `<meta charset="${esc(opts.charset ?? "utf-8")}">`, kind: "meta" });
  }
  if (opts.viewport !== "") {
    tags.push({ html: `<meta name="viewport" content="${esc(opts.viewport ?? "width=device-width, initial-scale=1")}">`, kind: "meta" });
  }
  if (opts.title) tags.push({ html: `<title>${esc(opts.title)}</title>`, kind: "title" });
  meta("name", "description", opts.description);
  meta("name", "robots", opts.robots);
  meta("name", "theme-color", opts.themeColor);

  // OpenGraph
  meta("property", "og:title", opts.ogTitle ?? opts.title);
  meta("property", "og:description", opts.ogDescription ?? opts.description);
  meta("property", "og:image", opts.ogImage);
  meta("property", "og:url", opts.ogUrl ?? opts.canonical);
  meta("property", "og:type", opts.ogType);
  meta("property", "og:site_name", opts.ogSiteName);
  meta("property", "og:locale", opts.ogLocale);

  // Twitter
  meta("name", "twitter:card", opts.twitterCard);
  meta("name", "twitter:site", opts.twitterSite);
  meta("name", "twitter:creator", opts.twitterCreator);
  meta("name", "twitter:title", opts.twitterTitle ?? opts.ogTitle ?? opts.title);
  meta("name", "twitter:description", opts.twitterDescription ?? opts.description);
  meta("name", "twitter:image", opts.twitterImage ?? opts.ogImage);

  if (opts.canonical) {
    tags.push({ html: `<link rel="canonical" href="${esc(opts.canonical)}">`, kind: "link" });
  }
  if (opts.jsonLd) {
    const payload = typeof opts.jsonLd === "string" ? opts.jsonLd : JSON.stringify(opts.jsonLd);
    tags.push({ html: `<script type="application/ld+json">${payload.replace(/<\//g, "<\\/")}</script>`, kind: "script" });
  }
  if (opts.extra) tags.push({ html: opts.extra, kind: "meta" });

  return tags;
}

/** The head as one HTML string. */
export function renderHead(opts: HeadOptions): string {
  return headTagsFor(opts).map((t) => t.html).join("\n");
}
