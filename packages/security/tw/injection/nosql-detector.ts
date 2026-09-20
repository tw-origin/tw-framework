/**
 * NoSQL Injection Detector -- detects and prevents NoSQL injection
 * attacks targeting MongoDB, Redis, and similar databases.
 *
 * Detects: $gt, $ne, $where, $regex, $in, $nin, MapReduce,
 * JavaScript injection, JSON structure manipulation, and
 * BSON type confusion attacks.
 *
 * @module security/injection/nosql-detector
 */

/** NoSQL detection result. */
export interface NoSQLDetectionResult {
  detected: boolean;
  confidence: number;
  patterns: string[];
  risk: "none" | "low" | "medium" | "high" | "critical";
}

/** Dangerous MongoDB operators. */
const MONGO_OPERATORS: Array<{ name: string; severity: number }> = [
  { name: "$gt", severity: 8 },
  { name: "$gte", severity: 8 },
  { name: "$lt", severity: 8 },
  { name: "$lte", severity: 8 },
  { name: "$ne", severity: 9 },
  { name: "$nin", severity: 7 },
  { name: "$in", severity: 6 },
  { name: "$not", severity: 6 },
  { name: "$or", severity: 5 },
  { name: "$and", severity: 5 },
  { name: "$nor", severity: 6 },
  { name: "$where", severity: 10 },
  { name: "$regex", severity: 8 },
  { name: "$exists", severity: 6 },
  { name: "$type", severity: 7 },
  { name: "$mod", severity: 6 },
  { name: "$size", severity: 5 },
  { name: "$all", severity: 5 },
  { name: "$elemMatch", severity: 7 },
  { name: "$slice", severity: 4 },
  { name: "$mapReduce", severity: 10 },
  { name: "$function", severity: 10 },
  { name: "$accumulator", severity: 8 },
  { name: "$merge", severity: 7 },
  { name: "$out", severity: 8 },
  { name: "$lookup", severity: 6 },
  { name: "$graphLookup", severity: 6 },
  { name: "$expr", severity: 7 },
  { name: "$jsonSchema", severity: 6 },
  { name: "$text", severity: 5 },
];

/** NoSQL injection patterns. */
const NOSQL_PATTERNS: Array<{ pattern: RegExp; name: string; severity: number }> = [
  // MongoDB operator injection
  { pattern: /\$where\s*:/i, name: "$where operator", severity: 10 },
  { pattern: /\$ne\s*:/i, name: "$ne (not equal)", severity: 9 },
  { pattern: /\$gt\s*:/i, name: "$gt (greater than)", severity: 8 },
  { pattern: /\$gte\s*:/i, name: "$gte", severity: 8 },
  { pattern: /\$lt\s*:/i, name: "$lt (less than)", severity: 8 },
  { pattern: /\$lte\s*:/i, name: "$lte", severity: 8 },
  { pattern: /\$regex\s*:/i, name: "$regex injection", severity: 8 },
  { pattern: /\$in\s*:/i, name: "$in operator", severity: 6 },
  { pattern: /\$nin\s*:/i, name: "$nin operator", severity: 7 },
  { pattern: /\$or\s*:\s*\[/i, name: "$or array", severity: 6 },
  { pattern: /\$and\s*:\s*\[/i, name: "$and array", severity: 5 },
  { pattern: /\$expr\s*:/i, name: "$expr", severity: 7 },

  // JavaScript injection (MongoDB $where, MapReduce)
  { pattern: /function\s*\(/i, name: "JavaScript function", severity: 8 },
  { pattern: /return\s+this\./i, name: "this. access", severity: 8 },
  { pattern: /eval\s*\(/i, name: "eval()", severity: 9 },
  { pattern: /new\s+Function\s*\(/i, name: "new Function()", severity: 9 },
  { pattern: /toString\s*\(\s*\)/i, name: "toString()", severity: 5 },

  // BSON type confusion
  { pattern: /NumberInt\s*\(/i, name: "NumberInt()", severity: 6 },
  { pattern: /NumberLong\s*\(/i, name: "NumberLong()", severity: 6 },
  { pattern: /ObjectId\s*\(/i, name: "ObjectId()", severity: 5 },
  { pattern: /ISODate\s*\(/i, name: "ISODate()", severity: 5 },
  { pattern: /BinData\s*\(/i, name: "BinData()", severity: 7 },

  // JSON structure injection
  { pattern: /\{.*\$.*\}/, name: "JSON with $ operator", severity: 7 },
  { pattern: /\{.*\.\$.*\}/, name: "Dot notation $ access", severity: 7 },

  // Redis injection
  { pattern: /(\r\n|\r|\n).*[a-z]+\s+/i, name: "CRLF injection (Redis)", severity: 8 },
  { pattern: /\b(config|flushall|flushdb|shutdown|debug)\b/i, name: "Redis dangerous command", severity: 9 },

  // Boolean injection
  { pattern: /\{\s*["']?\$ne["']?\s*:\s*(true|false|null)\s*\}/i, name: "Boolean $ne", severity: 9 },
  { pattern: /\{\s*["']?\$gt["']?\s*:\s*["']?["']?\s*\}/i, name: "Empty $gt", severity: 9 },

  // MapReduce injection
  { pattern: /mapreduce\s*\(/i, name: "MapReduce call", severity: 10 },
  { pattern: /\$map\s*:/i, name: "$map operator", severity: 8 },
  { pattern: /\$reduce\s*:/i, name: "$reduce operator", severity: 8 },
];

/** Recursively sanitizes an object by removing dangerous operators. */
function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // Remove keys that start with $ (MongoDB operators)
      if (key.startsWith("$")) {
        continue;
      }
      result[key] = sanitizeValue(val);
    }
    return result;
  }
  return value;
}

/** Calculates risk level. */
function riskFromConfidence(confidence: number): NoSQLDetectionResult["risk"] {
  if (confidence >= 0.9) return "critical";
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  if (confidence >= 0.2) return "low";
  return "none";
}

/**
 * NoSQL Injection Detector -- analyzes input for NoSQL injection.
 */
export class NoSQLInjectionDetector {
  private patterns: typeof NOSQL_PATTERNS;
  private mongoOperators: Map<string, number>;

  constructor(options?: { customPatterns?: typeof NOSQL_PATTERNS }) {
    this.patterns = options?.customPatterns ?? NOSQL_PATTERNS;
    this.mongoOperators = new Map(MONGO_OPERATORS.map(o => [o.name, o.severity]));
  }

  /** Detects NoSQL injection in a string input. */
  detect(input: string): NoSQLDetectionResult {
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

    // Check for MongoDB operators in the string
    for (const [op, severity] of this.mongoOperators) {
      if (input.includes(op)) {
        if (!detectedPatterns.includes(op)) {
          detectedPatterns.push(op);
        }
        maxSeverity = Math.max(maxSeverity, severity);
        patternCount++;
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

  /** Detects NoSQL injection in an object (parsed JSON). */
  detectObject(obj: unknown): NoSQLDetectionResult {
    const jsonStr = JSON.stringify(obj);
    const stringResult = this.detect(jsonStr);

    // Also check for $-prefixed keys in nested objects
    const hasDollarKeys = JSON.stringify(obj).match(/"\$[a-z]+"/i) !== null;
    if (hasDollarKeys) {
      stringResult.confidence = Math.min(1, stringResult.confidence + 0.2);
      stringResult.detected = true;
      if (!stringResult.patterns.includes("$ operator in keys")) {
        stringResult.patterns.push("$ operator in keys");
      }
    }

    return {
      ...stringResult,
      risk: riskFromConfidence(stringResult.confidence),
    };
  }

  /** Sanitizes an object by removing all $-prefixed keys. */
  sanitize<T>(input: T): T {
    if (typeof input === "string") {
      const result = this.detect(input);
      if (result.detected) {
        return "" as unknown as T;
      }
      return input;
    }
    return sanitizeValue(input) as T;
  }

  /** Checks if input is safe. */
  isSafe(input: string | unknown): boolean {
    if (typeof input === "string") {
      return !this.detect(input).detected;
    }
    return !this.detectObject(input).detected;
  }
}

/** Creates a new NoSQL injection detector. */
export function createNoSQLDetector(): NoSQLInjectionDetector {
  return new NoSQLInjectionDetector();
}
