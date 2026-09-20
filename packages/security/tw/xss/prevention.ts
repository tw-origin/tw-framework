/**
 * XSS Prevention -- context-aware encoding and output filtering
 * to prevent XSS attacks at the output layer.
 *
 * @module security/xss/prevention
 */

import { escapeHtml, escapeAttribute, escapeJavaScript, escapeCss, escapeUrl } from "../sanitize/escape";

/** Output context. */
export type OutputContext = "html" | "attribute" | "javascript" | "css" | "url" | "json" | "raw";

/** Prevention result. */
export interface PreventionResult {
  safe: string;
  context: OutputContext;
  modified: boolean;
}

/** Safe HTML tags that don't need encoding. */
const SAFE_TAGS = new Set([
  "b", "i", "em", "strong", "u", "br", "hr", "p", "span", "div",
  "ul", "ol", "li", "table", "tr", "td", "th", "thead", "tbody",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre",
  "a", "img", "figure", "figcaption", "mark", "small", "sub", "sup",
]);

/** Attributes that need URL validation. */
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "data", "poster"]);

/** Allowed URL protocols. */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:", "blob:"]);

/** Validates a URL for safe use in HTML attributes. */
function validateUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  // Relative URLs are safe
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed;
  }

  // Check protocol
  try {
    const parsed = new URL(trimmed, "https://example.com");
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
      return "";
    }
    return trimmed;
  } catch {
    // Not a valid URL -- treat as relative
    return trimmed;
  }
}

/**
 * XSS Prevention -- provides context-aware encoding and filtering.
 */
export class XSSPrevention {
  private strict: boolean;

  constructor(options?: { strict?: boolean }) {
    this.strict = options?.strict ?? false;
  }

  /**
   * Encodes output for the specified context.
   * This is the main entry point for safe output.
   */
  encode(input: string, context: OutputContext = "html"): PreventionResult {
    let safe: string;

    switch (context) {
      case "html":
        safe = escapeHtml(input);
        break;
      case "attribute":
        safe = escapeAttribute(input);
        break;
      case "javascript":
        safe = escapeJavaScript(input);
        break;
      case "css":
        safe = escapeCss(input);
        break;
      case "url":
        safe = escapeUrl(input);
        break;
      case "json":
        safe = JSON.stringify(input).slice(1, -1); // Remove surrounding quotes
        break;
      case "raw":
        safe = input;
        break;
      default:
        safe = escapeHtml(input);
    }

    return {
      safe,
      context,
      modified: safe !== input,
    };
  }

  /**
   * Encodes for HTML body context.
   * Use when outputting text inside HTML elements.
   * Example: <p>USER_INPUT</p>
   */
  encodeForHTML(input: string): string {
    return this.encode(input, "html").safe;
  }

  /**
   * Encodes for HTML attribute context.
   * Use when outputting inside an attribute value.
   * Example: <input value="USER_INPUT">
   */
  encodeForAttribute(input: string): string {
    return this.encode(input, "attribute").safe;
  }

  /**
   * Encodes for JavaScript context.
   * Use when outputting inside a <script> block.
   * Example: <script>var x = "USER_INPUT";</script>
   */
  encodeForJavaScript(input: string): string {
    return this.encode(input, "javascript").safe;
  }

  /**
   * Encodes for CSS context.
   * Use when outputting inside a <style> block.
   * Example: <style>.x { content: "USER_INPUT"; }</style>
   */
  encodeForCSS(input: string): string {
    return this.encode(input, "css").safe;
  }

  /**
   * Encodes for URL context.
   * Use when outputting as a URL parameter.
   * Example: <a href="?q=USER_INPUT">
   */
  encodeForURL(input: string): string {
    return this.encode(input, "url").safe;
  }

  /**
   * Encodes for JSON context.
   * Use when outputting inside a JSON response.
   */
  encodeForJSON(input: string): string {
    return this.encode(input, "json").safe;
  }

  /**
   * Validates and sanitizes a URL for use in an HTML attribute.
   * Returns an empty string if the URL is dangerous.
   */
  validateUrl(url: string): string {
    return validateUrl(url);
  }

  /**
   * Filters HTML content, removing dangerous elements.
   * This is a lightweight filter -- for full sanitization use HTMLSanitizer.
   */
  filterHTML(input: string): string {
    let result = input;

    // Remove script tags and content
    result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

    // Remove event handlers
    result = result.replace(/\son\w+\s*=\s*['"]?[^'"\s>]*['"]?/gi, "");

    // Remove javascript: URLs
    result = result.replace(/javascript:[^"'\s>]*/gi, "");

    // Remove data: URLs with dangerous types
    result = result.replace(/data:\s*(text\/html|application\/javascript|text\/javascript)[^"'\s>]*/gi, "");

    // Remove expression()
    result = result.replace(/expression\s*\([^)]*\)/gi, "");

    // Remove -moz-binding
    result = result.replace(/-moz-binding\s*:[^;]+;?/gi, "");

    // Validate URLs in attributes
    result = result.replace(/(href|src|action|formaction|data|poster)\s*=\s*['"]([^'"]*)['"]/gi, (match, attr, url) => {
      const validated = validateUrl(url);
      return validated ? `${attr}="${validated}"` : "";
    });

    return result;
  }

  /**
   * Creates a safe DOM node from potentially unsafe HTML.
   * Uses the template element to prevent script execution.
   */
  createSafeElement(html: string): DocumentFragment {
    const template = document.createElement("template");
    template.innerHTML = this.filterHTML(html);
    return template.content.cloneNode(true) as DocumentFragment;
  }

  /**
   * Safely sets text content on an element.
   * This is always XSS-safe.
   */
  safeSetText(element: Element, text: string): void {
    element.textContent = text;
  }

  /**
   * Safely sets an attribute on an element.
   * Validates URLs and removes dangerous values.
   */
  safeSetAttribute(element: Element, name: string, value: string): void {
    // Block event handler attributes
    if (name.startsWith("on")) {
      return;
    }

    // Validate URL attributes
    if (URL_ATTRIBUTES.has(name.toLowerCase())) {
      const validated = validateUrl(value);
      if (!validated) {
        return;
      }
      value = validated;
    }

    element.setAttribute(name, value);
  }
}

/** Creates a new XSS prevention instance. */
export function createXSSPrevention(options?: { strict?: boolean }): XSSPrevention {
  return new XSSPrevention(options);
}
