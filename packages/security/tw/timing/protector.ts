/**
 * Timing Attack Prevention -- protects against timing side-channel
 * attacks by using constant-time comparison and response timing
 * normalization.
 *
 * @module security/timing/protector"
 */

/** Configuration for timing protection. */
export interface TimingConfig {
  /** Whether to normalize response timing. */
  normalizeResponseTime?: boolean;
  /** Minimum response time in ms (responses faster than this are delayed). */
  minResponseTime?: number;
  /** Whether to add jitter to response timing. */
  addJitter?: boolean;
  /** Jitter range in ms. */
  jitterRange?: number;
}

/** Constant-time string comparison. */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do the comparison to avoid timing leak
    const maxLen = Math.max(a.length, b.length);
    let result = a.length ^ b.length;
    for (let i = 0; i < maxLen; i++) {
      result |= (a.charCodeAt(i % a.length) ?? 0) ^ (b.charCodeAt(i % b.length) ?? 0);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Constant-time byte array comparison. */
export function constantTimeCompareBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/** Constant-time comparison for numbers. */
export function constantTimeCompareNumbers(a: number, b: number): boolean {
  // XOR the values -- if equal, result is 0
  const diff = a ^ b;
  // Convert to boolean: 0 means equal
  // This takes constant time regardless of the values
  let result = 0;
  for (let i = 0; i < 32; i++) {
    result |= (diff >> i) & 1;
  }
  return result === 0;
}

/**
 * Timing Attack Protector -- provides utilities for preventing
 * timing-based side-channel attacks.
 */
export class TimingProtector {
  private normalizeResponseTime: boolean;
  private minResponseTime: number;
  private addJitter: boolean;
  private jitterRange: number;

  constructor(config: TimingConfig = {}) {
    this.normalizeResponseTime = config.normalizeResponseTime ?? true;
    this.minResponseTime = config.minResponseTime ?? 100;
    this.addJitter = config.addJitter ?? true;
    this.jitterRange = config.jitterRange ?? 50;
  }

  /**
   * Compares two strings in constant time.
   */
  compare(a: string, b: string): boolean {
    return constantTimeCompare(a, b);
  }

  /**
   * Compares two byte arrays in constant time.
   */
  compareBytes(a: Uint8Array, b: Uint8Array): boolean {
    return constantTimeCompareBytes(a, b);
  }

  /**
   * Compares two numbers in constant time.
   */
  compareNumbers(a: number, b: number): boolean {
    return constantTimeCompareNumbers(a, b);
  }

  /**
   * Delays the response to reach the minimum response time.
   * Call this at the end of a request handler.
   */
  async normalize(startTime: number): Promise<void> {
    if (!this.normalizeResponseTime) return;

    const elapsed = Date.now() - startTime;
    let delay = this.minResponseTime - elapsed;

    if (this.addJitter) {
      delay += Math.floor(Math.random() * this.jitterRange);
    }

    if (delay > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Wraps a function to normalize its execution time.
   */
  wrap<T extends (...args: unknown[]) => unknown>(fn: T): T {
    const self = this;
    return (async (...args: unknown[]) => {
      const start = Date.now();
      // Await the wrapped call: the elapsed time must include how long the
      // operation itself took, otherwise normalize() sleeps on top of a
      // near-zero measurement and the real duration still leaks.
      const result = await fn(...args);
      await self.normalize(start);
      return result;
    }) as T;
  }

  /**
   * Creates a middleware that normalizes response timing.
   */
  middleware() {
    const self = this;
    return (handler: (req: Request) => Response | Promise<Response>) => {
      return async (req: Request): Promise<Response> => {
        const start = Date.now();
        const response = await handler(req);
        await self.normalize(start);
        return response;
      };
    };
  }
}

/** Creates a new timing protector. */
export function createTimingProtector(config?: TimingConfig): TimingProtector {
  return new TimingProtector(config);
}
