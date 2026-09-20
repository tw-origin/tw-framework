/**
 * Rate Limit Middleware -- wraps rate limiters into a request
 * middleware that extracts client identifiers, applies limits,
 * and returns appropriate HTTP responses.
 *
 * Supports multiple limiters chained together (e.g., global + per-user),
 * custom key extractors (IP, API key, user ID), and configurable
 * response formats.
 *
 * @module security/rate-limit/middleware
 */

import type { TokenBucketLimiter } from "./token-bucket";
import type { SlidingWindowLimiter } from "./sliding-window";
import type { FixedWindowLimiter } from "./fixed-window";

/** Union type for all limiter types. */
export type AnyLimiter = TokenBucketLimiter | SlidingWindowLimiter | FixedWindowLimiter;

/** Key extractor -- determines the rate limit key from a request. */
export type KeyExtractor = (req: Request) => string;

/** Response format for rate limit errors. */
export interface RateLimitErrorResponse {
  error: string;
  message: string;
  retryAfter: number;
  limit: number;
}

/** Configuration for the rate limit middleware. */
export interface RateLimitMiddlewareOptions {
  /** The limiter instance to use. */
  limiter: AnyLimiter;
  /** How to extract the key from the request. */
  keyExtractor?: KeyExtractor;
  /** Whether to include rate limit headers in responses. */
  includeHeaders?: boolean;
  /** Custom error response handler. */
  onError?: (req: Request, retryAfter: number) => Response;
  /** Whether to skip rate limiting for certain requests. */
  skip?: (req: Request) => boolean;
  /** Prefix for the rate limit key. */
  keyPrefix?: string;
}

/** Standard rate limit headers. */
const RATE_LIMIT_HEADERS = {
  limit: "X-RateLimit-Limit",
  remaining: "X-RateLimit-Remaining",
  reset: "X-RateLimit-Reset",
  retryAfter: "Retry-After",
} as const;

/**
 * Rate Limit Middleware -- applies rate limiting to HTTP requests.
 */
export class RateLimitMiddleware {
  private limiter: AnyLimiter;
  private keyExtractor: KeyExtractor;
  private includeHeaders: boolean;
  private onErrorCb: ((req: Request, retryAfter: number) => Response) | null;
  private skipFn: ((req: Request) => boolean) | null;
  private keyPrefix: string;

  constructor(options: RateLimitMiddlewareOptions) {
    this.limiter = options.limiter;
    this.keyExtractor = options.keyExtractor ?? defaultKeyExtractor;
    this.includeHeaders = options.includeHeaders ?? true;
    this.onErrorCb = options.onError ?? null;
    this.skipFn = options.skip ?? null;
    this.keyPrefix = options.keyPrefix ?? "";
  }

  /**
   * Processes a request through rate limiting.
   * Returns null if allowed, or an error Response if rate limited.
   */
  process(req: Request): Response | null {
    if (this.skipFn && this.skipFn(req)) {
      return null;
    }

    const key = this.keyPrefix + this.keyExtractor(req);
    const result = this.limiter.check(key);

    if (result.allowed) {
      return null;
    }

    // Rate limited -- create error response
    if (this.onErrorCb) {
      return this.onErrorCb(req, result.retryAfter);
    }

    const errorBody: RateLimitErrorResponse = {
      error: "Too Many Requests",
      message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
      retryAfter: result.retryAfter,
      limit: result.limit,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.includeHeaders) {
      headers[RATE_LIMIT_HEADERS.limit] = String(result.limit);
      headers[RATE_LIMIT_HEADERS.remaining] = "0";
      headers[RATE_LIMIT_HEADERS.reset] = String(Math.floor(result.resetAt / 1000));
      headers[RATE_LIMIT_HEADERS.retryAfter] = String(result.retryAfter);
    }

    return new Response(JSON.stringify(errorBody), {
      status: 429,
      headers,
    });
  }

  /**
   * Adds rate limit headers to a successful response.
   */
  addHeaders(res: Response, key: string): Response {
    if (!this.includeHeaders) return res;

    const peek = "peek" in this.limiter
      ? (this.limiter as { peek: (k: string) => unknown }).peek(key)
      : null;

    const newHeaders = new Headers(res.headers);

    // Try to get remaining from the last check result
    // Since the limiter already consumed a token, we check peek
    if (peek && typeof peek === "object" && "tokens" in peek) {
      newHeaders.set(RATE_LIMIT_HEADERS.remaining, String(Math.floor((peek as { tokens: number }).tokens)));
    }

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  }

  /**
   * Wraps a handler with rate limiting.
   * Usage: `Bun.serve({ fetch: rateLimit.protect(handler) })`
   */
  protect(handler: (req: Request) => Response | Promise<Response>) {
    return (req: Request): Response | Promise<Response> => {
      const errorResponse = this.process(req);
      if (errorResponse) {
        return errorResponse;
      }
      return handler(req);
    };
  }
}

/**
 * Default key extractor -- uses client IP address.
 * Falls back to a hash of the User-Agent if IP is not available.
 */
export const defaultKeyExtractor: KeyExtractor = (req: Request): string => {
  // Try to get the real IP from headers (when behind a proxy)
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;

  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  // Fallback to User-Agent hash
  const ua = req.headers.get("user-agent") ?? "unknown";
  let hash = 0;
  for (let i = 0; i < ua.length; i++) {
    hash = ((hash << 5) - hash) + ua.charCodeAt(i);
    hash |= 0;
  }
  return `ua-${Math.abs(hash).toString(36)}`;
};

/** Creates a key extractor based on API key from header. */
export function apiKeyKeyExtractor(headerName: string = "x-api-key"): KeyExtractor {
  return (req: Request) => req.headers.get(headerName) ?? "anonymous";
}

/** Creates a key extractor based on a path prefix. */
export function pathKeyExtractor(): KeyExtractor {
  return (req: Request) => {
    try {
      const url = new URL(req.url);
      return url.pathname;
    } catch {
      return req.url;
    }
  };
}

/** Creates a new rate limit middleware. */
export function createRateLimitMiddleware(options: RateLimitMiddlewareOptions): RateLimitMiddleware {
  return new RateLimitMiddleware(options);
}
