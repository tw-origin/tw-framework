/** Re-export of the cache API (docs/cache.md). Prefer `from "tw"`. */
export { cache, cached, draftMode, getCache, resetCache, setDraftSecret, verifyDraftCookie } from "@tw/shared";
export type { CacheEntry, CacheHandle, CachedFn, CachedOptions, CacheSetOptions, CacheStats, DraftMode } from "@tw/shared";
