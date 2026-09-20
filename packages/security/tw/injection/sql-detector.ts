/**
 * SQL Injection Detector -- detects and prevents SQL injection
 * attacks using pattern matching, syntax analysis, and
 * context-aware validation.
 *
 * @module security/injection/sql-detector
 */

/** SQL injection detection result. */
export interface SQLDetectionResult {
  detected: boolean;
  confidence: number; // 0-1
  patterns: string[];
  sanitized: string;
  risk: "none" | "low" | "medium" | "high" | "critical";
}

/** SQL keywords that are commonly used in injection attacks. */
const SQL_KEYWORDS = [
  "SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "UNION",
  "OR", "AND", "WHERE", "FROM", "INTO", "VALUES",
  "EXEC", "EXECUTE", "DECLARE", "CAST", "CONVERT",
  "WAITFOR", "DELAY", "SHUTDOWN", "xp_cmdshell",
  "INFORMATION_SCHEMA", "SYSOBJECTS", "SYS.TABLES",
  "BENCHMARK", "SLEEP", "LOAD_FILE", "OUTFILE",
  "CHAR", "NCHAR", "VARCHAR", "NVARCHAR",
  "CONCAT", "GROUP_CONCAT", "HEX", "UNHEX",
  "IF", "IFNULL", "COALESCE", "CASE", "WHEN", "THEN", "ELSE", "END",
  "SUBSTRING", "MID", "LEFT", "RIGHT", "LEN", "LENGTH",
  "TOP", "LIMIT", "OFFSET", "ORDER", "BY", "GROUP",
  "HAVING", "JOIN", "INNER", "LEFT", "RIGHT", "OUTER",
  "CREATE", "ALTER", "TRUNCATE", "RENAME",
  "GRANT", "REVOKE", "COMMIT", "ROLLBACK",
];

/** SQL operators used in injection. */
const SQL_OPERATORS = [
  "=", "<>", "!=", ">", "<", ">=", "<=",
  "LIKE", "IN", "BETWEEN", "IS", "NOT",
  "EXISTS", "ANY", "ALL", "SOME",
];

/** SQL comment syntax patterns. */
const SQL_COMMENTS = [
  "--", "/*", "*/", "#", ";--", ";#",
];

/** Dangerous SQL patterns -- ordered by severity. */
const INJECTION_PATTERNS: Array<{ pattern: RegExp; name: string; severity: number }> = [
  // Classic OR/AND injection
  { pattern: /(\s|^)(or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i, name: "OR/AND tautology", severity: 9 },
  { pattern: /(\s|^)(or|and)\s+['"][^'"]*['"]?\s*=\s*['"][^'"]*['"]?/i, name: "OR/AND string tautology", severity: 9 },
  { pattern: /(\s|^)(or|and)\s+\d+\s*=\s*\d+/i, name: "Numeric OR/AND tautology", severity: 8 },

  // UNION-based injection
  { pattern: /union\s+(all\s+)?select/i, name: "UNION SELECT", severity: 10 },
  { pattern: /union\s+(all\s+)?select.*from/i, name: "UNION SELECT FROM", severity: 10 },

  // Comment-based injection
  { pattern: /--\s*$/m, name: "SQL comment (--)", severity: 6 },
  { pattern: /\/\*.*?\*\//s, name: "SQL block comment", severity: 5 },
  { pattern: /#.*$/m, name: "SQL comment (#)", severity: 5 },
  { pattern: /;.*--/i, name: "Statement + comment", severity: 8 },

  // Stacked queries
  { pattern: /;\s*(drop|delete|update|insert|create|alter|truncate|exec)/i, name: "Stacked query", severity: 10 },

  // Time-based blind injection
  { pattern: /waitfor\s+delay\s+['"]/i, name: "WAITFOR DELAY", severity: 9 },
  { pattern: /benchmark\s*\(/i, name: "BENCHMARK()", severity: 9 },
  { pattern: /pg_sleep\s*\(/i, name: "pg_sleep()", severity: 9 },
  { pattern: /sleep\s*\(\s*\d+\s*\)/i, name: "SLEEP()", severity: 8 },

  // Information schema access
  { pattern: /information_schema\.(tables|columns|schemata)/i, name: "Info schema access", severity: 8 },
  { pattern: /sys\.(tables|columns|objects)/i, name: "System table access", severity: 8 },

  // File operations
  { pattern: /load_file\s*\(/i, name: "LOAD_FILE()", severity: 10 },
  { pattern: /into\s+outfile/i, name: "INTO OUTFILE", severity: 10 },
  { pattern: /into\s+dumpfile/i, name: "INTO DUMPFILE", severity: 10 },

  // Command execution
  { pattern: /xp_cmdshell/i, name: "xp_cmdshell", severity: 10 },
  { pattern: /;\s*exec/i, name: "EXEC", severity: 9 },

  // Type casting for blind injection
  { pattern: /cast\s*\(/i, name: "CAST()", severity: 4 },
  { pattern: /convert\s*\(/i, name: "CONVERT()", severity: 4 },

  // String manipulation
  { pattern: /char\s*\(\s*\d+/i, name: "CHAR()", severity: 5 },
  { pattern: /concat\s*\(/i, name: "CONCAT()", severity: 4 },
  { pattern: /group_concat\s*\(/i, name: "GROUP_CONCAT()", severity: 7 },

  // Hex encoding
  { pattern: /0x[0-9a-f]{8,}/i, name: "Hex string", severity: 5 },
  { pattern: /unhex\s*\(/i, name: "UNHEX()", severity: 6 },

  // Boolean blind injection
  { pattern: /(\s|^)and\s+substring\s*\(/i, name: "AND SUBSTRING()", severity: 7 },
  { pattern: /(\s|^)and\s+mid\s*\(/i, name: "AND MID()", severity: 7 },
  { pattern: /(\s|^)and\s+left\s*\(/i, name: "AND LEFT()", severity: 7 },
  { pattern: /(\s|^)and\s+right\s*\(/i, name: "AND RIGHT()", severity: 7 },
  { pattern: /(\s|^)and\s+ascii\s*\(/i, name: "AND ASCII()", severity: 7 },

  // LIKE injection
  { pattern: /'\s*(or|and)\s+.*like/i, name: "LIKE injection", severity: 6 },

  // Boolean expressions
  { pattern: /!\d/, name: "NOT expression", severity: 3 },
  { pattern: /1=1/, name: "1=1 tautology", severity: 9 },
  { pattern: /true\s*=\s*true/i, name: "TRUE=TRUE", severity: 8 },
  { pattern: /false\s*=\s*false/i, name: "FALSE=FALSE", severity: 8 },
];

/** Escapes a string for safe SQL use. */
function escapeForSQL(input: string): string {
  return input
    .replace(/'/g, "''")
    .replace(/\\/g, "\\\\")
    .replace(/\x00/g, "\\0")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\x1a/g, "\\Z");
}

/** Calculates risk level from confidence score. */
function riskFromConfidence(confidence: number): SQLDetectionResult["risk"] {
  if (confidence >= 0.9) return "critical";
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  if (confidence >= 0.2) return "low";
  return "none";
}

/**
 * SQL Injection Detector -- analyzes input strings for SQL
 * injection patterns and provides sanitized output.
 */
export class SQLInjectionDetector {
  private patterns: typeof INJECTION_PATTERNS;
  private keywords: Set<string>;
  private comments: string[];
  private sanitizeMode: "escape" | "reject";

  constructor(options?: { sanitizeMode?: "escape" | "reject"; customPatterns?: typeof INJECTION_PATTERNS }) {
    this.patterns = options?.customPatterns ?? INJECTION_PATTERNS;
    this.keywords = new Set(SQL_KEYWORDS);
    this.comments = [...SQL_COMMENTS];
    this.sanitizeMode = options?.sanitizeMode ?? "escape";
  }

  /**
   * Detects SQL injection in a string.
   * Returns detection result with confidence, patterns, and sanitized output.
   */
  detect(input: string): SQLDetectionResult {
    const detectedPatterns: string[] = [];
    let maxSeverity = 0;
    let patternCount = 0;

    // Run pattern matching
    for (const { pattern, name, severity } of this.patterns) {
      if (pattern.test(input)) {
        detectedPatterns.push(name);
        maxSeverity = Math.max(maxSeverity, severity);
        patternCount++;
      }
    }

    // Keyword analysis
    const upperInput = input.toUpperCase();
    let keywordCount = 0;
    for (const keyword of this.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, "g");
      const matches = upperInput.match(regex);
      if (matches) {
        keywordCount += matches.length;
      }
    }

    // Comment detection
    let commentCount = 0;
    for (const comment of this.comments) {
      if (input.includes(comment)) {
        commentCount++;
      }
    }

    // Quote analysis -- count unescaped quotes
    const unescapedQuotes = (input.match(/(?<!\\)'/g) ?? []).length;
    const hasUnclosedQuote = unescapedQuotes % 2 !== 0;

    // Calculate confidence
    let confidence = 0;

    if (maxSeverity >= 9) confidence = Math.max(confidence, 0.9);
    else if (maxSeverity >= 7) confidence = Math.max(confidence, 0.7);
    else if (maxSeverity >= 5) confidence = Math.max(confidence, 0.4);
    else if (maxSeverity > 0) confidence = Math.max(confidence, 0.2);

    // Multiple patterns increase confidence
    if (patternCount >= 2) confidence = Math.min(1, confidence + 0.1);
    if (patternCount >= 3) confidence = Math.min(1, confidence + 0.1);

    // Keyword density
    if (keywordCount >= 3 && input.length < 100) confidence = Math.min(1, confidence + 0.1);
    if (keywordCount >= 5) confidence = Math.min(1, confidence + 0.1);

    // Comment presence
    if (commentCount > 0) confidence = Math.min(1, confidence + 0.1);

    // Unclosed quotes
    if (hasUnclosedQuote) confidence = Math.min(1, confidence + 0.15);

    // Very short input with SQL keywords
    if (input.length < 20 && keywordCount >= 2) confidence = Math.min(1, confidence + 0.1);

    const detected = confidence >= 0.2;
    const sanitized = this.sanitizeMode === "escape" ? escapeForSQL(input) : "";

    return {
      detected,
      confidence,
      patterns: detectedPatterns,
      sanitized,
      risk: riskFromConfidence(confidence),
    };
  }

  /** Checks if input is safe (no injection detected). */
  isSafe(input: string): boolean {
    return !this.detect(input).detected;
  }

  /** Returns a sanitized version of the input. */
  sanitize(input: string): string {
    const result = this.detect(input);
    if (result.detected && this.sanitizeMode === "reject") {
      return "";
    }
    return result.sanitized;
  }

  /** Validates multiple parameters at once. */
  validateBatch(inputs: Record<string, string>): Array<{ field: string; result: SQLDetectionResult }> {
    return Object.entries(inputs).map(([field, value]) => ({
      field,
      result: this.detect(value),
    }));
  }

  /** Adds a custom detection pattern. */
  addPattern(pattern: RegExp, name: string, severity: number): void {
    this.patterns.push({ pattern, name, severity });
  }
}

/** Creates a new SQL injection detector. */
export function createSQLDetector(options?: { sanitizeMode?: "escape" | "reject" }): SQLInjectionDetector {
  return new SQLInjectionDetector(options);
}
