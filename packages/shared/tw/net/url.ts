/**
 * URL parsing and manipulation utilities.
 * @module shared/net
 */

export interface URLParts {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  username: string;
  password: string;
}

export function parseURL(url: string): URLParts {
  const parsed = new URL(url);
  return {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    username: parsed.username,
    password: parsed.password,
  };
}

export function stringifyURL(parts: URLParts): string {
  const url = new URL(parts.protocol + "//" + parts.hostname);
  if (parts.port) url.port = parts.port;
  if (parts.pathname) url.pathname = parts.pathname;
  if (parts.search) url.search = parts.search;
  if (parts.hash) url.hash = parts.hash;
  if (parts.username) url.username = parts.username;
  if (parts.password) url.password = parts.password;
  return url.toString();
}

export function resolveURL(base: string, ...paths: string[]): string {
  return paths.reduce((acc, path) => new URL(path, acc).toString(), base);
}

export function normalizeURL(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.searchParams.sort();
  return parsed.toString();
}

export function isAbsoluteURL(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
}

export function isRelativeURL(url: string): boolean {
  return !isAbsoluteURL(url);
}

export function joinURL(base: string, ...paths: string[]): string {
  const url = new URL(base);
  url.pathname = [url.pathname, ...paths].join("/").replace(/\/+/g, "/").replace(/\/$/, "");
  return url.toString();
}

export function addQueryParams(url: string, params: Record<string, string | number | boolean | string[] | undefined>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      parsed.searchParams.delete(key);
    } else if (Array.isArray(value)) {
      parsed.searchParams.delete(key);
      for (const item of value) {
        parsed.searchParams.append(key, String(item));
      }
    } else {
      parsed.searchParams.set(key, String(value));
    }
  }
  return parsed.toString();
}

export function removeQueryParams(url: string, ...paramNames: string[]): string {
  const parsed = new URL(url);
  for (const name of paramNames) {
    parsed.searchParams.delete(name);
  }
  return parsed.toString();
}

export function getQueryParam(url: string, param: string): string | null {
  return new URL(url).searchParams.get(param);
}

export function getQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  new URL(url).searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

export function getAllQueryParam(url: string, param: string): string[] {
  return new URL(url).searchParams.getAll(param);
}

export function hasQueryParam(url: string, param: string): boolean {
  return new URL(url).searchParams.has(param);
}

export function setQueryParam(url: string, param: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(param, value);
  return parsed.toString();
}

export function addQueryParam(url: string, param: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.append(param, value);
  return parsed.toString();
}

export function getHash(url: string): string {
  const hash = new URL(url).hash;
  return hash.startsWith("#") ? hash.slice(1) : hash;
}

export function setHash(url: string, hash: string): string {
  const parsed = new URL(url);
  parsed.hash = hash.startsWith("#") ? hash : "#" + hash;
  return parsed.toString();
}

export function removeHash(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.toString();
}

export function getPathname(url: string): string {
  return new URL(url).pathname;
}

export function setPathname(url: string, pathname: string): string {
  const parsed = new URL(url);
  parsed.pathname = pathname;
  return parsed.toString();
}

export function getHostname(url: string): string {
  return new URL(url).hostname;
}

export function getProtocol(url: string): string {
  return new URL(url).protocol;
}

export function getPort(url: string): string {
  return new URL(url).port;
}

export function getOrigin(url: string): string {
  return new URL(url).origin;
}

export function isHTTPS(url: string): boolean {
  return new URL(url).protocol === "https:";
}

export function isHTTP(url: string): boolean {
  return new URL(url).protocol === "http:";
}

export function isFile(url: string): boolean {
  return new URL(url).protocol === "file:";
}

export function isDataURL(url: string): boolean {
  return new URL(url).protocol === "data:";
}

export function isBlobURL(url: string): boolean {
  return new URL(url).protocol === "blob:";
}

export function getDomainParts(url: string): string[] {
  return new URL(url).hostname.split(".").reverse();
}

export function getTopLevelDomain(url: string): string {
  const parts = getDomainParts(url);
  return parts[0] ?? "";
}

export function getSecondLevelDomain(url: string): string {
  const parts = getDomainParts(url);
  return parts[1] ?? "";
}

export function getRootDomain(url: string): string {
  const parts = getDomainParts(url);
  return parts.slice(0, 2).reverse().join(".");
}

export function getSubdomain(url: string): string {
  const hostname = new URL(url).hostname;
  const rootDomain = getRootDomain(url);
  const subdomain = hostname.slice(0, hostname.length - rootDomain.length);
  return subdomain.endsWith(".") ? subdomain.slice(0, -1) : subdomain;
}

export function parseQueryString(query: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  for (const [key, value] of params.entries()) {
    if (key in result) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function stringifyQueryString(params: Record<string, string | number | boolean | string[] | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, String(item));
      }
    } else {
      searchParams.set(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? "?" + str : "";
}

export function encodeURL(url: string): string {
  return encodeURIComponent(url);
}

export function decodeURL(url: string): string {
  return decodeURIComponent(url);
}

export function encodeComponent(str: string): string {
  return encodeURIComponent(str);
}

export function decodeComponent(str: string): string {
  return decodeURIComponent(str);
}

export function buildURL(base: string, options: { path?: string; query?: Record<string, string | number | boolean>; hash?: string; } = {}): string {
  let url = base;
  if (options.path) {
    url = joinURL(url, options.path);
  }
  if (options.query) {
    url = addQueryParams(url, options.query);
  }
  if (options.hash) {
    url = setHash(url, options.hash);
  }
  return url;
}

export function sameOrigin(a: string, b: string): boolean {
  return new URL(a).origin === new URL(b).origin;
}

export function sameHostname(a: string, b: string): boolean {
  return new URL(a).hostname === new URL(b).hostname;
}

export function samePathname(a: string, b: string): boolean {
  return new URL(a).pathname === new URL(b).pathname;
}

export function isLocalURL(url: string, localOrigin?: string): boolean {
  const origin = localOrigin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  return sameOrigin(url, origin);
}

export function toAbsoluteURL(url: string, base: string = "http://localhost"): string {
  if (isAbsoluteURL(url)) return url;
  return new URL(url, base).toString();
}

export function toRelativeURL(url: string, base: string): string {
  const baseUrl = new URL(base);
  const targetUrl = new URL(url, base);
  if (baseUrl.origin === targetUrl.origin) {
    if (baseUrl.pathname === targetUrl.pathname) {
      return targetUrl.search + targetUrl.hash;
    }
    return targetUrl.pathname + targetUrl.search + targetUrl.hash;
  }
  return targetUrl.toString();
}

export function extractPathSegments(url: string): string[] {
  const pathname = new URL(url).pathname;
  return pathname.split("/").filter(Boolean);
}

export function matchPath(url: string, pattern: string): Record<string, string> | null {
  const urlSegments = extractPathSegments(url);
  const patternSegments = pattern.split("/").filter(Boolean);
  if (urlSegments.length !== patternSegments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSeg = patternSegments[i];
    const urlSeg = urlSegments[i];
    if (patternSeg.startsWith(":")) {
      params[patternSeg.slice(1)] = urlSeg;
    } else if (patternSeg !== urlSeg) {
      return null;
    }
  }
  return params;
}

export function interpolatePath(pattern: string, params: Record<string, string>): string {
  return pattern.replace(/:(\w+)/g, (_, key) => params[key] ?? "");
}

export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeURL(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

export function compareURLs(a: string, b: string): boolean {
  const urlA = new URL(a);
  const urlB = new URL(b);
  urlA.searchParams.sort();
  urlB.searchParams.sort();
  return urlA.toString() === urlB.toString();
}

export function urlDistance(a: string, b: string): number {
  const segmentsA = extractPathSegments(a);
  const segmentsB = extractPathSegments(b);
  let common = 0;
  for (let i = 0; i < Math.min(segmentsA.length, segmentsB.length); i++) {
    if (segmentsA[i] === segmentsB[i]) common++;
    else break;
  }
  return segmentsA.length - common + segmentsB.length - common;
}

export function parseDataURL(url: string): { mimeType: string; encoding: string; data: string } {
  const match = url.match(/^data:([^;,]+)?(;([^,]+))?,(.*)$/);
  if (!match) throw new Error("Invalid data URL");
  return {
    mimeType: match[1] ?? "text/plain",
    encoding: match[3] ?? "url",
    data: match[4] ?? "",
  };
}

export function createDataURL(data: string, mimeType: string = "text/plain", encoding: string = "utf-8"): string {
  if (encoding === "base64") {
    const base64 = typeof btoa !== "undefined" ? btoa(data) : Buffer.from(data).toString("base64");
    return `data:${mimeType};base64,${base64}`;
  }
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(data)}`;
}

export function getQueryParamTypes(url: string): Record<string, "string" | "number" | "boolean" | "array"> {
  const result: Record<string, "string" | "number" | "boolean" | "array"> = {};
  const params = parseQueryString(url);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      result[key] = "array";
    } else if (value === "true" || value === "false") {
      result[key] = "boolean";
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      result[key] = "number";
    } else {
      result[key] = "string";
    }
  }
  return result;
}

export function coerceQueryParam(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

export function getTypedQueryParams(url: string): Record<string, string | number | boolean | string[]> {
  const result: Record<string, string | number | boolean | string[]> = {};
  const params = parseQueryString(url);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      result[key] = value;
    } else {
      result[key] = coerceQueryParam(value);
    }
  }
  return result;
}

export function buildSearchString(params: Record<string, string | number | boolean | string[] | undefined>): string {
  return stringifyQueryString(params);
}

export function redirect(url: string): void {
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
}

export function redirectTo(path: string): void {
  redirect(toAbsoluteURL(path));
}

export function openInNewTab(url: string): void {
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function downloadFile(url: string, filename?: string): void {
  if (typeof document !== "undefined") {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename ?? "";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error("Clipboard API not available"));
}

export function readFromClipboard(): Promise<string> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    return navigator.clipboard.readText();
  }
  return Promise.reject(new Error("Clipboard API not available"));
}

export function shareURL(url: string, title?: string, text?: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.share) {
    return navigator.share({ url, title, text });
  }
  return copyToClipboard(url);
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function getConnectionType(): string {
  const conn = (navigator as unknown as { connection?: { effectiveType: string } }).connection;
  return conn?.effectiveType ?? "unknown";
}

export function isBot(userAgent: string): boolean {
  return /bot|crawler|spider|crawling/i.test(userAgent);
}

export function getUserAgent(): string {
  return typeof navigator !== "undefined" ? navigator.userAgent : "";
}

export function getLanguage(): string {
  return typeof navigator !== "undefined" ? navigator.language : "en";
}

export function getLanguages(): string[] {
  return typeof navigator !== "undefined" ? [...navigator.languages] : ["en"];
}

export function getPlatform(): string {
  return typeof navigator !== "undefined" ? navigator.platform : "unknown";
}

export function isMobile(): boolean {
  const ua = getUserAgent();
  return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export function isTablet(): boolean {
  const ua = getUserAgent();
  return /iPad|Android(?!.*Mobile)|Tablet/i.test(ua);
}

export function isDesktop(): boolean {
  return !isMobile() && !isTablet();
}

export function isIOS(): boolean {
  const ua = getUserAgent();
  return /iPad|iPhone|iPod/.test(ua);
}

export function isAndroid(): boolean {
  const ua = getUserAgent();
  return /Android/.test(ua);
}

export function isMacOS(): boolean {
  const platform = getPlatform();
  return platform.includes("Mac");
}

export function isWindows(): boolean {
  const platform = getPlatform();
  return platform.includes("Win");
}

export function isLinux(): boolean {
  const platform = getPlatform();
  return platform.includes("Linux");
}

export function getBrowser(): string {
  const ua = getUserAgent();
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("OPR") || ua.includes("Opera")) return "Opera";
  if (ua.includes("MSIE") || ua.includes("Trident")) return "IE";
  return "Unknown";
}

export function getBrowserVersion(): string {
  const ua = getUserAgent();
  const browser = getBrowser();
  const patterns: Record<string, RegExp> = {
    Firefox: /Firefox\/(\d+\.\d+)/,
    Edge: /Edg\/(\d+\.\d+)/,
    Chrome: /Chrome\/(\d+\.\d+)/,
    Safari: /Version\/(\d+\.\d+)/,
    Opera: /(?:OPR|Opera)\/(\d+\.\d+)/,
    IE: /(?:MSIE |rv:)(\d+\.\d+)/,
  };
  const pattern = patterns[browser];
  if (pattern) {
    const match = ua.match(pattern);
    if (match) return match[1];
  }
  return "Unknown";
}

export function getEngine(): string {
  const ua = getUserAgent();
  if (ua.includes("Gecko")) return "Gecko";
  if (ua.includes("WebKit")) return "WebKit";
  if (ua.includes("Blink")) return "Blink";
  if (ua.includes("Trident")) return "Trident";
  return "Unknown";
}

export function getOS(): string {
  const ua = getUserAgent();
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iOS")) return "iOS";
  return "Unknown";
}

export function getOSVersion(): string {
  const ua = getUserAgent();
  if (ua.includes("Windows NT 10")) return "10/11";
  if (ua.includes("Windows NT 6.3")) return "8.1";
  if (ua.includes("Windows NT 6.2")) return "8";
  if (ua.includes("Windows NT 6.1")) return "7";
  if (ua.includes("Mac OS X")) {
    const match = ua.match(/Mac OS X (\d+[._]\d+)/);
    return match ? match[1].replace("_", ".") : "Unknown";
  }
  if (ua.includes("Android ")) {
    const match = ua.match(/Android (\d+\.\d+)/);
    return match ? match[1] : "Unknown";
  }
  if (ua.includes("iPhone OS") || ua.includes("CPU OS")) {
    const match = ua.match(/(?:iPhone OS|CPU OS) (\d+[._]\d+)/);
    return match ? match[1].replace("_", ".") : "Unknown";
  }
  return "Unknown";
}

export function getScreenResolution(): { width: number; height: number } {
  if (typeof screen !== "undefined") {
    return { width: screen.width, height: screen.height };
  }
  return { width: 0, height: 0 };
}

export function getViewportSize(): { width: number; height: number } {
  if (typeof window !== "undefined") {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  return { width: 0, height: 0 };
}

export function getColorDepth(): number {
  return typeof screen !== "undefined" ? screen.colorDepth : 24;
}

export function getPixelRatio(): number {
  return typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
}

export function getTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getTimezoneOffset(): number {
  return new Date().getTimezoneOffset();
}

export function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : undefined;
}

export function setCookie(name: string, value: string, options: { expires?: Date; maxAge?: number; path?: string; domain?: string; secure?: boolean; sameSite?: "strict" | "lax" | "none" } = {}): void {
  if (typeof document === "undefined") return;
  const { expires, maxAge, path = "/", domain, secure, sameSite = "lax" } = options;
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (expires) cookie += `; expires=${expires.toUTCString()}`;
  if (maxAge !== undefined) cookie += `; max-age=${maxAge}`;
  if (path) cookie += `; path=${path}`;
  if (domain) cookie += `; domain=${domain}`;
  if (secure) cookie += "; secure";
  cookie += `; samesite=${sameSite}`;
  document.cookie = cookie;
}

export function deleteCookie(name: string, path: string = "/"): void {
  setCookie(name, "", { expires: new Date(0), path });
}

export function getAllCookies(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const result: Record<string, string> = {};
  document.cookie.split(";").forEach((cookie) => {
    const [name, ...valueParts] = cookie.trim().split("=");
    result[name] = decodeURIComponent(valueParts.join("="));
  });
  return result;
}

export function hasCookie(name: string): boolean {
  return getCookie(name) !== undefined;
}

export function clearAllCookies(): void {
  const cookies = getAllCookies();
  for (const name of Object.keys(cookies)) {
    deleteCookie(name);
  }
}

export function getLocalStorage(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(key);
}

export function setLocalStorage(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, value);
}

export function removeLocalStorage(key: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(key);
}

export function clearLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.clear();
}

export function getSessionStorage(key: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(key);
}

export function setSessionStorage(key: string, value: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(key, value);
}

export function removeSessionStorage(key: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(key);
}

export function clearSessionStorage(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.clear();
}

export function getJSONStorage(storage: Storage, key: string): unknown {
  const value = storage.getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function setJSONStorage(storage: Storage, key: string, value: unknown): void {
  storage.setItem(key, JSON.stringify(value));
}

export function getLocalJSON(key: string): unknown {
  if (typeof localStorage === "undefined") return null;
  return getJSONStorage(localStorage, key);
}

export function setLocalJSON(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") return;
  setJSONStorage(localStorage, key, value);
}

export function getSessionJSON(key: string): unknown {
  if (typeof sessionStorage === "undefined") return null;
  return getJSONStorage(sessionStorage, key);
}

export function setSessionJSON(key: string, value: unknown): void {
  if (typeof sessionStorage === "undefined") return;
  setJSONStorage(sessionStorage, key, value);
}
