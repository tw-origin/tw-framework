/**
 * HTTP client -- fetch wrapper with interceptors, retries, caching.
 * @module runtime/http
 */

export interface HttpRequestConfig {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  body?: BodyInit | Record<string, unknown> | null;
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  cache?: boolean;
  cacheTtl?: number;
  auth?: { type: "bearer" | "basic" | "apikey"; token?: string; username?: string; password?: string; header?: string };
  responseType?: "json" | "text" | "blob" | "arrayBuffer" | "formData";
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  mode?: RequestMode;
  redirect?: RequestRedirect;
  referrerPolicy?: ReferrerPolicy;
}

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: HttpRequestConfig;
  url: string;
  ok: boolean;
  redirected: boolean;
  type: ResponseType;
}

export interface HttpError extends Error {
  config?: HttpRequestConfig;
  response?: HttpResponse;
  request?: Request;
  code?: string;
  status?: number;
}

export interface HttpInterceptor {
  request?: (config: HttpRequestConfig) => HttpRequestConfig | Promise<HttpRequestConfig>;
  response?: (response: HttpResponse) => HttpResponse | Promise<HttpResponse>;
  error?: (error: HttpError) => HttpError | Promise<HttpError>;
}

export interface HttpCacheEntry {
  response: HttpResponse;
  timestamp: number;
  ttl: number;
}

export class HttpClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private defaultTimeout: number;
  private defaultRetries: number;
  private defaultRetryDelay: number;
  private interceptors: HttpInterceptor[] = [];
  private cache: Map<string, HttpCacheEntry> = new Map();
  private cacheEnabled: boolean;
  private defaultCacheTtl: number;
  private requestCount: number = 0;
  private successCount: number = 0;
  private errorCount: number = 0;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(options: { baseURL?: string; headers?: Record<string, string>; timeout?: number; retries?: number; retryDelay?: number; cache?: boolean; cacheTtl?: number } = {}) {
    this.baseURL = options.baseURL ?? "";
    this.defaultHeaders = options.headers ?? { "Content-Type": "application/json" };
    this.defaultTimeout = options.timeout ?? 30000;
    this.defaultRetries = options.retries ?? 0;
    this.defaultRetryDelay = options.retryDelay ?? 1000;
    this.cacheEnabled = options.cache ?? false;
    this.defaultCacheTtl = options.cacheTtl ?? 60000;
  }

  use(interceptor: HttpInterceptor): this {
    this.interceptors.push(interceptor);
    return this;
  }

  eject(interceptor: HttpInterceptor): this {
    const index = this.interceptors.indexOf(interceptor);
    if (index !== -1) {
      this.interceptors.splice(index, 1);
    }
    return this;
  }

  clearInterceptors(): this {
    this.interceptors = [];
    return this;
  }

  getInterceptorCount(): number {
    return this.interceptors.length;
  }

  setBaseURL(url: string): this {
    this.baseURL = url;
    return this;
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  setDefaultHeader(name: string, value: string): this {
    this.defaultHeaders[name] = value;
    return this;
  }

  removeDefaultHeader(name: string): this {
    delete this.defaultHeaders[name];
    return this;
  }

  getDefaultHeaders(): Record<string, string> {
    return { ...this.defaultHeaders };
  }

  setDefaultTimeout(timeout: number): this {
    this.defaultTimeout = timeout;
    return this;
  }

  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }

  setDefaultRetries(retries: number): this {
    this.defaultRetries = retries;
    return this;
  }

  getDefaultRetries(): number {
    return this.defaultRetries;
  }

  setCacheEnabled(enabled: boolean): this {
    this.cacheEnabled = enabled;
    return this;
  }

  isCacheEnabled(): boolean {
    return this.cacheEnabled;
  }

  setDefaultCacheTtl(ttl: number): this {
    this.defaultCacheTtl = ttl;
    return this;
  }

  getDefaultCacheTtl(): number {
    return this.defaultCacheTtl;
  }

  clearCache(): this {
    this.cache.clear();
    return this;
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  async get<T>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: "GET" });
  }

  async post<T>(url: string, body?: unknown, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: "POST", body: body as BodyInit });
  }

  async put<T>(url: string, body?: unknown, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: "PUT", body: body as BodyInit });
  }

  async patch<T>(url: string, body?: unknown, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: "PATCH", body: body as BodyInit });
  }

  async delete<T>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: "DELETE" });
  }

  async head<T>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: "HEAD" });
  }

  async options<T>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...config, url, method: "OPTIONS" });
  }

  async request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const mergedConfig = this.mergeConfig(config);
    let processedConfig = mergedConfig;
    for (const interceptor of this.interceptors) {
      if (interceptor.request) {
        processedConfig = await interceptor.request(processedConfig);
      }
    }
    if (mergedConfig.method === "GET" && (mergedConfig.cache ?? this.cacheEnabled)) {
      const cached = this.getCachedResponse<T>(processedConfig);
      if (cached) return cached;
    }
    const retries = mergedConfig.retries ?? this.defaultRetries;
    const retryDelay = mergedConfig.retryDelay ?? this.defaultRetryDelay;
    let lastError: HttpError | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.executeRequest<T>(processedConfig);
        let processedResponse = response;
        for (const interceptor of this.interceptors) {
          if (interceptor.response) {
            processedResponse = await interceptor.response(processedResponse) as any;
          }
        }
        if (mergedConfig.method === "GET" && (mergedConfig.cache ?? this.cacheEnabled)) {
          // Cache on the FULL url (path + query): caching on the raw path made
          // `get("/search", {params:{q:"cats"}})` and `get("/search",
          // {params:{q:"dogs"}})` collide and serve each other's responses.
          this.cacheResponse(this.buildURL(processedConfig.url, processedConfig.params), processedResponse, mergedConfig.cacheTtl ?? this.defaultCacheTtl);
        }
        this.successCount++;
        return processedResponse;
      } catch (error) {
        lastError = this.createHttpError(error as Error, processedConfig);
        for (const interceptor of this.interceptors) {
          if (interceptor.error) {
            lastError = await interceptor.error(lastError);
          }
        }
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }
    this.errorCount++;
    throw lastError;
  }

  private async executeRequest<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.requestCount++;
    const url = this.buildURL(config.url, config.params);
    const headers = this.buildHeaders(config);
    const body = this.buildBody(config.body, headers);
    const controller = new AbortController();
    const requestId = `${config.method}_${url}_${Date.now()}`;
    this.abortControllers.set(requestId, controller);
    const timeout = config.timeout ?? this.defaultTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: config.method,
        headers,
        body,
        signal: config.signal ?? controller.signal,
        credentials: config.credentials,
        mode: config.mode,
        redirect: config.redirect,
        referrerPolicy: config.referrerPolicy,
      });
      const data = await this.parseResponse<T>(response, config.responseType ?? "json");
      const httpResponse: HttpResponse<T> = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config,
        url,
        ok: response.ok,
        redirected: response.redirected,
        type: response.type,
      };
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as HttpError;
        error.config = config;
        error.response = httpResponse;
        error.status = response.status;
        throw error;
      }
      return httpResponse;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        const httpError = new Error(`Request timeout after ${timeout}ms`) as HttpError;
        httpError.config = config;
        httpError.code = "TIMEOUT";
        throw httpError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      this.abortControllers.delete(requestId);
    }
  }

  private mergeConfig(config: HttpRequestConfig): HttpRequestConfig {
    return {
      ...config,
      url: config.url,
      method: config.method ?? "GET",
      headers: { ...this.defaultHeaders, ...config.headers },
      timeout: config.timeout ?? this.defaultTimeout,
      retries: config.retries ?? this.defaultRetries,
      retryDelay: config.retryDelay ?? this.defaultRetryDelay,
      cache: config.cache ?? this.cacheEnabled,
      cacheTtl: config.cacheTtl ?? this.defaultCacheTtl,
      responseType: config.responseType ?? "json",
    };
  }

  private buildURL(url: string, params?: Record<string, string | number | boolean | undefined>): string {
    const fullURL = url.startsWith("http") ? url : `${this.baseURL}${url}`;
    if (!params) return fullURL;
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    return queryString ? `${fullURL}${fullURL.includes("?") ? "&" : "?"}${queryString}` : fullURL;
  }

  private buildHeaders(config: HttpRequestConfig): Record<string, string> {
    const headers: Record<string, string> = { ...config.headers };
    if (config.auth) {
      switch (config.auth.type) {
        case "bearer":
          headers["Authorization"] = `Bearer ${config.auth.token}`;
          break;
        case "basic":
          headers["Authorization"] = `Basic ${btoa(`${config.auth.username}:${config.auth.password}`)}`;
          break;
        case "apikey":
          headers[config.auth.header ?? "X-API-Key"] = config.auth.token ?? "";
          break;
      }
    }
    return headers;
  }

  private buildBody(body: BodyInit | Record<string, unknown> | null, headers: Record<string, string>): BodyInit | null {
    if (body === null || body === undefined) return null;
    if (typeof body === "string" || body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer || body instanceof URLSearchParams) {
      return body as BodyInit;
    }
    return JSON.stringify(body);
  }

  private async parseResponse<T>(response: Response, responseType: string): Promise<T> {
    switch (responseType) {
      case "json": return response.json() as Promise<T>;
      case "text": return response.text() as Promise<T>;
      case "blob": return response.blob() as Promise<T>;
      case "arrayBuffer": return response.arrayBuffer() as Promise<T>;
      case "formData": return response.formData() as Promise<T>;
      default: return response.json() as Promise<T>;
    }
  }

  private createHttpError(error: Error, config: HttpRequestConfig): HttpError {
    const httpError = error as HttpError;
    httpError.config = config;
    if (!httpError.code) {
      httpError.code = "NETWORK_ERROR";
    }
    return httpError;
  }

  /** The full request URL (path + query params) -- the cache must key on this, not the bare path. */
  private cacheKey(config: HttpRequestConfig): string {
    return this.buildURL(config.url, config.params);
  }

  private getCachedResponse<T>(config: HttpRequestConfig): HttpResponse<T> | null {
    const key = this.cacheKey(config);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.response as HttpResponse<T>;
  }

  private cacheResponse(url: string, response: HttpResponse, ttl: number): void {
    this.cache.set(url, { response, timestamp: Date.now(), ttl });
  }

  abort(requestId?: string): void {
    if (requestId) {
      const controller = this.abortControllers.get(requestId);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(requestId);
      }
    } else {
      for (const controller of this.abortControllers.values()) {
        controller.abort();
      }
      this.abortControllers.clear();
    }
  }

  getStats(): { requestCount: number; successCount: number; errorCount: number; cacheSize: number; activeRequests: number; successRate: number } {
    return {
      requestCount: this.requestCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      cacheSize: this.cache.size,
      activeRequests: this.abortControllers.size,
      successRate: this.requestCount > 0 ? (this.successCount / this.requestCount) * 100 : 0,
    };
  }

  resetStats(): void {
    this.requestCount = 0;
    this.successCount = 0;
    this.errorCount = 0;
  }

  createInstance(options: { baseURL?: string; headers?: Record<string, string>; timeout?: number; retries?: number; retryDelay?: number; cache?: boolean; cacheTtl?: number }): HttpClient {
    return new HttpClient({ ...options, baseURL: options.baseURL ?? this.baseURL });
  }

  async download(url: string, filename?: string, config?: Partial<HttpRequestConfig>): Promise<Blob> {
    const response = await this.get<Blob>(url, { ...config, responseType: "blob" });
    if (filename && typeof document !== "undefined") {
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }
    return response.data;
  }

  async upload(url: string, formData: FormData, config?: Partial<HttpRequestConfig>): Promise<HttpResponse> {
    const headers = { ...config?.headers };
    delete headers["Content-Type"];
    return this.request({ ...config, url, method: "POST", body: formData, headers });
  }

  async uploadProgress(url: string, formData: FormData, onProgress: (loaded: number, total: number) => void, config?: Partial<HttpRequestConfig>): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url.startsWith("http") ? url : `${this.baseURL}${url}`);
      for (const [key, value] of Object.entries(config?.headers ?? {})) {
        xhr.setRequestHeader(key, value);
      }
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded, e.total);
        }
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({
            data,
            status: xhr.status,
            statusText: xhr.statusText,
            headers: new Headers(),
            config: { ...config, url, method: "POST" } as HttpRequestConfig,
            url,
            ok: xhr.status >= 200 && xhr.status < 300,
            redirected: false,
            type: "basic",
          });
        } catch {
          resolve({
            data: xhr.responseText,
            status: xhr.status,
            statusText: xhr.statusText,
            headers: new Headers(),
            config: { ...config, url, method: "POST" } as HttpRequestConfig,
            url,
            ok: xhr.status >= 200 && xhr.status < 300,
            redirected: false,
            type: "basic",
          });
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(formData);
    });
  }

  setAuthToken(token: string, type: "bearer" | "apikey" = "bearer"): this {
    if (type === "bearer") {
      this.defaultHeaders["Authorization"] = `Bearer ${token}`;
    } else {
      this.defaultHeaders["X-API-Key"] = token;
    }
    return this;
  }

  removeAuthToken(): this {
    delete this.defaultHeaders["Authorization"];
    delete this.defaultHeaders["X-API-Key"];
    return this;
  }

  setBasicAuth(username: string, password: string): this {
    this.defaultHeaders["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
    return this;
  }

  removeBasicAuth(): this {
    delete this.defaultHeaders["Authorization"];
    return this;
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createHttpClient(options?: { baseURL?: string; headers?: Record<string, string>; timeout?: number; retries?: number; retryDelay?: number; cache?: boolean; cacheTtl?: number }): HttpClient {
  return new HttpClient(options);
}

export class CacheManager<T = unknown> {
  private cache: Map<string, { value: T; timestamp: number; ttl: number; hits: number }> = new Map();
  private maxSize: number;
  private defaultTtl: number;
  private stats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };

  constructor(maxSize: number = 1000, defaultTtl: number = 60000) {
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evict();
    }
    this.cache.set(key, { value, timestamp: Date.now(), ttl: ttl ?? this.defaultTtl, hits: 0 });
    this.stats.sets++;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }
    entry.hits++;
    this.stats.hits++;
    return entry.value;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) this.stats.deletes++;
    return deleted;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return [...this.cache.keys()];
  }

  values(): T[] {
    return [...this.cache.values()].map((e) => e.value);
  }

  entries(): Array<{ key: string; value: T; timestamp: number; hits: number }> {
    return [...this.cache.entries()].map(([key, entry]) => ({ key, value: entry.value, timestamp: entry.timestamp, hits: entry.hits }));
  }

  private evict(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  getOrSet(key: string, factory: () => T | Promise<T>, ttl?: number): T | Promise<T> {
    const existing = this.get(key);
    if (existing !== undefined) return existing;
    const value = factory();
    if (value instanceof Promise) {
      return value.then((v) => {
        this.set(key, v, ttl);
        return v;
      });
    }
    this.set(key, value, ttl);
    return value;
  }

  async getOrSetAsync(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const existing = this.get(key);
    if (existing !== undefined) return existing;
    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  mset(entries: Array<{ key: string; value: T; ttl?: number }>): void {
    for (const entry of entries) {
      this.set(entry.key, entry.value, entry.ttl);
    }
  }

  mget(keys: string[]): Array<T | undefined> {
    return keys.map((key) => this.get(key));
  }

  mdelete(keys: string[]): void {
    for (const key of keys) {
      this.delete(key);
    }
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  getStats(): { hits: number; misses: number; sets: number; deletes: number; evictions: number; size: number; hitRate: number } {
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: this.stats.hits + this.stats.misses > 0 ? this.stats.hits / (this.stats.hits + this.stats.misses) : 0,
    };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };
  }

  setMaxSize(max: number): void {
    this.maxSize = max;
    while (this.cache.size > max) {
      this.evict();
    }
  }

  getMaxSize(): number {
    return this.maxSize;
  }

  setDefaultTtl(ttl: number): void {
    this.defaultTtl = ttl;
  }

  getDefaultTtl(): number {
    return this.defaultTtl;
  }

  getTtl(key: string): number | undefined {
    return this.cache.get(key)?.ttl;
  }

  setTtl(key: string, ttl: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    entry.ttl = ttl;
    entry.timestamp = Date.now();
    return true;
  }

  getRemainingTtl(key: string): number {
    const entry = this.cache.get(key);
    if (!entry) return 0;
    const elapsed = Date.now() - entry.timestamp;
    return Math.max(0, entry.ttl - elapsed);
  }

  isExpired(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return true;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  touch(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    entry.timestamp = Date.now();
    return true;
  }

  getHits(key: string): number {
    return this.cache.get(key)?.hits ?? 0;
  }

  getHotKeys(count: number = 10): string[] {
    return [...this.cache.entries()].sort((a, b) => b[1].hits - a[1].hits).slice(0, count).map(([key]) => key);
  }

  getColdKeys(count: number = 10): string[] {
    return [...this.cache.entries()].sort((a, b) => a[1].hits - b[1].hits).slice(0, count).map(([key]) => key);
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createCacheManager<T>(maxSize?: number, defaultTtl?: number): CacheManager<T> {
  return new CacheManager<T>(maxSize, defaultTtl);
}

export class Store<T> {
  private state: T;
  private listeners: Set<(state: T, prevState: T) => void> = new Set();
  private middleware: Array<(state: T, action: { type: string; payload?: unknown }) => T> = [];
  private reducer: (state: T, action: { type: string; payload?: unknown }) => T;
  private history: Array<{ state: T; action: string; timestamp: number }> = [];
  private maxHistory: number;
  private devtools: boolean;

  constructor(initialState: T, reducer: (state: T, action: { type: string; payload?: unknown }) => T, options: { maxHistory?: number; devtools?: boolean } = {}) {
    this.state = initialState;
    this.reducer = reducer;
    this.maxHistory = options.maxHistory ?? 100;
    this.devtools = options.devtools ?? false;
    this.history.push({ state: this.state, action: "@@INIT", timestamp: Date.now() });
  }

  getState(): T {
    return this.state;
  }

  dispatch(action: { type: string; payload?: unknown }): T {
    const prevState = this.state;
    let newState = this.reducer(this.state, action);
    for (const mw of this.middleware) {
      newState = mw(newState, action);
    }
    if (newState !== prevState) {
      this.state = newState;
      this.history.push({ state: this.state, action: action.type, timestamp: Date.now() });
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      this.notify(prevState);
      if (this.devtools) {
        console.log(`[Store] ${action.type}`, { prevState, newState });
      }
    }
    return this.state;
  }

  subscribe(listener: (state: T, prevState: T) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  useMiddleware(middleware: (state: T, action: { type: string; payload?: unknown }) => T): this {
    this.middleware.push(middleware);
    return this;
  }

  removeMiddleware(middleware: (state: T, action: { type: string; payload?: unknown }) => T): this {
    const index = this.middleware.indexOf(middleware);
    if (index !== -1) {
      this.middleware.splice(index, 1);
    }
    return this;
  }

  private notify(prevState: T): void {
    this.listeners.forEach((listener) => listener(this.state, prevState));
  }

  getHistory(): Array<{ state: T; action: string; timestamp: number }> {
    return [...this.history];
  }

  getHistoryLength(): number {
    return this.history.length;
  }

  clearHistory(): void {
    this.history = [{ state: this.state, action: "@@CLEAR", timestamp: Date.now() }];
  }

  setMaxHistory(max: number): void {
    this.maxHistory = max;
    while (this.history.length > max) {
      this.history.shift();
    }
  }

  getMaxHistory(): number {
    return this.maxHistory;
  }

  getListenerCount(): number {
    return this.listeners.size;
  }

  hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  reset(): void {
    this.state = this.history[0]?.state ?? this.state;
    this.history = [{ state: this.state, action: "@@RESET", timestamp: Date.now() }];
    this.notify(this.state);
  }

  toJSON(): string {
    return JSON.stringify({ state: this.state, history: this.history.length }, null, 2);
  }
}

export function createStore<T>(initialState: T, reducer: (state: T, action: { type: string; payload?: unknown }) => T, options?: { maxHistory?: number; devtools?: boolean }): Store<T> {
  return new Store(initialState, reducer, options);
}
