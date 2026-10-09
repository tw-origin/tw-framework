/**
 * TW cache (docs/cache.md).
 *
 * In `@tw/shared` so `import { cache } from "tw"` works in a project.
 */

import { parseDuration, type Duration } from "../net/request-context";

export interface CacheEntry<T = unknown> {
  value: T;
  tags: string[];
  expiresAt: number;
  createdAt: number;
}

export interface CacheSetOptions {
  tags?: string[];
  /** TTL. A duration string ("5m") or ms. 0 / undefined = no expiry. */
  revalidate?: Duration;
}

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
}

interface Store {
  map: Map<string, CacheEntry>;
  tags: Map<string, Set<string>>;   // tag -> keys
  hits: number;
  misses: number;
  evictions: number;
}

function newStore(): Store {
  return { map: new Map(), tags: new Map(), hits: 0, misses: 0, evictions: 0 };
}

/** The process-wide store, one per namespace. */
const stores = new Map<string, Store>();
let globalStore = newStore();

function storeFor(namespace: string): Store {
  if (namespace === "") return globalStore;
  let s = stores.get(namespace);
  if (!s) { s = newStore(); stores.set(namespace, s); }
  return s;
}

function tagKey(namespace: string, key: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

function expired(entry: CacheEntry): boolean {
  return entry.expiresAt !== 0 && entry.expiresAt <= Date.now();
}

function tag(store: Store, name: string, key: string): void {
  let set = store.tags.get(name);
  if (!set) { set = new Set(); store.tags.set(name, set); }
  set.add(key);
}

function untag(store: Store, name: string, key: string): void {
  const set = store.tags.get(name);
  if (!set) return;
  set.delete(key);
  if (set.size === 0) store.tags.delete(name);
}

/** A namespaced cache handle. */
export interface CacheHandle {
  readonly name: string;
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, opts?: CacheSetOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  /** Drop everything in this namespace. */
  clear(): Promise<void>;
  /** Drop everything carrying `tag`. */
  invalidateTag(tag: string): Promise<number>;
  /** Drop every entry tagged for an image source. */
  invalidateImage(src: string): Promise<number>;
  keys(): Promise<string[]>;
  stats(): CacheStats;
}

function makeHandle(name: string): CacheHandle {
  const store = storeFor(name);
  const k = (key: string) => tagKey(name, key);

  return {
    name,

    async get<T>(key: string): Promise<T | undefined> {
      const entry = store.map.get(k(key));
      if (!entry) { store.misses++; return undefined; }
      if (expired(entry)) {
        store.map.delete(k(key));
        for (const t of entry.tags) untag(store, t, k(key));
        store.misses++;
        return undefined;
      }
      store.hits++;
      return entry.value as T;
    },

    async set<T>(key: string, value: T, opts: CacheSetOptions = {}): Promise<void> {
      const ttl = opts.revalidate === undefined ? 0 : parseDuration(opts.revalidate);
      const full = k(key);
      const prev = store.map.get(full);
      if (prev) for (const t of prev.tags) untag(store, t, full);

      const entry: CacheEntry<T> = {
        value,
        tags: opts.tags ?? [],
        createdAt: Date.now(),
        expiresAt: ttl > 0 ? Date.now() + ttl : 0,
      };
      store.map.set(full, entry as CacheEntry);
      for (const t of entry.tags) tag(store, t, full);
    },

    async delete(key: string): Promise<boolean> {
      const full = k(key);
      const entry = store.map.get(full);
      if (!entry) return false;
      store.map.delete(full);
      for (const t of entry.tags) untag(store, t, full);
      return true;
    },

    async has(key: string): Promise<boolean> {
      const entry = store.map.get(k(key));
      if (!entry) return false;
      if (expired(entry)) { await this.delete(key); return false; }
      return true;
    },

    async clear(): Promise<void> {
      if (name === "") { globalStore = newStore(); return; }
      stores.delete(name);
    },

    async invalidateTag(t: string): Promise<number> {
      const keys = store.tags.get(t);
      if (!keys) return 0;
      let n = 0;
      for (const key of [...keys]) { if (store.map.delete(key)) n++; }
      store.tags.delete(t);
      return n;
    },

    async invalidateImage(src: string): Promise<number> {
      return this.invalidateTag(`image:${src}`);
    },

    async keys(): Promise<string[]> {
      const prefix = name ? `${name}:` : "";
      const out: string[] = [];
      for (const key of store.map.keys()) out.push(prefix ? key.slice(prefix.length) : key);
      return out;
    },

    stats(): CacheStats {
      return { entries: store.map.size, hits: store.hits, misses: store.misses, evictions: store.evictions };
    },
  };
}

/** A namespaced cache handle — the primary API. */
export function cache(name = ""): CacheHandle {
  return makeHandle(name);
}

/** The global handle, for when you really want everything. */
export function getCache(): CacheHandle {
  return makeHandle("");
}

/** Drop every namespace. Mostly for tests. */
export function resetCache(): void {
  stores.clear();
  globalStore = newStore();
}

// --- cached() ------------------------------------------------------------------

export interface CachedOptions<K> {
  /** Part of the key. A function of the call arguments, or a plain prefix. */
  key?: string | ((...args: unknown[]) => string);
  namespace?: string;
  tags?: string[];
  revalidate?: Duration;
  /** Serve a stale value while refreshing in the background. */
  staleWhileRevalidate?: boolean;
  onHit?: (key: string) => void;
  onMiss?: (key: string) => void;
}

export interface CachedFn<A extends unknown[], R> {
  (...args: A): Promise<R>;
  /** Drop this function's cached entries. */
  invalidate(): Promise<void>;
  /** The tag every entry carries, so you can invalidate from elsewhere. */
  readonly tag: string;
}

let cachedSeq = 0;
const inflight = new Map<string, Promise<unknown>>();

/**
 * Memoize an async function, with tags and stale-while-revalidate.
 *
 * A stable name, unlike Next's `unstable_cache`, plus two things it does not
 * do: serve stale while refreshing, and report hits and misses.
 */
export function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R> | R,
  opts: CachedOptions<A> = {},
): CachedFn<A, R> {
  const namespace = opts.namespace ?? `cached:${++cachedSeq}`;
  const handle = cache(namespace);
  const tagName = opts.tags?.[0] ?? `cached:${namespace}`;
  const tags = [...new Set([...(opts.tags ?? []), tagName])];

  const keyFor = (args: A): string => {
    if (typeof opts.key === "function") return opts.key(...args);
    if (typeof opts.key === "string") return `${opts.key}:${JSON.stringify(args)}`;
    return JSON.stringify(args);
  };

  const call = async (...args: A): Promise<R> => {
    const key = keyFor(args);
    const hit = await handle.get<R>(key);
    if (hit !== undefined) {
      opts.onHit?.(key);
      return hit;
    }

    if (opts.staleWhileRevalidate) {
      const stale = await handle.get<{ value: R }>(`swr:${key}`);
      if (stale !== undefined) {
        opts.onHit?.(key);
        void (async () => {
          try {
            const fresh = await fn(...args);
            await handle.set(key, fresh, { tags, revalidate: opts.revalidate });
            await handle.set(`swr:${key}`, { value: fresh }, { tags, revalidate: 0 });
          } catch { /* keep the stale value */ }
        })();
        return stale.value;
      }
    }

    opts.onMiss?.(key);
    // de-duplicate concurrent misses for the same key
    const pending = inflight.get(`${namespace}:${key}`);
    if (pending) return pending as Promise<R>;

    const p = (async () => {
      const value = await fn(...args);
      await handle.set(key, value, { tags, revalidate: opts.revalidate });
      if (opts.staleWhileRevalidate) await handle.set(`swr:${key}`, { value }, { tags, revalidate: 0 });
      return value;
    })();
    inflight.set(`${namespace}:${key}`, p);
    try { return await p; } finally { inflight.delete(`${namespace}:${key}`); }
  };

  const wrapped = call as CachedFn<A, R>;
  Object.defineProperty(wrapped, "tag", { value: tagName, enumerable: true });
  wrapped.invalidate = async () => { await handle.invalidateTag(tagName); };
  return wrapped;
}

// --- draftMode -----------------------------------------------------------------

const DRAFT_COOKIE = "__tw_draft";
let draftSecret: string | undefined;

/** Set the secret used to sign preview tokens. Do this at startup. */
export function setDraftSecret(secret: string): void { draftSecret = secret; }

async function hmac(input: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(input));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DraftMode {
  isEnabled: boolean;
  /** Turn preview mode on, returning the Set-Cookie header value. */
  enable(): Promise<string>;
  /** Turn it off, returning the Set-Cookie header value. */
  disable(): string;
  cookieName: string;
}

/**
 * Preview mode. Unlike Next's, the enabling cookie is **signed** when a secret
 * is configured, so preview mode cannot be turned on by guessing the name.
 */
export function draftMode(req?: Request | { headers: Record<string, string> | Headers }): DraftMode {
  const cookieHeader = readCookieHeader(req);
  const value = cookieHeader
    ? new RegExp(`(?:^|;\\s*)${DRAFT_COOKIE}=([^;]+)`).exec(cookieHeader)?.[1]
    : undefined;

  return {
    cookieName: DRAFT_COOKIE,
    get isEnabled() { return value === "1" || (!!value && value.startsWith("1.")); },

    async enable(): Promise<string> {
      if (!draftSecret) return `${DRAFT_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax`;
      const sig = await hmac("1", draftSecret);
      return `${DRAFT_COOKIE}=1.${sig}; Path=/; HttpOnly; SameSite=Lax`;
    },

    disable(): string {
      return `${DRAFT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
    },
  };
}

/** Read the cookie header from a Request or a plain headers bag. */
function readCookieHeader(req?: Request | { headers: Record<string, string> | Headers }): string | undefined {
  if (!req) return undefined;
  const h = (req as { headers?: unknown }).headers as
    | { get?: (n: string) => string | null }
    | Record<string, string>
    | undefined;
  if (!h) return undefined;
  if (typeof (h as { get?: unknown }).get === "function") {
    return (h as { get: (n: string) => string | null }).get("cookie") ?? undefined;
  }
  const rec = h as Record<string, string>;
  return rec["cookie"] ?? rec["Cookie"] ?? undefined;
}

/** Verify a signed draft cookie. */
export async function verifyDraftCookie(value: string | undefined, secret: string): Promise<boolean> {
  if (!value) return false;
  if (value === "1") return true;
  const [flag, sig] = value.split(".");
  if (flag !== "1" || !sig) return false;
  return (await hmac("1", secret)) === sig;
}
