/**
 * CSRF Token Manager -- generates, stores, validates, and rotates
 * Cross-Site Request Forgery tokens using signed double-submit cookies.
 *
 * Implements the double-submit cookie pattern with HMAC signing
 * for stateless CSRF protection. Supports both cookie-based and
 * header-based token transmission.
 *
 * @module security/csrf/token-manager
 */

/** Options for the CSRF token manager. */
export interface CSRFTokenOptions {
  /** Secret key used for HMAC signing. */
  secret: string;
  /** Token length in bytes (before encoding). */
  tokenLength?: number;
  /** Token TTL in milliseconds. */
  ttl?: number;
  /** Cookie name for the CSRF token. */
  cookieName?: string;
  /** Header name to check for the token. */
  headerName?: string;
  /** Form field name for the token. */
  fieldName?: string;
  /** Whether to use secure cookies. */
  secure?: boolean;
  /** Whether to use httpOnly cookies. */
  httpOnly?: boolean;
  /** SameSite attribute for the cookie. */
  sameSite?: "Strict" | "Lax" | "None";
  /** Cookie domain. */
  domain?: string;
  /** Cookie path. */
  path?: string;
  /** Whether to rotate tokens after use. */
  rotateAfterUse?: boolean;
  /** Hard cap on stored tokens (oldest evicted when full; default 10000). */
  maxTokens?: number;
}

/** A generated CSRF token with metadata. */
export interface CSRFToken {
  /** The token string to send to the client. */
  token: string;
  /** The signed token (token + HMAC). */
  signedToken: string;
  /** The cookie value to set. */
  cookieValue: string;
  /** When the token was created. */
  createdAt: number;
  /** When the token expires. */
  expiresAt: number;
}

/** Result of token validation. */
export interface CSRFValidationResult {
  valid: boolean;
  reason?: string;
  rotated?: CSRFToken;
}

/** Internal stored token entry. */
interface TokenEntry {
  token: string;
  signature: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  sessionId: string | null;
}

/**
 * Simple HMAC-SHA256 implementation using Web Crypto API.
 */
async function hmacSign(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const bytes = new Uint8Array(signature);
  return btoa(String.fromCharCode(...bytes));
}

/** Generates a random token of the specified length. */
function randomToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** Constant-time string comparison to prevent timing attacks.
 * Loops over the LONGER length (no early length return) so the running time
 * does not leak whether the lengths matched. */
function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let result = a.length === b.length ? 0 : 1;
  for (let i = 0; i < max; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}

/**
 * CSRF Token Manager -- handles token generation, validation,
 * rotation, and cookie management for CSRF protection.
 */
export class CSRFTokenManager {
  private secret: string;
  private tokenLength: number;
  private ttl: number;
  private cookieName: string;
  private headerName: string;
  private fieldName: string;
  private secure: boolean;
  private httpOnly: boolean;
  private sameSite: "Strict" | "Lax" | "None";
  private domain: string | undefined;
  private path: string;
  private rotateAfterUse: boolean;
  private maxTokens: number;
  private tokens: Map<string, TokenEntry> = new Map();

  constructor(options: CSRFTokenOptions) {
    this.secret = options.secret;
    this.tokenLength = options.tokenLength ?? 32;
    this.ttl = options.ttl ?? 3600000; // 1 hour
    this.cookieName = options.cookieName ?? "_csrf";
    this.headerName = options.headerName ?? "x-csrf-token";
    this.fieldName = options.fieldName ?? "_csrf";
    this.secure = options.secure ?? true;
    this.httpOnly = options.httpOnly ?? false; // Must be readable by JS
    this.sameSite = options.sameSite ?? "Lax";
    this.domain = options.domain;
    this.path = options.path ?? "/";
    this.rotateAfterUse = options.rotateAfterUse ?? true;
    this.maxTokens = options.maxTokens ?? 10000;
  }

  /**
   * Generates a new CSRF token for a session.
   * Optionally associates it with a session ID for server-side validation.
   */
  async generate(sessionId?: string): Promise<CSRFToken> {
    if (this.tokens.size >= this.maxTokens) {
      this.evictExpired();
      // Expiry alone can free nothing when every stored token is still
      // fresh -- in that case evict the OLDEST entry so the store can never
      // grow past the cap (unbounded token growth was a memory-exhaustion
      // vector: every page view generates a token).
      if (this.tokens.size >= this.maxTokens) {
        let oldestKey: string | null = null;
        let oldestAt = Infinity;
        for (const [t, entry] of this.tokens) {
          if (entry.createdAt < oldestAt) {
            oldestAt = entry.createdAt;
            oldestKey = t;
          }
        }
        if (oldestKey !== null) this.tokens.delete(oldestKey);
      }
    }

    const token = randomToken(this.tokenLength);
    const now = Date.now();
    const expiresAt = now + this.ttl;

    // Sign the token with the secret. The signature covers the token and the
    // (optional) session id -- it must be verifiable BOTH statefully and
    // statelessly, so no server-side-only value (like the store expiry) can
    // be part of the signed payload.
    const payload = `${token}.${sessionId ?? ""}`;
    const signature = await hmacSign(this.secret, payload);

    // Store for server-side validation
    this.tokens.set(token, {
      token,
      signature,
      createdAt: now,
      expiresAt,
      used: false,
      sessionId: sessionId ?? null,
    });

    return {
      token,
      signedToken: `${token}.${signature}`,
      cookieValue: `${token}.${signature}`,
      createdAt: now,
      expiresAt,
    };
  }

  /**
   * Validates a CSRF token from a request.
   * Checks both the token signature and optionally the server-side store.
   *
   * @param headerToken - Token from the request header
   * @param cookieToken - Token from the cookie
   * @param sessionId - Optional session ID for binding
   */
  async validate(
    headerToken: string,
    cookieToken: string,
    sessionId?: string
  ): Promise<CSRFValidationResult> {
    // Both tokens must be present
    if (!headerToken || !cookieToken) {
      return { valid: false, reason: "Missing token in header or cookie" };
    }

    // Parse tokens -- format: token.signature
    const [headerPart, headerSig] = headerToken.split(".");
    const [cookiePart, cookieSig] = cookieToken.split(".");

    if (!headerPart || !headerSig || !cookiePart || !cookieSig) {
      return { valid: false, reason: "Malformed token format" };
    }

    // Double-submit check: header token must match cookie token
    if (!constantTimeEqual(headerPart, cookiePart)) {
      return { valid: false, reason: "Token mismatch between header and cookie" };
    }

    // Verify signatures match
    if (!constantTimeEqual(headerSig, cookieSig)) {
      return { valid: false, reason: "Signature mismatch" };
    }

    // Verify the HMAC signature
    const now = Date.now();
    const entry = this.tokens.get(headerPart);

    if (entry) {
      // Server-side validation (stateful)
      if (now > entry.expiresAt) {
        this.tokens.delete(headerPart);
        return { valid: false, reason: "Token expired" };
      }

      if (entry.used && this.rotateAfterUse) {
        return { valid: false, reason: "Token already used" };
      }

      // Verify signature
      const expectedSig = await hmacSign(
        this.secret,
        `${headerPart}.${entry.sessionId ?? ""}`
      );

      if (!constantTimeEqual(headerSig, expectedSig)) {
        return { valid: false, reason: "Invalid signature" };
      }

      // Check session binding
      if (sessionId && entry.sessionId && sessionId !== entry.sessionId) {
        return { valid: false, reason: "Session mismatch" };
      }

      // Mark as used and optionally rotate
      entry.used = true;

      if (this.rotateAfterUse) {
        this.tokens.delete(headerPart);
        const rotated = await this.generate(sessionId ?? undefined);
        return { valid: true, rotated };
      }

      return { valid: true };
    }

    // Stateless validation -- verify HMAC without server-side store
    // We need to try to reconstruct the expected signature
    // This is only possible if the token was issued by this manager
    // Stateless mode: verify the HMAC directly. The signature must match the
    // HMAC of the token part (and session id) -- simply having the same
    // attacker-controlled value in header and cookie must never validate.
    const expectedSig = await hmacSign(
      this.secret,
      `${headerPart}.${sessionId ?? ""}`
    );

    if (!constantTimeEqual(headerSig, expectedSig)) {
      return { valid: false, reason: "Invalid signature" };
    }

    return { valid: true };
  }

  /**
   * Extracts the token from a request -- checks header, then form field.
   */
  extractToken(req: Request): string | null {
    // Check header first
    const headerVal = req.headers.get(this.headerName);
    if (headerVal) return headerVal;

    // Check form field (for multipart/form-data or application/x-www-form-urlencoded)
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")) {
      // For Bun, we'd parse the form -- but we can't do this synchronously
      // Return null and let the caller parse the form body
      return null;
    }

    return null;
  }

  /**
   * Gets the token from a cookie string.
   */
  getTokenFromCookie(cookieHeader: string | null): string | null {
    if (!cookieHeader) return null;
    const cookies = this.parseCookies(cookieHeader);
    return cookies[this.cookieName] ?? null;
  }

  /** Parses a cookie header into a key-value object. */
  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    const parts = cookieHeader.split(";");
    for (const part of parts) {
      const [key, ...valParts] = part.trim().split("=");
      if (key && valParts.length > 0) {
        cookies[key.trim()] = valParts.join("=").trim();
      }
    }
    return cookies;
  }

  /**
   * Builds the Set-Cookie header value for a CSRF token.
   */
  buildCookieHeader(token: CSRFToken): string {
    const parts: string[] = [`${this.cookieName}=${token.cookieValue}`];
    if (this.domain) parts.push(`Domain=${this.domain}`);
    parts.push(`Path=${this.path}`);
    parts.push(`SameSite=${this.sameSite}`);
    if (this.secure) parts.push("Secure");
    if (this.httpOnly) parts.push("HttpOnly");
    parts.push(`Max-Age=${Math.floor(this.ttl / 1000)}`);
    return parts.join("; ");
  }

  /** Returns the cookie name used by this manager. */
  getCookieName(): string {
    return this.cookieName;
  }

  /** Returns the header name used by this manager. */
  getHeaderName(): string {
    return this.headerName;
  }

  /** Returns the form field name used by this manager. */
  getFieldName(): string {
    return this.fieldName;
  }

  /** Revokes a specific token. */
  revoke(token: string): void {
    this.tokens.delete(token);
  }

  /** Revokes all tokens for a session. */
  revokeBySession(sessionId: string): void {
    for (const [token, entry] of this.tokens) {
      if (entry.sessionId === sessionId) {
        this.tokens.delete(token);
      }
    }
  }

  /** Removes expired tokens from the store. */
  private evictExpired(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokens) {
      if (now > entry.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }

  /** Clears all tokens. */
  clear(): void {
    this.tokens.clear();
  }

  /** Returns current statistics. */
  getStats(): {
    totalTokens: number;
    usedTokens: number;
    expiredTokens: number;
  } {
    const now = Date.now();
    let used = 0;
    let expired = 0;
    for (const entry of this.tokens.values()) {
      if (entry.used) used++;
      if (now > entry.expiresAt) expired++;
    }
    return {
      totalTokens: this.tokens.size,
      usedTokens: used,
      expiredTokens: expired,
    };
  }
}

/** Creates a new CSRF token manager. */
export function createCSRFManager(options: CSRFTokenOptions): CSRFTokenManager {
  return new CSRFTokenManager(options);
}
