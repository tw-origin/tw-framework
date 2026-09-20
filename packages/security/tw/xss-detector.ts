/**
 * XSS detector -- detects potential XSS vulnerabilities in code and HTML.
 * @module security
 */

export interface XSSDetectionResult {
  vulnerable: boolean;
  severity: "low" | "medium" | "high" | "critical";
  type: string;
  location: { line: number; column: number; offset: number };
  snippet: string;
  recommendation: string;
  cwe: string;
}

export class XSSDetector {
  private patterns: Array<{ name: string; regex: RegExp; severity: "low" | "medium" | "high" | "critical"; cwe: string; recommendation: string }>;
  private stats = { totalScans: 0, totalFindings: 0, criticalFindings: 0, highFindings: 0, mediumFindings: 0, lowFindings: 0 };

  constructor() {
    this.patterns = [
      { name: "innerHTML assignment", regex: /innerHTML\s*=\s*[^;]+/g, severity: "high", cwe: "CWE-79", recommendation: "Use textContent instead of innerHTML, or sanitize the input" },
      { name: "outerHTML assignment", regex: /outerHTML\s*=\s*[^;]+/g, severity: "high", cwe: "CWE-79", recommendation: "Avoid setting outerHTML with user input" },
      { name: "document.write", regex: /document\.write\s*\(/g, severity: "critical", cwe: "CWE-79", recommendation: "Avoid document.write, use DOM APIs instead" },
      { name: "document.writeln", regex: /document\.writeln\s*\(/g, severity: "critical", cwe: "CWE-79", recommendation: "Avoid document.writeln, use DOM APIs instead" },
      { name: "eval call", regex: /eval\s*\(/g, severity: "critical", cwe: "CWE-95", recommendation: "Avoid eval, use Function constructor or JSON.parse" },
      { name: "Function constructor", regex: /new\s+Function\s*\(/g, severity: "high", cwe: "CWE-95", recommendation: "Avoid new Function with user input" },
      { name: "setTimeout string", regex: /setTimeout\s*\(\s*["'`]/g, severity: "high", cwe: "CWE-95", recommendation: "Use setTimeout with a function, not a string" },
      { name: "setInterval string", regex: /setInterval\s*\(\s*["'`]/g, severity: "high", cwe: "CWE-95", recommendation: "Use setInterval with a function, not a string" },
      { name: "insertAdjacentHTML", regex: /insertAdjacentHTML\s*\(/g, severity: "high", cwe: "CWE-79", recommendation: "Use DOM APIs or sanitize input before inserting" },
      { name: "javascript: protocol", regex: /javascript:/gi, severity: "critical", cwe: "CWE-79", recommendation: "Remove javascript: protocol from URLs" },
      { name: "onerror handler", regex: /onerror\s*=/gi, severity: "high", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "onload handler", regex: /onload\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "onclick handler", regex: /onclick\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "onmouseover handler", regex: /onmouseover\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "onfocus handler", regex: /onfocus\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "onblur handler", regex: /onblur\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "onsubmit handler", regex: /onsubmit\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "onchange handler", regex: /onchange\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "oninput handler", regex: /oninput\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "onkeydown handler", regex: /onkeydown\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "onkeyup handler", regex: /onkeyup\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "onkeypress handler", regex: /onkeypress\s*=/gi, severity: "medium", cwe: "CWE-79", recommendation: "Use addEventListener instead of inline handlers" },
      { name: "iframe injection", regex: /<iframe[^>]*src\s*=\s*["'`]?[^"'`>]*["'`]?[^>]*>/gi, severity: "high", cwe: "CWE-79", recommendation: "Validate and sanitize iframe sources" },
      { name: "script injection", regex: /<script[^>]*>.*?<\/script>/gis, severity: "critical", cwe: "CWE-79", recommendation: "Remove inline scripts, use external scripts" },
      { name: "object injection", regex: /<object[^>]*>/gi, severity: "high", cwe: "CWE-79", recommendation: "Validate and sanitize object sources" },
      { name: "embed injection", regex: /<embed[^>]*>/gi, severity: "high", cwe: "CWE-79", recommendation: "Validate and sanitize embed sources" },
      { name: "svg onload", regex: /<svg[^>]*onload\s*=/gi, severity: "critical", cwe: "CWE-79", recommendation: "Remove onload from SVG elements" },
      { name: "img onerror", regex: /<img[^>]*onerror\s*=/gi, severity: "critical", cwe: "CWE-79", recommendation: "Remove onerror from img elements" },
      { name: "body onload", regex: /<body[^>]*onload\s*=/gi, severity: "high", cwe: "CWE-79", recommendation: "Remove onload from body element" },
      { name: "data: URI", regex: /data:[^"'\s)]+/gi, severity: "medium", cwe: "CWE-79", recommendation: "Validate data: URIs, especially in src attributes" },
      { name: "vbscript: protocol", regex: /vbscript:/gi, severity: "critical", cwe: "CWE-79", recommendation: "Remove vbscript: protocol" },
      { name: "expression()", regex: /expression\s*\(/gi, severity: "critical", cwe: "CWE-79", recommendation: "Remove CSS expression()" },
      { name: "import()", regex: /import\s*\(/g, severity: "high", cwe: "CWE-95", recommendation: "Avoid dynamic import with user input" },
      { name: "require()", regex: /require\s*\(/g, severity: "high", cwe: "CWE-95", recommendation: "Avoid require with user input" },
      { name: "globalThis access", regex: /globalThis\s*\[/g, severity: "medium", cwe: "CWE-95", recommendation: "Avoid dynamic property access on globalThis" },
      { name: "window access", regex: /window\s*\[/g, severity: "medium", cwe: "CWE-95", recommendation: "Avoid dynamic property access on window" },
      { name: "self access", regex: /self\s*\[/g, severity: "medium", cwe: "CWE-95", recommendation: "Avoid dynamic property access on self" },
      { name: "top access", regex: /top\s*\[/g, severity: "medium", cwe: "CWE-95", recommendation: "Avoid dynamic property access on top" },
      { name: "frames access", regex: /frames\s*\[/g, severity: "medium", cwe: "CWE-95", recommendation: "Avoid dynamic property access on frames" },
      { name: "location assignment", regex: /location\s*=\s*[^;]+/g, severity: "high", cwe: "CWE-601", recommendation: "Validate location before assignment to prevent open redirect" },
      { name: "location.href assignment", regex: /location\.href\s*=\s*[^;]+/g, severity: "high", cwe: "CWE-601", recommendation: "Validate URL before assignment" },
      { name: "location.assign", regex: /location\.assign\s*\(/g, severity: "high", cwe: "CWE-601", recommendation: "Validate URL before assignment" },
      { name: "location.replace", regex: /location\.replace\s*\(/g, severity: "high", cwe: "CWE-601", recommendation: "Validate URL before replacement" },
      { name: "window.open", regex: /window\.open\s*\(/g, severity: "medium", cwe: "CWE-601", recommendation: "Validate URL before opening" },
      { name: "form.action", regex: /action\s*=\s*["'`]?[^"'`>]*["'`]?/gi, severity: "medium", cwe: "CWE-601", recommendation: "Validate form action attribute" },
      { name: "anchor.href", regex: /href\s*=\s*["'`]?javascript:/gi, severity: "critical", cwe: "CWE-79", recommendation: "Remove javascript: protocol from href" },
      { name: "meta refresh", regex: /<meta[^>]*http-equiv\s*=\s*["'`]?refresh/gi, severity: "medium", cwe: "CWE-601", recommendation: "Validate meta refresh URLs" },
      { name: "base href", regex: /<base[^>]*href\s*=/gi, severity: "medium", cwe: "CWE-601", recommendation: "Validate base href" },
      { name: "XMLHttpRequest open", regex: /XMLHttpRequest\s*\(/g, severity: "low", cwe: "CWE-918", recommendation: "Validate URLs in XMLHttpRequest" },
      { name: "fetch call", regex: /fetch\s*\(/g, severity: "low", cwe: "CWE-918", recommendation: "Validate URLs in fetch calls" },
      { name: "WebSocket constructor", regex: /new\s+WebSocket\s*\(/g, severity: "low", cwe: "CWE-918", recommendation: "Validate WebSocket URLs" },
      { name: "postMessage", regex: /postMessage\s*\(/g, severity: "medium", cwe: "CWE-345", recommendation: "Validate origin in postMessage calls" },
      { name: "addEventListener message", regex: /addEventListener\s*\(\s*["'`]message/g, severity: "medium", cwe: "CWE-345", recommendation: "Validate origin in message event handlers" },
    ];
  }

  scan(code: string): XSSDetectionResult[] {
    this.stats.totalScans++;
    const findings: XSSDetectionResult[] = [];
    for (const pattern of this.patterns) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(code)) !== null) {
        const offset = match.index;
        const before = code.slice(0, offset);
        const line = before.split("\n").length;
        const column = offset - before.lastIndexOf("\n");
        const snippet = code.slice(Math.max(0, offset - 20), Math.min(code.length, offset + match[0].length + 20));
        findings.push({
          vulnerable: true,
          severity: pattern.severity,
          type: pattern.name,
          location: { line, column, offset },
          snippet: snippet.trim(),
          recommendation: pattern.recommendation,
          cwe: pattern.cwe,
        });
        this.stats.totalFindings++;
        switch (pattern.severity) {
          case "critical": this.stats.criticalFindings++; break;
          case "high": this.stats.highFindings++; break;
          case "medium": this.stats.mediumFindings++; break;
          case "low": this.stats.lowFindings++; break;
        }
      }
    }
    return findings;
  }

  scanFile(content: string): XSSDetectionResult[] {
    return this.scan(content);
  }

  scanHTML(html: string): XSSDetectionResult[] {
    return this.scan(html);
  }

  scanJavaScript(code: string): XSSDetectionResult[] {
    return this.scan(code);
  }

  isVulnerable(code: string): boolean {
    return this.scan(code).length > 0;
  }

  getVulnerabilityCount(code: string): number {
    return this.scan(code).length;
  }

  getCriticalVulnerabilities(code: string): XSSDetectionResult[] {
    return this.scan(code).filter((f) => f.severity === "critical");
  }

  getHighVulnerabilities(code: string): XSSDetectionResult[] {
    return this.scan(code).filter((f) => f.severity === "high");
  }

  getMediumVulnerabilities(code: string): XSSDetectionResult[] {
    return this.scan(code).filter((f) => f.severity === "medium");
  }

  getLowVulnerabilities(code: string): XSSDetectionResult[] {
    return this.scan(code).filter((f) => f.severity === "low");
  }

  addPattern(name: string, regex: RegExp, severity: "low" | "medium" | "high" | "critical", cwe: string, recommendation: string): this {
    this.patterns.push({ name, regex, severity, cwe, recommendation });
    return this;
  }

  removePattern(name: string): this {
    this.patterns = this.patterns.filter((p) => p.name !== name);
    return this;
  }

  getPatternCount(): number {
    return this.patterns.length;
  }

  getPatternNames(): string[] {
    return this.patterns.map((p) => p.name);
  }

  getStats(): { totalScans: number; totalFindings: number; criticalFindings: number; highFindings: number; mediumFindings: number; lowFindings: number } {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { totalScans: 0, totalFindings: 0, criticalFindings: 0, highFindings: 0, mediumFindings: 0, lowFindings: 0 };
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createXSSDetector(): XSSDetector {
  return new XSSDetector();
}

export class SQLInjectionDetector {
  private patterns: Array<{ name: string; regex: RegExp; severity: "low" | "medium" | "high" | "critical"; recommendation: string }>;
  private stats = { totalScans: 0, totalFindings: 0, criticalFindings: 0, highFindings: 0, mediumFindings: 0, lowFindings: 0 };

  constructor() {
    this.patterns = [
      { name: "String concatenation in query", regex: /["'`]\s*\+\s*[^;]+(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)/gi, severity: "critical", recommendation: "Use parameterized queries instead of string concatenation" },
      { name: "Template literal in query", regex: /`[^`]*(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)[^`]*\$\{/gi, severity: "critical", recommendation: "Use parameterized queries instead of template literals" },
      { name: "Raw query execution", regex: /\.query\s*\(\s*["'`]/gi, severity: "high", recommendation: "Use parameterized queries" },
      { name: "Execute call", regex: /\.execute\s*\(\s*["'`]/gi, severity: "high", recommendation: "Use parameterized queries" },
      { name: "Raw SQL", regex: /\.raw\s*\(/gi, severity: "high", recommendation: "Avoid raw SQL, use query builders" },
      { name: "SQL comment", regex: /--\s/g, severity: "medium", recommendation: "Check for SQL comment injection" },
      { name: "Stacked queries", regex: /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)/gi, severity: "high", recommendation: "Prevent stacked queries" },
      { name: "UNION injection", regex: /UNION\s+SELECT/gi, severity: "critical", recommendation: "Filter UNION SELECT from user input" },
      { name: "Boolean-based injection", regex: /OR\s+1\s*=\s*1/gi, severity: "high", recommendation: "Use parameterized queries to prevent boolean injection" },
      { name: "Time-based injection", regex: /WAITFOR\s+DELAY/gi, severity: "high", recommendation: "Filter WAITFOR DELAY from user input" },
      { name: "DROP statement", regex: /DROP\s+(TABLE|DATABASE)/gi, severity: "critical", recommendation: "Prevent DROP statements in queries" },
      { name: "xp_cmdshell", regex: /xp_cmdshell/gi, severity: "critical", recommendation: "Disable xp_cmdshell and filter from input" },
      { name: "Information schema", regex: /information_schema/gi, severity: "high", recommendation: "Filter information_schema access" },
      { name: "Load_file", regex: /load_file\s*\(/gi, severity: "critical", recommendation: "Filter load_file from input" },
      { name: "Into outfile", regex: /into\s+outfile/gi, severity: "critical", recommendation: "Filter INTO OUTFILE from input" },
      { name: "Benchmark", regex: /benchmark\s*\(/gi, severity: "high", recommendation: "Filter BENCHMARK from input" },
      { name: "Sleep", regex: /sleep\s*\(\s*\d+\s*\)/gi, severity: "medium", recommendation: "Filter SLEEP from input" },
      { name: "Hex encoding", regex: /0x[0-9a-f]{8,}/gi, severity: "medium", recommendation: "Check for hex-encoded SQL injection" },
      { name: "Char encoding", regex: /char\s*\(\s*\d+/gi, severity: "medium", recommendation: "Check for char-encoded SQL injection" },
      { name: "System tables", regex: /\b(sys\.|mysql\.|pg_catalog\.)/gi, severity: "high", recommendation: "Filter access to system tables" },
      { name: "Quoted tautology", regex: /\b(or|and)\b\s*['"]?\s*\d*\s*['"]?\s*=\s*['"]?\s*\d+/gi, severity: "high", recommendation: "Use parameterized queries to prevent tautology injection" },
      { name: "Quote-terminated injection", regex: /['"]\s*(or|and)\b/gi, severity: "medium", recommendation: "Escape or parameterize string inputs" },
    ];
  }

  scan(code: string): XSSDetectionResult[] {
    this.stats.totalScans++;
    const findings: XSSDetectionResult[] = [];
    for (const pattern of this.patterns) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(code)) !== null) {
        const offset = match.index;
        const before = code.slice(0, offset);
        const line = before.split("\n").length;
        const column = offset - before.lastIndexOf("\n");
        const snippet = code.slice(Math.max(0, offset - 20), Math.min(code.length, offset + match[0].length + 20));
        findings.push({
          vulnerable: true,
          severity: pattern.severity,
          type: pattern.name,
          location: { line, column, offset },
          snippet: snippet.trim(),
          recommendation: pattern.recommendation,
          cwe: "CWE-89",
        });
        this.stats.totalFindings++;
        switch (pattern.severity) {
          case "critical": this.stats.criticalFindings++; break;
          case "high": this.stats.highFindings++; break;
          case "medium": this.stats.mediumFindings++; break;
          case "low": this.stats.lowFindings++; break;
        }
      }
    }
    return findings;
  }

  isVulnerable(code: string): boolean {
    return this.scan(code).length > 0;
  }

  getVulnerabilityCount(code: string): number {
    return this.scan(code).length;
  }

  addPattern(name: string, regex: RegExp, severity: "low" | "medium" | "high" | "critical", recommendation: string): this {
    this.patterns.push({ name, regex, severity, recommendation });
    return this;
  }

  removePattern(name: string): this {
    this.patterns = this.patterns.filter((p) => p.name !== name);
    return this;
  }

  getPatternCount(): number {
    return this.patterns.length;
  }

  getPatternNames(): string[] {
    return this.patterns.map((p) => p.name);
  }

  getStats(): { totalScans: number; totalFindings: number; criticalFindings: number; highFindings: number; mediumFindings: number; lowFindings: number } {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { totalScans: 0, totalFindings: 0, criticalFindings: 0, highFindings: 0, mediumFindings: 0, lowFindings: 0 };
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createSQLInjectionDetector(): SQLInjectionDetector {
  return new SQLInjectionDetector();
}

import { createHmac, timingSafeEqual } from "node:crypto";

export class JWTManager {
  private secret: string;
  private issuer: string;
  private audience: string;
  private defaultExpiry: number;
  private refreshExpiry: number;
  private blacklist: Set<string> = new Set();
  private stats = { totalIssued: 0, totalVerified: 0, totalRefreshed: 0, totalRevoked: 0, totalErrors: 0 };

  constructor(secret: string, options?: { issuer?: string; audience?: string; defaultExpiry?: number; refreshExpiry?: number }) {
    this.secret = secret;
    this.issuer = options?.issuer ?? "tw-framework";
    this.audience = options?.audience ?? "tw-framework";
    this.defaultExpiry = options?.defaultExpiry ?? 3600;
    this.refreshExpiry = options?.refreshExpiry ?? 604800;
  }

  sign(payload: Record<string, unknown>, options?: { expiresIn?: number; issuer?: string; audience?: string; subject?: string }): string {
    this.stats.totalIssued++;
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (options?.expiresIn ?? this.defaultExpiry);
    const fullPayload = {
      ...payload,
      iat: now,
      exp,
      iss: options?.issuer ?? this.issuer,
      aud: options?.audience ?? this.audience,
      // Only override sub when an explicit option is given -- an undefined
      // option used to clobber payload.sub entirely.
      ...(options?.subject !== undefined ? { sub: options.subject } : {}),
    };
    const headerEncoded = this.base64UrlEncode(JSON.stringify(header));
    const payloadEncoded = this.base64UrlEncode(JSON.stringify(fullPayload));
    const signature = this.sign2(`${headerEncoded}.${payloadEncoded}`);
    return `${headerEncoded}.${payloadEncoded}.${signature}`;
  }

  verify(token: string, options?: { issuer?: string; audience?: string; subject?: string }): { valid: boolean; payload: Record<string, unknown> | null; error: string | null } {
    this.stats.totalVerified++;
    if (this.blacklist.has(token)) {
      this.stats.totalErrors++;
      return { valid: false, payload: null, error: "Token is revoked" };
    }
    const parts = token.split(".");
    if (parts.length !== 3) {
      this.stats.totalErrors++;
      return { valid: false, payload: null, error: "Invalid token format" };
    }
    const [headerEncoded, payloadEncoded, signature] = parts;
    const expectedSignature = this.sign2(`${headerEncoded}.${payloadEncoded}`);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      this.stats.totalErrors++;
      return { valid: false, payload: null, error: "Invalid signature" };
    }
    const payload = JSON.parse(this.base64UrlDecode(payloadEncoded)) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if ((payload.exp as any) && (payload.exp as any) < now) {
      this.stats.totalErrors++;
      return { valid: false, payload, error: "Token expired" };
    }
    if (payload.iss && payload.iss !== (options?.issuer ?? this.issuer)) {
      this.stats.totalErrors++;
      return { valid: false, payload, error: "Invalid issuer" };
    }
    if (payload.aud && payload.aud !== (options?.audience ?? this.audience)) {
      this.stats.totalErrors++;
      return { valid: false, payload, error: "Invalid audience" };
    }
    // Only validate the subject when the caller explicitly expects one --
    // tokens carrying a sub used to be rejected whenever options.subject
    // was not passed at all.
    if (options?.subject !== undefined && payload.sub !== options.subject) {
      this.stats.totalErrors++;
      return { valid: false, payload, error: "Invalid subject" };
    }
    return { valid: true, payload, error: null };
  }

  refresh(token: string): string | null {
    const { valid, payload } = this.verify(token);
    if (!valid || !payload) return null;
    this.stats.totalRefreshed++;
    this.revoke(token);
    const { iat, exp, iss, aud, sub, ...rest } = payload;
    return this.sign(rest, { expiresIn: this.defaultExpiry, issuer: iss as string, audience: aud as string, subject: sub as string });
  }

  revoke(token: string): void {
    this.blacklist.add(token);
    this.stats.totalRevoked++;
  }

  isRevoked(token: string): boolean {
    return this.blacklist.has(token);
  }

  decode(token: string): Record<string, unknown> | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
      return JSON.parse(this.base64UrlDecode(parts[1])) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  getExpiry(token: string): number | null {
    const payload = this.decode(token);
    return payload?.exp as number | null;
  }

  getIssuer(token: string): string | null {
    const payload = this.decode(token);
    return payload?.iss as string | null;
  }

  getAudience(token: string): string | null {
    const payload = this.decode(token);
    return payload?.aud as string | null;
  }

  getSubject(token: string): string | null {
    const payload = this.decode(token);
    return payload?.sub as string | null;
  }

  isExpired(token: string): boolean {
    const exp = this.getExpiry(token);
    if (!exp) return true;
    return Math.floor(Date.now() / 1000) >= exp;
  }

  getTimeUntilExpiry(token: string): number {
    const exp = this.getExpiry(token);
    if (!exp) return 0;
    return exp - Math.floor(Date.now() / 1000);
  }

  getPayload(token: string): Record<string, unknown> | null {
    return this.decode(token);
  }

  getHeader(token: string): Record<string, unknown> | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
      return JSON.parse(this.base64UrlDecode(parts[0])) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  getSignature(token: string): string | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return parts[2];
  }

  setSecret(secret: string): this {
    this.secret = secret;
    return this;
  }

  getSecret(): string {
    return this.secret;
  }

  setIssuer(issuer: string): this {
    this.issuer = issuer;
    return this;
  }

  getIssuer2(): string {
    return this.issuer;
  }

  setAudience(audience: string): this {
    this.audience = audience;
    return this;
  }

  getAudience2(): string {
    return this.audience;
  }

  setDefaultExpiry(expiry: number): this {
    this.defaultExpiry = expiry;
    return this;
  }

  getDefaultExpiry(): number {
    return this.defaultExpiry;
  }

  setRefreshExpiry(expiry: number): this {
    this.refreshExpiry = expiry;
    return this;
  }

  getRefreshExpiry(): number {
    return this.refreshExpiry;
  }

  clearBlacklist(): this {
    this.blacklist.clear();
    return this;
  }

  getBlacklistSize(): number {
    return this.blacklist.size;
  }

  getStats(): { totalIssued: number; totalVerified: number; totalRefreshed: number; totalRevoked: number; totalErrors: number; blacklistSize: number } {
    return { ...this.stats, blacklistSize: this.blacklist.size };
  }

  resetStats(): void {
    this.stats = { totalIssued: 0, totalVerified: 0, totalRefreshed: 0, totalRevoked: 0, totalErrors: 0 };
  }

  private sign2(data: string): string {
    // HMAC-SHA256 (real JWT HS256). The previous 32-bit rolling hash was
    // forgeable in microseconds.
    return createHmac("sha256", this.secret).update(data).digest("base64url");
  }

  private base64UrlEncode(str: string): string {
    let base64 = btoa(unescape(encodeURIComponent(str)));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  private base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    return decodeURIComponent(escape(atob(base64)));
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createJWTManager(secret: string, options?: { issuer?: string; audience?: string; defaultExpiry?: number; refreshExpiry?: number }): JWTManager {
  return new JWTManager(secret, options);
}

export class PasswordPolicy {
  private minLength: number = 8;
  private maxLength: number = 128;
  private requireUppercase: boolean = true;
  private requireLowercase: boolean = true;
  private requireNumbers: boolean = true;
  private requireSpecialChars: boolean = true;
  private minSpecialChars: number = 1;
  private minNumbers: number = 1;
  private minUppercase: number = 1;
  private minLowercase: number = 1;
  private preventCommonPasswords: boolean = true;
  private preventUserInfo: boolean = true;
  private preventRepeatingChars: boolean = true;
  private maxRepeatingChars: number = 3;
  private preventSequentialChars: boolean = true;
  private maxSequentialChars: number = 3;
  private historySize: number = 5;
  private passwordHistory: Map<string, string[]> = new Map();
  private commonPasswords: Set<string> = new Set([
    "password", "123456", "12345678", "qwerty", "abc123", "monkey", "1234567",
    "letmein", "trustno1", "dragon", "baseball", "iloveyou", "master", "sunshine",
    "ashley", "bailey", "shadow", "123123", "654321", "superman", "qazwsx",
    "michael", "football", "password1", "password123", "admin", "welcome",
    "hello", "charlie", "donald", "password!", "qwerty123", "1q2w3e4r",
  ]);

  setMinLength(length: number): this { this.minLength = length; return this; }
  getMinLength(): number { return this.minLength; }
  setMaxLength(length: number): this { this.maxLength = length; return this; }
  getMaxLength(): number { return this.maxLength; }
  setRequireUppercase(require: boolean): this { this.requireUppercase = require; return this; }
  isRequireUppercase(): boolean { return this.requireUppercase; }
  setRequireLowercase(require: boolean): this { this.requireLowercase = require; return this; }
  isRequireLowercase(): boolean { return this.requireLowercase; }
  setRequireNumbers(require: boolean): this { this.requireNumbers = require; return this; }
  isRequireNumbers(): boolean { return this.requireNumbers; }
  setRequireSpecialChars(require: boolean): this { this.requireSpecialChars = require; return this; }
  isRequireSpecialChars(): boolean { return this.requireSpecialChars; }
  setMinSpecialChars(count: number): this { this.minSpecialChars = count; return this; }
  getMinSpecialChars(): number { return this.minSpecialChars; }
  setMinNumbers(count: number): this { this.minNumbers = count; return this; }
  getMinNumbers(): number { return this.minNumbers; }
  setMinUppercase(count: number): this { this.minUppercase = count; return this; }
  getMinUppercase(): number { return this.minUppercase; }
  setMinLowercase(count: number): this { this.minLowercase = count; return this; }
  getMinLowercase(): number { return this.minLowercase; }
  setPreventCommonPasswords(prevent: boolean): this { this.preventCommonPasswords = prevent; return this; }
  isPreventCommonPasswords(): boolean { return this.preventCommonPasswords; }
  setPreventUserInfo(prevent: boolean): this { this.preventUserInfo = prevent; return this; }
  isPreventUserInfo(): boolean { return this.preventUserInfo; }
  setPreventRepeatingChars(prevent: boolean): this { this.preventRepeatingChars = prevent; return this; }
  isPreventRepeatingChars(): boolean { return this.preventRepeatingChars; }
  setMaxRepeatingChars(max: number): this { this.maxRepeatingChars = max; return this; }
  getMaxRepeatingChars(): number { return this.maxRepeatingChars; }
  setPreventSequentialChars(prevent: boolean): this { this.preventSequentialChars = prevent; return this; }
  isPreventSequentialChars(): boolean { return this.preventSequentialChars; }
  setMaxSequentialChars(max: number): this { this.maxSequentialChars = max; return this; }
  getMaxSequentialChars(): number { return this.maxSequentialChars; }
  setHistorySize(size: number): this { this.historySize = size; return this; }
  getHistorySize(): number { return this.historySize; }
  addCommonPassword(password: string): this { this.commonPasswords.add(password.toLowerCase()); return this; }
  removeCommonPassword(password: string): this { this.commonPasswords.delete(password.toLowerCase()); return this; }
  getCommonPasswordCount(): number { return this.commonPasswords.size; }

  validate(password: string, userInfo?: { username?: string; email?: string; firstName?: string; lastName?: string }): { valid: boolean; errors: string[]; strength: number; score: number } {
    const errors: string[] = [];
    let score = 0;
    if (password.length < this.minLength) {
      errors.push(`Password must be at least ${this.minLength} characters long`);
    } else { score += 10; }
    if (password.length > this.maxLength) {
      errors.push(`Password must be at most ${this.maxLength} characters long`);
    }
    if (this.requireUppercase) {
      const uppercaseCount = (password.match(/[A-Z]/g) ?? []).length;
      if (uppercaseCount < this.minUppercase) {
        errors.push(`Password must contain at least ${this.minUppercase} uppercase letter(s)`);
      } else { score += 10; }
    }
    if (this.requireLowercase) {
      const lowercaseCount = (password.match(/[a-z]/g) ?? []).length;
      if (lowercaseCount < this.minLowercase) {
        errors.push(`Password must contain at least ${this.minLowercase} lowercase letter(s)`);
      } else { score += 10; }
    }
    if (this.requireNumbers) {
      const numberCount = (password.match(/[0-9]/g) ?? []).length;
      if (numberCount < this.minNumbers) {
        errors.push(`Password must contain at least ${this.minNumbers} number(s)`);
      } else { score += 10; }
    }
    if (this.requireSpecialChars) {
      const specialCount = (password.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) ?? []).length;
      if (specialCount < this.minSpecialChars) {
        errors.push(`Password must contain at least ${this.minSpecialChars} special character(s)`);
      } else { score += 10; }
    }
    if (this.preventCommonPasswords && this.commonPasswords.has(password.toLowerCase())) {
      errors.push("Password is too common");
      score -= 20;
    }
    if (this.preventUserInfo && userInfo) {
      const lowerPassword = password.toLowerCase();
      if (userInfo.username && lowerPassword.includes(userInfo.username.toLowerCase())) {
        errors.push("Password should not contain username");
        score -= 10;
      }
      if (userInfo.email) {
        const emailParts = userInfo.email.toLowerCase().split("@");
        if (lowerPassword.includes(emailParts[0])) {
          errors.push("Password should not contain email");
          score -= 10;
        }
      }
      if (userInfo.firstName && lowerPassword.includes(userInfo.firstName.toLowerCase())) {
        errors.push("Password should not contain first name");
        score -= 10;
      }
      if (userInfo.lastName && lowerPassword.includes(userInfo.lastName.toLowerCase())) {
        errors.push("Password should not contain last name");
        score -= 10;
      }
    }
    if (this.preventRepeatingChars) {
      let maxRepeat = 1;
      let currentRepeat = 1;
      for (let i = 1; i < password.length; i++) {
        if (password[i] === password[i - 1]) {
          currentRepeat++;
          maxRepeat = Math.max(maxRepeat, currentRepeat);
        } else {
          currentRepeat = 1;
        }
      }
      if (maxRepeat > this.maxRepeatingChars) {
        errors.push(`Password should not have more than ${this.maxRepeatingChars} repeating characters`);
        score -= 10;
      }
    }
    if (this.preventSequentialChars) {
      let maxSequential = 1;
      let currentSequential = 1;
      for (let i = 1; i < password.length; i++) {
        const diff = password.charCodeAt(i) - password.charCodeAt(i - 1);
        if (diff === 1 || diff === -1) {
          currentSequential++;
          maxSequential = Math.max(maxSequential, currentSequential);
        } else {
          currentSequential = 1;
        }
      }
      if (maxSequential > this.maxSequentialChars) {
        errors.push(`Password should not have more than ${this.maxSequentialChars} sequential characters`);
        score -= 10;
      }
    }
    score += Math.min(20, password.length * 2);
    const variety = new Set(password.split("").map((c) => {
      if (/[a-z]/.test(c)) return "lower";
      if (/[A-Z]/.test(c)) return "upper";
      if (/[0-9]/.test(c)) return "number";
      return "special";
    })).size;
    score += variety * 5;
    const strength = score < 30 ? 0 : score < 50 ? 1 : score < 70 ? 2 : score < 85 ? 3 : 4;
    return { valid: errors.length === 0, errors, strength, score: Math.max(0, Math.min(100, score)) };
  }

  isValid(password: string, userInfo?: { username?: string; email?: string; firstName?: string; lastName?: string }): boolean {
    return this.validate(password, userInfo).valid;
  }

  getStrength(password: string): number {
    return this.validate(password).strength;
  }

  getScore(password: string): number {
    return this.validate(password).score;
  }

  getErrors(password: string, userInfo?: { username?: string; email?: string; firstName?: string; lastName?: string }): string[] {
    return this.validate(password, userInfo).errors;
  }

  addToHistory(userId: string, password: string): void {
    const history = this.passwordHistory.get(userId) ?? [];
    history.push(this.hashPassword(password));
    if (history.length > this.historySize) {
      history.shift();
    }
    this.passwordHistory.set(userId, history);
  }

  isInHistory(userId: string, password: string): boolean {
    const history = this.passwordHistory.get(userId) ?? [];
    const hash = this.hashPassword(password);
    return history.includes(hash);
  }

  clearHistory(userId: string): void {
    this.passwordHistory.delete(userId);
  }

  getHistorySize2(userId: string): number {
    return this.passwordHistory.get(userId)?.length ?? 0;
  }

  private hashPassword(password: string): string {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      hash = ((hash << 5) - hash) + password.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  generatePassword(length: number = 16, options?: { uppercase?: boolean; lowercase?: boolean; numbers?: boolean; special?: boolean }): string {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const special = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    let charset = "";
    if (options?.uppercase !== false) charset += upper;
    if (options?.lowercase !== false) charset += lower;
    if (options?.numbers !== false) charset += numbers;
    if (options?.special !== false) charset += special;
    if (charset === "") charset = lower + numbers;
    // Passwords: crypto randomness only — never Math.random.
    const c: Crypto | undefined = (typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined);
    if (!c || !c.getRandomValues) {
      throw new Error("No crypto.getRandomValues available for password generation");
    }
    const rand = new Uint32Array(length);
    c.getRandomValues(rand);
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset[rand[i] % charset.length];
    }
    return password;
  }

  generatePassphrase(wordCount: number = 4, separator: string = "-"): string {
    const words = ["apple", "banana", "cherry", "dragon", "eagle", "falcon", "guitar", "harbor", "island", "jungle", "kitten", "lemon", "mango", "novel", "ocean", "piano", "quartz", "river", "sunset", "tiger", "umbrella", "violin", "whisper", "xylophone", "yellow", "zebra"];
    const passphrase: string[] = [];
    for (let i = 0; i < wordCount; i++) {
      passphrase.push(words[Math.floor(Math.random() * words.length)]);
    }
    return passphrase.join(separator);
  }

  generatePIN(length: number = 4): string {
    let pin = "";
    for (let i = 0; i < length; i++) {
      pin += Math.floor(Math.random() * 10).toString();
    }
    return pin;
  }

  estimateCrackTime(password: string): { seconds: number; description: string } {
    const charsets = [
      { regex: /[a-z]/, size: 26 },
      { regex: /[A-Z]/, size: 26 },
      { regex: /[0-9]/, size: 10 },
      { regex: /[^a-zA-Z0-9]/, size: 32 },
    ];
    let poolSize = 0;
    for (const { regex, size } of charsets) {
      if (regex.test(password)) poolSize += size;
    }
    if (poolSize === 0) poolSize = 26;
    const combinations = Math.pow(poolSize, password.length);
    const guessesPerSecond = 10000000000;
    const seconds = combinations / guessesPerSecond;
    let description: string;
    if (seconds < 1) description = "Instant";
    else if (seconds < 60) description = `${Math.round(seconds)} seconds`;
    else if (seconds < 3600) description = `${Math.round(seconds / 60)} minutes`;
    else if (seconds < 86400) description = `${Math.round(seconds / 3600)} hours`;
    else if (seconds < 31536000) description = `${Math.round(seconds / 86400)} days`;
    else if (seconds < 31536000 * 100) description = `${Math.round(seconds / 31536000)} years`;
    else if (seconds < 31536000 * 1000000) description = `${Math.round(seconds / (31536000 * 100))} centuries`;
    else description = "Eternity";
    return { seconds, description };
  }

  toJSON(): string {
    return JSON.stringify({
      minLength: this.minLength,
      maxLength: this.maxLength,
      requireUppercase: this.requireUppercase,
      requireLowercase: this.requireLowercase,
      requireNumbers: this.requireNumbers,
      requireSpecialChars: this.requireSpecialChars,
      commonPasswords: this.commonPasswords.size,
      historyEntries: this.passwordHistory.size,
    }, null, 2);
  }
}

export function createPasswordPolicy(): PasswordPolicy {
  return new PasswordPolicy();
}
