/**
 * Accessibility utilities -- ARIA management, focus management, screen reader.
 * @module runtime/utils
 */

export interface AriaLiveRegion {
  element: HTMLElement;
  assertive: boolean;
}

export class AccessibilityManager {
  private liveRegions: Map<string, AriaLiveRegion> = new Map();
  private focusStack: HTMLElement[] = [];
  private announcements: string[] = [];
  private maxAnnouncements: number = 50;
  private screenReaderEnabled: boolean = false;

  announce(message: string, assertive: boolean = false): void {
    const region = this.getOrCreateLiveRegion(assertive);
    region.textContent = "";
    requestAnimationFrame(() => {
      region.textContent = message;
    });
    this.announcements.push(message);
    if (this.announcements.length > this.maxAnnouncements) {
      this.announcements.shift();
    }
  }

  private getOrCreateLiveRegion(assertive: boolean): HTMLElement {
    const key = assertive ? "assertive" : "polite";
    let region = this.liveRegions.get(key);
    if (!region) {
      const element = document.createElement("div");
      element.setAttribute("aria-live", assertive ? "assertive" : "polite");
      element.setAttribute("aria-atomic", "true");
      element.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
      document.body.appendChild(element);
      region = { element, assertive };
      this.liveRegions.set(key, region);
    }
    return region.element;
  }

  pushFocus(element: HTMLElement): void {
    this.focusStack.push(document.activeElement as HTMLElement);
    element.focus();
  }

  popFocus(): void {
    const previous = this.focusStack.pop();
    if (previous) {
      previous.focus();
    }
  }

  getFocusStack(): HTMLElement[] {
    return [...this.focusStack];
  }

  clearFocusStack(): void {
    this.focusStack = [];
  }

  trapFocus(container: HTMLElement): () => void {
    const focusableElements = this.getFocusableElements(container);
    if (focusableElements.length === 0) return () => {};
    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    container.addEventListener("keydown", handler);
    first.focus();
    return () => {
      container.removeEventListener("keydown", handler);
    };
  }

  getFocusableElements(container: HTMLElement = document.body): HTMLElement[] {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return [...container.querySelectorAll(selector)].filter((el) => {
      const style = window.getComputedStyle(el as HTMLElement);
      return style.display !== "none" && style.visibility !== "hidden" && (el as HTMLElement).offsetWidth > 0;
    }) as HTMLElement[];
  }

  setAriaLabel(element: HTMLElement, label: string): void {
    element.setAttribute("aria-label", label);
  }

  getAriaLabel(element: HTMLElement): string | null {
    return element.getAttribute("aria-label");
  }

  setAriaDescribedBy(element: HTMLElement, id: string): void {
    element.setAttribute("aria-describedby", id);
  }

  getAriaDescribedBy(element: HTMLElement): string | null {
    return element.getAttribute("aria-describedby");
  }

  setAriaLabelledBy(element: HTMLElement, id: string): void {
    element.setAttribute("aria-labelledby", id);
  }

  getAriaLabelledBy(element: HTMLElement): string | null {
    return element.getAttribute("aria-labelledby");
  }

  setAriaHidden(element: HTMLElement, hidden: boolean): void {
    element.setAttribute("aria-hidden", String(hidden));
  }

  isAriaHidden(element: HTMLElement): boolean {
    return element.getAttribute("aria-hidden") === "true";
  }

  setAriaExpanded(element: HTMLElement, expanded: boolean): void {
    element.setAttribute("aria-expanded", String(expanded));
  }

  getAriaExpanded(element: HTMLElement): boolean | null {
    const value = element.getAttribute("aria-expanded");
    return value === null ? null : value === "true";
  }

  setAriaSelected(element: HTMLElement, selected: boolean): void {
    element.setAttribute("aria-selected", String(selected));
  }

  getAriaSelected(element: HTMLElement): boolean | null {
    const value = element.getAttribute("aria-selected");
    return value === null ? null : value === "true";
  }

  setAriaChecked(element: HTMLElement, checked: boolean): void {
    element.setAttribute("aria-checked", String(checked));
  }

  getAriaChecked(element: HTMLElement): boolean | null {
    const value = element.getAttribute("aria-checked");
    return value === null ? null : value === "true";
  }

  setAriaDisabled(element: HTMLElement, disabled: boolean): void {
    element.setAttribute("aria-disabled", String(disabled));
  }

  getAriaDisabled(element: HTMLElement): boolean | null {
    const value = element.getAttribute("aria-disabled");
    return value === null ? null : value === "true";
  }

  setAriaPressed(element: HTMLElement, pressed: boolean): void {
    element.setAttribute("aria-pressed", String(pressed));
  }

  getAriaPressed(element: HTMLElement): boolean | null {
    const value = element.getAttribute("aria-pressed");
    return value === null ? null : value === "true";
  }

  setAriaBusy(element: HTMLElement, busy: boolean): void {
    element.setAttribute("aria-busy", String(busy));
  }

  getAriaBusy(element: HTMLElement): boolean | null {
    const value = element.getAttribute("aria-busy");
    return value === null ? null : value === "true";
  }

  setAriaLive(element: HTMLElement, mode: "off" | "polite" | "assertive"): void {
    element.setAttribute("aria-live", mode);
  }

  getAriaLive(element: HTMLElement): string | null {
    return element.getAttribute("aria-live");
  }

  setAriaRelevant(element: HTMLElement, relevant: string): void {
    element.setAttribute("aria-relevant", relevant);
  }

  getAriaRelevant(element: HTMLElement): string | null {
    return element.getAttribute("aria-relevant");
  }

  setAriaAtomic(element: HTMLElement, atomic: boolean): void {
    element.setAttribute("aria-atomic", String(atomic));
  }

  getAriaAtomic(element: HTMLElement): boolean | null {
    const value = element.getAttribute("aria-atomic");
    return value === null ? null : value === "true";
  }

  setAriaCurrent(element: HTMLElement, current: "page" | "step" | "location" | "date" | "time" | "true" | "false"): void {
    element.setAttribute("aria-current", current);
  }

  getAriaCurrent(element: HTMLElement): string | null {
    return element.getAttribute("aria-current");
  }

  setAriaControls(element: HTMLElement, id: string): void {
    element.setAttribute("aria-controls", id);
  }

  getAriaControls(element: HTMLElement): string | null {
    return element.getAttribute("aria-controls");
  }

  setAriaOwns(element: HTMLElement, id: string): void {
    element.setAttribute("aria-owns", id);
  }

  getAriaOwns(element: HTMLElement): string | null {
    return element.getAttribute("aria-owns");
  }

  setAriaFlowTo(element: HTMLElement, id: string): void {
    element.setAttribute("aria-flowto", id);
  }

  getAriaFlowTo(element: HTMLElement): string | null {
    return element.getAttribute("aria-flowto");
  }

  setRole(element: HTMLElement, role: string): void {
    element.setAttribute("role", role);
  }

  getRole(element: HTMLElement): string | null {
    return element.getAttribute("role");
  }

  removeRole(element: HTMLElement): void {
    element.removeAttribute("role");
  }

  hasRole(element: HTMLElement, role: string): boolean {
    return element.getAttribute("role") === role;
  }

  setTabIndex(element: HTMLElement, index: number): void {
    element.tabIndex = index;
  }

  getTabIndex(element: HTMLElement): number {
    return element.tabIndex;
  }

  makeFocusable(element: HTMLElement): void {
    if (!this.isFocusable(element)) {
      element.setAttribute("tabindex", "0");
    }
  }

  makeUnfocusable(element: HTMLElement): void {
    element.setAttribute("tabindex", "-1");
  }

  isFocusable(element: HTMLElement): boolean {
    if (element.hasAttribute("disabled")) return false;
    if (element.hasAttribute("tabindex") && element.getAttribute("tabindex") === "-1") return false;
    const focusableTags = ["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "AREA"];
    if (focusableTags.includes(element.tagName)) return true;
    if (element.hasAttribute("tabindex")) return true;
    return false;
  }

  isTabbable(element: HTMLElement): boolean {
    return this.isFocusable(element) && element.getAttribute("tabindex") !== "-1";
  }

  getAnnouncements(): string[] {
    return [...this.announcements];
  }

  clearAnnouncements(): void {
    this.announcements = [];
  }

  setScreenReaderEnabled(enabled: boolean): void {
    this.screenReaderEnabled = enabled;
  }

  isScreenReaderEnabled(): boolean {
    return this.screenReaderEnabled;
  }

  detectScreenReader(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  prefersReducedMotion(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }

  prefersColorScheme(): "light" | "dark" {
    if (typeof window === "undefined") return "light";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  prefersContrast(): "more" | "less" | "no-preference" {
    if (typeof window === "undefined") return "no-preference";
    if (window.matchMedia?.("(prefers-contrast: more)").matches) return "more";
    if (window.matchMedia?.("(prefers-contrast: less)").matches) return "less";
    return "no-preference";
  }

  destroy(): void {
    for (const region of this.liveRegions.values()) {
      region.element.remove();
    }
    this.liveRegions.clear();
    this.focusStack = [];
    this.announcements = [];
  }

  toJSON(): string {
    return JSON.stringify({
      announcements: this.announcements.length,
      focusStack: this.focusStack.length,
      liveRegions: this.liveRegions.size,
      screenReaderEnabled: this.screenReaderEnabled,
    }, null, 2);
  }
}

export function createAccessibilityManager(): AccessibilityManager {
  return new AccessibilityManager();
}

export class PerformanceMonitor {
  private metrics: Map<string, { name: string; value: number; unit: string; timestamp: number }> = new Map();
  private marks: Map<string, number> = new Map();
  private measures: Map<string, { name: string; duration: number; startTime: number; endTime: number }> = new Map();
  private observers: PerformanceObserver[] = [];
  private isMonitoring: boolean = false;
  private samples: Array<{ timestamp: number; memory: number; fps: number; cpu: number }> = [];
  private maxSamples: number = 1000;
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private fps: number = 0;
  private fpsTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    this.startFPSMonitoring();
    this.startResourceMonitoring();
  }

  stop(): void {
    this.isMonitoring = false;
    if (this.fpsTimer) {
      clearInterval(this.fpsTimer);
      this.fpsTimer = null;
    }
    for (const observer of this.observers) {
      observer.disconnect();
    }
    this.observers = [];
  }

  isMonitoringCheck(): boolean {
    return this.isMonitoring;
  }

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : performance.now();
    if (!start || !end) return 0;
    const duration = end - start;
    this.measures.set(name, { name, duration, startTime: start, endTime: end });
    return duration;
  }

  getMark(name: string): number | undefined {
    return this.marks.get(name);
  }

  getMeasure(name: string): { name: string; duration: number; startTime: number; endTime: number } | undefined {
    return this.measures.get(name);
  }

  getAllMeasures(): Array<{ name: string; duration: number; startTime: number; endTime: number }> {
    return [...this.measures.values()];
  }

  clearMarks(): void {
    this.marks.clear();
  }

  clearMeasures(): void {
    this.measures.clear();
  }

  recordMetric(name: string, value: number, unit: string = "ms"): void {
    this.metrics.set(name, { name, value, unit, timestamp: Date.now() });
  }

  getMetric(name: string): { name: string; value: number; unit: string; timestamp: number } | undefined {
    return this.metrics.get(name);
  }

  getAllMetrics(): Array<{ name: string; value: number; unit: string; timestamp: number }> {
    return [...this.metrics.values()];
  }

  clearMetrics(): void {
    this.metrics.clear();
  }

  getMemoryUsage(): { used: number; total: number; limit: number } | null {
    if (typeof performance !== "undefined" && (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory) {
      const memory = (performance as Performance & { memory: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
      };
    }
    return null;
  }

  getFPS(): number {
    return this.fps;
  }

  private startFPSMonitoring(): void {
    this.lastFrameTime = performance.now();
    this.fpsTimer = setInterval(() => {
      this.fps = this.frameCount;
      this.frameCount = 0;
      const memory = this.getMemoryUsage();
      this.samples.push({
        timestamp: Date.now(),
        memory: memory?.used ?? 0,
        fps: this.fps,
        cpu: 0,
      });
      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }
    }, 1000);
    const countFrame = () => {
      if (!this.isMonitoring) return;
      this.frameCount++;
      requestAnimationFrame(countFrame);
    };
    requestAnimationFrame(countFrame);
  }

  private startResourceMonitoring(): void {
    if (typeof PerformanceObserver !== "undefined") {
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric(`resource:${entry.name}`, entry.duration, "ms");
          }
        });
        resourceObserver.observe({ entryTypes: ["resource"] });
        this.observers.push(resourceObserver);
      } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
      try {
        const paintObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric(`paint:${entry.name}`, entry.startTime, "ms");
          }
        });
        paintObserver.observe({ entryTypes: ["paint"] });
        this.observers.push(paintObserver);
      } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
      try {
        const navObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric(`navigation:${entry.name}`, entry.duration, "ms");
          }
        });
        navObserver.observe({ entryTypes: ["navigation"] });
        this.observers.push(navObserver);
      } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.recordMetric("longTask", entry.duration, "ms");
          }
        });
        longTaskObserver.observe({ entryTypes: ["longtask"] });
        this.observers.push(longTaskObserver);
      } catch (e) {
   console.warn("[TW] Silent catch:", e);
 }
    }
  }

  getSamples(): Array<{ timestamp: number; memory: number; fps: number; cpu: number }> {
    return [...this.samples];
  }

  clearSamples(): void {
    this.samples = [];
  }

  getAverageFPS(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, s) => sum + s.fps, 0) / this.samples.length;
  }

  getAverageMemory(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, s) => sum + s.memory, 0) / this.samples.length;
  }

  getMinFPS(): number {
    if (this.samples.length === 0) return 0;
    return Math.min(...this.samples.map((s) => s.fps));
  }

  getMaxFPS(): number {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples.map((s) => s.fps));
  }

  getMaxMemory(): number {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples.map((s) => s.memory));
  }

  getStats(): { fps: number; averageFPS: number; minFPS: number; maxFPS: number; memory: number; averageMemory: number; maxMemory: number; sampleCount: number; metricCount: number; measureCount: number } {
    return {
      fps: this.fps,
      averageFPS: this.getAverageFPS(),
      minFPS: this.getMinFPS(),
      maxFPS: this.getMaxFPS(),
      memory: this.getMemoryUsage()?.used ?? 0,
      averageMemory: this.getAverageMemory(),
      maxMemory: this.getMaxMemory(),
      sampleCount: this.samples.length,
      metricCount: this.metrics.size,
      measureCount: this.measures.size,
    };
  }

  clear(): void {
    this.clearMarks();
    this.clearMeasures();
    this.clearMetrics();
    this.clearSamples();
  }

  destroy(): void {
    this.stop();
    this.clear();
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createPerformanceMonitor(): PerformanceMonitor {
  return new PerformanceMonitor();
}

export class MemoryProfiler {
  private snapshots: Array<{ timestamp: number; used: number; total: number; limit: number; label: string }> = [];
  private maxSnapshots: number = 100;
  private interval: ReturnType<typeof setInterval> | null = null;
  private isProfiling: boolean = false;

  start(intervalMs: number = 5000): void {
    if (this.isProfiling) return;
    this.isProfiling = true;
    this.takeSnapshot("auto");
    this.interval = setInterval(() => this.takeSnapshot("auto"), intervalMs);
  }

  stop(): void {
    this.isProfiling = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  isProfilingCheck(): boolean {
    return this.isProfiling;
  }

  takeSnapshot(label: string = "manual"): { timestamp: number; used: number; total: number; limit: number; label: string } | null {
    if (typeof performance === "undefined") return null;
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    if (!memory) return null;
    const snapshot = {
      timestamp: Date.now(),
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      limit: memory.jsHeapSizeLimit,
      label,
    };
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
    return snapshot;
  }

  getSnapshots(): Array<{ timestamp: number; used: number; total: number; limit: number; label: string }> {
    return [...this.snapshots];
  }

  getLatestSnapshot(): { timestamp: number; used: number; total: number; limit: number; label: string } | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  getPeakMemory(): number {
    if (this.snapshots.length === 0) return 0;
    return Math.max(...this.snapshots.map((s) => s.used));
  }

  getAverageMemory(): number {
    if (this.snapshots.length === 0) return 0;
    return this.snapshots.reduce((sum, s) => sum + s.used, 0) / this.snapshots.length;
  }

  getMinMemory(): number {
    if (this.snapshots.length === 0) return 0;
    return Math.min(...this.snapshots.map((s) => s.used));
  }

  getMemoryTrend(): "increasing" | "decreasing" | "stable" {
    if (this.snapshots.length < 2) return "stable";
    const recent = this.snapshots.slice(-5);
    const first = recent[0].used;
    const last = recent[recent.length - 1].used;
    const diff = last - first;
    const threshold = first * 0.05;
    if (diff > threshold) return "increasing";
    if (diff < -threshold) return "decreasing";
    return "stable";
  }

  getMemoryLeakSuspects(): string[] {
    const suspects: string[] = [];
    if (this.snapshots.length < 10) return suspects;
    const trend = this.getMemoryTrend();
    if (trend === "increasing") {
      const recent = this.snapshots.slice(-10);
      const firstAvg = recent.slice(0, 5).reduce((sum, s) => sum + s.used, 0) / 5;
      const lastAvg = recent.slice(5).reduce((sum, s) => sum + s.used, 0) / 5;
      if (lastAvg > firstAvg * 1.2) {
        suspects.push("Consistent memory growth detected");
      }
    }
    return suspects;
  }

  clearSnapshots(): void {
    this.snapshots = [];
  }

  setMaxSnapshots(max: number): void {
    this.maxSnapshots = max;
    while (this.snapshots.length > max) {
      this.snapshots.shift();
    }
  }

  getMaxSnapshots(): number {
    return this.maxSnapshots;
  }

  getSnapshotCount(): number {
    return this.snapshots.length;
  }

  getStats(): { peakMemory: number; averageMemory: number; minMemory: number; trend: string; snapshotCount: number; leakSuspects: string[] } {
    return {
      peakMemory: this.getPeakMemory(),
      averageMemory: this.getAverageMemory(),
      minMemory: this.getMinMemory(),
      trend: this.getMemoryTrend(),
      snapshotCount: this.snapshots.length,
      leakSuspects: this.getMemoryLeakSuspects(),
    };
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }

  destroy(): void {
    this.stop();
    this.clearSnapshots();
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createMemoryProfiler(): MemoryProfiler {
  return new MemoryProfiler();
}
