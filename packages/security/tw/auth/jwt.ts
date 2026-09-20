/**
 * JWT Manager -- JSON Web Token creation, signing, verification,
 * and refresh token management.
 *
 * Uses Web Crypto API for HMAC-SHA256/384/512 signing.
 * Supports: HS256, HS384, HS512, RS256 (via SubtleCrypto).
 *
 * @module security/auth/jwt
 */

/** JWT header. */
export interface JWTHeader {
  alg: "HS256" | "HS384" | "HS512" | "RS256" | "none";
  typ: "JWT";
  kid?: string;
}

/** JWT payload (claims). */
export interface JWTPayload {
  iss?: string;          // Issuer
  sub?: string;          // Subject (user ID)
  aud?: string | string[]; // Audience
  exp?: number;          // Expiration time (seconds since epoch)
  nbf?: number;          // Not before
  iat?: number;          // Issued at
  jti?: string;          // JWT ID (unique)
  [key: string]: unknown; // Custom claims
}

/** A complete JWT token. */
export interface JWTToken {
  header: JWTHeader;
  payload: JWTPayload;
  signature: string;
  token: string;
}

/** JWT verification options. */
export interface JWTVerifyOptions {
  issuer?: string;
  audience?: string | string[];
  subject?: string;
  clockTolerance?: number; // seconds
  ignoreExpiration?: boolean;
  ignoreNotBefore?: boolean;
}

/** JWT verification result. */
export interface JWTVerifyResult {
  valid: boolean;
  payload: JWTPayload | null;
  reason?: string;
}

/** JWT manager configuration. */
export interface JWTConfig {
  secret: string;
  algorithm?: "HS256" | "HS384" | "HS512";
  issuer?: string;
  audience?: string | string[];
  expiresIn?: number; // seconds
  notBefore?: number; // seconds
  keyId?: string;
}

/** Base64url encode. */
function base64urlEncode(data: string | Uint8Array): string {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data;
  // Build in chunks -- `String.fromCharCode(...bytes)` hits the engine's
  // argument-count limit (~65k) on large payloads.
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Base64url decode. */
function base64urlDecode(str: string): string {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** HMAC sign using Web Crypto API. */
async function hmacSign(secret: string, data: string, algorithm: "HS256" | "HS384" | "HS512"): Promise<string> {
  const hashAlgo = algorithm === "HS256" ? "SHA-256"
    : algorithm === "HS384" ? "SHA-384"
    : "SHA-512";

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: hashAlgo },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return base64urlEncode(new Uint8Array(signature));
}

/** Constant-time string comparison. */
function constantTimeEqual(a: string, b: string): boolean {
  // Loop over the longer input so the work done does not reveal the length
  // of the expected value through timing. A length mismatch still fails,
  // but only after the same amount of work as a full comparison.
  const len = Math.max(a.length, b.length);
  let result = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}

/**
 * JWT Manager -- creates, signs, verifies, and refreshes JWT tokens.
 */
export class JWTManager {
  private secret: string;
  private algorithm: "HS256" | "HS384" | "HS512";
  private issuer: string | undefined;
  private audience: string | string[] | undefined;
  private expiresIn: number;
  private notBefore: number;
  private keyId: string | undefined;
  private revokedTokens: Set<string> = new Set();
  private maxRevoked: number = 10000;

  constructor(config: JWTConfig) {
    this.secret = config.secret;
    this.algorithm = config.algorithm ?? "HS256";
    this.issuer = config.issuer;
    this.audience = config.audience;
    this.expiresIn = config.expiresIn ?? 3600; // 1 hour
    this.notBefore = config.notBefore ?? 0;
    this.keyId = config.keyId;
  }

  /**
   * Creates and signs a new JWT token.
   */
  async sign(payload: JWTPayload, options?: {
    expiresIn?: number;
    subject?: string;
    audience?: string | string[];
  }): Promise<JWTToken> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (options?.expiresIn ?? this.expiresIn);
    const nbf = now + this.notBefore;

    const fullPayload: JWTPayload = {
      iat: now,
      exp,
      nbf,
      iss: this.issuer,
      sub: options?.subject,
      aud: options?.audience ?? this.audience,
      jti: crypto.randomUUID(),
      ...payload,
    };

    const header: JWTHeader = {
      alg: this.algorithm,
      typ: "JWT",
      ...(this.keyId ? { kid: this.keyId } : {}),
    };

    const encodedHeader = base64urlEncode(JSON.stringify(header));
    const encodedPayload = base64urlEncode(JSON.stringify(fullPayload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signature = await hmacSign(this.secret, signingInput, this.algorithm);

    return {
      header,
      payload: fullPayload,
      signature,
      token: `${signingInput}.${signature}`,
    };
  }

  /**
   * Verifies a JWT token and returns the payload if valid.
   */
  async verify(token: string, options?: JWTVerifyOptions): Promise<JWTVerifyResult> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, payload: null, reason: "Invalid token format" };
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Decode header
    let header: JWTHeader;
    try {
      header = JSON.parse(base64urlDecode(encodedHeader));
    } catch {
      return { valid: false, payload: null, reason: "Invalid header" };
    }

    // Check algorithm
    if (header.alg === "none") {
      return { valid: false, payload: null, reason: "Algorithm 'none' not allowed" };
    }

    if (header.alg !== this.algorithm) {
      return { valid: false, payload: null, reason: `Algorithm mismatch: expected ${this.algorithm}, got ${header.alg}` };
    }

    // Verify signature
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = await hmacSign(this.secret, signingInput, this.algorithm);

    if (!constantTimeEqual(signature, expectedSignature)) {
      return { valid: false, payload: null, reason: "Invalid signature" };
    }

    // Decode payload
    let payload: JWTPayload;
    try {
      payload = JSON.parse(base64urlDecode(encodedPayload));
    } catch {
      return { valid: false, payload: null, reason: "Invalid payload" };
    }

    // Check revocation
    if (payload.jti && this.revokedTokens.has(payload.jti)) {
      return { valid: false, payload: null, reason: "Token revoked" };
    }

    const now = Math.floor(Date.now() / 1000);
    // Clock tolerance is opt-in (seconds, default 0). When set, it applies to
    // BOTH `exp` and `nbf` symmetrically -- a token a few seconds past exp
    // within the window is accepted (clock skew between issuer and verifier).
    const tolerance = options?.clockTolerance ?? 0;

    // Check expiration
    if (!options?.ignoreExpiration && payload.exp) {
      if (now > payload.exp + tolerance) {
        return { valid: false, payload: null, reason: "Token expired" };
      }
    }

    // Check not before
    if (!options?.ignoreNotBefore && payload.nbf) {
      if (now + tolerance < payload.nbf) {
        return { valid: false, payload: null, reason: "Token not yet valid" };
      }
    }

    // Check issuer
    if (options?.issuer && payload.iss !== options.issuer) {
      return { valid: false, payload: null, reason: "Invalid issuer" };
    }

    // Check audience
    if (options?.audience) {
      const expectedAud = options.audience;
      const tokenAud = payload.aud;
      // A token with NO aud claim must NOT pass a check that requires a
      // specific audience -- otherwise any token minted without an audience
      // is accepted everywhere an audience is required.
      if (!tokenAud) {
        return { valid: false, payload: null, reason: "Invalid audience" };
      }
      const audArray = Array.isArray(tokenAud) ? tokenAud : [tokenAud];
      const expectedArray = Array.isArray(expectedAud) ? expectedAud : [expectedAud];
      const matched = expectedArray.some(a => audArray.includes(a));
      if (!matched) {
        return { valid: false, payload: null, reason: "Invalid audience" };
      }
    }

    // Check subject
    if (options?.subject && payload.sub !== options.subject) {
      return { valid: false, payload: null, reason: "Invalid subject" };
    }

    return { valid: true, payload };
  }

  /**
   * Refreshes a token -- creates a new token with the same claims
   * but a new expiration and signature.
   */
  async refresh(token: string, options?: JWTVerifyOptions): Promise<JWTToken | null> {
    const result = await this.verify(token, options);
    if (!result.valid || !result.payload) {
      return null;
    }

    // Remove timing claims
    const { iat, exp, nbf, jti, ...claims } = result.payload;
    return this.sign(claims);
  }

  /**
   * Revokes a token by adding its JTI to the revocation list.
   */
  revoke(token: string): void {
    const parts = token.split(".");
    if (parts.length !== 3) return;

    try {
      const payload = JSON.parse(base64urlDecode(parts[1]));
      if (payload.jti) {
        if (this.revokedTokens.size >= this.maxRevoked) {
          // Evict oldest -- since Set maintains insertion order, delete first
          const first = this.revokedTokens.values().next().value;
          if (first) this.revokedTokens.delete(first);
        }
        this.revokedTokens.add(payload.jti);
      }
    } catch {
      // Invalid token -- ignore
    }
  }

  /** Decodes a token without verification (for inspection). */
  decode(token: string): JWTToken | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    try {
      const header = JSON.parse(base64urlDecode(parts[0]));
      const payload = JSON.parse(base64urlDecode(parts[1]));
      return {
        header,
        payload,
        signature: parts[2],
        token,
      };
    } catch {
      return null;
    }
  }

  /** Returns statistics. */
  getStats(): {
    revokedCount: number;
    algorithm: string;
    issuer: string | undefined;
  } {
    return {
      revokedCount: this.revokedTokens.size,
      algorithm: this.algorithm,
      issuer: this.issuer,
    };
  }
}

/** Creates a new JWT manager. */
export function createJWTManager(config: JWTConfig): JWTManager {
  return new JWTManager(config);
}
