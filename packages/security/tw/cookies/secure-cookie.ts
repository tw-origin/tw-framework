/**
 * Secure Cookie Manager -- signs, encrypts, and manages cookies
 * with built-in tamper protection and security flags.
 *
 * @module security/cookies/secure-cookie
 */

import { Hashing } from "../encryption/hashing";

/** Cookie options. */
export interface CookieOptions {
  name: string;
  value: string;
  maxAge?: number;     // seconds
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  signed?: boolean;
  encrypted?: boolean;
}

/** A parsed cookie. */
export interface ParsedCookie {
  name: string;
  value: string;
  options: Partial<CookieOptions>;
}

/** Configuration for the cookie manager. */
export interface CookieManagerConfig {
  secret: string;
  defaultPath?: string;
  defaultDomain?: string;
  defaultSecure?: boolean;
  defaultHttpOnly?: boolean;
  defaultSameSite?: "Strict" | "Lax" | "None";
  defaultMaxAge?: number;
  signByDefault?: boolean;
}

/**
 * Secure Cookie Manager -- handles cookie creation, signing,
 * parsing, and verification.
 */
export class SecureCookieManager {
  private secret: string;
  private defaultPath: string;
  private defaultDomain: string | undefined;
  private defaultSecure: boolean;
  private defaultHttpOnly: boolean;
  private defaultSameSite: "Strict" | "Lax" | "None";
  private defaultMaxAge: number | undefined;
  private signByDefault: boolean;

  constructor(config: CookieManagerConfig) {
    this.secret = config.secret;
    this.defaultPath = config.defaultPath ?? "/";
    this.defaultDomain = config.defaultDomain;
    this.defaultSecure = config.defaultSecure ?? true;
    this.defaultHttpOnly = config.defaultHttpOnly ?? true;
    this.defaultSameSite = config.defaultSameSite ?? "Lax";
    this.defaultMaxAge = config.defaultMaxAge;
    this.signByDefault = config.signByDefault ?? true;
  }

  /** Builds a Set-Cookie header string. */
  build(options: CookieOptions): string {
    const parts: string[] = [`${options.name}=${options.value}`];

    if (options.maxAge !== undefined) {
      parts.push(`Max-Age=${options.maxAge}`);
    } else if (options.expires) {
      parts.push(`Expires=${options.expires.toUTCString()}`);
    }

    parts.push(`Path=${options.path ?? this.defaultPath}`);

    if (options.domain ?? this.defaultDomain) {
      parts.push(`Domain=${options.domain ?? this.defaultDomain}`);
    }

    if (options.secure ?? this.defaultSecure) {
      parts.push("Secure");
    }

    if (options.httpOnly ?? this.defaultHttpOnly) {
      parts.push("HttpOnly");
    }

    parts.push(`SameSite=${options.sameSite ?? this.defaultSameSite}`);

    return parts.join("; ");
  }

  /** Creates a signed cookie -- value is signed with HMAC. */
  async sign(name: string, value: string, options?: Partial<CookieOptions>): Promise<string> {
    const signature = await Hashing.hmac(this.secret, value);
    const signedValue = `${value}.${signature}`;
    return this.build({
      maxAge: options?.maxAge ?? this.defaultMaxAge,
      path: options?.path ?? this.defaultPath,
      domain: options?.domain ?? this.defaultDomain,
      secure: options?.secure ?? this.defaultSecure,
      httpOnly: options?.httpOnly ?? this.defaultHttpOnly,
      sameSite: options?.sameSite ?? this.defaultSameSite,
      ...options,
      name,
      value: signedValue,
    });
  }

  /** Verifies a signed cookie value. */
  async verify(signedValue: string): Promise<string | null> {
    const lastDot = signedValue.lastIndexOf(".");
    if (lastDot === -1) return null;

    const value = signedValue.slice(0, lastDot);
    const signature = signedValue.slice(lastDot + 1);

    const valid = await Hashing.verifyHmac(this.secret, value, signature);
    return valid ? value : null;
  }

  /** Parses a Cookie header string. */
  parse(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    const parts = cookieHeader.split(";");

    for (const part of parts) {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;

      const name = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      cookies[name] = value;
    }

    return cookies;
  }

  /** Gets a cookie value from a request, optionally verifying it. */
  async get(req: Request, name: string, verify: boolean = true): Promise<string | null> {
    const cookieHeader = req.headers.get("cookie");
    if (!cookieHeader) return null;

    const cookies = this.parse(cookieHeader);
    const value = cookies[name];
    if (!value) return null;


    // The caller's `verify` argument alone decides verification. ANDing it
    // with the manager's `signByDefault` config made an explicit
    // `get(req, name, true)` silently return UNVERIFIED values on a
    // manager constructed with `signByDefault: false`.
    if (verify) {
      return this.verify(value);
    }
    return value;
  }

  /** Builds a Set-Cookie header to delete a cookie. */
  clear(name: string, options?: Partial<CookieOptions>): string {
    return this.build({
      path: options?.path ?? this.defaultPath,
      domain: options?.domain ?? this.defaultDomain,
      ...options,
      name: name as any,
      value: "",
      maxAge: 0,
    } as any);
  }

  /** Creates a session cookie (short-lived). */
  async session(name: string, value: string, maxAge: number = 3600): Promise<string> {
    return this.sign(name, value, { maxAge });
  }

  /** Creates a persistent cookie (long-lived). */
  async persistent(name: string, value: string, maxAge: number = 2592000): Promise<string> {
    return this.sign(name, value, { maxAge });
  }
}

/** Creates a new secure cookie manager. */
export function createCookieManager(config: CookieManagerConfig): SecureCookieManager {
  return new SecureCookieManager(config);
}
