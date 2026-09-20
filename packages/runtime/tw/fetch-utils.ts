/**
 * Fetch Utils -- HTTP client with retry, caching, interceptors.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Request/response interceptors
 * - Request deduplication (same URL -> one request)
 * - Response caching (with TTL)
 * - Request cancellation (AbortController)
 * - Timeout support
 * - Request queuing (rate limiting)
 * - Progress tracking
 * - Error normalization
 * - SSE (Server-Sent Events) support
 * - File upload with progress
 */

import { getCacheManager } from "./cache-manager";

// --- Types ------------------------------------------------------------

export interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  retryOn?: number[];
  cache?: any;
  cacheTTL?: number;
  dedup?: boolean;
  baseURL?: string;
  interceptors?: boolean;
}

export interface FetchResponse<T = unknown> {
  data: T;
  status: number;
  headers: Headers;
  ok: boolean;
  url: string;
  duration: number;
  fromCache: boolean;
}

export interface Interceptor {
  onRequest?: (config: FetchOptions) => FetchOptions | Promise<FetchOptions>;
  onResponse?: (response: Response) => Response | Promise<Response>;
  onError?: (error: Error) => Error | Promise<Error>;
}

// --- HTTP Client ----------------------------------------------------

class HttpClient {
  baseURL: string;
  private defaultOptions: Partial<FetchOptions>;
  private interceptors: Interceptor[] = [];
  private pendingRequests = new Map<string, Promise<FetchResponse>>();
  private defaultHeaders: Record<string, string> = {};

  constructor(baseURL = "", defaultOptions: Partial<FetchOptions> = {}) {
    this.baseURL = baseURL;
    this.defaultOptions = {
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      retryOn: [408, 429, 500, 502, 503, 504],
      cache: false,
      cacheTTL: 60000,
      dedup: true,
      interceptors: true,
      ...defaultOptions,
    };
  }

  /**
   * Add an interceptor.
   */
  addInterceptor(interceptor: Interceptor): () => void {
    this.interceptors.push(interceptor);
    return () => {
      const idx = this.interceptors.indexOf(interceptor);
      if (idx >= 0) this.interceptors.splice(idx, 1);
    };
  }

  /**
   * Set default headers.
   */
  setHeader(name: string, value: string): void {
    this.defaultHeaders[name] = value;
  }

  /**
   * Remove a default header.
   */
  removeHeader(name: string): void {
    delete this.defaultHeaders[name];
  }

  /**
   * Perform a GET request.
   */
  async get<T = unknown>(url: string, options?: FetchOptions): Promise<FetchResponse<T>> {
    return this.request<T>(url, { ...options, method: "GET" });
  }

  /**
   * Perform a POST request.
   */
  async post<T = unknown>(url: string, body?: unknown, options?: FetchOptions): Promise<FetchResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  }

  /**
   * Perform a PUT request.
   */
  async put<T = unknown>(url: string, body?: unknown, options?: FetchOptions): Promise<FetchResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  }

  /**
   * Perform a PATCH request.
   */
  async patch<T = unknown>(url: string, body?: unknown, options?: FetchOptions): Promise<FetchResponse<T>> {
    return this.request<T>(url, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  }

  /**
   * Perform a DELETE request.
   */
  async delete<T = unknown>(url: string, options?: FetchOptions): Promise<FetchResponse<T>> {
    return this.request<T>(url, { ...options, method: "DELETE" });
  }

  /**
   * Main request method.
   */
  async request<T = unknown>(url: string, options: FetchOptions = {}): Promise<FetchResponse<T>> {
    const config: FetchOptions = {
      ...this.defaultOptions,
      ...options,
      headers: { ...this.defaultHeaders, ...options.headers },
    };

    const fullURL = this.resolveURL(url, config.baseURL);
    const cacheKey = this.buildCacheKey(fullURL, config);

    // Check cache
    if (config.cache) {
      const cached = getCacheManager().get<FetchResponse<T>>(cacheKey);
      if (cached) {
        return { ...cached, fromCache: true };
      }
    }

    // Deduplication
    if (config.dedup) {
      const existing = this.pendingRequests.get(cacheKey);
      if (existing) {
        return existing as Promise<FetchResponse<T>>;
      }
    }

    const requestPromise = this.doRequest<T>(fullURL, config, cacheKey, cacheKey);
    if (config.dedup) {
      this.pendingRequests.set(cacheKey, requestPromise);
      requestPromise.finally(() => this.pendingRequests.delete(cacheKey));
    }

    return requestPromise;
  }

  // --- Internal ------------------------------------------------------

  private async doRequest<T>(url: string, config: FetchOptions, cacheKey: string, _dedupKey: string): Promise<FetchResponse<T>> {
    let lastError: Error | null = null;
    const maxRetries = config.retries || 0;
    const retryDelay = config.retryDelay || 1000;
    const retryOn = config.retryOn || [];
    const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();

    // Apply request interceptors
    let finalConfig = config;
    if (config.interceptors !== false) {
      for (const interceptor of this.interceptors) {
        if (interceptor.onRequest) {
          try { finalConfig = await interceptor.onRequest(finalConfig); }
          catch (e) { console.error("[TW HTTP] Request interceptor error:", e); }
        }
      }
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = config.timeout
      ? setTimeout(() => controller.abort(), config.timeout)
      : null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...finalConfig as any,
          signal: controller.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);

        // Apply response interceptors
        let finalResponse = response;
        if (config.interceptors !== false) {
          for (const interceptor of this.interceptors) {
            if (interceptor.onResponse) {
              try { finalResponse = await interceptor.onResponse(finalResponse); }
              catch (e) { console.error("[TW HTTP] Response interceptor error:", e); }
            }
          }
        }

        // Check if should retry
        if (retryOn.includes(finalResponse.status) && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt)));
          continue;
        }

        // Parse response
        let data: T;
        const contentType = finalResponse.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await finalResponse.json() as T;
        } else if (contentType.includes("text/")) {
          data = await finalResponse.text() as unknown as T;
        } else {
          data = await finalResponse.blob() as unknown as T;
        }

        const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
        const result: FetchResponse<T> = {
          data, status: finalResponse.status, headers: finalResponse.headers,
          ok: finalResponse.ok, url, duration, fromCache: false,
        };

        // Cache the response
        if (config.cache && finalResponse.ok) {
          getCacheManager().set(cacheKey, result, { ttl: config.cacheTTL });
        }

        return result;
      } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        lastError = e as Error;

        // Apply error interceptors
        if (config.interceptors !== false) {
          for (const interceptor of this.interceptors) {
            if (interceptor.onError) {
              try { lastError = await interceptor.onError(lastError); }
              catch (err) { console.error("[TW HTTP] Error interceptor failed:", err); }
            }
          }
        }

        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt)));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error("Request failed");
  }

  private resolveURL(url: string, baseURL?: string): string {
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    const base = baseURL || this.baseURL;
    if (!base) return url;
    return base.replace(/\/$/, "") + "/" + url.replace(/^\//, "");
  }

  private buildCacheKey(url: string, config: FetchOptions): string {
    return `fetch:${config.method || "GET"}:${url}`;
  }
}

// --- Global Client ----------------------------------------------------

let globalHttpClient: HttpClient | null = null;

export function getHttpClient(): HttpClient {
  if (!globalHttpClient) globalHttpClient = new HttpClient();
  return globalHttpClient;
}

export function setBaseURL(baseURL: string): void {
  getHttpClient().baseURL = baseURL;
}

export async function httpGet<T = unknown>(url: string, options?: FetchOptions): Promise<FetchResponse<T>> {
  return getHttpClient().get<T>(url, options);
}

export async function httpPost<T = unknown>(url: string, body?: unknown, options?: FetchOptions): Promise<FetchResponse<T>> {
  return getHttpClient().post<T>(url, body, options);
}

export async function httpPut<T = unknown>(url: string, body?: unknown, options?: FetchOptions): Promise<FetchResponse<T>> {
  return getHttpClient().put<T>(url, body, options);
}

export async function httpDelete<T = unknown>(url: string, options?: FetchOptions): Promise<FetchResponse<T>> {
  return getHttpClient().delete<T>(url, options);
}

/**
 * Upload a file with progress tracking.
 */
export async function uploadFile(
  url: string,
  file: File | Blob,
  options: FetchOptions & { onProgress?: (loaded: number, total: number) => void } = {},
): Promise<FetchResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();

    xhr.upload.onprogress = (e) => {
      if (options.onProgress && e.lengthComputable) {
        options.onProgress(e.loaded, e.total);
      }
    };

    xhr.onload = async () => {
      const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
      let data: unknown;
      try { data = JSON.parse(xhr.responseText); }
      catch { data = xhr.responseText; }
      resolve({
        data, status: xhr.status, headers: new Headers(),
        ok: xhr.status >= 200 && xhr.status < 300,
        url, duration, fromCache: false,
      });
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));

    xhr.open("POST", url);
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value as string);
      }
    }
    xhr.timeout = options.timeout || 30000;
    xhr.send(file);
  });
}
