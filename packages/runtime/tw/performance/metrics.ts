/**
 * Performance metrics -- Web Vitals, custom metrics, timing.
 * @module runtime/performance
 */

export interface Metric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta: number;
  entries: PerformanceEntry[];
  id: string;
}

export interface VitalThresholds {
  good: number;
  poor: number;
}

const LCP_THRESHOLDS: VitalThresholds = { good: 2500, poor: 4000 };
const FID_THRESHOLDS: VitalThresholds = { good: 100, poor: 300 };
const CLS_THRESHOLDS: VitalThresholds = { good: 0.1, poor: 0.25 };
const INP_THRESHOLDS: VitalThresholds = { good: 200, poor: 500 };
const TTFB_THRESHOLDS: VitalThresholds = { good: 800, poor: 1800 };
const FCP_THRESHOLDS: VitalThresholds = { good: 1800, poor: 3000 };

function getRating(value: number, thresholds: VitalThresholds): "good" | "needs-improvement" | "poor" {
  if (value <= thresholds.good) return "good";
  if (value <= thresholds.poor) return "needs-improvement";
  return "poor";
}

interface LayoutShift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

let clsValue = 0;
let clsEntries: LayoutShift[] = [];
let sessionValue = 0;
let sessionEntries: LayoutShift[] = [];

export function observeLCP(callback: (metric: Metric) => void): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1] as PerformanceEntry;
    const value = lastEntry.startTime;
    callback({
      name: "LCP",
      value,
      rating: getRating(value, LCP_THRESHOLDS),
      delta: value,
      entries,
      id: "v3-" + Date.now(),
    });
  });
  observer.observe({ type: "largest-contentful-paint", buffered: true });
  return () => observer.disconnect();
}

export function observeFID(callback: (metric: Metric) => void): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    for (const entry of entries) {
      const value = (entry as unknown as { processingStart: number; startTime: number }).processingStart - entry.startTime;
      callback({
        name: "FID",
        value,
        rating: getRating(value, FID_THRESHOLDS),
        delta: value,
        entries: [entry],
        id: "v3-" + Date.now(),
      });
    }
  });
  observer.observe({ type: "first-input", buffered: true });
  return () => observer.disconnect();
}

export function observeCLS(callback: (metric: Metric) => void): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries() as LayoutShift[];
    for (const entry of entries) {
      if (!entry.hadRecentInput) {
        const firstSessionEntry = sessionEntries[0];
        const lastSessionEntry = sessionEntries[sessionEntries.length - 1];
        if (firstSessionEntry && lastSessionEntry && entry.startTime - lastSessionEntry.startTime < 1000 && entry.startTime - firstSessionEntry.startTime < 5000) {
          sessionValue += entry.value;
        } else {
          sessionValue = entry.value;
          sessionEntries = [];
        }
        sessionEntries.push(entry);
        clsValue = sessionValue;
        callback({
          name: "CLS",
          value: clsValue * 1000,
          rating: getRating(clsValue, CLS_THRESHOLDS),
          delta: entry.value * 1000,
          entries: [entry],
          id: "v3-" + Date.now(),
        });
      }
    }
  });
  observer.observe({ type: "layout-shift", buffered: true });
  return () => observer.disconnect();
}

export function observeINP(callback: (metric: Metric) => void): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    let maxDuration = 0;
    for (const entry of entries) {
      const duration = (entry as unknown as { duration: number }).duration;
      if (duration > maxDuration) maxDuration = duration;
    }
    callback({
      name: "INP",
      value: maxDuration,
      rating: getRating(maxDuration, INP_THRESHOLDS),
      delta: maxDuration,
      entries,
      id: "v3-" + Date.now(),
    });
  });
  observer.observe({ type: "event", buffered: true });
  return () => observer.disconnect();
}

export function observeTTFB(callback: (metric: Metric) => void): () => void {
  if (typeof performance === "undefined") return () => {};
  const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navEntry) {
    const value = navEntry.responseStart - navEntry.requestStart;
    callback({
      name: "TTFB",
      value,
      rating: getRating(value, TTFB_THRESHOLDS),
      delta: value,
      entries: [navEntry],
      id: "v3-" + Date.now(),
    });
  }
  return () => {};
}

export function observeFCP(callback: (metric: Metric) => void): () => void {
  if (typeof PerformanceObserver === "undefined") return () => {};
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    for (const entry of entries) {
      callback({
        name: "FCP",
        value: entry.startTime,
        rating: getRating(entry.startTime, FCP_THRESHOLDS),
        delta: entry.startTime,
        entries: [entry],
        id: "v3-" + Date.now(),
      });
    }
  });
  observer.observe({ type: "paint", buffered: true });
  return () => observer.disconnect();
}

export function observeAllVitals(callback: (metric: Metric) => void): () => void {
  const cleanups = [
    observeLCP(callback),
    observeFID(callback),
    observeCLS(callback),
    observeINP(callback),
    observeTTFB(callback),
    observeFCP(callback),
  ];
  return () => cleanups.forEach((cleanup) => cleanup());
}

export class PerformanceTracker {
  private metrics: Map<string, Metric> = new Map();
  private observers: Array<() => void> = [];
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number> = new Map();

  start(): this {
    this.observers.push(observeAllVitals((metric) => {
      this.metrics.set(metric.name, metric);
    }));
    return this;
  }

  stop(): void {
    this.observers.forEach((cleanup) => cleanup());
    this.observers = [];
  }

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark: string): number {
    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);
    if (start === undefined || end === undefined) {
      throw new Error("Mark not found");
    }
    const duration = end - start;
    this.measures.set(name, duration);
    return duration;
  }

  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  getAllMetrics(): Metric[] {
    return [...this.metrics.values()];
  }

  getMeasure(name: string): number | undefined {
    return this.measures.get(name);
  }

  getAllMeasures(): Map<string, number> {
    return new Map(this.measures);
  }

  clear(): void {
    this.metrics.clear();
    this.marks.clear();
    this.measures.clear();
  }

  report(): Record<string, { value: number; rating: string }> {
    const result: Record<string, { value: number; rating: string }> = {};
    for (const [name, metric] of this.metrics) {
      result[name] = { value: metric.value, rating: metric.rating };
    }
    return result;
  }

  toJSON(): string {
    return JSON.stringify(this.report(), null, 2);
  }
}

export class ResourceTimer {
  private timings: Map<string, { start: number; end?: number; duration?: number }> = new Map();

  start(name: string): this {
    this.timings.set(name, { start: performance.now() });
    return this;
  }

  end(name: string): number {
    const timing = this.timings.get(name);
    if (!timing) throw new Error(`Timer "${name}" not found`);
    timing.end = performance.now();
    timing.duration = timing.end - timing.start;
    return timing.duration;
  }

  get(name: string): number | undefined {
    return this.timings.get(name)?.duration;
  }

  getAll(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [name, timing] of this.timings) {
      if (timing.duration !== undefined) {
        result.set(name, timing.duration);
      }
    }
    return result;
  }

  clear(): void {
    this.timings.clear();
  }
}

export class MemoryMonitor {
  private samples: Array<{ timestamp: number; used: number; total: number; limit: number }> = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private maxSamples: number;

  constructor(maxSamples: number = 100) {
    this.maxSamples = maxSamples;
  }

  start(intervalMs: number = 5000): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.sample(), intervalMs);
    this.sample();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  sample(): void {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    if (!mem) return;
    this.samples.push({
      timestamp: Date.now(),
      used: mem.usedJSHeapSize,
      total: mem.totalJSHeapSize,
      limit: mem.jsHeapSizeLimit,
    });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  getSamples(): Array<{ timestamp: number; used: number; total: number; limit: number }> {
    return [...this.samples];
  }

  getAverageUsage(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, s) => sum + s.used, 0) / this.samples.length;
  }

  getPeakUsage(): number {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples.map((s) => s.used));
  }

  getCurrentUsage(): number {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return mem?.usedJSHeapSize ?? 0;
  }

  getUsagePercentage(): number {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    if (!mem) return 0;
    return (mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  clear(): void {
    this.samples = [];
  }
}

export class NetworkMonitor {
  private requests: Array<{ url: string; method: string; status: number; duration: number; size: number; timestamp: number }> = [];
  private maxEntries: number;

  constructor(maxEntries: number = 500) {
    this.maxEntries = maxEntries;
  }

  recordRequest(url: string, method: string, status: number, duration: number, size: number): void {
    this.requests.push({ url, method, status, duration, size, timestamp: Date.now() });
    if (this.requests.length > this.maxEntries) {
      this.requests.shift();
    }
  }

  getRequests(): Array<{ url: string; method: string; status: number; duration: number; size: number; timestamp: number }> {
    return [...this.requests];
  }

  getRequestsByUrl(url: string): Array<{ url: string; method: string; status: number; duration: number; size: number; timestamp: number }> {
    return this.requests.filter((r) => r.url === url);
  }

  getRequestsByStatus(status: number): Array<{ url: string; method: string; status: number; duration: number; size: number; timestamp: number }> {
    return this.requests.filter((r) => r.status === status);
  }

  getAverageResponseTime(): number {
    if (this.requests.length === 0) return 0;
    return this.requests.reduce((sum, r) => sum + r.duration, 0) / this.requests.length;
  }

  getTotalDataTransferred(): number {
    return this.requests.reduce((sum, r) => sum + r.size, 0);
  }

  getErrorCount(): number {
    return this.requests.filter((r) => r.status >= 400).length;
  }

  getErrorRate(): number {
    if (this.requests.length === 0) return 0;
    return (this.getErrorCount() / this.requests.length) * 100;
  }

  getSlowestRequests(count: number = 10): Array<{ url: string; method: string; status: number; duration: number; size: number; timestamp: number }> {
    return [...this.requests].sort((a, b) => b.duration - a.duration).slice(0, count);
  }

  getStats(): {
    totalRequests: number;
    averageResponseTime: number;
    totalDataTransferred: number;
    errorCount: number;
    errorRate: number;
    uniqueUrls: number;
  } {
    return {
      totalRequests: this.requests.length,
      averageResponseTime: this.getAverageResponseTime(),
      totalDataTransferred: this.getTotalDataTransferred(),
      errorCount: this.getErrorCount(),
      errorRate: this.getErrorRate(),
      uniqueUrls: new Set(this.requests.map((r) => r.url)).size,
    };
  }

  clear(): void {
    this.requests = [];
  }
}

export class FrameMonitor {
  private frames: number = 0;
  private lastTime: number = 0;
  private fps: number = 0;
  private rafId: number | null = null;
  private isRunning: boolean = false;
  private drops: number = 0;
  private callback?: (fps: number) => void;

  constructor(callback?: (fps: number) => void) {
    this.callback = callback;
  }

  start(): this {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.frames = 0;
    this.lastTime = performance.now();
    this.tick();
    return this;
  }

  private tick = (): void => {
    if (!this.isRunning) return;
    this.frames++;
    const now = performance.now();
    const delta = now - this.lastTime;
    if (delta >= 1000) {
      this.fps = Math.round((this.frames * 1000) / delta);
      if (this.fps < 50) this.drops++;
      this.callback?.(this.fps);
      this.frames = 0;
      this.lastTime = now;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  getFPS(): number {
    return this.fps;
  }

  getDroppedFrames(): number {
    return this.drops;
  }

  isLowFPS(): boolean {
    return this.fps > 0 && this.fps < 50;
  }
}

export class LongTaskMonitor {
  private longTasks: PerformanceEntry[] = [];
  private observer: PerformanceObserver | null = null;
  private threshold: number;
  private callback?: (task: PerformanceEntry) => void;

  constructor(threshold: number = 50, callback?: (task: PerformanceEntry) => void) {
    this.threshold = threshold;
    this.callback = callback;
  }

  start(): this {
    if (typeof PerformanceObserver === "undefined") return this;
    this.observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        this.longTasks.push(entry);
        this.callback?.(entry);
      }
    });
    this.observer.observe({ type: "longtask", buffered: true });
    return this;
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  getLongTasks(): PerformanceEntry[] {
    return [...this.longTasks];
  }

  getLongTaskCount(): number {
    return this.longTasks.length;
  }

  getTotalLongTaskTime(): number {
    return this.longTasks.reduce((sum, task) => sum + task.duration, 0);
  }

  getAverageLongTaskDuration(): number {
    if (this.longTasks.length === 0) return 0;
    return this.getTotalLongTaskTime() / this.longTasks.length;
  }

  getLongestTask(): PerformanceEntry | undefined {
    return this.longTasks.sort((a, b) => b.duration - a.duration)[0];
  }

  clear(): void {
    this.longTasks = [];
  }
}

export class ResourceMonitor {
  private resources: PerformanceResourceTiming[] = [];
  private observer: PerformanceObserver | null = null;
  private callback?: (resource: PerformanceResourceTiming) => void;

  constructor(callback?: (resource: PerformanceResourceTiming) => void) {
    this.callback = callback;
  }

  start(): this {
    if (typeof PerformanceObserver === "undefined") return this;
    this.observer = new PerformanceObserver((list) => {
      const entries = list.getEntries() as PerformanceResourceTiming[];
      for (const entry of entries) {
        this.resources.push(entry);
        this.callback?.(entry);
      }
    });
    this.observer.observe({ type: "resource", buffered: true });
    return this;
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  getResources(): PerformanceResourceTiming[] {
    return [...this.resources];
  }

  getResourcesByType(type: "script" | "style" | "image" | "font" | "xhr" | "fetch" | "document"): PerformanceResourceTiming[] {
    const typeMap: Record<string, string[]> = {
      script: ["javascript", "script"],
      style: ["css"],
      image: ["png", "jpg", "jpeg", "gif", "svg", "webp", "avif"],
      font: ["woff", "woff2", "ttf", "eot", "otf"],
      xhr: ["xmlhttprequest"],
      fetch: ["fetch"],
      document: ["html"],
    };
    return this.resources.filter((r) => {
      const url = r.name;
      const ext = url.split(".").pop()?.toLowerCase() ?? "";
      return typeMap[type]?.some((t) => ext.includes(t) || r.initiatorType.includes(t));
    });
  }

  getTotalResourceSize(): number {
    return this.resources.reduce((sum, r) => sum + (r.transferSize ?? 0), 0);
  }

  getTotalResourceTime(): number {
    return this.resources.reduce((sum, r) => sum + (r.duration ?? 0), 0);
  }

  getResourceCount(): number {
    return this.resources.length;
  }

  getSlowestResources(count: number = 10): PerformanceResourceTiming[] {
    return [...this.resources].sort((a, b) => b.duration - a.duration).slice(0, count);
  }

  getLargestResources(count: number = 10): PerformanceResourceTiming[] {
    return [...this.resources].sort((a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0)).slice(0, count);
  }

  clear(): void {
    this.resources = [];
  }
}

export interface BudgetThreshold {
  metric: string;
  budget: number;
  actual: number;
  exceeded: boolean;
  percentage: number;
}

export class PerformanceBudget {
  private budgets: Map<string, number> = new Map();
  private actuals: Map<string, number> = new Map();

  setBudget(metric: string, value: number): this {
    this.budgets.set(metric, value);
    return this;
  }

  setActual(metric: string, value: number): this {
    this.actuals.set(metric, value);
    return this;
  }

  check(): BudgetThreshold[] {
    const results: BudgetThreshold[] = [];
    for (const [metric, budget] of this.budgets) {
      const actual = this.actuals.get(metric) ?? 0;
      results.push({
        metric,
        budget,
        actual,
        exceeded: actual > budget,
        percentage: budget > 0 ? (actual / budget) * 100 : 0,
      });
    }
    return results;
  }

  getExceeded(): BudgetThreshold[] {
    return this.check().filter((b) => b.exceeded);
  }

  isWithinBudget(): boolean {
    return this.getExceeded().length === 0;
  }

  clear(): void {
    this.budgets.clear();
    this.actuals.clear();
  }
}

export function measureAsync<T>(fn: () => Promise<T>, label?: string): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  return fn().then((result) => ({
    result,
    duration: performance.now() - start,
  })).catch((error) => {
    throw { error, duration: performance.now() - start };
  });
}

export function measureSync<T>(fn: () => T, label?: string): { result: T; duration: number } {
  const start = performance.now();
  const result = fn();
  return { result, duration: performance.now() - start };
}

export function debounceMeasure(fn: () => void, wait: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const start = performance.now();
      fn();
      const duration = performance.now() - start;
      if (duration > 16) {
        console.warn(`[Performance] "${fn.name || "anonymous"}" took ${duration.toFixed(2)}ms`);
      }
    }, wait);
  };
}

export function createPerformanceReporter(endpoint: string): (metrics: Metric[]) => Promise<void> {
  return async (metrics: Metric[]) => {
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics, timestamp: Date.now(), url: location.href, userAgent: navigator.userAgent }),
      });
    } catch {
      // Silently fail
    }
  };
}

export function getNavigationTiming(): PerformanceNavigationTiming | undefined {
  if (typeof performance === "undefined") return undefined;
  return performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
}

export function getTimeToInteractive(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.domInteractive - nav.startTime;
}

export function getDOMContentLoadTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.domContentLoadedEventEnd - nav.startTime;
}

export function getLoadTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.loadEventEnd - nav.startTime;
}

export function getDNSLookupTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.domainLookupEnd - nav.domainLookupStart;
}

export function getTCPConnectTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.connectEnd - nav.connectStart;
}

export function getTLSNegotiationTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.connectEnd - nav.secureConnectionStart;
}

export function getRequestTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.responseStart - nav.requestStart;
}

export function getResponseTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.responseEnd - nav.responseStart;
}

export function getDOMParsingTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.domInteractive - nav.responseEnd;
}

export function getResourceLoadTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.loadEventStart - nav.domInteractive;
}

export function getUnloadTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.unloadEventEnd - nav.unloadEventStart;
}

export function getRedirectTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.redirectEnd - nav.redirectStart;
}

export function getServerResponseTime(): number | undefined {
  const nav = getNavigationTiming();
  if (!nav) return undefined;
  return nav.responseStart - nav.requestStart;
}

export function getAllTimings(): Record<string, number> {
  const nav = getNavigationTiming();
  if (!nav) return {};
  return {
    dnsLookup: getDNSLookupTime() ?? 0,
    tcpConnect: getTCPConnectTime() ?? 0,
    tlsNegotiation: getTLSNegotiationTime() ?? 0,
    request: getRequestTime() ?? 0,
    response: getResponseTime() ?? 0,
    domParsing: getDOMParsingTime() ?? 0,
    resourceLoad: getResourceLoadTime() ?? 0,
    unload: getUnloadTime() ?? 0,
    redirect: getRedirectTime() ?? 0,
    serverResponse: getServerResponseTime() ?? 0,
    timeToInteractive: getTimeToInteractive() ?? 0,
    domContentLoad: getDOMContentLoadTime() ?? 0,
    loadComplete: getLoadTime() ?? 0,
  };
}

export function formatTimingReport(): string {
  const timings = getAllTimings();
  const lines: string[] = ["=== Performance Timing Report ==="];
  for (const [name, value] of Object.entries(timings)) {
    lines.push(`  ${name}: ${value.toFixed(2)}ms`);
  }
  return lines.join("\n");
}

export function markAndMeasure(name: string, fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

export async function markAndMeasureAsync<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  return measureAsync(fn, name);
}

export class UserTiming {
  private marks: Map<string, number> = new Map();
  private measures: Map<string, { duration: number; startMark: string; endMark: string }> = new Map();

  mark(name: string): this {
    this.marks.set(name, performance.now());
    if (typeof performance !== "undefined" && performance.mark) {
      performance.mark(name);
    }
    return this;
  }

  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : performance.now();
    if (start === undefined) throw new Error(`Mark "${startMark}" not found`);
    if (end === undefined) throw new Error(`Mark "${endMark}" not found`);
    const duration = end - start;
    this.measures.set(name, { duration, startMark, endMark: endMark ?? "now" });
    if (typeof performance !== "undefined" && performance.measure) {
      performance.measure(name, startMark, endMark);
    }
    return duration;
  }

  getMark(name: string): number | undefined {
    return this.marks.get(name);
  }

  getMeasure(name: string): number | undefined {
    return this.measures.get(name)?.duration;
  }

  getAllMeasures(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [name, measure] of this.measures) {
      result.set(name, measure.duration);
    }
    return result;
  }

  clearMarks(): void {
    this.marks.clear();
    if (typeof performance !== "undefined" && performance.clearMarks) {
      performance.clearMarks();
    }
  }

  clearMeasures(): void {
    this.measures.clear();
    if (typeof performance !== "undefined" && performance.clearMeasures) {
      performance.clearMeasures();
    }
  }

  clear(): void {
    this.clearMarks();
    this.clearMeasures();
  }
}

export class PerformanceObserverManager {
  private observers: Map<string, PerformanceObserver> = new Map();

  observe(name: string, type: string, callback: (entries: PerformanceEntry[]) => void, buffered: boolean = true): this {
    if (typeof PerformanceObserver === "undefined") return this;
    const observer = new PerformanceObserver((list) => {
      callback(list.getEntries());
    });
    observer.observe({ type, buffered });
    this.observers.set(name, observer);
    return this;
  }

  disconnect(name: string): void {
    const observer = this.observers.get(name);
    if (observer) {
      observer.disconnect();
      this.observers.delete(name);
    }
  }

  disconnectAll(): void {
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();
  }

  getObserver(name: string): PerformanceObserver | undefined {
    return this.observers.get(name);
  }

  getObserverNames(): string[] {
    return [...this.observers.keys()];
  }
}
