/**
 * CSP Nonce Manager -- generates and manages per-request nonces
 * for inline script and style elements.
 *
 * @module security/csp/nonce-manager
 */

/** A stored nonce with its associated request ID and expiry. */
interface NonceEntry {
  nonce: string;
  requestId: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

/** Configuration for the nonce manager. */
export interface NonceManagerOptions {
  nonceLength?: number;
  ttl?: number;
  maxNonces?: number;
  cleanupInterval?: number;
  encoding?: "base64" | "hex" | "base64url";
}

/** The nonce context attached to a request. */
export interface NonceContext {
  nonce: string;
  scriptSrcNonce: string;
  styleSrcNonce: string;
  header: string;
}

/**
 * Nonce Manager -- thread-safe nonce generation and validation
 * for Content-Security-Policy inline script/style protection.
 */
export class NonceManager {
  private nonces: Map<string, NonceEntry> = new Map();
  private nonceLength: number;
  private ttl: number;
  private maxNonces: number;
  private cleanupInterval: number;
  private encoding: "base64" | "hex" | "base64url";
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private cryptoObj: typeof crypto | null;

  constructor(options: NonceManagerOptions = {}) {
    this.nonceLength = options.nonceLength ?? 32;
    this.ttl = options.ttl ?? 300000; // 5 minutes
    this.maxNonces = options.maxNonces ?? 10000;
    this.cleanupInterval = options.cleanupInterval ?? 60000; // 1 minute
    this.encoding = options.encoding ?? "base64";
    this.cryptoObj = typeof crypto !== "undefined" ? crypto : null;
    this.startCleanup();
  }

  /** Generates a cryptographically random nonce. */
  private generateNonce(): string {
    const bytes = new Uint8Array(this.nonceLength);
    const c: Crypto | undefined =
      (typeof globalThis !== "undefined" && (globalThis as any).crypto) || this.cryptoObj;
    if (c && c.getRandomValues) {
      c.getRandomValues(bytes);
    } else {
      // Security tokens must never fall back to Math.random — fail hard.
      throw new Error("No crypto.getRandomValues available for nonce generation");
    }

    if (this.encoding === "hex") {
      return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    } else if (this.encoding === "base64url") {
      const b64 = btoa(String.fromCharCode(...bytes));
      return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    } else {
      return btoa(String.fromCharCode(...bytes));
    }
  }

  /**
   * Creates a new nonce for a request.
   * Returns the nonce string and associated CSP source.
   */
  createNonce(requestId: string): NonceContext {
    // Check if we've hit the max
    if (this.nonces.size >= this.maxNonces) {
      this.evictOldest();
    }

    const nonce = this.generateNonce();
    const now = Date.now();

    this.nonces.set(nonce, {
      nonce,
      requestId,
      createdAt: now,
      expiresAt: now + this.ttl,
      used: false,
    });

    return {
      nonce,
      scriptSrcNonce: `'nonce-${nonce}'`,
      styleSrcNonce: `'nonce-${nonce}'`,
      header: nonce,
    };
  }

  /**
   * Validates a nonce against stored entries.
   * Returns true if the nonce exists and hasn't expired.
   */
  validate(nonce: string): boolean {
    const entry = this.nonces.get(nonce);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.nonces.delete(nonce);
      return false;
    }
    return true;
  }

  /**
   * Marks a nonce as used. This prevents replay attacks.
   * Returns true if the nonce was successfully marked.
   */
  consume(nonce: string): boolean {
    const entry = this.nonces.get(nonce);
    if (!entry || entry.used) return false;
    entry.used = true;
    return true;
  }

  /**
   * Gets the nonce for a specific request ID.
   * Returns null if not found or expired.
   */
  getByRequestId(requestId: string): string | null {
    for (const [nonce, entry] of this.nonces) {
      if (entry.requestId === requestId) {
        if (Date.now() > entry.expiresAt) {
          this.nonces.delete(nonce);
          return null;
        }
        return nonce;
      }
    }
    return null;
  }

  /** Removes a specific nonce. */
  revoke(nonce: string): void {
    this.nonces.delete(nonce);
  }

  /** Removes all nonces for a specific request ID. */
  revokeByRequestId(requestId: string): void {
    for (const [nonce, entry] of this.nonces) {
      if (entry.requestId === requestId) {
        this.nonces.delete(nonce);
      }
    }
  }

  /** Evicts the oldest nonces until under max capacity. */
  private evictOldest(): void {
    const sorted = Array.from(this.nonces.values())
      .sort((a, b) => a.createdAt - b.createdAt);
    const toRemove = Math.ceil(sorted.length * 0.1); // Remove oldest 10%
    for (let i = 0; i < toRemove; i++) {
      this.nonces.delete(sorted[i].nonce);
    }
  }

  /** Periodic cleanup of expired nonces. */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [nonce, entry] of this.nonces) {
        if (now > entry.expiresAt) {
          this.nonces.delete(nonce);
        }
      }
    }, this.cleanupInterval);

    // Don't keep the process alive just for cleanup
    if (this.cleanupTimer && typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  /** Stops the cleanup timer. */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.nonces.clear();
  }

  /** Returns current statistics. */
  getStats(): {
    totalNonces: number;
    usedNonces: number;
    activeNonces: number;
    expiredNonces: number;
  } {
    const now = Date.now();
    let used = 0;
    let expired = 0;
    for (const entry of this.nonces.values()) {
      if (entry.used) used++;
      if (now > entry.expiresAt) expired++;
    }
    return {
      totalNonces: this.nonces.size,
      usedNonces: used,
      activeNonces: this.nonces.size - expired,
      expiredNonces: expired,
    };
  }
}

/** Creates a new nonce manager instance. */
export function createNonceManager(options?: NonceManagerOptions): NonceManager {
  return new NonceManager(options);
}

/**
 * Middleware that attaches a nonce to each request.
 * Usage: `server.use(nonceMiddleware(nonceManager))`
 */
export function nonceMiddleware(manager: NonceManager) {
  return (req: Request, next: (req: Request) => Response): Response => {
    const requestId = crypto.randomUUID();
    const ctx = manager.createNonce(requestId);
    // Attach to request headers for downstream use
    (req as unknown as Record<string, unknown>).__nonce = ctx.nonce;
    (req as unknown as Record<string, unknown>).__requestId = requestId;

    const res = next(req);
    manager.revoke(ctx.nonce);
    return res;
  };
}
