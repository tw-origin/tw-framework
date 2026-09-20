/**
 * Token Bucket Rate Limiter -- a precise, memory-efficient rate
 * limiter using the token bucket algorithm.
 *
 * Each client gets a bucket that fills at a configured rate.
 * Requests consume tokens. When the bucket is empty, requests
 * are rejected or queued.
 *
 * @module security/rate-limit/token-bucket
 */

/** Result of a rate limit check. */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfter: number;
}

/** Options for the token bucket. */
export interface TokenBucketOptions {
  /** Maximum tokens the bucket can hold. */
  capacity: number;
  /** Tokens added per second (refill rate). */
  refillRate: number;
  /** Initial tokens in the bucket. Defaults to capacity. */
  initialTokens?: number;
}

/** A single token bucket for one client. */
class Bucket {
  capacity: number;
  refillRate: number;
  tokens: number;
  lastRefill: number;

  constructor(options: TokenBucketOptions) {
    this.capacity = options.capacity;
    this.refillRate = options.refillRate;
    this.tokens = options.initialTokens ?? options.capacity;
    this.lastRefill = Date.now();
  }

  /** Refills the bucket based on elapsed time. */
  refill(now: number): void {
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /** Tries to consume n tokens. Returns true if successful. */
  consume(n: number, now: number): boolean {
    this.refill(now);
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  /** Returns the time (ms) until n tokens will be available. */
  timeUntilAvailable(n: number, now: number): number {
    this.refill(now);
    if (this.tokens >= n) return 0;
    const needed = n - this.tokens;
    return Math.ceil((needed / this.refillRate) * 1000);
  }
}

/**
 * Token Bucket Rate Limiter -- maintains per-client buckets
 * with configurable capacity and refill rate.
 */
export class TokenBucketLimiter {
  private buckets: Map<string, Bucket> = new Map();
  private capacity: number;
  private refillRate: number;
  private maxBuckets: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null;

  constructor(options: TokenBucketOptions & { maxBuckets?: number }) {
    this.capacity = options.capacity;
    this.refillRate = options.refillRate;
    this.maxBuckets = options.maxBuckets ?? 100000;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    if (typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Checks if a request from the given key is allowed.
   * Consumes 1 token if allowed.
   */
  check(key: string, tokens: number = 1): RateLimitResult {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxBuckets) {
        this.evictOldest();
      }
      bucket = new Bucket({
        capacity: this.capacity,
        refillRate: this.refillRate,
      });
      this.buckets.set(key, bucket);
    }

    const now = Date.now();
    const allowed = bucket.consume(tokens, now);
    const retryAfter = allowed ? 0 : bucket.timeUntilAvailable(tokens, now);

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      limit: this.capacity,
      resetAt: now + retryAfter,
      retryAfter: Math.ceil(retryAfter / 1000),
    };
  }

  /** Peeks at the current state without consuming. */
  peek(key: string): { tokens: number; capacity: number } | null {
    const bucket = this.buckets.get(key);
    if (!bucket) return null;
    bucket.refill(Date.now());
    return { tokens: bucket.tokens, capacity: bucket.capacity };
  }

  /** Resets a specific bucket. */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Adds tokens to a bucket (bonus tokens). */
  addTokens(key: string, tokens: number): void {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Bucket({
        capacity: this.capacity,
        refillRate: this.refillRate,
      });
      this.buckets.set(key, bucket);
    }
    bucket.refill(Date.now());
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokens);
  }

  /** Evicts the oldest buckets (LRU-style). */
  private evictOldest(): void {
    const entries = Array.from(this.buckets.entries())
      .sort((a, b) => a[1].lastRefill - b[1].lastRefill);
    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.buckets.delete(entries[i][0]);
    }
  }

  /** Removes stale buckets. */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = (this.capacity / this.refillRate) * 1000 * 2; // 2x fill time
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }

  /** Returns statistics. */
  getStats(): {
    totalBuckets: number;
    activeBuckets: number;
    avgTokens: number;
  } {
    let totalTokens = 0;
    let active = 0;
    const now = Date.now();
    const maxAge = 60000;
    for (const bucket of this.buckets.values()) {
      bucket.refill(now);
      totalTokens += bucket.tokens;
      if (now - bucket.lastRefill < maxAge) active++;
    }
    return {
      totalBuckets: this.buckets.size,
      activeBuckets: active,
      avgTokens: this.buckets.size > 0 ? totalTokens / this.buckets.size : 0,
    };
  }

  /** Destroys the limiter. */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
  }
}

/** Creates a new token bucket rate limiter. */
export function createTokenBucket(options: TokenBucketOptions & { maxBuckets?: number }): TokenBucketLimiter {
  return new TokenBucketLimiter(options);
}
