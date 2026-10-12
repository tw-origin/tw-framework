/**
 * Error codes.
 *
 * This registry is the single source of truth: errors.json is generated from it
 * and docs/error-reference.md documents it. Code allocation:
 *
 *   TW000        generic / fallback
 *   TW001-TW019  syntax
 *   TW020-TW049  structure & attributes
 *   TW050-TW069  semantics
 *   TW070-TW089  quality (perf, a11y, security, best-practice, deprecation)
 *   TW090-TW097  cache, state & loops
 *   TW099-TW119  server blocks (experimental.serverBlocks)
 *   TW120-TW199  routing                          [reserved]
 *   TW200-TW299  render modes                     [reserved]
 *   TW300-TW399  extensions (.tw / .twm / .tss)   [reserved]
 *   TW400-TW499  imports                          [reserved]
 *   TW500-TW599  build                            [reserved]
 *   TW600-TW699  runtime                          [reserved]
 *   TW700-TW799  CLI                              [reserved]
 *   TW1007       server-only boundary (standalone)
 *
 * A reserved band is a convention, not an emitted code: add a new code to the
 * band that matches its origin, and mark it `reserved: true` until it is used.
 */

import { type ErrorCode, type DiagnosticSeverity, type DiagnosticCategory } from "./types";

export const ERROR_CODES: Record<ErrorCode, { message: string; severity: DiagnosticSeverity; category: DiagnosticCategory; reserved?: boolean }> = {
  // Syntax
  TW001: { message: "Unexpected token", severity: "error", category: "syntax" },
  TW002: { message: "Unclosed brace -- expected }", severity: "error", category: "syntax" },
  TW003: { message: "Unknown HTML tag", severity: "warning", category: "syntax" },
  TW004: { message: "Unknown CSS property", severity: "warning", category: "syntax" },
  TW005: { message: "Unknown event type", severity: "warning", category: "syntax" },
  TW006: { message: "Unknown attribute", severity: "info", category: "syntax" },
  TW007: { message: "Page directive can only appear at the top of the file", severity: "error", category: "syntax" },
  TW008: { message: "Layout directive must specify a layout name", severity: "error", category: "syntax" },
  TW009: { message: "Import must specify a source module", severity: "error", category: "syntax" },
  TW010: { message: "State variable must have a name and value", severity: "error", category: "syntax" },
  TW011: { message: "Render mode must be one of: static, server, edge, interactive", severity: "error", category: "syntax" },
  TW012: { message: "Revalidate must be a positive number (seconds)", severity: "error", category: "syntax" },
  TW013: { message: "Redirect must specify a target URL", severity: "error", category: "syntax" },
  TW014: { message: "Component not found", severity: "error", category: "semantic" },
  TW015: { message: "Duplicate attribute on element", severity: "warning", category: "syntax" },
  TW016: { message: "Missing key attribute in for loop", severity: "info", category: "best-practice", reserved: true },
  TW017: { message: "Script block is empty", severity: "warning", category: "syntax", reserved: true },
  TW018: { message: "Style block is empty", severity: "warning", category: "syntax" },
  TW019: { message: "Circular component reference detected", severity: "error", category: "semantic", reserved: true },
  TW020: { message: "Duplicate page directive", severity: "warning", category: "syntax" },

  // Semantic
  TW021: { message: "Undefined variable referenced", severity: "error", category: "semantic" },
  TW022: { message: "Undefined component referenced", severity: "error", category: "semantic" },
  TW023: { message: "Component prop type mismatch", severity: "warning", category: "semantic", reserved: true },
  TW024: { message: "Missing required prop", severity: "warning", category: "semantic", reserved: true },
  TW025: { message: "Unused import", severity: "info", category: "best-practice" },
  TW026: { message: "Unused state variable", severity: "info", category: "best-practice" },
  TW027: { message: "State variable redeclared", severity: "error", category: "semantic" },
  TW028: { message: "Invalid directive value", severity: "error", category: "semantic" },
  TW029: { message: "Directive not allowed in this context", severity: "error", category: "semantic" },
  TW030: { message: "Missing required directive", severity: "warning", category: "semantic" },
  TW031: { message: "Event handler not defined", severity: "warning", category: "semantic", reserved: true },
  TW032: { message: "Binding expression is empty", severity: "error", category: "semantic" },
  TW033: { message: "Invalid binding type", severity: "error", category: "semantic" },
  TW034: { message: "Slot name conflicts with component name", severity: "warning", category: "semantic" },
  TW035: { message: "Template reference variable not used", severity: "info", category: "best-practice" },
  TW036: { message: "Duplicate component definition", severity: "error", category: "semantic" },
  TW037: { message: "Component extends itself", severity: "error", category: "semantic" },
  TW038: { message: "Invalid layout reference", severity: "error", category: "semantic" },
  TW039: { message: "Middleware path is invalid", severity: "error", category: "semantic" },

  // Accessibility
  TW040: { message: "Image missing alt attribute", severity: "warning", category: "accessibility" },
  TW041: { message: "Form input missing label", severity: "warning", category: "accessibility" },
  TW042: { message: "Button missing accessible text", severity: "warning", category: "accessibility" },
  TW043: { message: "Missing ARIA label on interactive element", severity: "info", category: "accessibility" },
  TW044: { message: "Invalid ARIA role", severity: "warning", category: "accessibility" },
  TW045: { message: "Invalid ARIA attribute", severity: "warning", category: "accessibility" },
  TW046: { message: "Heading hierarchy skip detected", severity: "warning", category: "accessibility" },
  TW047: { message: "Missing lang attribute on html element", severity: "info", category: "accessibility", reserved: true },
  TW048: { message: "Tab order may be incorrect", severity: "info", category: "accessibility", reserved: true },
  TW049: { message: "Color contrast may be insufficient", severity: "info", category: "accessibility", reserved: true },

  // Performance
  TW050: { message: "Large inline script -- consider extracting", severity: "info", category: "performance" },
  TW051: { message: "Large inline style -- consider extracting", severity: "info", category: "performance" },
  TW052: { message: "Deeply nested DOM tree", severity: "info", category: "performance" },
  TW053: { message: "Too many DOM nodes", severity: "info", category: "performance" },
  TW054: { message: "Unoptimized image -- consider lazy loading", severity: "info", category: "performance" },
  TW055: { message: "Unused CSS rules detected", severity: "info", category: "performance", reserved: true },
  TW056: { message: "Duplicate styles detected", severity: "info", category: "performance", reserved: true },
  TW057: { message: "Consider code splitting for large components", severity: "info", category: "performance", reserved: true },
  TW058: { message: "Inline event handler may cause performance issues", severity: "info", category: "performance", reserved: true },
  TW059: { message: "Consider memoization for expensive computation", severity: "info", category: "performance", reserved: true },

  // Security
  TW060: { message: "Potential XSS vulnerability -- unescaped output", severity: "warning", category: "security", reserved: true },
  TW061: { message: "Dangerous HTML injection detected", severity: "error", category: "security" },
  TW062: { message: "Inline event handler -- consider CSP", severity: "info", category: "security", reserved: true },
  TW063: { message: "External script without integrity check", severity: "warning", category: "security" },
  TW064: { message: "Missing Content-Security-Policy", severity: "info", category: "security", reserved: true },
  TW065: { message: "Mixed content detected (HTTP on HTTPS page)", severity: "warning", category: "security", reserved: true },
  TW066: { message: "Sensitive data in template", severity: "warning", category: "security", reserved: true },
  TW067: { message: "Missing nonce for inline script", severity: "info", category: "security", reserved: true },
  TW068: { message: "eval() usage detected", severity: "error", category: "security" },
  TW069: { message: "Dangerous URL pattern detected", severity: "warning", category: "security", reserved: true },

  // Best practices
  TW070: { message: "Use semantic HTML elements", severity: "info", category: "best-practice", reserved: true },
  TW071: { message: "Avoid inline styles -- use CSS classes", severity: "info", category: "best-practice" },
  TW072: { message: "Consider using a button instead of a div with click", severity: "info", category: "best-practice" },
  TW073: { message: "Add type attribute to script tags", severity: "info", category: "best-practice", reserved: true },
  TW074: { message: "Use async/defer for non-critical scripts", severity: "info", category: "best-practice", reserved: true },
  TW075: { message: "Add width/height to images", severity: "info", category: "best-practice" },
  TW076: { message: "Use rel=\"noopener\" for external links", severity: "info", category: "best-practice" },
  TW077: { message: "Add loading=\"lazy\" to below-fold images", severity: "info", category: "best-practice", reserved: true },
  TW078: { message: "Consider using <picture> for responsive images", severity: "info", category: "best-practice", reserved: true },
  TW079: { message: "Use <button type=\"button\"> for non-submit buttons", severity: "info", category: "best-practice", reserved: true },

  // Deprecation
  TW080: { message: "Deprecated HTML tag", severity: "warning", category: "deprecation", reserved: true },
  TW081: { message: "Deprecated CSS property", severity: "warning", category: "deprecation", reserved: true },
  TW082: { message: "Deprecated API usage", severity: "warning", category: "deprecation", reserved: true },
  TW083: { message: "Deprecated attribute", severity: "warning", category: "deprecation", reserved: true },
  TW084: { message: "Deprecated event name", severity: "warning", category: "deprecation", reserved: true },
  TW085: { message: "Deprecated directive syntax -- use new syntax", severity: "warning", category: "deprecation", reserved: true },
  TW086: { message: "Deprecated state declaration syntax", severity: "warning", category: "deprecation", reserved: true },
  TW087: { message: "Deprecated component lifecycle hook", severity: "warning", category: "deprecation", reserved: true },
  TW088: { message: "Deprecated import path", severity: "warning", category: "deprecation" },
  TW089: { message: "Deprecated render mode -- use 'interactive'", severity: "warning", category: "deprecation", reserved: true },

  // Cache (docs/cache-tags.md)
  TW090: { message: "cache { } requires a revalidate window or a life profile", severity: "error", category: "syntax" },
  TW091: { message: "fn cached handler is impure (request.cookies/headers/body or setSignal)", severity: "error", category: "semantic", reserved: true },
  TW092: { message: "Unknown cache profile", severity: "error", category: "semantic", reserved: true },
  TW093: { message: "Non-deterministic call in a cached handler (value freezes into the cache entry)", severity: "warning", category: "best-practice", reserved: true },
  TW094: { message: "Invalid state literal -- array/object elements must be comma-separated (and objects need colons)", severity: "error", category: "syntax" },
  TW095: { message: "Invalid for-loop iterable -- use {varName} or a valid comma-separated literal", severity: "error", category: "syntax" },
  TW096: { message: "Unknown state variable in interpolation (renders empty)", severity: "warning", category: "semantic" },
  TW097: { message: "while with a comparison renders its body ONCE at build time (state cannot mutate during SSR) -- use for loops for repetition", severity: "warning", category: "semantic" },
  // Server blocks (TW099-TW101)
  TW099: { message: "Unknown server modifier (only ':defer' is supported)", severity: "error", category: "syntax" },
  TW100: { message: "Expected '{' after 'server'", severity: "error", category: "syntax" },
  TW101: { message: "Unclosed server block -- a '}' never closes the 'server {'", severity: "error", category: "syntax" },
  // Server blocks, semantic (TW102-TW105)
  TW102: { message: "Server block declares a name that collides with state { } or a route param", severity: "error", category: "semantic" },
  TW103: { message: "A static page's server block cannot read headers, cookies or query", severity: "error", category: "semantic" },
  TW104: { message: "A static page's server block cannot read params without enumerated params (add params.twm / fn generate())", severity: "error", category: "semantic" },
  TW105: { message: "Server blocks in layouts are not supported yet", severity: "error", category: "semantic" },
  TW106: { message: "Request context (headers/cookies/query/params) is not available in a static server block", severity: "error", category: "semantic" },
  TW107: { message: "getSession()/requireUser() are not available in a static page's server block", severity: "error", category: "semantic" },
  TW108: { message: "redirect()/notFound() are not available in a static page's server block", severity: "error", category: "semantic" },
  TW109: { message: "redirect() target must be a same-origin internal path", severity: "error", category: "semantic" },
  TW110: { message: "A cached fetch must not set an Authorization, Proxy-Authorization or Cookie header", severity: "error", category: "semantic" },
  TW111: { message: "A cached page's server block cannot read headers, cookies, getSession() or requireUser()", severity: "error", category: "semantic" },
  TW112: { message: "cache { vary } is only valid on an ssr page (not static)", severity: "error", category: "semantic" },
  TW113: { message: "A server-block value is not serializable (function/Map/Set/Date-class/cycle/...)", severity: "error", category: "semantic" },
  TW114: { message: "The server-block payload exceeds server.maxPayloadBytes", severity: "error", category: "semantic" },
  TW115: { message: "A server-block value reads env (possible secret leak into markup)", severity: "error", category: "semantic" },
  TW116: { message: "SQL-looking template literal interpolates request data (lint)", severity: "warning", category: "semantic" },
  TW117: { message: "fetch() with a request-derived URL (SSRF lint)", severity: "warning", category: "semantic" },
  // Codes thrown outside the rule engine. TW303 comes from the stylesheet
  // parser (codegen/tss.ts); TW000 is the generic fallback used when an error
  // carries no code of its own.
  TW303: { message: "Unbalanced braces in a stylesheet -- a rule block is never closed", severity: "error", category: "syntax" },
  TW000: { message: "Generic error with no specific code", severity: "error", category: "syntax" },
};
