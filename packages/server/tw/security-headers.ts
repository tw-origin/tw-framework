/**
 * Security Headers -- HTTP security headers middleware.
 *
 * Automatically adds security headers to all responses:
 * - Content-Security-Policy (CSP)
 * - Strict-Transport-Security (HSTS)
 * - X-Content-Type-Options
 * - X-Frame-Options
 * - Referrer-Policy
 * - Permissions-Policy
 * - Cross-Origin policies
 * - X-DNS-Prefetch-Control
 *
 * Also supports nonce generation for CSP.
 */

import { createHash } from "node:crypto";

// --- Types ------------------------------------------------------------

export interface SecurityHeadersOptions {
  /** CSP directives */
  csp?: CSPDirectives;
  /** Enable HSTS (HTTPS only) */
  hsts?: boolean | HSTSOptions;
  /** X-Frame-Options */
  frameOptions?: "DENY" | "SAMEORIGIN" | false;
  /** X-Content-Type-Options */
  contentTypeOptions?: boolean;
  /** Referrer-Policy */
  referrerPolicy?: ReferrerPolicy;
  /** Permissions-Policy */
  permissionsPolicy?: Record<string, string[]>;
  /** Cross-Origin Embedder Policy */
  coep?: "unsafe-none" | "require-corp" | "credentialless";
  /** Cross-Origin Opener Policy */
  coop?: "unsafe-none" | "same-origin-allow-popups" | "same-origin";
  /** Cross-Origin Resource Policy */
  corp?: "same-site" | "same-origin" | "cross-origin";
  /** X-DNS-Prefetch-Control */
  dnsPrefetchControl?: boolean;
}

interface HSTSOptions {
  maxAge: number;
  includeSubDomains?: boolean;
  preload?: boolean;
}

type ReferrerPolicy =
  | "no-referrer"
  | "no-referrer-when-downgrade"
  | "same-origin"
  | "origin"
  | "strict-origin"
  | "origin-when-cross-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url";

interface CSPDirectives {
  "default-src"?: string[];
  "script-src"?: string[];
  "style-src"?: string[];
  "img-src"?: string[];
  "font-src"?: string[];
  "connect-src"?: string[];
  "media-src"?: string[];
  "frame-src"?: string[];
  "object-src"?: string[];
  "manifest-src"?: string[];
  "worker-src"?: string[];
  "base-uri"?: string[];
  "form-action"?: string[];
  "frame-ancestors"?: string[];
  "navigate-to"?: string[];
  "report-uri"?: string;
  "report-to"?: string;
  "upgrade-insecure-requests"?: boolean;
  "block-all-mixed-content"?: boolean;
}

// --- Defaults --------------------------------------------------------

const DEFAULT_CSP: CSPDirectives = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "media-src": ["'self'"],
  "frame-src": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "upgrade-insecure-requests": true,
};

const DEFAULT_OPTIONS: Required<SecurityHeadersOptions> = {
  csp: DEFAULT_CSP,
  hsts: false,
  frameOptions: "SAMEORIGIN",
  contentTypeOptions: true,
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    "payment": [],
  },
  coep: "unsafe-none",
  coop: "unsafe-none",
  corp: "same-origin",
  dnsPrefetchControl: false,
};

// --- Nonce Generation ------------------------------------------------

let nonceCounter = 0;

/**
 * Generate a cryptographically random nonce for CSP.
 */
export function generateNonce(length: number = 32): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback to node:crypto
    const hash = createHash("sha256");
    hash.update(`${Date.now()}-${nonceCounter++}-${Math.random()}`);
    return hash.digest("base64");
  }
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Generate a nonce and add it to CSP script-src.
 */
export function generateNonceForCSP(csp: CSPDirectives): { nonce: string; csp: CSPDirectives } {
  const nonce = generateNonce();
  const updatedCSP: CSPDirectives = {
    ...csp,
    "script-src": [...(csp["script-src"] || []), `'nonce-${nonce}'`],
  };
  return { nonce, csp: updatedCSP };
}

// --- Header Generation -----------------------------------------------

/**
 * Build a CSP header string from directives.
 */
export function buildCSPHeader(directives: CSPDirectives): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(directives)) {
    if (typeof value === "boolean") {
      if (value) parts.push(key);
    } else if (Array.isArray(value)) {
      if (value.length > 0) {
        parts.push(`${key} ${value.join(" ")}`);
      }
    } else if (typeof value === "string") {
      parts.push(`${key} ${value}`);
    }
  }

  return parts.join("; ");
}

/**
 * Build HSTS header.
 */
export function buildHSTSHeader(options: HSTSOptions): string {
  const parts = [`max-age=${options.maxAge}`];
  if (options.includeSubDomains) parts.push("includeSubDomains");
  if (options.preload) parts.push("preload");
  return parts.join("; ");
}

/**
 * Build Permissions-Policy header.
 */
export function buildPermissionsPolicyHeader(policies: Record<string, string[]>): string {
  return Object.entries(policies)
    .map(([feature, origins]) => {
      if (origins.length === 0) return `${feature}=()`;
      return `${feature}=(${origins.join(" ")})`;
    })
    .join(", ");
}

/**
 * Generate all security headers from options.
 */
export function generateSecurityHeaders(options: SecurityHeadersOptions = {}): Record<string, string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const headers: Record<string, string> = {};

  // CSP
  if (opts.csp) {
    headers["Content-Security-Policy"] = buildCSPHeader(opts.csp);
    // Round 4: the client hydration runtime (islands, event handlers)
    // compiles expressions with `new Function`, which needs
    // 'unsafe-eval' in script-src. A configured CSP without it breaks
    // every interactive page -- warn once instead of failing silently.
    try {
      const scriptSrc = Array.isArray((opts.csp as any)["script-src"])
        ? (opts.csp as any)["script-src"].join(" ")
        : String((opts.csp as any)["script-src"] ?? "");
      if (scriptSrc && !scriptSrc.includes("'unsafe-eval'") && !scriptSrc.includes("'strict-dynamic'")) {
        console.warn("[tw] security: configured CSP has no 'unsafe-eval' in script-src -- the island hydration runtime needs it (add script-src: ['self', ''unsafe-eval''] or migrate handlers).");
      }
    } catch { /* advisory only */ }
  }

  // HSTS
  if (opts.hsts) {
    const hstsOpts = typeof opts.hsts === "object"
      ? opts.hsts
      : { maxAge: 31536000, includeSubDomains: true };
    headers["Strict-Transport-Security"] = buildHSTSHeader(hstsOpts);
  }

  // X-Frame-Options
  if (opts.frameOptions) {
    headers["X-Frame-Options"] = opts.frameOptions;
  }

  // X-Content-Type-Options
  if (opts.contentTypeOptions) {
    headers["X-Content-Type-Options"] = "nosniff";
  }

  // Referrer-Policy
  if (opts.referrerPolicy) {
    headers["Referrer-Policy"] = opts.referrerPolicy;
  }

  // Permissions-Policy
  if (opts.permissionsPolicy) {
    headers["Permissions-Policy"] = buildPermissionsPolicyHeader(opts.permissionsPolicy);
  }

  // Cross-Origin policies
  if (opts.coep && opts.coep !== "unsafe-none") {
    headers["Cross-Origin-Embedder-Policy"] = opts.coep;
  }
  if (opts.coop && opts.coop !== "unsafe-none") {
    headers["Cross-Origin-Opener-Policy"] = opts.coop;
  }
  if (opts.corp) {
    headers["Cross-Origin-Resource-Policy"] = opts.corp;
  }

  // X-DNS-Prefetch-Control
  if (opts.dnsPrefetchControl) {
    headers["X-DNS-Prefetch-Control"] = "off";
  }

  return headers;
}

/**
 * Middleware that adds security headers to all responses.
 */
export function securityHeadersMiddleware(options: SecurityHeadersOptions = {}) {
  const headers = generateSecurityHeaders(options);

  return (req: unknown, res: { headers: Record<string, string> }, next: () => void) => {
    for (const [key, value] of Object.entries(headers)) {
      res.headers[key] = value;
    }
    next();
  };
}

/**
 * Create a development CSP that allows unsafe-inline and localhost.
 */
export function createDevCSP(): CSPDirectives {
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "http://localhost:*", "ws://localhost:*"],
    "font-src": ["'self'", "data:", "http://localhost:*"],
    "connect-src": ["'self'", "http://localhost:*", "ws://localhost:*"],
    "media-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
}

/**
 * Create a production CSP with strict security.
 */
export function createProdCSP(): CSPDirectives {
  return {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "media-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "upgrade-insecure-requests": true,
    "block-all-mixed-content": true,
  };
}
