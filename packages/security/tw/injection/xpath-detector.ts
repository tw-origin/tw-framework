/**
 * XPath Injection Detector -- detects XPath injection attacks
 * targeting XML/XPath queries.
 *
 * @module security/injection/xpath-detector
 */

/** XPath detection result. */
export interface XPathDetectionResult {
  detected: boolean;
  confidence: number;
  patterns: string[];
  risk: "none" | "low" | "medium" | "high" | "critical";
}

/** XPath injection patterns. */
const XPATH_PATTERNS: Array<{ pattern: RegExp; name: string; severity: number }> = [
  // XPath query manipulation
  { pattern: /'\s*\]/, name: "Quote + bracket", severity: 8 },
  { pattern: /'\s*\)/, name: "Quote + paren", severity: 8 },
  { pattern: /'\s*\[/, name: "Quote + open bracket", severity: 7 },
  { pattern: /'\s*or\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i, name: "OR tautology", severity: 9 },
  { pattern: /'\s*or\s+['"][^'"]+['"]?\s*=\s*['"][^'"]+/i, name: "OR string tautology", severity: 9 },
  { pattern: /'\s*and\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i, name: "AND tautology", severity: 8 },

  // XPath axes
  { pattern: /\/\/ancestor::/i, name: "ancestor axis", severity: 7 },
  { pattern: /\/\/descendant::/i, name: "descendant axis", severity: 7 },
  { pattern: /\/\/parent::/i, name: "parent axis", severity: 6 },
  { pattern: /\/\/child::/i, name: "child axis", severity: 5 },
  { pattern: /\/\/following::/i, name: "following axis", severity: 6 },
  { pattern: /\/\/preceding::/i, name: "preceding axis", severity: 6 },
  { pattern: /\/\/self::/i, name: "self axis", severity: 5 },

  // XPath functions
  { pattern: /\bconcat\s*\(/i, name: "concat()", severity: 6 },
  { pattern: /\bsubstring\s*\(/i, name: "substring()", severity: 6 },
  { pattern: /\bstring\s*\(/i, name: "string()", severity: 5 },
  { pattern: /\bname\s*\(/i, name: "name()", severity: 6 },
  { pattern: /\btext\s*\(/i, name: "text()", severity: 5 },
  { pattern: /\bcount\s*\(/i, name: "count()", severity: 5 },
  { pattern: /\bcontains\s*\(/i, name: "contains()", severity: 7 },
  { pattern: /\bstarts-with\s*\(/i, name: "starts-with()", severity: 6 },
  { pattern: /\bposition\s*\(/i, name: "position()", severity: 5 },
  { pattern: /\blast\s*\(/i, name: "last()", severity: 5 },

  // Node selection
  { pattern: /\/\*\/text\(\)/i, name: "Text node extraction", severity: 8 },
  { pattern: /\/\/\*/i, name: "Wildcard descendant", severity: 7 },
  { pattern: /\/\*\/\*/i, name: "Wildcard path", severity: 6 },

  // Comment injection
  { pattern: /<!--/, name: "XML comment open", severity: 5 },
  { pattern: /-->/, name: "XML comment close", severity: 5 },

  // CDATA injection
  { pattern: /<!\[CDATA\[/i, name: "CDATA injection", severity: 8 },

  // Processing instruction
  { pattern: /<\?/, name: "Processing instruction", severity: 7 },

  // Entity injection
  { pattern: /&(lt|gt|amp|quot|apos);/i, name: "XML entity", severity: 4 },
  { pattern: /&[a-z]+;/i, name: "Custom entity", severity: 6 },

  // Boolean extraction
  { pattern: /'\s*or\s+'?1'?\s*=\s*'?1/i, name: "1=1 XPath", severity: 9 },
  { pattern: /'\s*or\s+'?'?\s*=\s*'?'?/i, name: "Empty string comparison", severity: 8 },
];

/** Escapes XPath string literal. */
function escapeXPathString(input: string): string {
  if (!input.includes("'")) {
    return `'${input}'`;
  }
  if (!input.includes('"')) {
    return `"${input}"`;
  }
  // Both quotes present -- use concat()
  const parts = input.split("'").map(part => `'${part}'`);
  return `concat(${parts.join(",\"'\",")})`;
}

/** Risk calculation. */
function riskFromConfidence(confidence: number): XPathDetectionResult["risk"] {
  if (confidence >= 0.9) return "critical";
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  if (confidence >= 0.2) return "low";
  return "none";
}

/**
 * XPath Injection Detector.
 */
export class XPathInjectionDetector {
  private patterns: typeof XPATH_PATTERNS;

  constructor() {
    this.patterns = [...XPATH_PATTERNS];
  }

  /** Detects XPath injection. */
  detect(input: string): XPathDetectionResult {
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

    let confidence = 0;
    if (maxSeverity >= 9) confidence = 0.9;
    else if (maxSeverity >= 7) confidence = 0.7;
    else if (maxSeverity >= 5) confidence = 0.4;
    else if (maxSeverity > 0) confidence = 0.2;

    if (patternCount >= 2) confidence = Math.min(1, confidence + 0.1);

    return {
      detected: confidence >= 0.2,
      confidence,
      patterns: detectedPatterns,
      risk: riskFromConfidence(confidence),
    };
  }

  /** Escapes input for safe XPath use. */
  sanitize(input: string): string {
    return escapeXPathString(input);
  }

  /** Checks if input is safe. */
  isSafe(input: string): boolean {
    return !this.detect(input).detected;
  }
}

/** Creates a new XPath injection detector. */
export function createXPathDetector(): XPathInjectionDetector {
  return new XPathInjectionDetector();
}
