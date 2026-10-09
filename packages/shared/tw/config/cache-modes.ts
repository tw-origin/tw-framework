/**
 * Cache mode (strategies.cache.mode): how a rendered route is cached.
 *
 *   isr  (default) -- incremental static regeneration; the server cache holds
 *                     the response and refreshes it on a window or a tag.
 *   swr            -- stale-while-revalidate: serve stale, refresh behind it.
 *   none           -- never cache; every request renders fresh.
 *   cdn            -- hand caching to the CDN and expose a purge manifest.
 */

export type CacheModeName = "isr" | "swr" | "none" | "cdn";

export interface CacheModeInfo {
  mode: CacheModeName;
  detail: string;
  /** Does this mode keep a server-side cache? */
  serverCache: boolean;
}

export const CACHE_MODES: Record<CacheModeName, CacheModeInfo> = {
  isr: { mode: "isr", detail: "incremental static regeneration", serverCache: true },
  swr: { mode: "swr", detail: "stale-while-revalidate", serverCache: true },
  none: { mode: "none", detail: "never cached", serverCache: false },
  cdn: { mode: "cdn", detail: "CDN-cached, with a purge manifest", serverCache: false },
};

/** Resolve the configured cache mode, defaulting to isr. */
export function resolveCacheMode(cfg: any): CacheModeName {
  const m = cfg?.strategies?.cache?.mode;
  return m === "swr" || m === "none" || m === "cdn" ? m : "isr";
}

/** The Cache-Control header for a mode and a revalidate window (seconds). */
export function cacheControlFor(mode: CacheModeName, maxAge: number): string {
  switch (mode) {
    case "none": return "no-cache, no-store, must-revalidate";
    case "cdn": return `public, max-age=0, s-maxage=${maxAge}`;
    case "swr": return `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 10}`;
    default: return `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`;
  }
}

export interface PurgeManifest {
  generatedFor: "cdn";
  routes: Array<{ path: string; tags: string[] }>;
}

/** The CDN purge manifest (cdn mode only). */
export function purgeManifest(routes: Array<{ path: string; tags: string[] }>): PurgeManifest | null {
  if (routes.length === 0) return { generatedFor: "cdn", routes: [] };
  return { generatedFor: "cdn", routes };
}
