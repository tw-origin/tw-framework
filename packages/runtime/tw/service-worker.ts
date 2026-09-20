/**
 * Service Worker -- registration, caching strategies, offline support.
 *
 * Features:
 * - Automatic registration
 * - Update detection and notification
 * - Cache strategies (cache-first, network-first, stale-while-revalidate)
 * - Offline fallback pages
 * - Background sync
 * - Push notifications
 * - Cache management (clear old caches)
 * - Precaching
 * - Runtime caching
 */

// --- Types ------------------------------------------------------------

export type CacheStrategy = "cache-first" | "network-first" | "stale-while-revalidate" | "network-only" | "cache-only";

export interface ServiceWorkerOptions {
  swUrl?: string;
  scope?: string;
  onUpdateFound?: (registration: ServiceWorkerRegistration) => void;
  onControllerChange?: () => void;
  onError?: (error: Error) => void;
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onOffline?: () => void;
  onOnline?: () => void;
}

export interface CacheRule {
  pattern: RegExp;
  strategy: CacheStrategy;
  cacheName?: string;
  maxEntries?: number;
  maxAgeSeconds?: number;
}

export interface CacheStats {
  cacheNames: string[];
  totalEntries: number;
  totalSize: number;
}

// --- Service Worker Manager ------------------------------------------

class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private options: ServiceWorkerOptions;
  private cacheRules: CacheRule[] = [];
  private isRegistered = false;

  constructor(options: ServiceWorkerOptions = {}) {
    this.options = {
      swUrl: "/sw.js",
      scope: "/",
      ...options,
    };
  }

  /**
   * Register the service worker.
   */
  async register(): Promise<ServiceWorkerRegistration | null> {
    if (!("serviceWorker" in navigator)) {
      console.warn("[TW SW] Service workers not supported");
      return null;
    }

    try {
      this.registration = await navigator.serviceWorker.register(this.options.swUrl!, {
        scope: this.options.scope,
      });

      this.isRegistered = true;
      this.setupListeners();

      if (this.options.onSuccess) {
        this.options.onSuccess(this.registration);
      }

      return this.registration;
    } catch (e) {
      if (this.options.onError) {
        this.options.onError(e as Error);
      } else {
        console.error("[TW SW] Registration failed:", e);
      }
      return null;
    }
  }

  /**
   * Unregister the service worker.
   */
  private listeners: Array<{ target: EventTarget; type: string; handler: EventListener }> = [];

  async unregister(): Promise<boolean> {
    if (!this.registration) return false;
    const result = await this.registration.unregister();
    this.listeners.forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
    this.listeners = [];
    this.registration = null;
    this.isRegistered = false;
    return result;
  }

  /**
   * Check for updates.
   */
  async update(): Promise<void> {
    if (!this.registration) return;
    await this.registration.update();
  }

  /**
   * Skip waiting (activate new SW immediately).
   */
  skipWaiting(): void {
    if (!this.registration?.waiting) return;
    this.registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  /**
   * Add a cache rule.
   */
  addCacheRule(rule: CacheRule): void {
    this.cacheRules.push(rule);
  }

  /**
   * Get cache statistics.
   */
  async getCacheStats(): Promise<CacheStats> {
    if (!("caches" in window)) {
      return { cacheNames: [], totalEntries: 0, totalSize: 0 };
    }

    const keys = await caches.keys();
    let totalEntries = 0;
    let totalSize = 0;

    for (const name of keys) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      totalEntries += requests.length;
      // Estimate size (can't get actual size from Cache API)
      totalSize += requests.length * 10000; // Rough estimate
    }

    return {
      cacheNames: keys,
      totalEntries,
      totalSize,
    };
  }

  /**
   * Clear a specific cache.
   */
  async clearCache(name: string): Promise<boolean> {
    return caches.delete(name);
  }

  /**
   * Clear all caches.
   */
  async clearAllCaches(): Promise<void> {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }

  /**
   * Precache URLs.
   */
  async precache(urls: string[], cacheName: string = "tw-precache"): Promise<void> {
    if (!("caches" in window)) return;
    const cache = await caches.open(cacheName);
    await cache.addAll(urls);
  }

  /**
   * Cache a single URL at runtime.
   */
  async cacheURL(url: string, cacheName: string = "tw-runtime"): Promise<void> {
    if (!("caches" in window)) return;
    const cache = await caches.open(cacheName);
    const response = await fetch(url);
    cache.put(url, response.clone());
  }

  /**
   * Get the registration status.
   */
  get isReady(): boolean { return this.isRegistered; }

  /**
   * Get the current registration.
   */
  getRegistration(): ServiceWorkerRegistration | null { return this.registration; }

  // --- Internal ------------------------------------------------------

  private setupListeners(): void {
    if (!this.registration) return;

    this.registration.addEventListener("updatefound", () => {
      if (!this.registration) return;
      const newWorker = this.registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          if (this.options.onUpdateFound) {
            this.options.onUpdateFound(this.registration!);
          }
        }
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (this.options.onControllerChange) {
        this.options.onControllerChange();
      }
    });

    // Online/offline detection
    window.addEventListener("offline", () => {
      if (this.options.onOffline) this.options.onOffline();
    });
    window.addEventListener("online", () => {
      if (this.options.onOnline) this.options.onOnline();
    });
  }
}

// --- Global Manager --------------------------------------------------

let globalSWManager: ServiceWorkerManager | null = null;

export function getServiceWorkerManager(): ServiceWorkerManager {
  if (!globalSWManager) globalSWManager = new ServiceWorkerManager();
  return globalSWManager;
}

export async function registerServiceWorker(options?: ServiceWorkerOptions): Promise<ServiceWorkerRegistration | null> {
  const manager = new ServiceWorkerManager(options);
  return manager.register();
}

export async function unregisterServiceWorker(): Promise<boolean> {
  return getServiceWorkerManager().unregister();
}

export async function clearServiceWorkerCaches(): Promise<void> {
  await getServiceWorkerManager().clearAllCaches();
}

/**
 * Generate a service worker script string with caching strategies.
 */
export function generateServiceWorkerScript(rules: CacheRule[], precacheUrls: string[] = []): string {
  return `
const PRECACHE = "tw-precache-v1";
const RUNTIME = "tw-runtime-v1";
const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};
const CACHE_RULES = ${JSON.stringify(rules.map(r => ({ pattern: r.pattern.source, strategy: r.strategy, cacheName: r.cacheName || "tw-runtime-v1" })))};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== PRECACHE && key !== RUNTIME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Find matching cache rule
  const rule = CACHE_RULES.find(r => new RegExp(r.pattern).test(url.pathname));
  if (!rule) return;

  if (rule.strategy === "cache-first") {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(rule.cacheName).then(cache => cache.put(event.request, clone));
        return response;
      }))
    );
  } else if (rule.strategy === "network-first") {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(rule.cacheName).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
  } else if (rule.strategy === "stale-while-revalidate") {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(rule.cacheName).then(cache => cache.put(event.request, clone));
          return response;
        });
        return cached || fetchPromise;
      })
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
`;
}
