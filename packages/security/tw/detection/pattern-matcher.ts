/**
 * Pattern-based threat detection -- matches input against threat patterns.
 * @module security/detection
 */

export interface ThreatPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: number;
  category: "xss" | "sqli" | "nosqli" | "command" | "ldap" | "xpath" | "ssrf" | "path-traversal" | "smuggling" | "spam" | "bot";
  description: string;
}

export interface DetectionResult {
  matched: boolean;
  pattern: ThreatPattern | null;
  input: string;
  severity: number;
  matches: Array<{ index: number; match: string; pattern: ThreatPattern }>;
}

export const XSS_PATTERNS: ThreatPattern[] = [
  { id: "xss-001", name: "Script tag injection", pattern: /<script[\s>]/i, severity: 10, category: "xss", description: "Script tag detected in input" },
  { id: "xss-002", name: "Event handler injection", pattern: /on\w+\s*=\s*["']?[^"']*["']?/i, severity: 8, category: "xss", description: "Event handler attribute detected" },
  { id: "xss-003", name: "JavaScript URI", pattern: /javascript:/i, severity: 9, category: "xss", description: "JavaScript URI scheme detected" },
  { id: "xss-004", name: "Data URI with script", pattern: /data:\s*text\/html/i, severity: 8, category: "xss", description: "Data URI with HTML content type" },
  { id: "xss-005", name: "VBScript URI", pattern: /vbscript:/i, severity: 9, category: "xss", description: "VBScript URI scheme detected" },
  { id: "xss-006", name: "Expression filter", pattern: /expression\s*\(/i, severity: 9, category: "xss", description: "CSS expression detected" },
  { id: "xss-007", name: "IMG tag with error handler", pattern: /<img[^>]+onerror\s*=/i, severity: 9, category: "xss", description: "IMG tag with onerror handler" },
  { id: "xss-008", name: "SVG with script", pattern: /<svg[^>]*>.*?<script/i, severity: 10, category: "xss", description: "SVG with embedded script" },
  { id: "xss-009", name: "Iframe injection", pattern: /<iframe[\s>]/i, severity: 8, category: "xss", description: "Iframe tag detected" },
  { id: "xss-010", name: "Object embed", pattern: /<object[\s>]|<embed[\s>]/i, severity: 8, category: "xss", description: "Object/embed tag detected" },
  { id: "xss-011", name: "Body onload", pattern: /<body[^>]+onload\s*=/i, severity: 9, category: "xss", description: "Body tag with onload handler" },
  { id: "xss-012", name: "Style with expression", pattern: /<style[^>]*>[^<]*expression\s*\(/i, severity: 8, category: "xss", description: "Style tag with expression" },
  { id: "xss-013", name: "InnerHTML assignment", pattern: /\.innerHTML\s*=/i, severity: 7, category: "xss", description: "innerHTML assignment detected" },
  { id: "xss-014", name: "Document write", pattern: /document\.write\s*\(/i, severity: 9, category: "xss", description: "document.write detected" },
  { id: "xss-015", name: "Eval call", pattern: /\beval\s*\(/i, severity: 9, category: "xss", description: "eval() call detected" },
  { id: "xss-016", name: "SetTimeout with string", pattern: /setTimeout\s*\(\s*["']/i, severity: 7, category: "xss", description: "setTimeout with string argument" },
  { id: "xss-017", name: "SetInterval with string", pattern: /setInterval\s*\(\s*["']/i, severity: 7, category: "xss", description: "setInterval with string argument" },
  { id: "xss-018", name: "FromCharCode", pattern: /String\.fromCharCode/i, severity: 6, category: "xss", description: "String.fromCharCode used (possible obfuscation)" },
  { id: "xss-019", name: "Escape/unescape", pattern: /\b(escape|unescape)\s*\(/i, severity: 5, category: "xss", description: "escape/unescape function used" },
  { id: "xss-020", name: "Cookie manipulation", pattern: /document\.cookie/i, severity: 8, category: "xss", description: "Cookie manipulation detected" },
];

export const SQL_INJECTION_PATTERNS: ThreatPattern[] = [
  { id: "sqli-001", name: "SQL comment", pattern: /--\s|\/\*.*?\*\//i, severity: 7, category: "sqli", description: "SQL comment detected" },
  { id: "sqli-002", name: "UNION SELECT", pattern: /union\s+select/i, severity: 9, category: "sqli", description: "UNION SELECT statement detected" },
  { id: "sqli-003", name: "OR 1=1", pattern: /\bor\s+1\s*=\s*1|\bor\s+'1'='1'/i, severity: 9, category: "sqli", description: "Boolean-based SQL injection" },
  { id: "sqli-004", name: "AND 1=1", pattern: /\band\s+1\s*=\s*1|\band\s+'1'='1'/i, severity: 9, category: "sqli", description: "Boolean-based SQL injection" },
  { id: "sqli-005", name: "DROP TABLE", pattern: /drop\s+table/i, severity: 10, category: "sqli", description: "DROP TABLE statement detected" },
  { id: "sqli-006", name: "INSERT INTO", pattern: /insert\s+into/i, severity: 8, category: "sqli", description: "INSERT INTO statement detected" },
  { id: "sqli-007", name: "DELETE FROM", pattern: /delete\s+from/i, severity: 9, category: "sqli", description: "DELETE FROM statement detected" },
  { id: "sqli-008", name: "UPDATE SET", pattern: /update\s+\w+\s+set/i, severity: 8, category: "sqli", description: "UPDATE SET statement detected" },
  { id: "sqli-009", name: "EXEC / EXECUTE", pattern: /\bexec(ute)?\s*\(/i, severity: 9, category: "sqli", description: "EXEC/EXECUTE call detected" },
  { id: "sqli-010", name: "xp_cmdshell", pattern: /xp_cmdshell/i, severity: 10, category: "sqli", description: "SQL Server xp_cmdshell detected" },
  { id: "sqli-011", name: "sp_executesql", pattern: /sp_executesql/i, severity: 9, category: "sqli", description: "sp_executesql detected" },
  { id: "sqli-012", name: "WAITFOR DELAY", pattern: /waitfor\s+delay/i, severity: 8, category: "sqli", description: "Time-based SQL injection" },
  { id: "sqli-013", name: "BENCHMARK", pattern: /benchmark\s*\(/i, severity: 8, category: "sqli", description: "MySQL BENCHMARK detected" },
  { id: "sqli-014", name: "SLEEP", pattern: /\bsleep\s*\(/i, severity: 8, category: "sqli", description: "MySQL SLEEP detected" },
  { id: "sqli-015", name: "PG_SLEEP", pattern: /pg_sleep/i, severity: 8, category: "sqli", description: "PostgreSQL pg_sleep detected" },
  { id: "sqli-016", name: "Information schema", pattern: /information_schema/i, severity: 7, category: "sqli", description: "Information schema access detected" },
  { id: "sqli-017", name: "LOAD_FILE", pattern: /load_file\s*\(/i, severity: 9, category: "sqli", description: "MySQL LOAD_FILE detected" },
  { id: "sqli-018", name: "INTO OUTFILE", pattern: /into\s+outfile/i, severity: 9, category: "sqli", description: "MySQL INTO OUTFILE detected" },
  { id: "sqli-019", name: "CHAR function", pattern: /\bchar\s*\(\s*\d+/i, severity: 6, category: "sqli", description: "SQL CHAR function with numeric args" },
  { id: "sqli-020", name: "CONCAT function", pattern: /\bconcat\s*\(/i, severity: 5, category: "sqli", description: "SQL CONCAT function detected" },
  { id: "sqli-021", name: "GROUP BY", pattern: /group\s+by/i, severity: 4, category: "sqli", description: "GROUP BY clause detected" },
  { id: "sqli-022", name: "ORDER BY", pattern: /order\s+by/i, severity: 4, category: "sqli", description: "ORDER BY clause detected" },
  { id: "sqli-023", name: "HAVING clause", pattern: /\bhaving\s+/i, severity: 6, category: "sqli", description: "HAVING clause detected" },
  { id: "sqli-024", name: "Subquery", pattern: /\(\s*select\s+/i, severity: 5, category: "sqli", description: "Subquery detected" },
  { id: "sqli-025", name: "Stacked queries", pattern: /;\s*(select|insert|update|delete|drop|create|alter)/i, severity: 8, category: "sqli", description: "Stacked queries detected" },
];

export const COMMAND_INJECTION_PATTERNS: ThreatPattern[] = [
  { id: "cmd-001", name: "Command chaining", pattern: /(?:;|\||&&|\|\|)\s*(?:ls|cat|rm|mv|cp|wget|curl|bash|sh|python|perl|ruby|php)/i, severity: 9, category: "command", description: "Command chaining detected" },
  { id: "cmd-002", name: "Backticks", pattern: /`[^`]+`/, severity: 8, category: "command", description: "Backtick command execution" },
  { id: "cmd-003", name: "Dollar paren", pattern: /\$\([^)]+\)/, severity: 8, category: "command", description: "$() command substitution" },
  { id: "cmd-004", name: "System call", pattern: /\b(system|exec|popen|proc_open|shell_exec|passthru)\s*\(/i, severity: 9, category: "command", description: "System call function detected" },
  { id: "cmd-005", name: "Netcat", pattern: /\bnc\s|\bnetcat\s/i, severity: 8, category: "command", description: "Netcat command detected" },
  { id: "cmd-006", name: "Reverse shell", pattern: /bash\s+-i\s|\/dev\/tcp/i, severity: 10, category: "command", description: "Reverse shell detected" },
  { id: "cmd-007", name: "Wget download", pattern: /\bwget\s/i, severity: 7, category: "command", description: "Wget command detected" },
  { id: "cmd-008", name: "Curl download", pattern: /\bcurl\s/i, severity: 7, category: "command", description: "Curl command detected" },
  { id: "cmd-009", name: "Chmod", pattern: /\bchmod\s/i, severity: 6, category: "command", description: "Chmod command detected" },
  { id: "cmd-010", name: "Sudo", pattern: /\bsudo\s/i, severity: 7, category: "command", description: "Sudo command detected" },
  { id: "cmd-011", name: "Su", pattern: /\bsu\s/i, severity: 7, category: "command", description: "Su command detected" },
  { id: "cmd-012", name: "Cron manipulation", pattern: /crontab\s|\/etc\/cron/i, severity: 8, category: "command", description: "Cron manipulation detected" },
  { id: "cmd-013", name: "SSH key manipulation", pattern: /\.ssh\/|ssh-keygen/i, severity: 8, category: "command", description: "SSH key manipulation" },
  { id: "cmd-014", name: "Process kill", pattern: /\bkill\s+-9|\bkillall\s/i, severity: 6, category: "command", description: "Process kill command" },
  { id: "cmd-015", name: "Environment variable", pattern: /\$\{?[A-Z_]+\}?/, severity: 4, category: "command", description: "Environment variable reference" },
];

export const PATH_TRAVERSAL_PATTERNS: ThreatPattern[] = [
  { id: "pt-001", name: "Directory traversal", pattern: /\.\.\/|\.\.\\/i, severity: 8, category: "path-traversal", description: "Directory traversal detected" },
  { id: "pt-002", name: "Absolute path", pattern: /^(\/|\\|[A-Za-z]:\\)/, severity: 5, category: "path-traversal", description: "Absolute path detected" },
  { id: "pt-003", name: "Null byte", pattern: /%00|\x00/, severity: 9, category: "path-traversal", description: "Null byte detected" },
  { id: "pt-004", name: "URL encoded dot", pattern: /%2e|%2E/, severity: 6, category: "path-traversal", description: "URL encoded dot detected" },
  { id: "pt-005", name: "URL encoded slash", pattern: /%2f|%2F|%5c|%5C/, severity: 6, category: "path-traversal", description: "URL encoded slash detected" },
  { id: "pt-006", name: "Double encoding", pattern: /%252e|%252f/i, severity: 8, category: "path-traversal", description: "Double URL encoding detected" },
  { id: "pt-007", name: "UNC path", pattern: /\\\\[^\\]+\\/, severity: 7, category: "path-traversal", description: "UNC path detected" },
  { id: "pt-008", name: "etc/passwd", pattern: /\/etc\/passwd/i, severity: 9, category: "path-traversal", description: "Access to /etc/passwd" },
  { id: "pt-009", name: "etc/shadow", pattern: /\/etc\/shadow/i, severity: 10, category: "path-traversal", description: "Access to /etc/shadow" },
  { id: "pt-010", name: "Windows system32", pattern: /c:\\windows\\system32/i, severity: 8, category: "path-traversal", description: "Access to Windows system32" },
  { id: "pt-011", name: "Boot.ini", pattern: /boot\.ini/i, severity: 7, category: "path-traversal", description: "Access to boot.ini" },
  { id: "pt-012", name: "Win.ini", pattern: /win\.ini/i, severity: 7, category: "path-traversal", description: "Access to win.ini" },
];

export const ALL_PATTERNS: ThreatPattern[] = [
  ...XSS_PATTERNS,
  ...SQL_INJECTION_PATTERNS,
  ...COMMAND_INJECTION_PATTERNS,
  ...PATH_TRAVERSAL_PATTERNS,
];

export class PatternMatcher {
  private patterns: ThreatPattern[];
  private customPatterns: ThreatPattern[] = [];

  constructor(patterns: ThreatPattern[] = ALL_PATTERNS) {
    this.patterns = patterns;
  }

  detect(input: string): DetectionResult {
    const matches: Array<{ index: number; match: string; pattern: ThreatPattern }> = [];
    let maxSeverity = 0;
    let matchedPattern: ThreatPattern | null = null;

    const allPatterns = [...this.patterns, ...this.customPatterns];
    for (const pattern of allPatterns) {
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(input)) !== null) {
        matches.push({ index: match.index, match: match[0], pattern });
        if (pattern.severity > maxSeverity) {
          maxSeverity = pattern.severity;
          matchedPattern = pattern;
        }
        if (match.index === regex.lastIndex) regex.lastIndex++;
      }
    }

    return {
      matched: matches.length > 0,
      pattern: matchedPattern,
      input,
      severity: maxSeverity,
      matches,
    };
  }

  detectBatch(inputs: string[]): DetectionResult[] {
    return inputs.map((input) => this.detect(input));
  }

  addPattern(pattern: ThreatPattern): this {
    this.customPatterns.push(pattern);
    return this;
  }

  removePattern(id: string): this {
    this.customPatterns = this.customPatterns.filter((p) => p.id !== id);
    return this;
  }

  getPatterns(): ThreatPattern[] {
    return [...this.patterns, ...this.customPatterns];
  }

  getPatternsByCategory(category: ThreatPattern["category"]): ThreatPattern[] {
    return this.getPatterns().filter((p) => p.category === category);
  }

  getPatternsBySeverity(minSeverity: number): ThreatPattern[] {
    return this.getPatterns().filter((p) => p.severity >= minSeverity);
  }

  clearCustomPatterns(): void {
    this.customPatterns = [];
  }
}

export function detectThreats(input: string): DetectionResult {
  const matcher = new PatternMatcher();
  return matcher.detect(input);
}

export function detectXSS(input: string): DetectionResult {
  const matcher = new PatternMatcher(XSS_PATTERNS);
  return matcher.detect(input);
}

export function detectSQLInjection(input: string): DetectionResult {
  const matcher = new PatternMatcher(SQL_INJECTION_PATTERNS);
  return matcher.detect(input);
}

export function detectCommandInjection(input: string): DetectionResult {
  const matcher = new PatternMatcher(COMMAND_INJECTION_PATTERNS);
  return matcher.detect(input);
}

export function detectPathTraversal(input: string): DetectionResult {
  const matcher = new PatternMatcher(PATH_TRAVERSAL_PATTERNS);
  return matcher.detect(input);
}

export function detectAll(inputs: string[]): DetectionResult[] {
  const matcher = new PatternMatcher();
  return matcher.detectBatch(inputs);
}

export function getThreatScore(input: string): number {
  const result = detectThreats(input);
  return result.severity;
}

export function isMalicious(input: string, threshold: number = 5): boolean {
  return getThreatScore(input) >= threshold;
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/&/g, "&amp;")
    .replace(/\//g, "&#x2F;");
}

export function sanitizeInputDeep(input: string): string {
  let result = input;
  result = sanitizeInput(result);
  result = result.replace(/javascript:/gi, "");
  result = result.replace(/vbscript:/gi, "");
  result = result.replace(/on\w+\s*=/gi, "");
  result = result.replace(/expression\s*\(/gi, "");
  result = result.replace(/data:\s*text\/html/gi, "");
  return result;
}

export function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createCustomPattern(id: string, name: string, pattern: string, severity: number, category: ThreatPattern["category"], description: string): ThreatPattern {
  return { id, name, pattern: new RegExp(pattern, "i"), severity, category, description };
}

export function scanFileContent(content: string): DetectionResult[] {
  const lines = content.split("\n");
  const matcher = new PatternMatcher();
  return lines.map((line) => matcher.detect(line)).filter((r) => r.matched);
}

export function scanObject(obj: Record<string, unknown>): Array<{ key: string; result: DetectionResult }> {
  const matcher = new PatternMatcher();
  const results: Array<{ key: string; result: DetectionResult }> = [];
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      const result = matcher.detect(value);
      if (result.matched) {
        results.push({ key, result });
      }
    }
  }
  return results;
}

export function scanDeep(obj: unknown, path: string = ""): Array<{ path: string; result: DetectionResult }> {
  const matcher = new PatternMatcher();
  const results: Array<{ path: string; result: DetectionResult }> = [];
  if (typeof obj === "string") {
    const result = matcher.detect(obj);
    if (result.matched) results.push({ path, result });
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      results.push(...scanDeep(item, path ? `${path}[${i}]` : `[${i}]`));
    });
  } else if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      results.push(...scanDeep(value, currentPath));
    }
  }
  return results;
}

export class ThreatScanner {
  private matcher: PatternMatcher;
  private log: Array<{ timestamp: number; input: string; result: DetectionResult }> = [];
  private maxLogSize: number;

  constructor(maxLogSize: number = 1000) {
    this.matcher = new PatternMatcher();
    this.maxLogSize = maxLogSize;
  }

  scan(input: string): DetectionResult {
    const result = this.matcher.detect(input);
    if (result.matched) {
      this.log.push({ timestamp: Date.now(), input, result });
      if (this.log.length > this.maxLogSize) this.log.shift();
    }
    return result;
  }

  scanBatch(inputs: string[]): DetectionResult[] {
    return inputs.map((input) => this.scan(input));
  }

  scanObject(obj: Record<string, unknown>): Array<{ key: string; result: DetectionResult }> {
    return scanObject(obj);
  }

  scanDeep(obj: unknown): Array<{ path: string; result: DetectionResult }> {
    return scanDeep(obj);
  }

  getLog(): Array<{ timestamp: number; input: string; result: DetectionResult }> {
    return [...this.log];
  }

  getThreats(): Array<{ timestamp: number; input: string; result: DetectionResult }> {
    return this.log.filter((entry) => entry.result.matched);
  }

  getThreatsByCategory(category: ThreatPattern["category"]): Array<{ timestamp: number; input: string; result: DetectionResult }> {
    return this.log.filter((entry) => entry.result.pattern?.category === category);
  }

  getThreatsBySeverity(minSeverity: number): Array<{ timestamp: number; input: string; result: DetectionResult }> {
    return this.log.filter((entry) => entry.result.severity >= minSeverity);
  }

  getThreatCount(): number {
    return this.log.length;
  }

  getThreatRate(): number {
    return this.log.length;
  }

  clearLog(): void {
    this.log = [];
  }

  addPattern(pattern: ThreatPattern): this {
    this.matcher.addPattern(pattern);
    return this;
  }

  removePattern(id: string): this {
    this.matcher.removePattern(id);
    return this;
  }
}

export function getPatternCount(): number {
  return ALL_PATTERNS.length;
}

export function getPatternsByCategory(): Record<ThreatPattern["category"], ThreatPattern[]> {
  const result = {} as Record<ThreatPattern["category"], ThreatPattern[]>;
  for (const pattern of ALL_PATTERNS) {
    if (!result[pattern.category]) result[pattern.category] = [];
    result[pattern.category].push(pattern);
  }
  return result;
}

export function getPatternStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const pattern of ALL_PATTERNS) {
    stats[pattern.category] = (stats[pattern.category] ?? 0) + 1;
  }
  return stats;
}
