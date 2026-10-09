/**
 * @tw/plugin-sitemap — the first official TW plugin.
 *
 * Serves two things a content site always needs, generated from the pages you
 * already have:
 *
 *   GET /sitemap.xml   every static route, as a sitemap
 *   GET /robots.txt    a robots file that points at the sitemap
 *
 * Install and enable it like any plugin:
 *
 *   tw plugin install @tw/plugin-sitemap
 *
 *   // tw.config.ts
 *   plugins: [
 *     { name: "@tw/plugin-sitemap", options: { siteUrl: "https://example.com" } },
 *   ]
 *
 * A dynamic route (`blog/[slug]/page.tw`) cannot be enumerated from the file
 * system, so list its concrete URLs under `routes` — or generate them yourself
 * and pass them in.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SitemapOptions {
  /** Absolute site origin, e.g. "https://example.com". Required for a sitemap. */
  siteUrl?: string;
  /** Paths to leave out. `*` matches one segment, `**` matches any number. */
  exclude?: string[];
  /** Extra paths to include, e.g. concrete URLs for dynamic routes. */
  routes?: string[];
  /** Include `route.twm` API endpoints (default false). */
  includeApi?: boolean;
  /** `<changefreq>` for every entry (default "weekly"). */
  changefreq?: string;
  /** `<priority>` for every entry (default 0.5). */
  priority?: number;
  /** Project root to scan (default: the current working directory). */
  rootDir?: string;
  /** Serve /robots.txt as well (default true). */
  robots?: boolean;
}

// ---------------------------------------------------------------------------
// Route collection
// ---------------------------------------------------------------------------

/** A route group `(marketing)` is not part of the URL. */
function isGroup(segment: string): boolean {
  return segment.startsWith("(") && segment.endsWith(")");
}

/** `[slug]`, `[...rest]`, `[[...opt]]` — a value we cannot know from the tree. */
function isDynamic(segment: string): boolean {
  return segment.startsWith("[");
}

/** Directories the router ignores. */
function isPrivate(segment: string): boolean {
  return segment.startsWith("_") || segment.startsWith(".");
}

/**
 * Walk `home/` and return every static route path.
 * `home/page.tw` -> "/", `home/about/page.tw` -> "/about",
 * `home/(app)/dash/page.tw` -> "/dash". Dynamic segments are skipped.
 */
export function collectStaticRoutes(rootDir: string): string[] {
  const base = join(rootDir, "home");
  if (!existsSync(base)) return [];
  const found: string[] = [];

  const walk = (dir: string, urlSegments: string[]) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const full = join(dir, name);
      let isDir = false;
      try { isDir = statSync(full).isDirectory(); } catch { continue; }
      if (isDir) {
        if (isPrivate(name) || isDynamic(name)) continue;
        walk(full, isGroup(name) ? urlSegments : [...urlSegments, name]);
      } else if (name === "page.tw") {
        found.push(urlSegments.length ? "/" + urlSegments.join("/") : "/");
      }
    }
  };

  walk(base, []);
  return found.sort();
}

/** Every `route.twm` endpoint, as paths. */
export function collectApiRoutes(rootDir: string): string[] {
  const base = join(rootDir, "home");
  if (!existsSync(base)) return [];
  const found: string[] = [];
  const walk = (dir: string, urlSegments: string[]) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const full = join(dir, name);
      let isDir = false;
      try { isDir = statSync(full).isDirectory(); } catch { continue; }
      if (isDir) {
        if (isPrivate(name) || isDynamic(name)) continue;
        walk(full, [...urlSegments, name]);
      } else if (name === "route.twm") {
        found.push(urlSegments.length ? "/" + urlSegments.join("/") : "/");
      }
    }
  };
  walk(base, []);
  return found.sort();
}

// ---------------------------------------------------------------------------
// Exclusion
// ---------------------------------------------------------------------------

/**
 * Turn a path pattern into a regex and test one path.
 *
 *   *   matches within one segment      /draft/*    -> /draft/a   (not /draft/a/b)
 *   **  matches zero or more segments  /admin/**   -> /admin, /admin/a, /admin/a/b
 *
 * `**` matching zero segments is what makes `/admin/**` exclude `/admin`
 * itself — the case a user almost always means.
 */
export function matchesPattern(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Replace `**` forms with placeholders FIRST, so the single-`*` rule below
  // does not mangle the regex fragments we insert (they contain `*`).
  const rx = escaped
    .replace(/\/\*\*$/, "\u0000TAIL\u0000")   // /admin/**  -> the bare prefix too
    .replace(/\/\*\*\//g, "\u0000MID\u0000") // /a/**/b    -> zero or more segments
    .replace(/\*\*/g, "\u0000ANY\u0000")     // any other **
    .replace(/\*/g, "[^/]*")                  // a single * stays in one segment
    .replace(/\u0000TAIL\u0000/g, "(?:/.*)?")
    .replace(/\u0000MID\u0000/g, "(?:/.*/|/)")
    .replace(/\u0000ANY\u0000/g, ".*");
  return new RegExp("^" + rx + "$").test(path);
}

/** Drop everything matched by `exclude`. */
export function applyExclude(paths: string[], exclude: string[] = []): string[] {
  if (exclude.length === 0) return paths;
  return paths.filter((p) => !exclude.some((pat) => matchesPattern(pat, p)));
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Join an origin and a path without a double slash. */
export function absoluteUrl(siteUrl: string, path: string): string {
  const origin = siteUrl.replace(/\/+$/, "");
  return origin + (path.startsWith("/") ? path : "/" + path);
}

/** Build the sitemap XML for a set of paths. */
export function buildSitemapXml(
  paths: string[],
  opts: { siteUrl: string; changefreq?: string; priority?: number; lastmod?: string },
): string {
  const changefreq = opts.changefreq ?? "weekly";
  const priority = opts.priority ?? 0.5;
  const lastmod = opts.lastmod ?? new Date().toISOString().slice(0, 10);
  const urls = paths.map((p) =>
    `  <url>\n` +
    `    <loc>${escapeXml(absoluteUrl(opts.siteUrl, p))}</loc>\n` +
    `    <lastmod>${lastmod}</lastmod>\n` +
    `    <changefreq>${changefreq}</changefreq>\n` +
    `    <priority>${priority}</priority>\n` +
    `  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** A robots.txt that allows everything and points at the sitemap. */
export function robotsTxt(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(siteUrl, "/sitemap.xml")}\n`;
}

// ---------------------------------------------------------------------------
// The plugin
// ---------------------------------------------------------------------------

/** Minimal shape, so this package does not depend on the framework to type. */
interface PluginApi {
  on(hook: string, handler: (ctx: any) => any): void;
  getConfig(): any;
  getLogger(): any;
}

export interface SitemapPlugin {
  name: string;
  version: string;
  description: string;
  priority?: number;
  setup(api: PluginApi): void;
}

const plugin: SitemapPlugin = {
  name: "sitemap",
  version: "2.0.0",
  description: "Serves /sitemap.xml and /robots.txt from your pages",

  setup(api) {
    const opts: SitemapOptions =
      api.getConfig()?.plugins?.find?.((p: any) => p?.name === "@tw/plugin-sitemap")?.options ?? {};

    const rootDir = opts.rootDir ?? process.cwd();
    const siteUrl = opts.siteUrl;
    if (!siteUrl) {
      api.getLogger()?.warn?.(
        "  @tw/plugin-sitemap: no siteUrl option — a sitemap needs absolute URLs. " +
        'Add plugins: [{ name: "@tw/plugin-sitemap", options: { siteUrl: "https://example.com" } }]',
      );
    }

    api.on("onRequest", (ctx: any) => {
      const pathname: string = ctx?.url?.pathname ?? "";

      if (pathname === "/sitemap.xml") {
        if (!siteUrl) {
          return new Response("sitemap unavailable: set siteUrl in the plugin options", { status: 500 });
        }
        const pages = collectStaticRoutes(rootDir);
        const apis = opts.includeApi ? collectApiRoutes(rootDir) : [];
        const extra = opts.routes ?? [];
        const paths = applyExclude([...new Set([...pages, ...apis, ...extra])], opts.exclude).sort();
        return new Response(buildSitemapXml(paths, {
          siteUrl,
          changefreq: opts.changefreq,
          priority: opts.priority,
        }), {
          headers: { "content-type": "application/xml; charset=utf-8" },
        });
      }

      if (pathname === "/robots.txt" && opts.robots !== false) {
        if (!siteUrl) return undefined; // no site to point at — leave it to the app
        return new Response(robotsTxt(siteUrl), {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      return undefined;
    });
  },
};

export default plugin;
