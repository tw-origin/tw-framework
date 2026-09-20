/**
 * CSRF Middleware -- request-level CSRF protection that integrates
 * with the CSRFTokenManager to validate tokens on mutating requests.
 *
 * Also provides helpers for injecting tokens into HTML responses
 * and JSON API responses.
 *
 * @module security/csrf/middleware
 */

import { CSRFTokenManager, type CSRFToken } from "./token-manager";

/** Methods that require CSRF protection. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Paths that are exempt from CSRF protection. */
export type CSRFExemptPaths = Set<string> | RegExp | ((path: string) => boolean);

/** Configuration for the CSRF middleware. */
export interface CSRFMiddlewareOptions {
  /** The CSRF token manager instance. */
  manager: CSRFTokenManager;
  /** Paths exempt from CSRF checks. */
  exemptPaths?: CSRFExemptPaths;
  /** Whether to attach token to response headers. */
  attachTokenHeader?: boolean;
  /** Whether to attach token to response cookies. */
  attachTokenCookie?: boolean;
  /** Custom error handler. */
  onError?: (req: Request, reason: string) => Response;
  /** Custom success handler -- can modify the response. */
  onSuccess?: (req: Request, token: CSRFToken | null) => void;
  /** Whether to skip CSRF for same-site requests. */
  skipSameSite?: boolean;
}

/** Context for CSRF operations on a single request. */
export interface CSRFContext {
  token: CSRFToken | null;
  isValid: boolean;
  skipCheck: boolean;
}

/** Result of CSRF middleware processing. */
export interface CSRFMiddlewareResult {
  passed: boolean;
  reason?: string;
  token?: CSRFToken;
}

/**
 * CSRF Middleware -- protects against Cross-Site Request Forgery
 * attacks by validating tokens on mutating HTTP requests.
 */
export class CSRFMiddleware {
  private manager: CSRFTokenManager;
  private exemptPaths: CSRFExemptPaths;
  private attachTokenHeader: boolean;
  private attachTokenCookie: boolean;
  private onErrorCb: ((req: Request, reason: string) => Response) | null;
  private onSuccessCb: ((req: Request, token: CSRFToken | null) => void) | null;
  private skipSameSite: boolean;

  constructor(options: CSRFMiddlewareOptions) {
    this.manager = options.manager;
    this.exemptPaths = options.exemptPaths ?? new Set<string>();
    this.attachTokenHeader = options.attachTokenHeader ?? true;
    this.attachTokenCookie = options.attachTokenCookie ?? true;
    this.onErrorCb = options.onError ?? null;
    this.onSuccessCb = options.onSuccess ?? null;
    this.skipSameSite = options.skipSameSite ?? true;
  }

  /**
   * Checks if a path is exempt from CSRF protection.
   */
  private isExempt(path: string): boolean {
    if (this.exemptPaths instanceof Set) {
      return this.exemptPaths.has(path);
    }
    if (this.exemptPaths instanceof RegExp) {
      return this.exemptPaths.test(path);
    }
    if (typeof this.exemptPaths === "function") {
      return this.exemptPaths(path);
    }
    return false;
  }

  /**
   * Checks if the request is same-origin based on the Origin or Referer header.
   */
  private isSameOrigin(req: Request): boolean {
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const host = req.headers.get("host");

    if (!host) return false;

    if (origin) {
      try {
        const url = new URL(origin);
        return url.host === host;
      } catch {
        return false;
      }
    }

    if (referer) {
      try {
        const url = new URL(referer);
        return url.host === host;
      } catch {
        return false;
      }
    }

    // No Origin and no Referer -- a headerless client (curl, attack
    // scripts). Treat as NOT same-origin so the full token check still
    // applies: returning true here let any client that simply omitted both
    // headers bypass CSRF protection entirely.
    return false;
  }

  /**
   * Processes a request through CSRF validation.
   * Returns null if the request passes, or an error Response if it fails.
   */
  async process(req: Request): Promise<Response | null> {
    const method = req.method.toUpperCase();
    const url = new URL(req.url);
    const path = url.pathname;

    // Skip non-mutating methods
    if (!MUTATING_METHODS.has(method)) {
      return null;
    }

    // Skip exempt paths
    if (this.isExempt(path)) {
      return null;
    }

    // Skip same-site requests if configured
    if (this.skipSameSite && this.isSameOrigin(req)) {
      // Still validate the token if present, but don't fail if missing
      const headerToken = this.manager.extractToken(req);
      if (headerToken) {
        const cookieToken = this.manager.getTokenFromCookie(
          req.headers.get("cookie")
        );
        if (cookieToken) {
          const result = await this.manager.validate(headerToken, cookieToken);
          if (result.rotated && this.onSuccessCb) {
            this.onSuccessCb(req, result.rotated);
          }
        }
      }
      return null;
    }

    // Extract token from header
    const headerToken = this.manager.extractToken(req);
    if (!headerToken) {
      return this.createErrorResponse(req, "Missing CSRF token in header");
    }

    // Extract token from cookie
    const cookieToken = this.manager.getTokenFromCookie(
      req.headers.get("cookie")
    );
    if (!cookieToken) {
      return this.createErrorResponse(req, "Missing CSRF token in cookie");
    }

    // Validate
    const result = await this.manager.validate(headerToken, cookieToken);
    if (!result.valid) {
      return this.createErrorResponse(req, result.reason ?? "Invalid CSRF token");
    }

    // Call success handler
    if (this.onSuccessCb) {
      this.onSuccessCb(req, result.rotated ?? null);
    }

    return null;
  }

  /**
   * Creates a CSRF error response.
   */
  private createErrorResponse(req: Request, reason: string): Response {
    if (this.onErrorCb) {
      return this.onErrorCb(req, reason);
    }

    return new Response(
      JSON.stringify({
        error: "CSRF Validation Failed",
        message: reason,
        code: "CSRF_FAILED",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  /**
   * Attaches a new CSRF token to a response -- either as a header,
   * cookie, or both.
   */
  async attachToken(
    response: Response,
    token: CSRFToken
  ): Promise<Response> {
    const newHeaders = new Headers(response.headers);

    if (this.attachTokenHeader) {
      newHeaders.set(this.manager.getHeaderName(), token.signedToken);
    }

    if (this.attachTokenCookie) {
      newHeaders.set("Set-Cookie", this.manager.buildCookieHeader(token));
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  /**
   * Middleware function for use with Bun.serve or similar frameworks.
   * Usage: `Bun.serve({ fetch: csrf.protect(handler) })`
   */
  protect(handler: (req: Request) => Response | Promise<Response>) {
    return async (req: Request): Promise<Response> => {
      const errorResponse = await this.process(req);
      if (errorResponse) {
        return errorResponse;
      }

      const response = await handler(req);

      // Attach a new token to the response if this was a GET request
      // (token refresh on safe methods)
      if (req.method === "GET") {
        const token = await this.manager.generate();
        return this.attachToken(response, token);
      }

      // For mutating methods, attach rotated token if available
      if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
        const token = await this.manager.generate();
        return this.attachToken(response, token);
      }

      return response;
    };
  }

  /**
   * Generates a meta tag for HTML responses.
   * Usage: `<meta name="csrf-token" content="${token}">`
   */
  async getMetaTag(): Promise<string> {
    const token = await this.manager.generate();
    return `<meta name="csrf-token" content="${token.signedToken}">`;
  }

  /**
   * Generates a JavaScript snippet that sets the CSRF token
   * for use with fetch/XHR.
   */
  async getInitScript(): Promise<string> {
    const token = await this.manager.generate();
    const headerName = this.manager.getHeaderName();
    return `<script>window.__CSRF_TOKEN__="${token.signedToken}";window.__CSRF_HEADER__="${headerName}";</script>`;
  }
}

/** Creates a new CSRF middleware instance. */
export function createCSRFMiddleware(options: CSRFMiddlewareOptions): CSRFMiddleware {
  return new CSRFMiddleware(options);
}
