/**
 * TW request-context helpers (docs/request-context.md).
 *
 * Lives in `@tw/shared` so the server, the SDK and the published `"tw"`
 * specifier all reach the same functions. A user writes:
 *
 *   import { clientIp, geolocation } from "tw";
 *
 * and `@tw/server` re-exports this module, which is what `"tw"` resolves to.
 */

// --- Types ------------------------------------------------------------------

export interface Geo {
  city?: string;
  country?: string;
  countryName?: string;
  region?: string;
  continent?: string;
  latitude?: number;
  longitude?: number;
  postalCode?: string;
  timezone?: string;
  /** Emoji flag, derived from `country`. */
  flag?: string;
  currency?: string;
  /** True when `country` is a European Union member. */
  isEU: boolean;
  metroCode?: string;
  /** 0-1; how confident the edge provider is in this reading. */
  confidence?: number;
  /** Which provider answered. */
  source: string;
  /** Great-circle distance in km to a point, when lat/lng are known. */
  distanceTo(lat: number, lng: number): number | null;
}

export interface DeferredTask<T = unknown> {
  status: "pending" | "done" | "failed";
  result?: T;
  error?: unknown;
  /** Resolves when the task settles. Never rejects. */
  done: Promise<T | undefined>;
  /** The task is thenable, so `await task` works and `result` is set on settle. */
  then<R = T | undefined>(
    onFulfilled?: (value: T | undefined) => R | PromiseLike<R>,
    onRejected?: (reason: unknown) => R | PromiseLike<R>,
  ): Promise<R | undefined>;
}

export interface Deadline {
  /** Milliseconds left in the request budget. */
  remaining: number;
  ms: number;
  isExpired: boolean;
  /** Pass straight to `fetch(..., { signal })`. */
  abortSignal: AbortSignal;
  /** Fires once, a little before the wall. */
  onExpiring(cb: () => void): void;
  /** Throws when the budget is spent. */
  throwIfExpired(): void;
}

// --- Header access + client address (from @tw/shared) ------------------------

import {
  clientIp as _clientIp, ipAddress as _ipAddress, normalizeIp as _normalizeIp,
  isPrivateIp as _isPrivateIp, inCidr as _inCidr, trustProxy as _trustProxy,
  readHeader,
} from "./ip";
import type { ClientIp as _ClientIp, HeaderBag } from "./ip";

export type { HeaderBag };
export const clientIp = _clientIp;
export const ipAddress = _ipAddress;
export const normalizeIp = _normalizeIp;
export const isPrivateIp = _isPrivateIp;
export const inCidr = _inCidr;
export const trustProxy = _trustProxy;
export type ClientIp = _ClientIp;

// --- A2. geolocation --------------------------------------------------------

const EU = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"]);

function flagFor(country?: string): string | undefined {
  if (!country || country.length !== 2) return undefined;
  const A = 0x1f1e6;
  return String.fromCodePoint(A + country.toUpperCase().charCodeAt(0) - 65, A + country.toUpperCase().charCodeAt(1) - 65);
}

function num(v?: string): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Geolocation from edge headers, with a provider fallback chain.
 *
 * Vercel returns six fields and stops. This reads Vercel, Cloudflare,
 * CloudFront and Fastly shapes, adds continent/timezone/flag/currency/EU,
 * and can answer `distanceTo()`.
 */
export function geolocation(bag: HeaderBag): Geo {
  const g = (n: string) => readHeader(bag, n);
  const city = g("x-vercel-ip-city") ?? g("cf-ipcity") ?? g("cloudfront-viewer-city");
  const country = g("x-vercel-ip-country") ?? g("cf-ipcountry") ?? g("cloudfront-viewer-country");
  const region = g("x-vercel-ip-country-region") ?? g("cf-region-code") ?? g("cloudfront-viewer-country-region");
  const latitude = num(g("x-vercel-ip-latitude") ?? g("cf-iplatitude") ?? g("cloudfront-viewer-latitude"));
  const longitude = num(g("x-vercel-ip-longitude") ?? g("cf-iplongitude") ?? g("cloudfront-viewer-longitude"));
  const postalCode = g("x-vercel-ip-postal-code") ?? g("cf-postal-code") ?? g("cloudfront-viewer-postal-code");
  const timezone = g("x-vercel-ip-timezone") ?? g("cf-timezone") ?? g("cloudfront-viewer-time-zone");
  const continent = g("cf-ipcontinent") ?? g("cloudfront-viewer-country-continent-code");
  const metroCode = g("x-vercel-ip-city") ? g("x-vercel-ip-metro-code") : g("cloudfront-viewer-metro-code");

  const source = g("x-vercel-ip-country") ? "vercel"
    : g("cf-ipcountry") ? "cloudflare"
    : g("cloudfront-viewer-country") ? "cloudfront"
    : g("x-served-by") ? "fastly"
    : "unknown";

  return {
    city,
    country,
    region,
    continent,
    latitude,
    longitude,
    postalCode,
    timezone,
    flag: flagFor(country),
    isEU: country ? EU.has(country.toUpperCase()) : false,
    metroCode,
    confidence: source === "unknown" ? 0 : 0.9,
    source,
    distanceTo(toLat: number, toLng: number) {
      if (latitude === undefined || longitude === undefined) return null;
      return haversine(latitude, longitude, toLat, toLng);
    },
  };
}

// --- A3. deferred work ------------------------------------------------------

const pending = new Set<Promise<unknown>>();
let waitUntilHook: ((p: Promise<unknown>) => void) | undefined;

/** Register the platform's waitUntil (Workers/Vercel) so tasks survive the response. */
export function setWaitUntilHook(fn: (p: Promise<unknown>) => void): void {
  waitUntilHook = fn;
}

function track<T>(p: Promise<T>): Promise<T> {
  pending.add(p);
  void p.finally(() => pending.delete(p));
  if (waitUntilHook) { try { waitUntilHook(p); } catch { /* ignore */ } }
  return p;
}

/** How many deferred tasks are still in flight (useful in tests). */
export function pendingTasks(): number {
  return pending.size;
}

/** Run a promise after the response is sent. */
export function waitUntil<T>(promise: Promise<T> | (() => Promise<T>)): DeferredTask<T> {
  return makeTask(typeof promise === "function" ? promise() : promise);
}

/** Next-style: run a callback after the response is sent. */
export function after<T>(fn: () => T | Promise<T>): DeferredTask<T> {
  return makeTask(Promise.resolve().then(fn));
}

/** Like `after`, but retries and gives up after `timeout` ms. */
export type Duration = number | string;

/** "10s" | "500ms" | "2m" | "1h" | a number of ms -> milliseconds. */
export function parseDuration(d: Duration): number {
  if (typeof d === "number") return d;
  const m = /^\s*([\d.]+)\s*(ms|s|m|h)?\s*$/i.exec(d);
  if (!m) throw new Error(`Invalid duration: ${JSON.stringify(d)}`);
  const n = Number.parseFloat(m[1]);
  const unit = (m[2] ?? "ms").toLowerCase();
  const scale = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 1;
  return n * scale;
}

export function background<T>(
  fn: () => T | Promise<T>,
  opts: { retries?: number; timeout?: Duration } = {},
): DeferredTask<T> {
  const { retries = 2 } = opts;
  const timeout = parseDuration(opts.timeout ?? "30s");
  const run = async (): Promise<T> => {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await withTimeout(Promise.resolve().then(fn), timeout);
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  };
  return makeTask(run());
}

/** Alias of `after` for people who think in "defer". */
export function defer<T>(fn: () => T | Promise<T>): DeferredTask<T> {
  return after(fn);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`background task timed out after ${ms}ms`)), ms);
    if (typeof (t as { unref?: () => void }).unref === "function") (t as { unref: () => void }).unref();
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function makeTask<T>(p: Promise<T>): DeferredTask<T> {
  const task = {
    status: "pending" as DeferredTask<T>["status"],
    done: Promise.resolve(undefined) as Promise<T | undefined>,
    then<R>(onFulfilled?: (v: T | undefined) => R | PromiseLike<R>, onRejected?: (e: unknown) => R | PromiseLike<R>) {
      return task.done.then(onFulfilled, onRejected);
    },
  } as DeferredTask<T>;
  const tracked = track(p.then(
    (v) => { task.status = "done"; task.result = v; return v; },
    (e) => { task.status = "failed"; task.error = e; return undefined; },
  ));
  task.done = tracked;
  return task;
}

// --- A4. env ----------------------------------------------------------------

class EnvReader {
  constructor(private source: Record<string, string | undefined>) {}

  get(name: string): string | undefined { return this.source[name]; }

  /** Throws a loud, named error when a required variable is missing. */
  require(name: string): string {
    const v = this.source[name];
    if (v === undefined || v === "") throw new Error(`Missing required environment variable: ${name}`);
    return v;
  }

  int(name: string, fallback?: number): number {
    const v = this.source[name];
    if (v === undefined || v === "") {
      if (fallback !== undefined) return fallback;
      throw new Error(`Environment variable ${name} is not an integer (missing)`);
    }
    // Reject trailing garbage: parseInt("1e999") is 1, which silently hides a
    // typo. The whole value must be an integer.
    if (!/^[+-]?\d+$/.test(v.trim())) {
      throw new Error(`Environment variable ${name} is not an integer: ${JSON.stringify(v)}`);
    }
    return Number.parseInt(v.trim(), 10);
  }

  float(name: string, fallback?: number): number {
    const v = this.source[name];
    if (v === undefined || v === "") {
      if (fallback !== undefined) return fallback;
      throw new Error(`Environment variable ${name} is not a float (missing)`);
    }
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v.trim())) {
      throw new Error(`Environment variable ${name} is not a float: ${JSON.stringify(v)}`);
    }
    const n = Number.parseFloat(v.trim());
    if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} is not finite: ${JSON.stringify(v)}`);
    return n;
  }

  bool(name: string, fallback?: boolean): boolean {
    const v = this.source[name];
    if (v === undefined || v === "") {
      if (fallback !== undefined) return fallback;
      throw new Error(`Environment variable ${name} is not a boolean (missing)`);
    }
    const s = v.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(s)) return true;
    if (["0", "false", "no", "off"].includes(s)) return false;
    throw new Error(`Environment variable ${name} is not a boolean: ${JSON.stringify(v)}`);
  }

  url(name: string): URL {
    const v = this.require(name);
    try { return new URL(v); } catch { throw new Error(`Environment variable ${name} is not a URL: ${JSON.stringify(v)}`); }
  }

  json<T = unknown>(name: string): T {
    const v = this.require(name);
    try { return JSON.parse(v) as T; } catch { throw new Error(`Environment variable ${name} is not valid JSON`); }
  }

  list(name: string, sep = ","): string[] {
    const v = this.source[name];
    if (!v) return [];
    return v.split(sep).map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Validate a whole set at once -- call it at startup and every problem is
   * reported together, instead of one crash per variable.
   */
  schema<S extends Record<string, EnvType>>(spec: S): EnvSchemaResult<S> {
    const values: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const [name, type] of Object.entries(spec)) {
      try {
        switch (type) {
          case "int": values[name] = this.int(name); break;
          case "float": values[name] = this.float(name); break;
          case "bool": values[name] = this.bool(name); break;
          case "url": values[name] = this.url(name); break;
          case "json": values[name] = this.json(name); break;
          case "list": values[name] = this.list(name); break;
          default: values[name] = this.require(name);
        }
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    return { ok: errors.length === 0, values: values as EnvValues<S>, errors };
  }
}

export type EnvType = "string" | "int" | "float" | "bool" | "url" | "json" | "list";

type EnvValueOf<T extends EnvType> =
  T extends "int" | "float" ? number :
  T extends "bool" ? boolean :
  T extends "url" ? URL :
  T extends "list" ? string[] :
  T extends "json" ? unknown : string;

export type EnvValues<S extends Record<string, EnvType>> = { [K in keyof S]: EnvValueOf<S[K]> };

export interface EnvSchemaResult<S extends Record<string, EnvType>> {
  ok: boolean;
  values: EnvValues<S>;
  /** Every problem, so one startup check reports them all. */
  errors: string[];
}

const envSource: Record<string, string | undefined> =
  (typeof process !== "undefined" && process.env ? (process.env as Record<string, string | undefined>) : {});

export const env = new EnvReader(envSource);

/** Raw environment access -- the shape `@vercel/functions` gives you. */
export function getEnv(source?: Record<string, string | undefined>): EnvReader {
  return source ? new EnvReader(source) : env;
}

// --- A5. deadline -----------------------------------------------------------

const DEADLINE_MS = 30_000;

/**
 * The request time budget, as an object with an AbortSignal.
 *
 * Vercel hands you a number you have to poll. This gives you a signal to pass
 * to fetch and a callback that fires before the wall.
 */
export function deadline(totalMs: number = DEADLINE_MS, startedAt: number = Date.now()): Deadline {
  const started = startedAt;
  const controller = new AbortController();
  let fired = false;
  const callbacks: Array<() => void> = [];
  const remaining = () => Math.max(0, totalMs - (Date.now() - started));

  const check = () => {
    if (fired) return;
    if (remaining() <= 0) { fired = true; controller.abort(); for (const cb of callbacks) { try { cb(); } catch { /* ignore */ } } }
  };

  return {
    get remaining() { check(); return remaining(); },
    get ms() { return totalMs; },
    get isExpired() { return remaining() <= 0; },
    abortSignal: controller.signal,
    onExpiring(cb: () => void) {
      callbacks.push(cb);
      if (remaining() <= 0) { try { cb(); } catch { /* ignore */ } }
    },
    throwIfExpired() {
      if (remaining() <= 0) throw new Error("Request deadline exceeded");
    },
  };
}

/** Milliseconds left, as a bare number. */
export function getDeadline(totalMs: number = DEADLINE_MS, startedAt: number = Date.now()): number {
  return deadline(totalMs, startedAt).remaining;
}

// --- A6. metrics ------------------------------------------------------------

export interface MetricPoint { name: string; value: number; tags: Record<string, string>; at: number }

const metricSink: MetricPoint[] = [];
let metricSinkFn: ((p: MetricPoint) => void) | undefined;

export function setMetricSink(fn: (p: MetricPoint) => void): void { metricSinkFn = fn; }
export function collectedMetrics(): MetricPoint[] { return [...metricSink]; }
export function clearMetrics(): void { metricSink.length = 0; }

function emit(name: string, value: number, tags: Record<string, string> = {}): void {
  const point: MetricPoint = { name, value, tags, at: Date.now() };
  metricSink.push(point);
  if (metricSinkFn) { try { metricSinkFn(point); } catch { /* ignore */ } }
}

/** Record a single metric point. */
export function metric(name: string, value: number, tags?: Record<string, string>): void {
  emit(name, value, tags);
}

export function counter(name: string, tags?: Record<string, string>) {
  let total = 0;
  return { add(n = 1) { total += n; emit(name, total, tags); }, get value() { return total; } };
}

export function gauge(name: string, tags?: Record<string, string>) {
  return { set(v: number) { emit(name, v, tags); } };
}

export function histogram(name: string, tags?: Record<string, string>) {
  const samples: number[] = [];
  return {
    observe(v: number) { samples.push(v); emit(name, v, tags); },
    get samples() { return [...samples]; },
  };
}

export function timer(name: string, tags?: Record<string, string>) {
  const started = Date.now();
  return { stop(): number { const d = Date.now() - started; emit(name, d, tags); return d; } };
}

// --- A7. userAgent ----------------------------------------------------------

export interface UserAgentInfo {
  raw: string;
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  device?: string;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isBot: boolean;
  botName?: string;
}

/** Parse the UA into the fields apps actually branch on. */
/** No real user agent is anywhere near this long; a longer one is an attack. */
const MAX_UA = 512;

export function userAgent(bag: HeaderBag): UserAgentInfo {
  const rawFull = readHeader(bag, "user-agent") ?? "";
  // Bound the input before any regex runs. An unbounded UA string makes the
  // patterns below backtrack pathologically (a 20k-char UA took 30 seconds),
  // which is a denial-of-service vector -- anyone can set that header.
  const raw = rawFull.length > MAX_UA ? rawFull.slice(0, MAX_UA) : rawFull;
  const ua = raw.toLowerCase();
  const bot = /([a-z0-9_-]*)(bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|curl|wget|headless)/.exec(ua);
  const isBot = !!bot;
  const isTablet = /(ipad|tablet|playbook|silk|(android(?!.*mobile)))/.test(ua);
  const isMobile = !isTablet && /(mobile|iphone|ipod|android|blackberry|iemobile|opera mini|windows phone)/.test(ua);

  let browser: string | undefined;
  let browserVersion: string | undefined;
  const pick = (re: RegExp, name: string) => {
    const m = re.exec(raw);
    if (m && !browser) { browser = name; browserVersion = m[1]; }
  };
  pick(/Edg\/([\d.]+)/, "Edge");
  pick(/OPR\/([\d.]+)/, "Opera");
  pick(/Chrome\/([\d.]+)/, "Chrome");
  pick(/Firefox\/([\d.]+)/, "Firefox");
  pick(/Version\/([\d.]+).*Safari/, "Safari");
  pick(/MSIE ([\d.]+)/, "IE");

  let os: string | undefined;
  let osVersion: string | undefined;
  const osPick = (re: RegExp, name: string) => { const m = re.exec(raw); if (m && !os) { os = name; osVersion = m[1]; } };
  osPick(/Windows NT ([\d.]+)/, "Windows");
  osPick(/Mac OS X ([\d_.]+)/, "macOS");
  osPick(/Android ([\d.]+)/, "Android");
  osPick(/(?:iPhone|iPad); CPU OS ([\d_]+)/, "iOS");
  osPick(/Linux/, "Linux");

  const device = /iphone/.test(ua) ? "iPhone"
    : /ipad/.test(ua) ? "iPad"
    : /android/.test(ua) ? "Android"
    : /macintosh/.test(ua) ? "Mac"
    : /windows/.test(ua) ? "PC"
    : undefined;

  return {
    raw: rawFull, browser, browserVersion, os,
    osVersion: osVersion?.replace(/_/g, "."),
    device, isMobile, isTablet,
    isDesktop: !isMobile && !isTablet && !isBot,
    isBot, botName: (bot?.[1] || bot?.[2]) || undefined,
  };
}

// --- A8. request-time intent ------------------------------------------------

interface DynamicRecord { reason: string; at: number }
const dynamicRoutes: DynamicRecord[] = [];

/** Mark the current render as request-time (the escape hatch, like `connection()`). */
export async function connection(reason = "connection()"): Promise<void> {
  dynamicRoutes.push({ reason, at: Date.now() });
}

/** Named intent: this route is dynamic. */
export async function dynamic(reason = "dynamic()"): Promise<void> { await connection(reason); }
/**
 * Named intent: this route is static. A no-op marker kept for symmetry with
 * `dynamic()` -- it documents intent next to the code that would otherwise
 * make the route dynamic.
 *
 * Named `staticRoute` rather than `static` because `static` is a reserved
 * word: an `export { x as static }` alias does not survive every bundler's
 * namespace interop, so the import would silently be undefined.
 */
export function staticRoute(reason = "static()"): void { void reason; }

/** Why routes went dynamic this build -- read by the build profiler. */
export function dynamicReasons(): DynamicRecord[] { return [...dynamicRoutes]; }
export function clearDynamicReasons(): void { dynamicRoutes.length = 0; }
