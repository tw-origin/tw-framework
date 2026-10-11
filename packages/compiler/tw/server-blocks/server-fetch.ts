/**
 * serverFetch -- the `fetch` seen inside server blocks (Phase E2a).
 *
 * Wraps the platform fetch with:
 *   - a default timeout (AbortSignal), `server.fetchTimeoutMs` (default 10s)
 *   - typed errors: ServerFetchError kind "network" | "timeout" | "invalid-json"
 *   - per-request dedupe of identical GETs
 *   - an opt-in per-fetch cache via `fetch(url, { cache: { revalidate, tag } })`
 *
 * Secrets never appear in errors: messages carry only the URL host + path.
 * The cache is in-memory, bounded (LRU), GET/HEAD + 2xx only, never Set-Cookie.
 */

import { sha256 } from "@tw/shared";

export type ServerFetchErrorKind = "network" | "timeout" | "invalid-json";

/** Process build id: a new process starts with a cold per-fetch cache. */
export const SERVER_FETCH_BUILD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class ServerFetchError extends Error {
  kind: ServerFetchErrorKind;
  constructor(kind: ServerFetchErrorKind, message: string) {
    super(message);
    this.name = "ServerFetchError";
    this.kind = kind;
  }
}

export interface FetchCacheSpec { revalidate: number; tag?: string; }

export interface ServerFetchOptions {
  /** Default request timeout in ms (server.fetchTimeoutMs). */
  timeoutMs?: number;
  /** Skip caching responses larger than this (server.fetchCacheMaxBytes). */
  maxBytes?: number;
  /** Max cache entries (LRU). */
  maxEntries?: number;
  /** Build id -- part of every cache key (a new build starts cold). */
  buildId: string;
  /** When false, the cache is bypassed (dev default). */
  cacheEnabled?: boolean;
  /** One dev log line per fetch: duration + HIT/MISS/BYPASS. */
  log?: (line: string) => void;
  /** Override the underlying fetch (tests / non-standard runtimes). */
  platformFetch?: (url: string, init?: any) => Promise<Response>;
}

interface CacheEntry {
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
  freshUntil: number;
  tag?: string;
}

const CACHE = new Map<string, CacheEntry>();          // insertion order = LRU
const TAG_INDEX = new Map<string, Set<string>>();      // tag -> keys
const DEDUPE_HEADER_NAMES = new Set(["authorization", "proxy-authorization", "cookie"]);

function hostPath(url: string): string {
  try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; }
}

function canonicalHeaders(headers?: Record<string, string>): string {
  if (!headers) return "";
  return Object.keys(headers)
    .map((k) => [k.toLowerCase(), headers[k]] as [string, string])
    .filter(([k]) => !["traceparent", "x-request-id", "user-agent"].includes(k))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

/** The credential rule: a cached fetch must not set these headers. */
export function hasCredentialHeader(headers?: Record<string, string>): string | null {
  if (!headers) return null;
  for (const k of Object.keys(headers)) if (DEDUPE_HEADER_NAMES.has(k.toLowerCase())) return k;
  return null;
}

export function fetchCacheKey(method: string, url: string, body: unknown, headers: Record<string, string> | undefined, buildId: string): string {
  return sha256(`${method.toUpperCase()} ${url} ${body == null ? "" : JSON.stringify(body)} ${canonicalHeaders(headers)} ${buildId}`);
}

export function invalidateFetchTag(tag: string): number {
  const keys = TAG_INDEX.get(tag);
  if (!keys) return 0;
  let n = 0;
  for (const k of keys) if (CACHE.delete(k)) n++;
  TAG_INDEX.delete(tag);
  return n;
}

export function fetchCacheSize(): number { return CACHE.size; }
export function clearFetchCache(): void { CACHE.clear(); TAG_INDEX.clear(); }

/** The fetch available inside a server block (and nowhere else). */
export function createServerFetch(opts: ServerFetchOptions): (url: string, init?: any) => Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const maxEntries = opts.maxEntries ?? 1000;
  const cacheEnabled = opts.cacheEnabled !== false;
  const buildId = opts.buildId;
  const dedupe = new Map<string, Promise<Response>>();   // per instance (per request)

  function log(line: string) { try { opts.log?.(line); } catch { /* ignore */ } }

  async function realFetch(url: string, init: any): Promise<Response> {
    const method = String(init?.method ?? "GET").toUpperCase();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    // Prefer the runtime's native fetch (Bun.fetch) -- a test shim (happy-dom)
    // must not intercept server-side fetches.
    const platformFetch: any = opts.platformFetch ?? (((globalThis as any).Bun?.fetch) ?? globalThis.fetch);
    let res: Response;
    try {
      res = await platformFetch(url, { ...init, signal: controller.signal });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === "AbortError") throw new ServerFetchError("timeout", `fetch timed out after ${timeoutMs}ms: ${hostPath(url)}`);
      throw new ServerFetchError("network", `fetch failed: ${hostPath(url)}`);
    }
    clearTimeout(timer);
    log(`[tw] serverFetch ${method} ${hostPath(url)} ${res.status} ${Date.now() - started}ms`);
    return res;
  }

  return async function serverFetch(url: string, init: any = {}): Promise<Response> {
    const method = String(init?.method ?? "GET").toUpperCase();
    const headers = init?.headers as Record<string, string> | undefined;
    const body = init?.body;
    const cacheSpec: FetchCacheSpec | undefined = init?.cache;
    const cacheableMethod = method === "GET" || method === "HEAD";

    // Credential rule (runtime; the literal case is a build error).
    if (cacheSpec && hasCredentialHeader(headers)) {
      throw new ServerFetchError("network", `a cached fetch must not set a credential header (${hasCredentialHeader(headers)}): ${hostPath(url)}`);
    }

    const key = fetchCacheKey(method, url, body, headers, buildId);

    // 1) cache HIT
    if (cacheSpec && cacheEnabled && cacheableMethod) {
      const hit = CACHE.get(key);
      if (hit && Date.now() < hit.freshUntil) {
        log(`[tw] serverFetch ${method} ${hostPath(url)} HIT`);
        return new Response(hit.body.slice(0), { status: hit.status, headers: hit.headers });
      }
      if (hit) CACHE.delete(key);
    }

    // 2) per-request dedupe
    if (dedupe.has(key)) return dedupe.get(key)!.then((r) => r.clone());

    const p = (async () => {
      const res = await realFetch(url, init);
      // Only cache GET/HEAD, 2xx, no Set-Cookie, within the size cap.
      if (cacheSpec && cacheEnabled && cacheableMethod && res.ok && !res.headers.get("set-cookie")) {
        const buf = await res.clone().arrayBuffer();
        if (buf.byteLength <= maxBytes) {
          while (CACHE.size >= maxEntries) {
            const oldest = CACHE.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            CACHE.delete(oldest);
          }
          const hdrs: Record<string, string> = {};
          res.headers.forEach((v, k) => { hdrs[k] = v; });
          CACHE.set(key, { status: res.status, headers: hdrs, body: buf, freshUntil: Date.now() + (cacheSpec.revalidate ?? 0) * 1000, tag: cacheSpec.tag });
          if (cacheSpec.tag) {
            if (!TAG_INDEX.has(cacheSpec.tag)) TAG_INDEX.set(cacheSpec.tag, new Set());
            TAG_INDEX.get(cacheSpec.tag)!.add(key);
          }
        }
      }
      return res;
    })();

    dedupe.set(key, p);
    // Clear the dedupe entry on settle WITHOUT creating an unhandled rejection
    // (`.finally()` returns a new promise that rejects if `p` does).
    p.then(() => dedupe.delete(key), () => dedupe.delete(key));
    return p;
  };
}

/** Wrap a Response so `.json()` throws a typed ServerFetchError on bad JSON. */
export function wrapJsonErrors(res: Response): Response {
  const orig = res.json.bind(res);
  (res as any).json = async () => {
    try { return await orig(); }
    catch { throw new ServerFetchError("invalid-json", `invalid JSON in response: ${hostPath(res.url)}`); }
  };
  return res;
}
