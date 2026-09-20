/**
 * HTML Sanitizer -- a context-aware HTML sanitizer that removes
 * dangerous elements and attributes while preserving safe content.
 *
 * Uses an allowlist approach: only known-safe tags, attributes,
 * and protocols are kept. Everything else is stripped.
 *
 * Supports: tag filtering, attribute filtering, protocol validation,
 * CSS sanitization, URL sanitization, and script/style removal.
 *
 * @module security/sanitize/html-sanitizer
 */

/** Allowed HTML tags. */
const ALLOWED_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo",
  "blockquote", "br", "caption", "cite", "code", "col", "colgroup",
  "data", "dd", "del", "details", "dfn", "div", "dl", "dt",
  "em", "figcaption", "figure", "footer", "h1", "h2", "h3",
  "h4", "h5", "h6", "header", "hr", "i", "img", "ins",
  "kbd", "li", "main", "mark", "nav", "ol", "p", "pre",
  "q", "rp", "rt", "ruby", "s", "samp", "section", "small",
  "span", "strong", "sub", "summary", "sup", "table", "tbody",
  "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
]);

/** Allowed attributes per tag (global attributes allowed on all). */
const GLOBAL_ATTRIBUTES = new Set([
  "class", "id", "title", "lang", "dir", "tabindex",
  "role", "aria-label", "aria-labelledby", "aria-describedby",
  "aria-hidden", "aria-live", "aria-expanded", "aria-controls",
  "data-tw", "data-id",
]);

/** Tag-specific allowed attributes. */
const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "name", "target", "rel", "download", "type"]),
  img: new Set(["src", "alt", "width", "height", "loading", "srcset", "sizes"]),
  table: new Set(["summary", "width"]),
  td: new Set(["colspan", "rowspan", "headers", "scope", "abbr"]),
  th: new Set(["colspan", "rowspan", "headers", "scope", "abbr"]),
  col: new Set(["span", "width"]),
  colgroup: new Set(["span", "width"]),
  time: new Set(["datetime"]),
  details: new Set(["open"]),
  del: new Set(["cite", "datetime"]),
  ins: new Set(["cite", "datetime"]),
  blockquote: new Set(["cite"]),
  q: new Set(["cite"]),
  data: new Set(["value"]),
  ol: new Set(["reversed", "start", "type"]),
  ul: new Set(["type"]),
  li: new Set(["value"]),
  input: new Set(["type", "name", "value", "checked", "disabled", "readonly", "placeholder", "required", "min", "max", "step", "pattern", "autocomplete"]),
  label: new Set(["for"]),
  textarea: new Set(["name", "rows", "cols", "placeholder", "required", "disabled", "readonly"]),
  select: new Set(["name", "required", "disabled"]),
  option: new Set(["value", "selected", "disabled", "label"]),
  optgroup: new Set(["label", "disabled"]),
  button: new Set(["type", "name", "value", "disabled"]),
  form: new Set(["action", "method", "enctype", "novalidate", "autocomplete"]),
  fieldset: new Set(["disabled", "form"]),
  meter: new Set(["value", "min", "max", "low", "high", "optimum"]),
  progress: new Set(["value", "max"]),
};

/** Allowed URL protocols. */
const ALLOWED_PROTOCOLS = new Set([
  "http:", "https:", "mailto:", "tel:", "ftp:", "data:", "blob:", "ws:", "wss:",
]);

/** Dangerous tags that should be completely removed (including content). */
const DANGEROUS_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "applet",
  "meta", "link", "base", "form", "noscript",
]);

/** Attributes that can contain URLs (need protocol validation). */
const URL_ATTRIBUTES = new Set([
  "href", "src", "action", "cite", "data", "poster", "background",
  "srcset", "longdesc", "usemap", "formaction",
]);

/** CSS properties that are allowed. */
const ALLOWED_CSS_PROPS = new Set([
  "color", "background-color", "border", "border-color", "border-width",
  "border-style", "border-radius", "margin", "padding", "width", "height",
  "max-width", "max-height", "min-width", "min-height",
  "font-size", "font-weight", "font-family", "font-style",
  "text-align", "text-decoration", "text-transform", "text-indent",
  "line-height", "letter-spacing", "word-spacing",
  "display", "position", "top", "right", "bottom", "left",
  "z-index", "overflow", "visibility", "opacity",
  "flex", "flex-direction", "flex-wrap", "flex-grow", "flex-shrink",
  "justify-content", "align-items", "align-self", "align-content",
  "grid", "grid-template-columns", "grid-template-rows", "grid-gap",
  "gap", "box-shadow", "box-sizing", "cursor",
]);

/** Sanitization configuration. */
export interface SanitizerConfig {
  /** Additional allowed tags. */
  allowedTags?: string[];
  /** Tags to remove (overrides allowed). */
  removedTags?: string[];
  /** Additional allowed attributes. */
  allowedAttributes?: string[];
  /** Additional allowed protocols. */
  allowedProtocols?: string[];
  /** Whether to allow `style` attributes (sanitized). */
  allowStyleAttributes?: boolean;
  /** Whether to allow comments. */
  allowComments?: boolean;
  /** Whether to allow data: URLs in img src. */
  allowDataImages?: boolean;
  /** Maximum nesting depth. */
  maxDepth?: number;
  /** Custom attribute filter. */
  attributeFilter?: (tag: string, attr: string, value: string) => boolean;
}

/** Result of sanitization. */
export interface SanitizeResult {
  html: string;
  removedTags: string[];
  removedAttributes: string[];
  warnings: string[];
}

/** Escapes HTML special characters. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Unescapes HTML entities. */
export function unescapeHtml(str: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    '&quot;': '"',
    "&#x27;": "'",
    "&#39;": "'",
    "&#47;": "/",
    "&sol;": "/",
    "&#96;": "`",
    "&grave;": "`",
    "&#61;": "=",
    "&equals;": "=",
  };
  return str.replace(/&[a-z#0-9]+;/gi, (m) => entities[m] ?? m);
}

/** Validates a URL's protocol. */
function isValidUrl(url: string, allowedProtocols: Set<string>, allowDataImages: boolean): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true; // Empty URLs are relative

  // Relative URLs (no protocol)
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("?")) {
    return true;
  }

  // Protocol-relative URLs
  if (trimmed.startsWith("//")) {
    return allowedProtocols.has("https:");
  }

  try {
    const parsed = new URL(trimmed, "https://example.com");
    if (parsed.protocol && ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      if (parsed.protocol === "data:" && !allowDataImages) {
        // Only allow data: for images
        return trimmed.startsWith("data:image/");
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Sanitizes a CSS style string. */
function sanitizeCss(css: string, allowedProps: Set<string>): string {
  const declarations = css.split(";");
  const sanitized: string[] = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;

    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const value = decl.slice(colonIdx + 1).trim();

    if (!prop || !value) continue;

    // Skip dangerous properties
    if (prop.startsWith("-moz-binding")) continue;
    if (prop === "behavior") continue;

    // Check allowlist
    if (allowedProps.has(prop)) {
      // Sanitize value -- remove url() with dangerous protocols
      const sanitizedValue = value.replace(/url\s*\(\s*['"]?\s*([^'")]+)/gi, (match, url) => {
        const trimmedUrl = (url as string).trim();
        if (isValidUrl(trimmedUrl, new Set(["https:"]), false)) {
          return match;
        }
        return "url()";
      });
      // Remove expression() and javascript:
      if (/expression\s*\(/i.test(sanitizedValue)) continue;
      if (/javascript:/i.test(sanitizedValue)) continue;
      sanitized.push(`${prop}: ${sanitizedValue}`);
    }
  }

  return sanitized.join("; ");
}

/**
 * HTML Sanitizer -- removes dangerous HTML, scripts, and attributes
 * while preserving safe content.
 */
export class HTMLSanitizer {
  private allowedTags: Set<string>;
  private dangerousTags: Set<string>;
  private globalAttributes: Set<string>;
  private tagAttributes: Map<string, Set<string>>;
  private allowedProtocols: Set<string>;
  private allowStyleAttributes: boolean;
  private allowComments: boolean;
  private allowDataImages: boolean;
  private maxDepth: number;
  private attributeFilter: ((tag: string, attr: string, value: string) => boolean) | null;

  constructor(config: SanitizerConfig = {}) {
    this.allowedTags = new Set(ALLOWED_TAGS);
    for (const tag of config.allowedTags ?? []) {
      this.allowedTags.add(tag.toLowerCase());
    }
    // Assign dangerousTags BEFORE the removedTags loop reads it -- the loop
    // calls this.dangerousTags.add(...), which throws on undefined.
    this.dangerousTags = new Set(DANGEROUS_TAGS);
    for (const tag of config.removedTags ?? []) {
      this.allowedTags.delete(tag.toLowerCase());
      this.dangerousTags.add(tag.toLowerCase());
    }
    this.globalAttributes = new Set(GLOBAL_ATTRIBUTES);
    for (const attr of config.allowedAttributes ?? []) {
      this.globalAttributes.add(attr.toLowerCase());
    }
    this.tagAttributes = new Map();
    for (const [tag, attrs] of Object.entries(TAG_ATTRIBUTES)) {
      this.tagAttributes.set(tag, new Set(attrs));
    }
    this.allowedProtocols = new Set(ALLOWED_PROTOCOLS);
    for (const proto of config.allowedProtocols ?? []) {
      this.allowedProtocols.add(proto.toLowerCase());
    }
    this.allowStyleAttributes = config.allowStyleAttributes ?? false;
    this.allowComments = config.allowComments ?? false;
    this.allowDataImages = config.allowDataImages ?? true;
    this.maxDepth = config.maxDepth ?? 50;
    this.attributeFilter = config.attributeFilter ?? null;
  }

  /**
   * Sanitizes an HTML string, returning safe HTML.
   */
  sanitize(html: string): string {
    const result = this.sanitizeWithReport(html);
    return result.html;
  }

  /**
   * Sanitizes HTML and returns a detailed report of what was removed.
   */
  sanitizeWithReport(html: string): SanitizeResult {
    const removedTags: string[] = [];
    const removedAttributes: string[] = [];
    const warnings: string[] = [];

    // Use DOMParser if available (browser), otherwise use a simpler regex-based approach
    let sanitized = html;

    // Remove comments (unless allowed)
    if (!this.allowComments) {
      sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, "");
    }

    // Remove CDATA sections
    sanitized = sanitized.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

    // Remove XML processing instructions
    sanitized = sanitized.replace(/<\?[\s\S]*?\?>/g, "");

    // Remove DOCTYPE
    sanitized = sanitized.replace(/<!DOCTYPE[^>]*>/gi, "");

    // Process tags -- use a tag-by-tag approach
    sanitized = this.processTags(sanitized, removedTags, removedAttributes, warnings, 0);

    return { html: sanitized, removedTags, removedAttributes, warnings };
  }

  /** Processes HTML tags one by one. */
  private processTags(
    html: string,
    removedTags: string[],
    removedAttributes: string[],
    warnings: string[],
    depth: number
  ): string {
    if (depth > this.maxDepth) {
      warnings.push(`Maximum nesting depth (${this.maxDepth}) exceeded`);
      return escapeHtml(html);
    }

    let result = html;

    // Remove dangerous tags completely (including content)
    for (const tag of this.dangerousTags) {
      const regex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
      result = result.replace(regex, (match) => {
        removedTags.push(tag);
        return "";
      });
      // Also remove self-closing variants
      const selfClosing = new RegExp(`<${tag}\\b[^>]*/?>`, "gi");
      result = result.replace(selfClosing, (match) => {
        removedTags.push(tag);
        return "";
      });
    }

    // Process remaining tags
    result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (match, tagName, attrString) => {
      const tag = tagName.toLowerCase();

      // Check if tag is allowed
      if (!this.allowedTags.has(tag)) {
        removedTags.push(tag);
        return "";
      }

      // Parse and filter attributes
      const attrs = this.parseAttributes(attrString);
      const filteredAttrs: string[] = [];

      for (const [name, value] of attrs) {
        const lowerName = name.toLowerCase();

        // Check if attribute is allowed
        const tagAttrs = this.tagAttributes.get(tag);
        const isAllowed = this.globalAttributes.has(lowerName) ||
          (tagAttrs?.has(lowerName) ?? false);

        if (!isAllowed) {
          removedAttributes.push(`${tag}.${lowerName}`);
          continue;
        }

        // Check for event handler attributes (on*)
        if (lowerName.startsWith("on")) {
          removedAttributes.push(`${tag}.${lowerName}`);
          continue;
        }

        // Validate URL attributes
        if (URL_ATTRIBUTES.has(lowerName)) {
          if (!isValidUrl(value, this.allowedProtocols, this.allowDataImages)) {
            removedAttributes.push(`${tag}.${lowerName} (bad URL)`);
            continue;
          }
        }

        // Sanitize style attribute
        if (lowerName === "style" && this.allowStyleAttributes) {
          const sanitizedStyle = sanitizeCss(value, ALLOWED_CSS_PROPS);
          if (sanitizedStyle) {
            filteredAttrs.push(`style="${escapeHtml(sanitizedStyle)}"`);
          }
          continue;
        } else if (lowerName === "style" && !this.allowStyleAttributes) {
          removedAttributes.push(`${tag}.style`);
          continue;
        }

        // Apply custom filter
        if (this.attributeFilter && !this.attributeFilter(tag, lowerName, value)) {
          removedAttributes.push(`${tag}.${lowerName} (filtered)`);
          continue;
        }

        // Escape the value
        filteredAttrs.push(`${lowerName}="${escapeHtml(value)}"`);
      }

      const isClosing = match.startsWith("</");
      const attrStr = filteredAttrs.length > 0 ? " " + filteredAttrs.join(" ") : "";

      if (isClosing) {
        return `</${tag}>`;
      }

      // Handle self-closing tags
      const isSelfClosing = match.endsWith("/>") || ["img", "br", "hr", "col", "input", "meta", "link"].includes(tag);
      return isSelfClosing ? `<${tag}${attrStr} />` : `<${tag}${attrStr}>`;
    });

    return result;
  }

  /** Parses an attribute string into name-value pairs. */
  private parseAttributes(attrString: string): Array<[string, string]> {
    const attrs: Array<[string, string]> = [];
    const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match;

    while ((match = regex.exec(attrString)) !== null) {
      const name = match[1];
      const value = match[2] ?? match[3] ?? match[4] ?? "";
      attrs.push([name, value]);
    }

    return attrs;
  }

  /** Creates a strict sanitizer (minimal allowed tags). */
  static strict(): HTMLSanitizer {
    return new HTMLSanitizer({
      allowedTags: ["p", "br", "strong", "em", "ul", "ol", "li", "a"],
      allowedAttributes: ["href"],
      allowedProtocols: ["https:", "mailto:"],
      allowStyleAttributes: false,
      allowComments: false,
      allowDataImages: false,
    });
  }

  /** Creates a permissive sanitizer (for trusted content). */
  static permissive(): HTMLSanitizer {
    return new HTMLSanitizer({
      allowStyleAttributes: true,
      allowComments: true,
      allowDataImages: true,
    });
  }
}

/** Creates a new HTML sanitizer. */
export function createSanitizer(config?: SanitizerConfig): HTMLSanitizer {
  return new HTMLSanitizer(config);
}
