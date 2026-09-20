/**
 * HTTP Request Smuggling Prevention -- detects and prevents
 * HTTP request smuggling attacks caused by inconsistent
 * parsing of Content-Length and Transfer-Encoding headers.
 *
 * @module security/smuggling/preventer
 */

/** Smuggling detection result. */
export interface SmugglingResult {
  safe: boolean;
  detected: boolean;
  patterns: string[];
  risk: "none" | "low" | "medium" | "high" | "critical";
}

/** Configuration. */
export interface SmugglingConfig {
  /** Whether to reject ambiguous Content-Length. */
  rejectAmbiguousContentLength?: boolean;
  /** Whether to reject multiple Content-Length headers. */
  rejectMultipleContentLength?: boolean;
  /** Whether to reject Transfer-Encoding: chunked + Content-Length. */
  rejectTEWithContentLength?: boolean;
  /** Whether to reject unknown Transfer-Encoding values. */
  rejectUnknownTransferEncoding?: boolean;
  /** Whether to normalize header casing. */
  normalizeHeaders?: boolean;
}

/**
 * HTTP Request Smuggling Preventer -- validates HTTP headers
 * to prevent request smuggling attacks.
 */
export class SmugglingPreventer {
  private rejectAmbiguousCL: boolean;
  private rejectMultipleCL: boolean;
  private rejectTEWithCL: boolean;
  private rejectUnknownTE: boolean;
  private normalizeHeaders: boolean;

  constructor(config: SmugglingConfig = {}) {
    this.rejectAmbiguousCL = config.rejectAmbiguousContentLength ?? true;
    this.rejectMultipleCL = config.rejectMultipleContentLength ?? true;
    this.rejectTEWithCL = config.rejectTEWithContentLength ?? true;
    this.rejectUnknownTE = config.rejectUnknownTransferEncoding ?? true;
    this.normalizeHeaders = config.normalizeHeaders ?? true;
  }

  /** Validates headers from a request. */
  validate(headers: Headers | Record<string, string>): SmugglingResult {
    const headerObj = headers instanceof Headers
      ? Object.fromEntries(headers.entries())
      : headers;

    const patterns: string[] = [];
    let maxRisk: SmugglingResult["risk"] = "none";

    // Get all header names (case-insensitive)
    const lowerHeaders: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(headerObj)) {
      const lowerKey = key.toLowerCase();
      if (!lowerHeaders[lowerKey]) {
        lowerHeaders[lowerKey] = [];
      }
      lowerHeaders[lowerKey].push(value);
    }

    // Check for multiple Content-Length headers
    const contentLengths = lowerHeaders["content-length"] ?? [];
    if (contentLengths.length > 1) {
      if (this.rejectMultipleCL) {
        patterns.push("Multiple Content-Length headers");
        maxRisk = "critical";
      } else if (contentLengths.some(v => v !== contentLengths[0])) {
        patterns.push("Conflicting Content-Length values");
        maxRisk = "critical";
      }
    }

    // Check for ambiguous Content-Length values
    if (contentLengths.length > 0) {
      for (const cl of contentLengths) {
        // Leading zeros, spaces, or commas
        if (/^[\s0,]+/.test(cl) || /\s/.test(cl) || /,/.test(cl)) {
          patterns.push(`Ambiguous Content-Length: "${cl}"`);
          maxRisk = this.higherRisk(maxRisk, "high");
        }
        // Non-numeric content
        if (!/^\d+$/.test(cl.trim())) {
          patterns.push(`Non-numeric Content-Length: "${cl}"`);
          maxRisk = this.higherRisk(maxRisk, "critical");
        }
        // Negative values
        if (cl.trim().startsWith("-")) {
          patterns.push(`Negative Content-Length: "${cl}"`);
          maxRisk = this.higherRisk(maxRisk, "critical");
        }
      }
    }

    // Check Transfer-Encoding
    const transferEncodings = lowerHeaders["transfer-encoding"] ?? [];
    if (transferEncodings.length > 0) {
      for (const te of transferEncodings) {
        const teValue = te.toLowerCase().trim();

        // Check for chunked
        if (teValue.includes("chunked")) {
          // If both TE: chunked and Content-Length are present
          if (contentLengths.length > 0) {
            if (this.rejectTEWithCL) {
              patterns.push("Transfer-Encoding: chunked with Content-Length");
              maxRisk = this.higherRisk(maxRisk, "critical");
            }
          }
        }

        // Unknown Transfer-Encoding values
        const knownEncodings = ["chunked", "compress", "deflate", "gzip", "identity"];
        const encodings = teValue.split(",").map(e => e.trim().split(";")[0].trim());
        for (const enc of encodings) {
          if (enc && !knownEncodings.includes(enc)) {
            if (this.rejectUnknownTE) {
              patterns.push(`Unknown Transfer-Encoding: "${enc}"`);
              maxRisk = this.higherRisk(maxRisk, "high");
            }
          }
        }

        // Check for obfuscated Transfer-Encoding
        if (/\bchunked\b/i.test(te) && te !== teValue) {
          patterns.push("Obfuscated Transfer-Encoding (case mismatch)");
          maxRisk = this.higherRisk(maxRisk, "high");
        }

        // Check for Transfer-Encoding with space/tab
        if (/transfer-encoding\s*:\s*chunked\s*[,;]/i.test(te)) {
          patterns.push("Transfer-Encoding with trailing characters");
          maxRisk = this.higherRisk(maxRisk, "high");
        }
      }
    }

    // Check for duplicate headers that could cause ambiguity
    for (const [key, values] of Object.entries(lowerHeaders)) {
      if (values.length > 1 && key !== "content-length" && key !== "transfer-encoding") {
        // Some headers are allowed to be duplicated (Set-Cookie, etc.)
        const allowedDuplicates = ["set-cookie", "via", "x-forwarded-for"];
        if (!allowedDuplicates.includes(key)) {
          patterns.push(`Duplicate header: ${key}`);
          maxRisk = this.higherRisk(maxRisk, "low");
        }
      }
    }

    // Check for CRLF injection in headers
    for (const [key, values] of Object.entries(headerObj)) {
      for (const value of values) {
        if (/\r\n|\r|\n/.test(value)) {
          patterns.push(`CRLF in header: ${key}`);
          maxRisk = this.higherRisk(maxRisk, "critical");
        }
      }
    }

    // Check for header name injection
    for (const key of Object.keys(headerObj)) {
      if (/[\r\n]/.test(key)) {
        patterns.push(`CRLF in header name: ${key}`);
        maxRisk = this.higherRisk(maxRisk, "critical");
      }
    }

    const detected = patterns.length > 0;
    return {
      safe: !detected,
      detected,
      patterns,
      risk: maxRisk,
    };
  }

  /** Returns the higher of two risk levels. */
  private higherRisk(a: SmugglingResult["risk"], b: SmugglingResult["risk"]): SmugglingResult["risk"] {
    const order: SmugglingResult["risk"][] = ["none", "low", "medium", "high", "critical"];
    return order.indexOf(a) >= order.indexOf(b) ? a : b;
  }

  /** Checks if headers are safe. */
  isSafe(headers: Headers | Record<string, string>): boolean {
    return this.validate(headers).safe;
  }

  /** Normalizes headers to prevent parsing ambiguity. */
  normalize(headers: Record<string, string>): Record<string, string> {
    if (!this.normalizeHeaders) return headers;

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      // Remove CRLF
      const cleanKey = key.replace(/[\r\n]/g, "");
      const cleanValue = value.replace(/[\r\n]/g, "");
      // Use canonical header name
      const canonical = cleanKey.toLowerCase();
      if (!normalized[canonical]) {
        normalized[canonical] = cleanValue.trim();
      }
    }
    return normalized;
  }
}

/** Creates a new smuggling preventer. */
export function createSmugglingPreventer(config?: SmugglingConfig): SmugglingPreventer {
  return new SmugglingPreventer(config);
}
