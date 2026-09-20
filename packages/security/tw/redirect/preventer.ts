/**
 * Open Redirect Preventer -- prevents open redirect vulnerabilities
 * by validating redirect URLs against an allowlist.
 *
 * @module security/redirect/preventer
 */

/** Redirect validation result. */
export interface RedirectResult {
  allowed: boolean;
  reason: string;
  safeUrl: string;
  risk: "none" | "low" | "medium" | "high" | "critical";
}

/** Configuration for redirect prevention. */
export interface RedirectConfig {
  /** Allowed origins for redirects. */
  allowedOrigins?: string[];
  /** Whether to allow relative redirects. */
  allowRelative?: boolean;
  /** Whether to allow same-origin redirects. */
  allowSameOrigin?: boolean;
  /** Whether to allow protocol-relative URLs (//example.com). */
  allowProtocolRelative?: boolean;
  /** Blocked patterns (regex strings). */
  blockedPatterns?: string[];
  /** Whether to strip fragments. */
  stripFragment?: boolean;
  /** Default safe redirect URL. */
  defaultRedirect?: string;
}

/** Dangerous redirect patterns. */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /javascript:/i, name: "javascript: protocol" },
  { pattern: /data:/i, name: "data: protocol" },
  { pattern: /vbscript:/i, name: "vbscript: protocol" },
  { pattern: /file:/i, name: "file: protocol" },
  { pattern: /\/\/\s*[a-z]/i, name: "Protocol-relative URL" },
  { pattern: /\\u[0-9a-f]{4}/i, name: "Unicode escape" },
  { pattern: /\\x[0-9a-f]{2}/i, name: "Hex escape" },
  { pattern: /%2f%2f/i, name: "Double-encoded //" },
  { pattern: /\t|\n|\r/, name: "Whitespace in URL" },
];

/**
 * Open Redirect Preventer -- validates redirect URLs to prevent
 * open redirect attacks.
 */
export class RedirectPreventer {
  private allowedOrigins: Set<string>;
  private allowRelative: boolean;
  private allowSameOrigin: boolean;
  private allowProtocolRelative: boolean;
  private blockedPatterns: RegExp[];
  private stripFragment: boolean;
  private defaultRedirect: string;

  constructor(config: RedirectConfig = {}) {
    this.allowedOrigins = new Set(config.allowedOrigins ?? []);
    this.allowRelative = config.allowRelative ?? true;
    this.allowSameOrigin = config.allowSameOrigin ?? true;
    this.allowProtocolRelative = config.allowProtocolRelative ?? false;
    this.blockedPatterns = (config.blockedPatterns ?? []).map(p => new RegExp(p, "i"));
    this.stripFragment = config.stripFragment ?? false;
    this.defaultRedirect = config.defaultRedirect ?? "/";
  }

  /** Validates a redirect URL. */
  validate(url: string, requestOrigin?: string): RedirectResult {
    const trimmed = url.trim();

    if (!trimmed) {
      return {
        allowed: true,
        reason: "Empty redirect -- using default",
        safeUrl: this.defaultRedirect,
        risk: "none",
      };
    }

    // Check dangerous patterns
    for (const { pattern, name } of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          allowed: false,
          reason: `Dangerous pattern detected: ${name}`,
          safeUrl: this.defaultRedirect,
          risk: "critical",
        };
      }
    }

    // Check custom blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(trimmed)) {
        return {
          allowed: false,
          reason: `URL matches blocked pattern`,
          safeUrl: this.defaultRedirect,
          risk: "high",
        };
      }
    }

    // Check for relative URLs.
    // WHATWG URL treats `\` like `/` for special schemes, so ` /\\evil.com`
    // resolves to https://evil.com/ in a browser -- a leading slash followed
    // by a backslash is as dangerous as `//` and must not pass as relative.
    const startsWithBackslashPair = trimmed.startsWith("/\\") || trimmed.startsWith("\\\\");
    if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !startsWithBackslashPair) {
      if (this.allowRelative) {
        let safeUrl = trimmed;
        if (this.stripFragment) {
          safeUrl = safeUrl.split("#")[0];
        }
        return {
          allowed: true,
          reason: "Relative redirect allowed",
          safeUrl,
          risk: "none",
        };
      }
      return {
        allowed: false,
        reason: "Relative redirects not allowed",
        safeUrl: this.defaultRedirect,
        risk: "medium",
      };
    }

    // Check for protocol-relative URLs. WHATWG URL treats `\` like `/` for
    // special schemes, so `/\evil.com` and `\\evil.com` are exactly as
    // dangerous as `//evil.com` and must hit the same rule.
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("/\\") ||
      trimmed.startsWith("\\\\")
    ) {
      if (!this.allowProtocolRelative) {
        return {
          allowed: false,
          reason: "Protocol-relative URLs not allowed",
          safeUrl: this.defaultRedirect,
          risk: "high",
        };
      }
    }

    // Parse the URL
    let parsed: URL;
    try {
      parsed = new URL(trimmed, requestOrigin ?? "https://example.com");
    } catch {
      return {
        allowed: false,
        reason: "Invalid URL",
        safeUrl: this.defaultRedirect,
        risk: "medium",
      };
    }

    // Check protocol
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        allowed: false,
        reason: `Protocol '${parsed.protocol}' not allowed for redirects`,
        safeUrl: this.defaultRedirect,
        risk: "high",
      };
    }

    // Check same-origin
    if (requestOrigin) {
      try {
        const requestUrl = new URL(requestOrigin);
        if (parsed.origin === requestUrl.origin) {
          if (this.allowSameOrigin) {
            return {
              allowed: true,
              reason: "Same-origin redirect allowed",
              safeUrl: parsed.toString(),
              risk: "none",
            };
          }
          return {
            allowed: false,
            reason: "Same-origin redirects not allowed",
            safeUrl: this.defaultRedirect,
            risk: "medium",
          };
        }
      } catch {
        // Ignore invalid request origin
      }
    }

    // Check allowed origins
    if (this.allowedOrigins.size > 0) {
      if (this.allowedOrigins.has(parsed.origin)) {
        return {
          allowed: true,
          reason: "Redirect to allowed origin",
          safeUrl: parsed.toString(),
          risk: "low",
        };
      }
      return {
        allowed: false,
        reason: `Redirect to '${parsed.origin}' not in allowed list`,
        safeUrl: this.defaultRedirect,
        risk: "high",
      };
    }

    // No allowlist and not same-origin -- block by default
    return {
      allowed: false,
      reason: "External redirect not allowed without allowlist",
      safeUrl: this.defaultRedirect,
      risk: "high",
    };
  }

  /** Returns a safe redirect URL (always returns a valid URL). */
  getSafeUrl(url: string, requestOrigin?: string): string {
    return this.validate(url, requestOrigin).safeUrl;
  }

  /** Adds an allowed origin. */
  addAllowedOrigin(origin: string): void {
    this.allowedOrigins.add(origin);
  }

  /** Removes an allowed origin. */
  removeAllowedOrigin(origin: string): void {
    this.allowedOrigins.delete(origin);
  }
}

/** Creates a new redirect preventer. */
export function createRedirectPreventer(config?: RedirectConfig): RedirectPreventer {
  return new RedirectPreventer(config);
}
