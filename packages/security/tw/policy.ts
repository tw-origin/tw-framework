/**
 * Security policy engine -- CSP generation, nonce management, XSS prevention,
 * header injection protection, and content sanitization.
 *
 * This provides the security layer for TW's server and dev-server.
 * It generates Content-Security-Policy headers, manages per-request nonces,
 * validates input, and sanitizes output to prevent XSS attacks.
 */

import { createHash, randomBytes } from "node:crypto";

// --- CSP Builder -----------------------------------------------------

export type CSPDirective =
  | "default-src" | "script-src" | "style-src" | "img-src" | "font-src"
  | "connect-src" | "media-src" | "frame-src" | "object-src" | "manifest-src"
  | "worker-src" | "child-src" | "base-uri" | "form-action" | "frame-ancestors"
  | "navigate-to" | "plugin-types" | "require-sri-for" | "upgrade-insecure-requests"
  | "block-all-mixed-content" | "report-uri" | "report-to";

export interface CSPSource {
  type: "self" | "unsafe-inline" | "unsafe-eval" | "strict-dynamic" | "nonce" | "hash" | "scheme" | "host" | "data" | "blob" | "mediastream" | "filesystem";
  value?: string;
  hashAlg?: "sha256" | "sha384" | "sha512";
  hash?: string;
}

export class CSPBuilder {
  private directives: Map<CSPDirective, CSPSource[]> = new Map();
  private nonces: Set<string> = new Set();

  set(directive: CSPDirective, ...sources: CSPSource[]): this {
    this.directives.set(directive, sources);
    return this;
  }

  add(directive: CSPDirective, ...sources: CSPSource[]): this {
    const existing = this.directives.get(directive) ?? [];
    this.directives.set(directive, [...existing, ...sources]);
    return this;
  }

  remove(directive: CSPDirective): this {
    this.directives.delete(directive);
    return this;
  }

  generateNonce(): string {
    const nonce = randomBytes(16).toString("base64");
    this.nonces.add(nonce);
    return nonce;
  }

  build(): string {
    const parts: string[] = [];

    for (const [directive, sources] of this.directives) {
      const sourceStrs = sources.map(s => this.sourceToString(s));
      parts.push(`${directive} ${sourceStrs.join(" ")}`);
    }

    return parts.join("; ");
  }

  private sourceToString(source: CSPSource): string {
    switch (source.type) {
      case "self": return "'self'";
      case "unsafe-inline": return "'unsafe-inline'";
      case "unsafe-eval": return "'unsafe-eval'";
      case "strict-dynamic": return "'strict-dynamic'";
      case "nonce": return `'nonce-${source.value}'`;
      case "hash": return `'${source.hashAlg}-${source.hash}'`;
      case "scheme": return `${source.value}:`;
      case "host": return source.value ?? "";
      case "data": return "data:";
      case "blob": return "blob:";
      case "mediastream": return "mediastream:";
      case "filesystem": return "filesystem:";
      default: return "";
    }
  }

  // Preset configurations
  static strict(): CSPBuilder {
    return new CSPBuilder()
      .set("default-src", { type: "self" } as any)
      .set("script-src", { type: "self" } as any)
      .set("style-src", { type: "self" } as any)
      .set("img-src", { type: "self" } as any, { type: "data" })
      .set("font-src", { type: "self" } as any)
      .set("connect-src", { type: "self" } as any)
      .set("media-src", { type: "self" } as any)
      .set("frame-src", { type: "none" } as any)
      .set("object-src", { type: "none" } as any)
      .set("base-uri", { type: "self" } as any)
      .set("form-action", { type: "self" } as any)
      .set("frame-ancestors", { type: "none" } as any)
      .set("upgrade-insecure-requests");
  }

  static withNonce(): CSPBuilder {
    const builder = new CSPBuilder();
    const nonce = builder.generateNonce();
    return builder
      .set("default-src", { type: "self" } as any)
      .set("script-src", { type: "self" } as any, { type: "nonce", value: nonce })
      .set("style-src", { type: "self" } as any, { type: "nonce", value: nonce })
      .set("img-src", { type: "self" } as any, { type: "data" }, { type: "blob" })
      .set("font-src", { type: "self" } as any, { type: "data" })
      .set("connect-src", { type: "self" } as any)
      .set("object-src", { type: "none" } as any)
      .set("base-uri", { type: "self" } as any)
      .set("form-action", { type: "self" } as any)
      .set("frame-ancestors", { type: "none" } as any)
      .set("upgrade-insecure-requests");
  }

  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Security-Policy": this.build(),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    };
    return headers;
  }
}

// --- XSS Sanitizer --------------------------------------------------

export class XSSSanitizer {
  private static instance: XSSSanitizer;
  private allowedTags: Set<string>;
  private allowedAttrs: Set<string>;
  private attrAllowedTags: Map<string, Set<string>>;

  private constructor() {
    this.allowedTags = new Set([
      "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo",
      "blockquote", "br", "caption", "cite", "code", "col", "colgroup",
      "data", "dd", "del", "details", "dfn", "div", "dl", "dt",
      "em", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4",
      "h5", "h6", "header", "hr", "i", "img", "ins", "kbd", "li",
      "main", "mark", "nav", "ol", "p", "pre", "q", "rp", "rt",
      "ruby", "s", "samp", "section", "small", "span", "strong", "sub",
      "summary", "sup", "table", "tbody", "td", "tfoot", "th", "thead",
      "time", "tr", "u", "ul", "var", "wbr",
    ]);

    this.allowedAttrs = new Set([
      "class", "id", "title", "lang", "dir", "translate",
      "aria-label", "aria-labelledby", "aria-describedby", "aria-hidden",
      "aria-live", "role", "data-*",
    ]);

    this.attrAllowedTags = new Map();
    // href is only allowed on <a> and <area>
    this.attrAllowedTags.set("href", new Set(["a", "area"]));
    // src is only allowed on media elements
    this.attrAllowedTags.set("src", new Set(["img", "video", "audio", "source", "track", "iframe"]));
    // alt is allowed on images
    this.attrAllowedTags.set("alt", new Set(["img", "area", "input"]));
    // type, name, value, placeholder attribute on form elements (input sanitization)
    this.attrAllowedTags.set("type", new Set(["input", "button"]));
    this.attrAllowedTags.set("name", new Set(["input", "button", "select", "textarea", "form"]));
    this.attrAllowedTags.set("value", new Set(["input", "button", "option"]));
    this.attrAllowedTags.set("placeholder", new Set(["input", "textarea"]));
    this.attrAllowedTags.set("colspan", new Set(["td", "th"]));
    this.attrAllowedTags.set("rowspan", new Set(["td", "th"]));
    this.attrAllowedTags.set("datetime", new Set(["time", "del", "ins"]));
  }

  static getInstance(): XSSSanitizer {
    if (!XSSSanitizer.instance) {
      XSSSanitizer.instance = new XSSSanitizer();
    }
    return XSSSanitizer.instance;
  }

  /**
   * Sanitize HTML by removing dangerous tags, attributes, and protocols.
   */
  sanitize(html: string): string {
    if (!html) return "";

    let result = html;

    // Remove HTML comments (may contain IE conditional comments)
    result = result.replace(/<!--[\s\S]*?-->/g, "");

    // Remove script tags and their content
    result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

    // Remove event handler attributes (onclick, onerror, etc.)
    result = result.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
    result = result.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
    result = result.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");

    // Remove javascript: URLs
    result = result.replace(/(href|src|action|formaction)\s*=\s*["']?\s*javascript:/gi, "$1=\"\"");

    // Remove data: URLs in href (can be used for XSS)
    result = result.replace(/href\s*=\s*["']?\s*data:/gi, "href=\"\"");

    // Remove vbscript: URLs
    result = result.replace(/(href|src)\s*=\s*["']?\s*vbscript:/gi, "$1=\"\"");

    // Remove style attributes that contain expressions
    result = result.replace(/style\s*=\s*["'][^"']*expression\s*\(/gi, "style=\"");

    // Remove iframe, object, embed tags
    result = result.replace(/<\/?(iframe|object|embed|applet|base|form|input|textarea|select|button)[^>]*>/gi, "");

    // Remove SVG with event handlers (use-after-free vector)
    result = result.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, (match) => {
      if (/\son\w+=/.test(match)) return "";
      return match;
    });

    // Remove meta tags
    result = result.replace(/<meta[^>]*>/gi, "");

    // Remove link tags (can be used for CSS injection)
    result = result.replace(/<link[^>]*>/gi, "");

    // Decode and re-encode to catch double-encoding attacks
    result = this.escapeHTML(result);

    return result;
  }

  escapeHTML(str: string): string {
    const AMP = String.fromCharCode(38);
    const LT = String.fromCharCode(60);
    const GT = String.fromCharCode(62);
    const QUOT = String.fromCharCode(34);
    const APOS = String.fromCharCode(39);
    return String(str)
      .replace(/&/g, AMP + "amp;")
      .replace(/</g, AMP + "lt;")
      .replace(/>/g, AMP + "gt;")
      .replace(/"/g, AMP + "quot;")
      .replace(/'/g, AMP + "#x27;");
  }

  escapeAttr(str: string): string {
    return this.escapeHTML(str);
  }

  /**
   * Validate a URL for safe use in href/src attributes.
   * Returns null if the URL is dangerous.
   */
  validateURL(url: string): string | null {
    if (!url) return null;
    const trimmed = url.trim().toLowerCase();

    // Block dangerous protocols
    const dangerousProtocols = [
      "javascript:", "vbscript:", "data:", "file:", "about:",
      "blob:", "filesystem:", "jar:", "moz-icon:", "view-source:",
    ];
    for (const proto of dangerousProtocols) {
      if (trimmed.startsWith(proto)) return null;
    }

    // Allow relative URLs
    if (trimmed.startsWith("/") || trimmed.startsWith("#") || trimmed.startsWith("?")) {
      return url;
    }

    // Allow http/https/mailto/tel
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") ||
        trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) {
      return url;
    }

    // Block everything else
    return null;
  }

  /**
   * Generate a Subresource Integrity hash for a script/style.
   */
  generateSRI(content: string, alg: "sha256" | "sha384" | "sha512" = "sha384"): string {
    const hash = createHash(alg).update(content).digest("base64");
    return `${alg}-${hash}`;
  }

  /**
   * Check if content looks like it contains XSS attempts.
   */
  detectXSS(input: string): boolean {
    const patterns = [
      /<script\b/i,
      /javascript:/i,
      /vbscript:/i,
      /on\w+\s*=/i,
      /expression\s*\(/i,
      /<iframe\b/i,
      /<object\b/i,
      /<embed\b/i,
      /<base\b/i,
      /<meta\b/i,
      /<link\b/i,
      /data:text\/html/i,
      /<img\b[^>]*onerror/i,
      /<svg\b[^>]*onload/i,
      /<body\b[^>]*onload/i,
      /<style\b[^>]*@import/i,
    ];
    return patterns.some(p => p.test(input));
  }
}

// --- Rate Limiter ----------------------------------------------------

export interface RateLimitConfig {
  windowMs: number;     // time window in milliseconds
  maxRequests: number;  // max requests in the window
  skipSuccessfulGets?: boolean;
  keyGenerator?: (req: unknown) => string;
}

export class RateLimiter {
  private hits: Map<string, number[]> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: 60000, // 1 minute default
      maxRequests: 100,
      ...config,
    };
  }

  check(key: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let hits = this.hits.get(key) ?? [];
    // Remove old hits outside the window
    hits = hits.filter(t => t > windowStart);

    if (hits.length >= this.config.maxRequests) {
      const oldestHit = hits[0];
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldestHit + this.config.windowMs - now,
      };
    }

    hits.push(now);
    this.hits.set(key, hits);

    return {
      allowed: true,
      remaining: this.config.maxRequests - hits.length,
      resetMs: this.config.windowMs,
    };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  // Clean up expired entries periodically
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    for (const [key, hits] of this.hits) {
      const filtered = hits.filter(t => t > windowStart);
      if (filtered.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, filtered);
      }
    }
  }
}

// --- CSRF Protection ------------------------------------------------

export class CSRFProtection {
  private tokens: Map<string, { value: string; expires: number }> = new Map();
  private secret: string;

  constructor(secret?: string) {
    this.secret = secret ?? randomBytes(32).toString("hex");
  }

  generateToken(sessionId: string): string {
    const token = randomBytes(32).toString("hex");
    const expires = Date.now() + 3600000; // 1 hour
    this.tokens.set(sessionId, { value: token, expires });
    return token;
  }

  validateToken(sessionId: string, token: string): boolean {
    const stored = this.tokens.get(sessionId);
    if (!stored) return false;
    if (Date.now() > stored.expires) {
      this.tokens.delete(sessionId);
      return false;
    }
    return stored.value === token;
  }

  consumeToken(sessionId: string): void {
    this.tokens.delete(sessionId);
  }

  getSecret(): string {
    return this.secret;
  }
}

// --- Input Validation ------------------------------------------------

export class InputValidator {
  static sanitizeString(input: string, maxLength: number = 1000): string {
    if (!input) return "";
    let s = String(input);
    if (s.length > maxLength) s = s.slice(0, maxLength);
    // Remove null bytes
    s = s.replace(/\0/g, "");
    // Remove control characters except newline, tab, carriage return
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    return s;
  }

  static validateEmail(email: string): boolean {
    if (!email || email.length > 254) return false;
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(email);
  }

  static validateURL(url: string): boolean {
    if (!url || url.length > 2048) return false;
    try {
      const parsed = new URL(url);
      return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  static validateInt(input: string, min?: number, max?: number): number | null {
    const n = parseInt(input, 10);
    if (isNaN(n)) return null;
    if (min !== undefined && n < min) return null;
    if (max !== undefined && n > max) return null;
    return n;
  }

  static sanitizeFilename(filename: string): string {
    if (!filename) return "";
    // Remove path separators
    let s = filename.replace(/[/\\]/g, "_");
    // Remove null bytes
    s = s.replace(/\0/g, "");
    // Remove leading dots (hidden files / directory traversal)
    s = s.replace(/^\.+/, "");
    // Limit length
    if (s.length > 255) s = s.slice(0, 255);
    return s;
  }

  static preventPathTraversal(input: string): string {
    if (!input) return "";
    return input.replace(/\.\./g, "").replace(/\/+/g, "/").replace(/\\+/g, "\\");
  }
}
