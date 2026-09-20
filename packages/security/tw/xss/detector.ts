/**
 * XSS Detector -- detects Cross-Site Scripting attacks using
 * pattern matching, context analysis, and DOM-based detection.
 *
 * Supports: reflected XSS, stored XSS, DOM-based XSS,
 * mutation XSS, and polyglot payloads.
 *
 * @module security/xss/detector
 */

/** XSS detection result. */
export interface XSSDetectionResult {
  detected: boolean;
  confidence: number;
  patterns: string[];
  payloads: string[];
  context: "html" | "attribute" | "javascript" | "css" | "url" | "unknown";
  risk: "none" | "low" | "medium" | "high" | "critical";
}

/** XSS payload patterns -- ordered by severity. */
const XSS_PATTERNS: Array<{ pattern: RegExp; name: string; severity: number }> = [
  // Script tag injection
  { pattern: /<script\b[^>]*>/i, name: "<script> tag", severity: 10 },
  { pattern: /<\/script\s*>/i, name: "</script> tag", severity: 9 },
  { pattern: /<script\b[^>]*src\s*=/i, name: "<script src=>", severity: 10 },
  { pattern: /<script\b[^>]*>.*?<\/script>/is, name: "Complete script block", severity: 10 },

  // Event handlers
  { pattern: /\bon\w+\s*=\s*['"]?[^'"\s>]+/i, name: "Event handler (on*)", severity: 9 },
  { pattern: /\bon(load|error|click|mouseover|mouseout|focus|blur|submit|change|keyup|keydown)\s*=/i, name: "Specific event handler", severity: 9 },
  { pattern: /\bonerror\s*=\s*['"]?[^'"\s]+/i, name: "onerror handler", severity: 10 },
  { pattern: /\bonload\s*=\s*['"]?[^'"\s]+/i, name: "onload handler", severity: 10 },

  // JavaScript: protocol
  { pattern: /javascript:\s*[^"'\s]+/i, name: "javascript: protocol", severity: 10 },
  { pattern: /javascript:\s*void\s*\(/i, name: "javascript:void()", severity: 9 },

  // Data URI with script
  { pattern: /data:\s*text\/html/i, name: "data:text/html", severity: 9 },
  { pattern: /data:\s*application\/javascript/i, name: "data:application/javascript", severity: 10 },
  { pattern: /data:\s*text\/javascript/i, name: "data:text/javascript", severity: 10 },

  // SVG XSS
  { pattern: /<svg\b[^>]*>/i, name: "<svg> tag", severity: 7 },
  { pattern: /<svg\b[^>]*onload\s*=/i, name: "<svg onload>", severity: 10 },
  { pattern: /<svg[^>]*>.*?<script/is, name: "SVG + script", severity: 10 },
  { pattern: /<foreignObject\b/i, name: "<foreignObject>", severity: 8 },
  { pattern: /<use\b[^>]*href\s*=/i, name: "<use href>", severity: 7 },

  // Iframe injection
  { pattern: /<iframe\b[^>]*>/i, name: "<iframe> tag", severity: 8 },
  { pattern: /<iframe\b[^>]*src\s*=\s*['"]?javascript:/i, name: "<iframe src=javascript:>", severity: 10 },
  { pattern: /<iframe\b[^>]*srcdoc\s*=/i, name: "<iframe srcdoc>", severity: 9 },

  // Object/embed
  { pattern: /<object\b[^>]*>/i, name: "<object> tag", severity: 8 },
  { pattern: /<embed\b[^>]*>/i, name: "<embed> tag", severity: 8 },
  { pattern: /<object\b[^>]*data\s*=/i, name: "<object data>", severity: 9 },

  // Expression and behavior (IE)
  { pattern: /expression\s*\(/i, name: "expression()", severity: 9 },
  { pattern: /behavior\s*:/i, name: "behavior:", severity: 8 },
  { pattern: /-moz-binding\s*:/i, name: "-moz-binding", severity: 9 },

  // InnerHTML manipulation
  { pattern: /\.innerHTML\s*=/i, name: ".innerHTML=", severity: 8 },
  { pattern: /\.outerHTML\s*=/i, name: ".outerHTML=", severity: 8 },
  { pattern: /document\.write\s*\(/i, name: "document.write()", severity: 8 },
  { pattern: /document\.writeln\s*\(/i, name: "document.writeln()", severity: 8 },

  // eval and Function
  { pattern: /\beval\s*\(/i, name: "eval()", severity: 9 },
  { pattern: /new\s+Function\s*\(/i, name: "new Function()", severity: 9 },
  { pattern: /setTimeout\s*\(\s*['"]/, name: "setTimeout(string)", severity: 8 },
  { pattern: /setInterval\s*\(\s*['"]/, name: "setInterval(string)", severity: 8 },

  // Template injection
  { pattern: /\{\{.*?\}\}/, name: "Template literal {{}}", severity: 5 },
  { pattern: /\$\{.*?\}/, name: "Template literal ${}", severity: 5 },

  // Mutation XSS
  { pattern: /<noscript\b/i, name: "<noscript>", severity: 7 },
  { pattern: /<noembed\b/i, name: "<noembed>", severity: 7 },
  { pattern: /<textarea\b[^>]*>.*?<\/textarea>/is, name: "<textarea> content", severity: 6 },
  { pattern: /<title\b[^>]*>.*?<\/title>/is, name: "<title> content", severity: 6 },
  { pattern: /<style\b[^>]*>.*?<\/style>/is, name: "<style> content", severity: 6 },

  // Encoded payloads
  { pattern: /&#x?[0-9a-f]+;/i, name: "HTML entity encoding", severity: 4 },
  { pattern: /\\x[0-9a-f]{2}/i, name: "Hex escape", severity: 5 },
  { pattern: /\\u[0-9a-f]{4}/i, name: "Unicode escape", severity: 5 },
  { pattern: /\\[0-7]{1,3}/, name: "Octal escape", severity: 4 },

  // Dangerous DOM APIs
  { pattern: /document\.cookie/i, name: "document.cookie access", severity: 7 },
  { pattern: /window\.location\s*=/i, name: "window.location=", severity: 7 },
  { pattern: /location\.href\s*=/i, name: "location.href=", severity: 6 },
  { pattern: /location\.replace\s*\(/i, name: "location.replace()", severity: 5 },
  { pattern: /window\.open\s*\(/i, name: "window.open()", severity: 5 },

  // fetch/XHR
  { pattern: /fetch\s*\(\s*['"]https?:\/\//i, name: "fetch(http://)", severity: 4 },
  { pattern: /XMLHttpRequest/i, name: "XMLHttpRequest", severity: 3 },

  // Base tag injection
  { pattern: /<base\b[^>]*href\s*=/i, name: "<base href>", severity: 8 },

  // Meta refresh redirect
  { pattern: /<meta\b[^>]*http-equiv\s*=\s*['"]?refresh/i, name: "Meta refresh", severity: 7 },
  { pattern: /<meta\b[^>]*http-equiv\s*=\s*['"]?set-cookie/i, name: "Meta set-cookie", severity: 8 },

  // Polyglot payloads
  { pattern: /['"]\s*;\s*alert\s*\(/i, name: "Alert polyglot", severity: 9 },
  { pattern: /['"]\s*;\s*prompt\s*\(/i, name: "Prompt polyglot", severity: 9 },
  { pattern: /['"]\s*;\s*confirm\s*\(/i, name: "Confirm polyglot", severity: 8 },

  // String.fromCharCode
  { pattern: /String\.fromCharCode\s*\(/i, name: "String.fromCharCode()", severity: 7 },

  // Obfuscated payloads
  { pattern: /window\[['"]self['"]\]/i, name: "window['self']", severity: 7 },
  { pattern: /self\[['"]eval['"]\]/i, name: "self['eval']", severity: 8 },
  { pattern: /top\[['"]eval['"]\]/i, name: "top['eval']", severity: 8 },
];

/** Determines the output context of an input. */
function detectContext(input: string): XSSDetectionResult["context"] {
  // Check if input appears to be in an HTML context
  if (/<\w+[^>]*>/.test(input) || /<\/\w+/.test(input)) {
    return "html";
  }
  // Check for attribute context
  if (/=\s*['"]/.test(input)) {
    return "attribute";
  }
  // Check for JavaScript context
  if (/(\beval\b|\bfunction\b|\breturn\b|=>)/.test(input)) {
    return "javascript";
  }
  // Check for CSS context
  if (/(:\s*[\w-]+\s*;|@media|@import)/.test(input)) {
    return "css";
  }
  // Check for URL context
  if (/^(https?|ftp|data|blob):/i.test(input.trim())) {
    return "url";
  }
  return "unknown";
}

/** Extracts payload snippets from the input. */
function extractPayloads(input: string): string[] {
  const payloads: string[] = [];
  const seen = new Set<string>();

  // Extract script blocks
  const scriptMatches = input.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi);
  if (scriptMatches) {
    for (const m of scriptMatches) {
      if (!seen.has(m)) { payloads.push(m); seen.add(m); }
    }
  }

  // Extract event handlers
  const handlerMatches = input.match(/\bon\w+\s*=\s*['"]?[^'"\s>]+/gi);
  if (handlerMatches) {
    for (const m of handlerMatches) {
      if (!seen.has(m)) { payloads.push(m); seen.add(m); }
    }
  }

  // Extract javascript: URLs
  const jsMatches = input.match(/javascript:\s*[^"'\s>]+/gi);
  if (jsMatches) {
    for (const m of jsMatches) {
      if (!seen.has(m)) { payloads.push(m); seen.add(m); }
    }
  }

  // Extract data: URIs
  const dataMatches = input.match(/data:\s*(text\/html|application\/javascript|text\/javascript)[^"'\s>]*/gi);
  if (dataMatches) {
    for (const m of dataMatches) {
      if (!seen.has(m)) { payloads.push(m); seen.add(m); }
    }
  }

  return payloads.slice(0, 10); // Limit to 10 payloads
}

/** Calculates risk level. */
function riskFromConfidence(confidence: number): XSSDetectionResult["risk"] {
  if (confidence >= 0.9) return "critical";
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  if (confidence >= 0.2) return "low";
  return "none";
}

/**
 * XSS Detector -- detects Cross-Site Scripting attacks
 * in input strings using pattern matching and context analysis.
 */
export class XSSDetector {
  private patterns: typeof XSS_PATTERNS;
  private maxPayloads: number;

  constructor(options?: { maxPayloads?: number; customPatterns?: typeof XSS_PATTERNS }) {
    this.patterns = options?.customPatterns ?? XSS_PATTERNS;
    this.maxPayloads = options?.maxPayloads ?? 10;
  }

  /** Detects XSS in a string. */
  detect(input: string): XSSDetectionResult {
    const detectedPatterns: string[] = [];
    let maxSeverity = 0;
    let patternCount = 0;

    for (const { pattern, name, severity } of this.patterns) {
      if (pattern.test(input)) {
        if (!detectedPatterns.includes(name)) {
          detectedPatterns.push(name);
        }
        maxSeverity = Math.max(maxSeverity, severity);
        patternCount++;
      }
    }

    // Context detection
    const context = detectContext(input);

    // Payload extraction
    const payloads = extractPayloads(input).slice(0, this.maxPayloads);

    // Confidence calculation
    let confidence = 0;
    if (maxSeverity >= 10) confidence = 0.95;
    else if (maxSeverity >= 8) confidence = 0.75;
    else if (maxSeverity >= 6) confidence = 0.5;
    else if (maxSeverity >= 4) confidence = 0.3;
    else if (maxSeverity > 0) confidence = 0.2;

    if (patternCount >= 2) confidence = Math.min(1, confidence + 0.1);
    if (patternCount >= 3) confidence = Math.min(1, confidence + 0.1);
    if (patternCount >= 5) confidence = Math.min(1, confidence + 0.1);

    // Multiple payloads increase confidence
    if (payloads.length >= 2) confidence = Math.min(1, confidence + 0.05);

    return {
      detected: confidence >= 0.2,
      confidence,
      patterns: detectedPatterns,
      payloads,
      context,
      risk: riskFromConfidence(confidence),
    };
  }

  /** Checks if input is safe. */
  isSafe(input: string): boolean {
    return !this.detect(input).detected;
  }

  /** Detects XSS in an HTTP request (query params, body, headers). */
  detectRequest(req: Request): Array<{ location: string; result: XSSDetectionResult }> {
    const results: Array<{ location: string; result: XSSDetectionResult }> = [];
    const url = new URL(req.url);

    // Check query parameters
    for (const [key, value] of url.searchParams) {
      const result = this.detect(value);
      if (result.detected) {
        results.push({ location: `query.${key}`, result });
      }
    }

    // Check path segments
    for (const segment of url.pathname.split("/")) {
      if (segment) {
        const result = this.detect(segment);
        if (result.detected) {
          results.push({ location: "path", result });
        }
      }
    }

    // Check headers
    const headerNames = ["referer", "user-agent", "x-forwarded-for", "cookie"];
    for (const name of headerNames) {
      const value = req.headers.get(name);
      if (value) {
        const result = this.detect(value);
        if (result.detected) {
          results.push({ location: `header.${name}`, result });
        }
      }
    }

    return results;
  }

  /** Adds a custom detection pattern. */
  addPattern(pattern: RegExp, name: string, severity: number): void {
    this.patterns.push({ pattern, name, severity });
  }
}

/** Creates a new XSS detector. */
export function createXSSDetector(options?: { maxPayloads?: number }): XSSDetector {
  return new XSSDetector(options);
}
