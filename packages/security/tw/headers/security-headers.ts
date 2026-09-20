/**
 * Security Headers -- generates and applies HTTP security headers
 * including HSTS, X-Frame-Options, X-Content-Type-Options,
 * Referrer-Policy, Permissions-Policy, and more.
 *
 * @module security/headers/security-headers
 */

/** Security headers configuration. */
export interface SecurityHeadersConfig {
  /** HSTS: max-age in seconds. */
  hstsMaxAge?: number;
  /** HSTS: include subdomains. */
  hstsIncludeSubdomains?: boolean;
  /** HSTS: preload into browser HSTS list. */
  hstsPreload?: boolean;
  /** X-Frame-Options: deny, sameorigin, or allow-from. */
  frameOptions?: "DENY" | "SAMEORIGIN" | { ALLOW_FROM: string };
  /** X-Content-Type-Options. */
  contentTypeOptions?: boolean;
  /** Referrer-Policy. */
  referrerPolicy?: string;
  /** Permissions-Policy. */
  permissionsPolicy?: Record<string, string[]>;
  /** X-Permitted-Cross-Domain-Policies. */
  crossDomainPolicies?: string;
  /** X-DNS-Prefetch-Control. */
  dnsPrefetchControl?: "on" | "off";
  /** Cross-Origin-Embedder-Policy. */
  coep?: "unsafe-none" | "require-corp";
  /** Cross-Origin-Opener-Policy. */
  coop?: "unsafe-none" | "same-origin-allow-popups" | "same-origin";
  /** Cross-Origin-Resource-Policy. */
  corp?: "same-site" | "same-origin" | "cross-origin";
  /** X-XSS-Protection (legacy, but still useful). */
  xssProtection?: "0" | "1" | "1; mode=block";
  /** X-Powered-By -- set to false to remove. */
  removePoweredBy?: boolean;
  /** Server header value. */
  serverHeader?: string;
}

/** Default security headers configuration. */
const DEFAULTS: SecurityHeadersConfig = {
  hstsMaxAge: 31536000, // 1 year
  hstsIncludeSubdomains: true,
  hstsPreload: false,
  frameOptions: "SAMEORIGIN",
  contentTypeOptions: true,
  referrerPolicy: "strict-origin-when-cross-origin",
  xssProtection: "1; mode=block",
  removePoweredBy: true,
  coep: "unsafe-none",
  coop: "same-origin",
  corp: "same-origin",
};

/** Builds HSTS header value. */
function buildHSTS(config: SecurityHeadersConfig): string {
  const parts: string[] = [`max-age=${config.hstsMaxAge}`];
  if (config.hstsIncludeSubdomains) parts.push("includeSubDomains");
  if (config.hstsPreload) parts.push("preload");
  return parts.join("; ");
}

/** Builds Permissions-Policy header value. */
function buildPermissionsPolicy(policy: Record<string, string[]>): string {
  return Object.entries(policy)
    .map(([feature, origins]) => {
      if (origins.length === 0) return `${feature}=()`;
      if (origins.length === 1 && origins[0] === "*") return `${feature}=*`;
      return `${feature}=(${origins.map(o => `"${o}"`).join(" ")})`;
    })
    .join(", ");
}

/**
 * Security Headers -- generates a set of HTTP security headers
 * based on configuration.
 */
export class SecurityHeaders {
  private config: SecurityHeadersConfig;
  private headers: Record<string, string>;

  constructor(config: SecurityHeadersConfig = {}) {
    this.config = { ...DEFAULTS, ...config };
    this.headers = this.build();
  }

  /** Builds the security headers object. */
  private build(): Record<string, string> {
    const headers: Record<string, string> = {};

    // HSTS
    if (this.config.hstsMaxAge && this.config.hstsMaxAge > 0) {
      headers["Strict-Transport-Security"] = buildHSTS(this.config);
    }

    // X-Frame-Options
    if (this.config.frameOptions) {
      if (typeof this.config.frameOptions === "string") {
        headers["X-Frame-Options"] = this.config.frameOptions;
      } else {
        headers["X-Frame-Options"] = `ALLOW-FROM ${this.config.frameOptions.ALLOW_FROM}`;
      }
    }

    // X-Content-Type-Options
    if (this.config.contentTypeOptions) {
      headers["X-Content-Type-Options"] = "nosniff";
    }

    // Referrer-Policy
    if (this.config.referrerPolicy) {
      headers["Referrer-Policy"] = this.config.referrerPolicy;
    }

    // Permissions-Policy
    if (this.config.permissionsPolicy) {
      headers["Permissions-Policy"] = buildPermissionsPolicy(this.config.permissionsPolicy);
    }

    // X-XSS-Protection
    if (this.config.xssProtection) {
      headers["X-XSS-Protection"] = this.config.xssProtection;
    }

    // Cross-Domain Policies
    if (this.config.crossDomainPolicies) {
      headers["X-Permitted-Cross-Domain-Policies"] = this.config.crossDomainPolicies;
    }

    // DNS Prefetch Control
    if (this.config.dnsPrefetchControl) {
      headers["X-DNS-Prefetch-Control"] = this.config.dnsPrefetchControl;
    }

    // Cross-Origin policies
    if (this.config.coep) {
      headers["Cross-Origin-Embedder-Policy"] = this.config.coep;
    }
    if (this.config.coop) {
      headers["Cross-Origin-Opener-Policy"] = this.config.coop;
    }
    if (this.config.corp) {
      headers["Cross-Origin-Resource-Policy"] = this.config.corp;
    }

    // Server header
    if (this.config.serverHeader) {
      headers["Server"] = this.config.serverHeader;
    }

    return headers;
  }

  /** Returns the security headers object. */
  getHeaders(): Record<string, string> {
    return { ...this.headers };
  }

  /** Applies security headers to a response. */
  apply(res: Response): Response {
    const newHeaders = new Headers(res.headers);

    for (const [key, value] of Object.entries(this.headers)) {
      newHeaders.set(key, value);
    }

    // Remove X-Powered-By if configured
    if (this.config.removePoweredBy) {
      newHeaders.delete("X-Powered-By");
    }

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  }

  /**
   * Creates a middleware function.
   * Usage: `Bun.serve({ fetch: secHeaders.middleware(handler) })`
   */
  middleware(handler: (req: Request) => Response | Promise<Response>) {
    return (req: Request): Response | Promise<Response> => {
      return Promise.resolve(handler(req)).then(res => this.apply(res));
    };
  }

  /** Updates configuration and rebuilds headers. */
  update(config: Partial<SecurityHeadersConfig>): void {
    this.config = { ...this.config, ...config };
    this.headers = this.build();
  }

  /** Returns the HSTS header value. */
  getHSTS(): string {
    return this.headers["Strict-Transport-Security"] ?? "";
  }

  /** Returns the X-Frame-Options header value. */
  getFrameOptions(): string {
    return this.headers["X-Frame-Options"] ?? "";
  }
}

/** Creates a new security headers instance. */
export function createSecurityHeaders(config?: SecurityHeadersConfig): SecurityHeaders {
  return new SecurityHeaders(config);
}

/** Returns a strict security headers configuration. */
export function strictSecurityHeaders(): SecurityHeaders {
  return new SecurityHeaders({
    hstsMaxAge: 31536000,
    hstsIncludeSubdomains: true,
    hstsPreload: true,
    frameOptions: "DENY",
    contentTypeOptions: true,
    referrerPolicy: "no-referrer",
    permissionsPolicy: {
      "camera": [], "microphone": [], "geolocation": [],
      "payment": [], "usb": [], "magnetometer": [],
      "gyroscope": [], "accelerometer": [],
    },
    coep: "require-corp",
    coop: "same-origin",
    corp: "same-origin",
    removePoweredBy: true,
  });
}

/** Returns development-friendly security headers (less strict). */
export function devSecurityHeaders(): SecurityHeaders {
  return new SecurityHeaders({
    hstsMaxAge: 0,
    frameOptions: "SAMEORIGIN",
    contentTypeOptions: true,
    referrerPolicy: "strict-origin-when-cross-origin",
    removePoweredBy: true,
  });
}
