/**
 * Cache directive engine (docs/cache-tags.md) -- shared by the compiler,
 * the CLI build, and the server.
 *
 * One thing completely: resolve `cache { }` directive metadata
 * (page frontmatter or `fn cached` handler) into absolute seconds.
 *
 * Keys (Next.js-compatible names, one precise meaning each):
 *   life       profile name -> { stale, revalidate, expire }
 *   stale      CLIENT-side hint: Cache-Control max-age seconds.
 *              The server render-cache never reads it.
 *   revalidate SERVER freshness threshold: age < revalidate -> HIT.
 *   expire     hard limit: revalidate <= age < expire -> STALE +
 *              background refresh; age >= expire -> MISS.
 *   tag        invalidation family for revalidateTag().
 */
import { maskSourceStringsAndComments } from "./source-mask";

// --- Types --------------------------------------------------------------------

export interface CacheDirectiveMeta {
  life?: string;
  revalidate?: number;
  stale?: number;
  expire?: number;
  tag?: string;
}

export interface CacheProfile {
  stale?: number;
  revalidate?: number;
  expire?: number;
}

/** Fully resolved cache config -- absolute seconds, ready to serve. */
export interface ResolvedCache {
  /** Server freshness threshold (seconds). age < revalidate -> HIT. */
  revalidate: number;
  /** Client-side Cache-Control max-age (seconds). Server ignores it. */
  stale: number;
  /** Hard limit (seconds). May be Infinity (legacy `revalidate N` ISR). */
  expire: number;
  /** Invalidation family tag (undefined = untagged entry). */
  tag?: string;
}

// --- Built-in profiles ---------------------------------------------------------

export const BUILTIN_CACHE_PROFILES: Record<string, CacheProfile> = {
  seconds: { stale: 1, revalidate: 1, expire: 2 },
  minutes: { stale: 60, revalidate: 300, expire: 3600 },
  hours:   { stale: 3600, revalidate: 14400, expire: 86400 },
  days:    { stale: 86400, revalidate: 604800, expire: 2592000 },
  max:     { stale: 2592000, revalidate: 5184000, expire: 31536000 },
};

// --- Parsing ------------------------------------------------------------------

/**
 * Parse `cache { ... }` key/value pairs from a directive body string
 * (the text between the braces, WITHOUT the braces).
 * Accepts comma separators: `revalidate 3600, stale 300, tag "products"`.
 */
export function parseCacheBody(body: string): CacheDirectiveMeta {
  const meta: CacheDirectiveMeta = {};
  // key value pairs: life "name" / tag "x" / revalidate 60 / stale 300 / expire 3600
  const pairRegex = /\b(life|tag|revalidate|stale|expire)\s*=?\s*(?:"([^"]*)"|'([^']*)'|(\d+))/g;
  let m: RegExpExecArray | null;
  while ((m = pairRegex.exec(body)) !== null) {
    const key = m[1];
    const strVal = m[2] ?? m[3] ?? null;
    const numVal = m[4] != null ? Number(m[4]) : null;
    if (key === "revalidate" || key === "stale" || key === "expire") {
      if (numVal != null && Number.isFinite(numVal) && numVal >= 0) {
        (meta as any)[key] = numVal;
      }
    } else if (key === "life" || key === "tag") {
      if (strVal != null && strVal.length > 0) {
        (meta as any)[key] = strVal;
      }
    }
  }
  return meta;
}

/**
 * Extract the `cache { ... }` block from a .tw page source's page
 * frontmatter. Returns the meta, or null when the page has no cache block.
 */
export function extractCacheDirective(source: string): CacheDirectiveMeta | null {
  // Mask strings + comments first: a docs page that SHOWS `cache { ... }`
  // inside a quoted example must not register a cache window (same class
  // as the .twm comment-strip bug fixed in v1.0.6).
  const masked = maskSourceStringsAndComments(source);
  // page { ... cache { ... } ... } -- the cache block contains no nested
  // braces, so [^}] captures exactly its body. The match runs on the MASKED
  // text (so quoted examples never fake a block), but the BODY is cut from
  // the ORIGINAL source by position -- the directive's own string values
  // (`life "product"`) live inside it and must survive.
  const m = /page\s*\{[^}]*?\bcache\s*\{([^}]*)\}/.exec(masked);
  if (!m) return null;
  const bodyStart = m.index + m[0].length - m[1].length - 1;
  const bodyEnd = bodyStart + m[1].length;
  return parseCacheBody(source.slice(bodyStart, bodyEnd));
}

/** True when a `cache { }` body is complete enough to resolve. */
export function cacheMetaIsUsable(meta: CacheDirectiveMeta | null): boolean {
  if (!meta) return false;
  return meta.revalidate != null || meta.stale != null || meta.expire != null || !!meta.life;
}

// --- Resolution ----------------------------------------------------------------

/**
 * Resolve directive meta into absolute seconds against the available
 * profiles (user profiles from tw.config.ts `cache.profiles` override the
 * built-ins). Returns null when the meta is unusable (TW090 candidate).
 *
 * Semantics (docs/cache-tags.md):
 *   - `revalidate N` alone (the legacy ISR form) desugars to
 *     { revalidate: N, stale: 0, expire: Infinity } -- the v1.0.5
 *     behavior exactly: fresh for N seconds, then stale-while-revalidate
 *     forever, never a blocking MISS.
 *   - An explicit `cache { }` block defaults expire to revalidate (no SWR
 *     window) unless expire is given.
 *   - A `life` profile supplies all three; explicit keys override it.
 */
export function resolveCache(
  meta: CacheDirectiveMeta,
  profiles?: Record<string, CacheProfile>,
  opts?: { legacy?: boolean },
): ResolvedCache | null {
  if (!cacheMetaIsUsable(meta)) return null;

  let revalidate = meta.revalidate;
  let stale = meta.stale ?? 0;
  let expire = meta.expire;

  if (meta.life) {
    const profile = (profiles && profiles[meta.life]) ?? BUILTIN_CACHE_PROFILES[meta.life];
    if (!profile) {
      throw new Error(
        "TW092: Unknown cache profile \"" + meta.life + "\". " +
        "Add it to tw.config.ts cache.profiles or use one of: " +
        Object.keys(BUILTIN_CACHE_PROFILES).join(", ") + ".",
      );
    }
    if (revalidate == null && profile.revalidate != null) revalidate = profile.revalidate;
    if (meta.stale == null && profile.stale != null) stale = profile.stale;
    if (expire == null && profile.expire != null) expire = profile.expire;
  }

  if (revalidate == null || !Number.isFinite(revalidate) || revalidate <= 0) return null;

  if (expire == null || !Number.isFinite(expire)) {
    // legacy `revalidate N` (desugared, no cache block): v1.0.5 ISR --
    // stale-while-revalidate forever. Explicit cache { } defaults to a
    // strict window (expire == revalidate) unless a value/profile gave one.
    expire = opts?.legacy ? Infinity : revalidate;
  }
  if (expire < revalidate) expire = revalidate;

  return { revalidate, stale, expire, tag: meta.tag };
}

// --- Canonical query -----------------------------------------------------------

/**
 * Canonicalize a URL query string for cache keys: sort keys, drop empty
 * values, decode+encode values exactly once. `?a=1&b=2` and `?b=2&a=1`
 * produce the same output.
 */
export function canonicalizeQuery(search: string): string {
  if (!search) return "";
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return "";
  const pairs: [string, string][] = [];
  for (const part of q.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    let k: string, v: string;
    if (i < 0) { k = part; v = ""; }
    else { k = part.slice(0, i); v = part.slice(i + 1); }
    if (v === "") continue; // empty values dropped
    try { k = decodeURIComponent(k); } catch { /* keep raw */ }
    try { v = decodeURIComponent(v); } catch { /* keep raw */ }
    pairs.push([k, v]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pairs.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
}

// --- Sync tw.config.ts profile reading -----------------------------------------

/**
 * Balance-scan the object literal starting at `source[i]` (which must be
 * the opening `{`). Returns the index of its closing `}`.
 */
function balancedEnd(source: string, i: number): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let k = i; k < source.length; k++) {
    const ch = source[k];
    if (inStr) {
      if (ch === "\\") k++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return k; }
  }
  return -1;
}

/**
 * Read `cache.profiles` from tw.config.ts synchronously. loadConfigSync
 * cannot import .ts config files under every runtime (its require shim is
 * ESM-context dependent), so the profiles block is parsed directly from
 * the source text. Works for the documented shape:
 *
 *   cache: { profiles: { product: { stale: 300, revalidate: 3600, expire: 86400 } } }
 *
 * Returns {} when absent or unparsable -- callers fall back to built-ins.
 */
export function readCacheProfilesSync(rootDir: string): Record<string, CacheProfile> {
  try {
    // Node/Bun fs via a lazy import-free require shim: shared/cache.ts is
    // imported from server-side code paths only (compiler/build/serve).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let read: (p: string, enc: string) => string;
    try {
      read = (globalThis as any).require("node:fs").readFileSync;
    } catch {
      // ESM context (no global require): resolve through the fs util
      // bundled with @tw/shared's server surface.
      const fsmod = (globalThis as any).process
        ? (globalThis as any).process.getBuiltinModule?.("node:fs")
        : null;
      if (!fsmod) return {};
      read = fsmod.readFileSync;
    }
    let src = "";
    for (const name of ["tw.config.ts", "tw.config.js", "tw.config.mjs"]) {
      try {
        src = read(rootDir.endsWith("/") ? rootDir + name : rootDir + "/" + name, "utf-8");
        if (src) break;
      } catch { /* try next */ }
    }
    if (!src) return {};
    return parseCacheProfilesSource(src);
  } catch {
    return {};
  }
}

/** Parse cache.profiles out of a config source string (testable). */
export function parseCacheProfilesSource(src: string): Record<string,CacheProfile> {
  const out: Record<string, CacheProfile> = {};
  const cleaned = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/gm, "");
  const cacheKey = /\bcache\s*:\s*\{/.exec(cleaned);
  if (!cacheKey) return out;
  const cacheOpen = cleaned.indexOf("{", cacheKey.index);
  const cacheClose = balancedEnd(cleaned, cacheOpen);
  if (cacheClose < 0) return out;
  const cacheBody = cleaned.slice(cacheOpen + 1, cacheClose);
  const profKey = /\bprofiles\s*:\s*\{/.exec(cacheBody);
  if (!profKey) return out;
  const profOpen = cacheBody.indexOf("{", profKey.index);
  const profClose = balancedEnd(cacheBody, profOpen);
  if (profClose < 0) return out;
  const profBody = cacheBody.slice(profOpen + 1, profClose);
  for (const m of profBody.matchAll(/([A-Za-z0-9_]+)\s*:\s*\{([^}]*)\}/g)) {
    const profile: CacheProfile = {};
    for (const kv of m[2].matchAll(/(stale|revalidate|expire)\s*:\s*(\d+)/g)) {
      (profile as any)[kv[1]] = Number(kv[2]);
    }
    if (Object.keys(profile).length > 0) out[m[1]] = profile;
  }
  return out;
}
