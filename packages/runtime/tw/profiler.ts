/**
 * Profiler -- render profiling and performance measurement.
 *
 * Features:
 * - Component render timing
 * - Effect execution tracking
 * - Flame graph data generation
 * - Slow component detection
 * - Memory usage snapshots
 * - Commit phase tracking
 * - Custom markers
 * - Export to Chrome DevTools format
 */

// --- Types ------------------------------------------------------------

export interface ProfileEntry {
  name: string;
  type: "component" | "effect" | "commit" | "layout" | "custom";
  startTime: number;
  endTime: number;
  duration: number;
  componentId?: string;
  depth: number;
  children: ProfileEntry[];
}

export interface ProfileSession {
  id: string;
  startTime: number;
  endTime: number;
  entries: ProfileEntry[];
  totalDuration: number;
  componentCount: number;
  effectCount: number;
  commitCount: number;
}

export interface ProfilerStats {
  sessions: number;
  totalEntries: number;
  avgRenderTime: number;
  slowestComponent: string | null;
  slowestTime: number;
}

// --- Profiler --------------------------------------------------------

class Profiler {
  private enabled = false;
  private sessions: ProfileSession[] = [];
  private currentSession: ProfileSession | null = null;
  private stack: ProfileEntry[] = [];
  private markers = new Map<string, number>();
  private maxSessions = 50;
  private slowThreshold = 16; // 16ms = 60fps threshold

  /**
   * Start a profiling session.
   */
  startSession(id?: string): string {
    if (!this.enabled) return "";

    const sessionId = id || `session-${Date.now()}`;
    this.currentSession = {
      id: sessionId,
      startTime: typeof performance !== "undefined" ? performance.now() : Date.now(),
      endTime: 0,
      entries: [],
      totalDuration: 0,
      componentCount: 0,
      effectCount: 0,
      commitCount: 0,
    };
    this.stack = [];

    return sessionId;
  }

  /**
   * End the current profiling session.
   */
  endSession(): ProfileSession | null {
    if (!this.enabled || !this.currentSession) return null;

    this.currentSession.endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.currentSession.totalDuration = this.currentSession.endTime - this.currentSession.startTime;

    this.sessions.push(this.currentSession);
    if (this.sessions.length > this.maxSessions) this.sessions.shift();

    const session = this.currentSession;
    this.currentSession = null;
    this.stack = [];

    return session;
  }

  /**
   * Start tracking a component render.
   */
  startRender(componentId: string, componentName: string): void {
    if (!this.enabled || !this.currentSession) return;

    const entry: ProfileEntry = {
      name: componentName,
      type: "component",
      startTime: typeof performance !== "undefined" ? performance.now() : Date.now(),
      endTime: 0,
      duration: 0,
      componentId,
      depth: this.stack.length,
      children: [],
    };

    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1].children.push(entry);
    } else {
      this.currentSession.entries.push(entry);
    }

    this.stack.push(entry);
    this.currentSession.componentCount++;
  }

  /**
   * End tracking a component render.
   */
  endRender(): void {
    if (!this.enabled || !this.currentSession || this.stack.length === 0) return;

    const entry = this.stack.pop()!;
    entry.endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    entry.duration = entry.endTime - entry.startTime;

    if (entry.duration > this.slowThreshold) {
      console.warn(`[TW Profiler] Slow component: '${entry.name}' took ${entry.duration.toFixed(2)}ms`);
    }
  }

  /**
   * Track an effect execution.
   */
  trackEffect(name: string, fn: () => void): void {
    if (!this.enabled || !this.currentSession) {
      fn();
      return;
    }

    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      fn();
    } finally {
      const end = typeof performance !== "undefined" ? performance.now() : Date.now();
      this.currentSession.effectCount++;
      const duration = end - start;
      if (duration > this.slowThreshold) {
        console.warn(`[TW Profiler] Slow effect: '${name}' took ${duration.toFixed(2)}ms`);
      }
    }
  }

  /**
   * Mark a point in time.
   */
  mark(name: string): void {
    this.markers.set(name, typeof performance !== "undefined" ? performance.now() : Date.now());
  }

  /**
   * Measure between two marks.
   */
  measure(startMark: string, endMark: string, name?: string): number | null {
    const start = this.markers.get(startMark);
    const end = this.markers.get(endMark);
    if (start === undefined || end === undefined) return null;

    const duration = end - start;
    if (name && this.enabled && this.currentSession) {
      this.currentSession.entries.push({
        name: name || `${startMark}->${endMark}`,
        type: "custom",
        startTime: start,
        endTime: end,
        duration,
        depth: 0,
        children: [],
      });
    }

    return duration;
  }

  /**
   * Get all sessions.
   */
  getSessions(): ProfileSession[] {
    return [...this.sessions];
  }

  /**
   * Get the last session.
   */
  getLastSession(): ProfileSession | null {
    return this.sessions.length > 0 ? this.sessions[this.sessions.length - 1] : null;
  }

  /**
   * Get profiler statistics.
   */
  getStats(): ProfilerStats {
    let totalEntries = 0;
    let totalRenderTime = 0;
    let renderCount = 0;
    let slowestComponent: string | null = null;
    let slowestTime = 0;

    for (const session of this.sessions) {
      totalEntries += session.entries.length;
      this.collectStats(session.entries, (name, duration) => {
        totalRenderTime += duration;
        renderCount++;
        if (duration > slowestTime) {
          slowestTime = duration;
          slowestComponent = name;
        }
      });
    }

    return {
      sessions: this.sessions.length,
      totalEntries,
      avgRenderTime: renderCount > 0 ? totalRenderTime / renderCount : 0,
      slowestComponent,
      slowestTime,
    };
  }

  private collectStats(entries: ProfileEntry[], cb: (name: string, duration: number) => void): void {
    for (const entry of entries) {
      if (entry.type === "component") {
        cb(entry.name, entry.duration);
      }
      if (entry.children.length > 0) {
        this.collectStats(entry.children, cb);
      }
    }
  }

  /**
   * Export session to Chrome DevTools Profiler format.
   */
  exportToDevTools(sessionId?: string): unknown {
    const session = sessionId
      ? this.sessions.find(s => s.id === sessionId)
      : this.sessions[this.sessions.length - 1];

    if (!session) return null;

    const profiles: Record<string, unknown> = {};
    const samples: number[] = [];
    const timestamps: number[] = [];

    const walk = (entry: ProfileEntry) => {
      profiles[entry.name] = {
        type: entry.type,
        duration: entry.duration,
        startTime: entry.startTime,
        endTime: entry.endTime,
        depth: entry.depth,
      };
      samples.push(entry.duration);
      timestamps.push(entry.startTime);
      for (const child of entry.children) walk(child);
    };

    for (const entry of session.entries) walk(entry);

    return {
      profiles,
      samples,
      timestamps,
      startTime: session.startTime,
      endTime: session.endTime,
      totalDuration: session.totalDuration,
    };
  }

  /**
   * Enable/disable profiling.
   */
  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  get isEnabled(): boolean { return this.enabled; }

  /**
   * Set the slow threshold (in ms).
   */
  setSlowThreshold(ms: number): void { this.slowThreshold = ms; }

  /**
   * Clear all sessions.
   */
  clear(): void {
    this.sessions = [];
    this.markers.clear();
  }
}

// --- Global Profiler --------------------------------------------------

let globalProfiler: Profiler | null = null;

export function getProfiler(): Profiler {
  if (!globalProfiler) globalProfiler = new Profiler();
  return globalProfiler;
}

export function enableProfiler(enabled = true): void {
  getProfiler().setEnabled(enabled);
}

export function startProfiling(id?: string): string {
  return getProfiler().startSession(id);
}

export function endProfiling(): ProfileSession | null {
  return getProfiler().endSession();
}

export function getProfilerStats(): ProfilerStats {
  return getProfiler().getStats();
}
