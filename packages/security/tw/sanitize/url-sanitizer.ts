/**
 * URL Sanitizer -- validates and sanitizes URLs to prevent
 * javascript:, data:, and other dangerous protocol attacks.
 *
 * @module security/sanitize/url-sanitizer
 */

/** Safe URL protocols. */
const SAFE_PROTOCOLS = new Set([
  "http:", "https:", "mailto:", "tel:", "ftp:",
]);

/** Protocols safe for image src. */
const IMAGE_SAFE_PROTOCOLS = new Set([
  "http:", "https:", "data:image/", "blob:",
]);

/** Sanitization result. */
export interface UrlSanitizeResult {
  url: string;
  safe: boolean;
  reason: string;
}

/**
 * URL Sanitizer -- validates URLs against allowed protocols
 * and sanitizes them for safe use in HTML attributes.
 */
export class URLSanitizer {
  private allowedProtocols: Set<string>;
  private allowedImageProtocols: Set<string>;
  private stripFragment: boolean;
  private stripQuery: boolean;
  private maxUrlLength: number;

  constructor(options: {
    allowedProtocols?: string[];
    allowedImageProtocols?: string[];
    stripFragment?: boolean;
    stripQuery?: boolean;
    maxUrlLength?: number;
  } = {}) {
    this.allowedProtocols = new Set(options.allowedProtocols ?? Array.from(SAFE_PROTOCOLS));
    this.allowedImageProtocols = new Set(options.allowedImageProtocols ?? Array.from(IMAGE_SAFE_PROTOCOLS));
    this.stripFragment = options.stripFragment ?? false;
    this.stripQuery = options.stripQuery ?? false;
    this.maxUrlLength = options.maxUrlLength ?? 2048;
  }

  /**
   * Sanitizes a URL for general use (href, src, action).
   */
  sanitize(url: string): string {
    const result = this.sanitizeWithReport(url);
    return result.safe ? result.url : "";
  }

  /**
   * Sanitizes a URL and returns a detailed report.
   */
  sanitizeWithReport(url: string): UrlSanitizeResult {
    const trimmed = url.trim();

    if (!trimmed) {
      return { url: "", safe: true, reason: "Empty URL" };
    }

    if (trimmed.length > this.maxUrlLength) {
      return { url: "", safe: false, reason: "URL exceeds maximum length" };
    }

    // Check for protocol-relative URLs
    if (trimmed.startsWith("//")) {
      return { url: `https:${trimmed}`, safe: true, reason: "Protocol-relative URL upgraded to HTTPS" };
    }

    // Check for relative URLs
    if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("?") ||
        trimmed.startsWith("./") || trimmed.startsWith("../")) {
      return { url: trimmed, safe: true, reason: "Relative URL" };
    }

    // Check for data: URLs (only safe for images)
    if (trimmed.toLowerCase().startsWith("data:")) {
      if (this.allowedImageProtocols.has("data:image/") &&
          trimmed.toLowerCase().startsWith("data:image/")) {
        return { url: trimmed, safe: true, reason: "Data image URL" };
      }
      return { url: "", safe: false, reason: "Data URL not allowed" };
    }

    // Check for blob: URLs
    if (trimmed.toLowerCase().startsWith("blob:")) {
      if (this.allowedImageProtocols.has("blob:")) {
        return { url: trimmed, safe: true, reason: "Blob URL" };
      }
      return { url: "", safe: false, reason: "Blob URL not allowed" };
    }

    // Check for javascript: URLs
    if (trimmed.toLowerCase().startsWith("javascript:")) {
      return { url: "", safe: false, reason: "JavaScript protocol blocked" };
    }

    // Check for vbscript: URLs
    if (trimmed.toLowerCase().startsWith("vbscript:")) {
      return { url: "", safe: false, reason: "VBScript protocol blocked" };
    }

    // Parse the URL
    try {
      const parsed = new URL(trimmed);

      if (!this.allowedProtocols.has(parsed.protocol)) {
        return { url: "", safe: false, reason: `Protocol '${parsed.protocol}' not allowed` };
      }

      let result = trimmed;

      // Strip fragment if configured
      if (this.stripFragment && parsed.hash) {
        parsed.hash = "";
        result = parsed.toString();
      }

      // Strip query if configured
      if (this.stripQuery && parsed.search) {
        parsed.search = "";
        result = parsed.toString();
      }

      return { url: result, safe: true, reason: "Valid URL" };
    } catch {
      // Not a valid URL -- treat as relative
      return { url: trimmed, safe: true, reason: "Treated as relative URL" };
    }
  }

  /**
   * Sanitizes a URL specifically for use in an <img src> attribute.
   */
  sanitizeImageSrc(url: string): string {
    const result = this.sanitizeWithReport(url);
    if (!result.safe) return "";

    // Additional check for image-specific protocols
    const lower = result.url.toLowerCase();
    if (lower.startsWith("data:") && !lower.startsWith("data:image/")) {
      return "";
    }

    return result.url;
  }

  /**
   * Checks if a URL is safe without sanitizing.
   */
  isSafe(url: string): boolean {
    return this.sanitizeWithReport(url).safe;
  }

  /** Sanitizes a list of URLs. */
  sanitizeAll(urls: string[]): string[] {
    return urls.map(u => this.sanitize(u)).filter(u => u.length > 0);
  }
}

/** Creates a new URL sanitizer. */
export function createURLSanitizer(options?: ConstructorParameters<typeof URLSanitizer>[0]): URLSanitizer {
  return new URLSanitizer(options);
}
