/**
 * LDAP Injection Detector -- detects LDAP injection attacks
 * targeting directory services.
 *
 * @module security/injection/ldap-detector
 */

/** LDAP detection result. */
export interface LDAPDetectionResult {
  detected: boolean;
  confidence: number;
  patterns: string[];
  risk: "none" | "low" | "medium" | "high" | "critical";
}

/** LDAP injection patterns. */
const LDAP_PATTERNS: Array<{ pattern: RegExp; name: string; severity: number }> = [
  // LDAP filter manipulation
  { pattern: /\)\(/, name: "Filter closing + opening", severity: 9 },
  { pattern: /\)\s*\(\|/i, name: "OR filter injection", severity: 10 },
  { pattern: /\)\s*\(&/i, name: "AND filter injection", severity: 9 },
  { pattern: /\)\s*\(!/i, name: "NOT filter injection", severity: 9 },
  { pattern: /\*\s*\)/, name: "Wildcard + filter close", severity: 8 },
  { pattern: /\(\|\(.+\)\(.+\)\)/, name: "Complex OR injection", severity: 10 },

  // Wildcard injection
  { pattern: /^\s*\*/, name: "Leading wildcard", severity: 7 },
  { pattern: /\*+\s*$/, name: "Trailing wildcard", severity: 7 },
  { pattern: /\*{2,}/, name: "Multiple wildcards", severity: 6 },

  // Boolean injection
  { pattern: /(\*|=)\s*(true|false)/i, name: "Boolean value", severity: 6 },

  // LDAP special characters
  { pattern: /\\[0-9a-f]{2}/i, name: "Hex escape", severity: 7 },
  { pattern: /\\\(/, name: "Escaped paren", severity: 5 },
  { pattern: /\\\)/, name: "Escaped paren", severity: 5 },
  { pattern: /\\\*/, name: "Escaped wildcard", severity: 5 },
  { pattern: /\\/, name: "Backslash", severity: 4 },

  // DN injection
  { pattern: /,\s*(dc|ou|cn|dn|o|c)=/i, name: "DN component injection", severity: 8 },
  { pattern: /\bdc\s*=/i, name: "DC attribute", severity: 5 },
  { pattern: /\bou\s*=/i, name: "OU attribute", severity: 5 },
  { pattern: /\bcn\s*=/i, name: "CN attribute", severity: 5 },

  // LDAP bind
  { pattern: /uid\s*=\s*[^,]+,\s*ou/i, name: "Bind DN injection", severity: 8 },

  // NULL byte
  { pattern: /\x00/, name: "Null byte", severity: 9 },

  // Attribute extraction
  { pattern: /\(\|?\(?.*=.*\*.*\)\)?/, name: "Attribute value wildcard", severity: 7 },

  // LDAP search filter keywords
  { pattern: /\bobjectClass\s*=/i, name: "objectClass filter", severity: 6 },
  { pattern: /\bobjectCategory\s*=/i, name: "objectCategory filter", severity: 6 },
  { pattern: /\bsAMAccountName\s*=/i, name: "sAMAccountName (AD)", severity: 7 },
  { pattern: /\buserPassword\s*=/i, name: "userPassword access", severity: 10 },
  { pattern: /\bunicodePwd\s*=/i, name: "unicodePwd access", severity: 10 },
];

/** LDAP special characters that need escaping. */
const LDAP_SPECIAL_CHARS = ["\\", "*", "(", ")", "\x00"];

/** Escapes LDAP special characters. */
function escapeLDAP(input: string): string {
  let result = "";
  for (const char of input) {
    if (LDAP_SPECIAL_CHARS.includes(char)) {
      const hex = char.charCodeAt(0).toString(16).padStart(2, "0");
      result += `\\${hex}`;
    } else {
      result += char;
    }
  }
  return result;
}

/** Risk calculation. */
function riskFromConfidence(confidence: number): LDAPDetectionResult["risk"] {
  if (confidence >= 0.9) return "critical";
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  if (confidence >= 0.2) return "low";
  return "none";
}

/**
 * LDAP Injection Detector -- analyzes input for LDAP injection.
 */
export class LDAPInjectionDetector {
  private patterns: typeof LDAP_PATTERNS;

  constructor() {
    this.patterns = [...LDAP_PATTERNS];
  }

  /** Detects LDAP injection. */
  detect(input: string): LDAPDetectionResult {
    const detectedPatterns: string[] = [];
    let maxSeverity = 0;
    let patternCount = 0;

    for (const { pattern, name, severity } of this.patterns) {
      if (pattern.test(input)) {
        detectedPatterns.push(name);
        maxSeverity = Math.max(maxSeverity, severity);
        patternCount++;
      }
    }

    // Check for LDAP special characters
    for (const char of LDAP_SPECIAL_CHARS) {
      if (input.includes(char)) {
        patternCount++;
        if (char === "\x00") maxSeverity = Math.max(maxSeverity, 9);
      }
    }

    let confidence = 0;
    if (maxSeverity >= 10) confidence = 0.95;
    else if (maxSeverity >= 8) confidence = 0.75;
    else if (maxSeverity >= 6) confidence = 0.5;
    else if (maxSeverity >= 4) confidence = 0.3;
    else if (maxSeverity > 0) confidence = 0.2;

    if (patternCount >= 2) confidence = Math.min(1, confidence + 0.1);
    if (patternCount >= 3) confidence = Math.min(1, confidence + 0.1);

    return {
      detected: confidence >= 0.2,
      confidence,
      patterns: detectedPatterns,
      risk: riskFromConfidence(confidence),
    };
  }

  /** Escapes input for safe LDAP use. */
  sanitize(input: string): string {
    return escapeLDAP(input);
  }

  /** Checks if input is safe. */
  isSafe(input: string): boolean {
    return !this.detect(input).detected;
  }
}

/** Creates a new LDAP injection detector. */
export function createLDAPDetector(): LDAPInjectionDetector {
  return new LDAPInjectionDetector();
}
