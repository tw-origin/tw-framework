/**
 * Fixed Window Rate Limiter -- the simplest rate limiting algorithm.
 * Counts requests in a fixed time window. Resets at window boundaries.
 *
 * Very memory efficient -- stores only a count per client per window.
 * Best suited for approximate rate limiting where occasional boundary
 * bursts are acceptable.
 *
 * @module security/rate-limit/fixed-window
 */

import type { RateLimitResult } from "./token-bucket";

/** Configuration for the fixed window limiter. */
export interface FixedWindowOptions {
  /** Maximum requests per window. */
  maxRequests: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

/** A counter for a single client in the current window. */
interface WindowCounter {
  count: number;
  windowStart: number;
}

/**
 * Fixed Window Rate Limiter -- counts requests per client in
 * fixed time windows. Resets counters at window boundaries.
 */
export class FixedWindowLimiter {
  private counters: Map<string, WindowCounter> = new Map();
  private maxRequests: number;
  private windowMs: number;
  private maxCounters: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null;

  constructor(options: FixedWindowOptions & { maxCounters?: number }) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.maxCounters = options.maxCounters ?? 100000;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    if (typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  /** Checks if a request is allowed and increments the counter if so. */
  check(key: string): RateLimitResult {
    const now = Date.now();
    let counter = this.counters.get(key);

    if (!counter) {
      if (this.counters.size >= this.maxCounters) {
        this.cleanup();
      }
      counter = { count: 0, windowStart: this.getWindowStart(now) };
      this.counters.set(key, counter);
    }

    // Check if we need to reset the window
    const currentWindowStart = this.getWindowStart(now);
    if (counter.windowStart < currentWindowStart) {
      counter.count = 0;
      counter.windowStart = currentWindowStart;
    }

    const allowed = counter.count < this.maxRequests;
    if (allowed) {
      counter.count++;
    }

    const windowEnd = currentWindowStart + this.windowMs;
    const remaining = Math.max(0, this.maxRequests - counter.count);
    const retryAfter = allowed ? 0 : Math.ceil((windowEnd - now) / 1000);

    return {
      allowed,
      remaining,
      limit: this.maxRequests,
      resetAt: windowEnd,
      retryAfter,
    };
  }

  /** Returns the start of the current window. */
  private getWindowStart(now: number): number {
    return Math.floor(now / this.windowMs) * this.windowMs;
  }

  /** Resets a specific key. */
  reset(key: string): void {
    this.counters.delete(key);
  }

  /** Resets all counters. */
  resetAll(): void {
    this.counters.clear();
  }

  /** Gets the current count for a key without incrementing. */
  getCount(key: string): number {
    const counter = this.counters.get(key);
    if (!counter) return 0;
    const now = Date.now();
    const currentWindowStart = this.getWindowStart(now);
    if (counter.windowStart < currentWindowStart) {
      return 0;
    }
    return counter.count;
  }

  /** Removes stale counters. */
  private cleanup(): void {
    const now = Date.now();
    const currentWindowStart = this.getWindowStart(now);
    for (const [key, counter] of this.counters) {
      if (counter.windowStart < currentWindowStart) {
        this.counters.delete(key);
      }
    }
  }

  /** Returns statistics. */
  getStats(): {
    totalKeys: number;
    activeKeys: number;
    avgCount: number;
  } {
    const now = Date.now();
    const currentWindowStart = this.getWindowStart(now);
    let active = 0;
    let total = 0;
    for (const counter of this.counters.values()) {
      if (counter.windowStart === currentWindowStart) {
        active++;
        total += counter.count;
      }
    }
    return {
      totalKeys: this.counters.size,
      activeKeys: active,
      avgCount: active > 0 ? total / active : 0,
    };
  }

  /** Destroys the limiter. */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.counters.clear();
  }
}

/** Creates a new fixed window rate limiter. */
export function createFixedWindow(options: FixedWindowOptions & { maxCounters?: number }): FixedWindowLimiter {
  return new FixedWindowLimiter(options);
}
