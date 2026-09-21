/**
 * Content Security Policy -- generates, validates, and enforces CSP headers.
 * @module security/csp
 */

export interface CSPDirective {
  name: string;
  values: string[];
}

export interface CSPReport {
  "document-uri": string;
  "violated-directive": string;
  "effective-directive": string;
  "blocked-uri"?: string;
  "line-number"?: number;
  "column-number"?: number;
  "source-file"?: string;
  "status-code"?: number;
  "script-sample"?: string;
  timestamp: number;
}

export interface CSPOptions {
  reportOnly?: boolean;
  reportUri?: string;
  reportTo?: string;
  useNonce?: boolean;
  useHash?: boolean;
  strictDynamic?: boolean;
  unsafeInline?: boolean;
  unsafeEval?: boolean;
}

const DEFAULT_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "https:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "frame-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "upgrade-insecure-requests": [],
  "block-all-mixed-content": [],
};

export class CSPManager {
  private directives: Map<string, Set<string>> = new Map();
  private options: Required<CSPOptions>;
  private reports: CSPReport[] = [];
  private maxReports: number = 100;
  private nonceCache: Set<string> = new Set();
  private hashCache: Set<string> = new Set();

  constructor(options: CSPOptions = {}) {
    this.options = {
      reportOnly: options.reportOnly ?? false,
      reportUri: options.reportUri ?? "",
      reportTo: options.reportTo ?? "",
      useNonce: options.useNonce ?? false,
      useHash: options.useHash ?? false,
      strictDynamic: options.strictDynamic ?? false,
      unsafeInline: options.unsafeInline ?? false,
      unsafeEval: options.unsafeEval ?? false,
    };
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    for (const [directive, values] of Object.entries(DEFAULT_DIRECTIVES)) {
      this.directives.set(directive, new Set(values));
    }
  }

  setDirective(name: string, values: string[]): this {
    this.directives.set(name, new Set(values));
    return this;
  }

  addDirectiveValue(name: string, value: string): this {
    if (!this.directives.has(name)) {
      this.directives.set(name, new Set());
    }
    this.directives.get(name)!.add(value);
    return this;
  }

  removeDirectiveValue(name: string, value: string): this {
    this.directives.get(name)?.delete(value);
    return this;
  }

  removeDirective(name: string): this {
    this.directives.delete(name);
    return this;
  }

  getDirective(name: string): string[] {
    return [...(this.directives.get(name) ?? [])];
  }

  hasDirective(name: string): boolean {
    return this.directives.has(name);
  }

  getAllDirectives(): CSPDirective[] {
    return [...this.directives.entries()].map(([name, values]) => ({
      name,
      values: [...values],
    }));
  }

  generateHeader(): string {
    const parts: string[] = [];
    for (const [name, values] of this.directives) {
      if (values.size === 0) {
        parts.push(name);
      } else {
        parts.push(`${name} ${[...values].join(" ")}`);
      }
    }
    if (this.options.reportUri) {
      parts.push(`report-uri ${this.options.reportUri}`);
    }
    if (this.options.reportTo) {
      parts.push(`report-to ${this.options.reportTo}`);
    }
    return parts.join("; ");
  }

  getHeaderName(): string {
    return this.options.reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  }

  getHeaders(): Record<string, string> {
    return { [this.getHeaderName()]: this.generateHeader() };
  }

  generateNonce(): string {
    const nonce = this.generateRandomString(32);
    this.nonceCache.add(nonce);
    if (this.options.useNonce) {
      this.addDirectiveValue("script-src", `'nonce-${nonce}'`);
    }
    return nonce;
  }

  generateHash(content: string, algorithm: "sha256" | "sha384" | "sha512" = "sha256"): string {
    const hash = this.hashContent(content, algorithm);
    const hashValue = `'${algorithm}-${hash}'`;
    this.hashCache.add(hashValue);
    if (this.options.useHash) {
      this.addDirectiveValue("script-src", hashValue);
    }
    return hashValue;
  }

  private generateRandomString(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    // Security tokens: crypto randomness only — never Math.random.
    const c: Crypto | undefined = (typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined);
    if (!c || !c.getRandomValues) {
      throw new Error("No crypto.getRandomValues available for token generation");
    }
    const rand = new Uint32Array(length);
    c.getRandomValues(rand);
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[rand[i] % chars.length];
    }
    return result;
  }

  private hashContent(content: string, algorithm: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, "0");
  }

  validateNonce(nonce: string): boolean {
    return this.nonceCache.has(nonce);
  }

  validateHash(hash: string): boolean {
    return this.hashCache.has(hash);
  }

  reportViolation(report: Omit<CSPReport, "timestamp">): void {
    const fullReport: CSPReport = { ...report, timestamp: Date.now() };
    this.reports.push(fullReport);
    if (this.reports.length > this.maxReports) {
      this.reports.shift();
    }
  }

  getReports(): CSPReport[] {
    return [...this.reports];
  }

  getReportCount(): number {
    return this.reports.length;
  }

  clearReports(): void {
    this.reports = [];
  }

  setMaxReports(max: number): void {
    this.maxReports = max;
    while (this.reports.length > max) {
      this.reports.shift();
    }
  }

  enableStrictDynamic(): this {
    this.options.strictDynamic = true;
    this.addDirectiveValue("script-src", "'strict-dynamic'");
    return this;
  }

  disableStrictDynamic(): this {
    this.options.strictDynamic = false;
    this.removeDirectiveValue("script-src", "'strict-dynamic'");
    return this;
  }

  enableUnsafeInline(): this {
    this.options.unsafeInline = true;
    this.addDirectiveValue("script-src", "'unsafe-inline'");
    this.addDirectiveValue("style-src", "'unsafe-inline'");
    return this;
  }

  disableUnsafeInline(): this {
    this.options.unsafeInline = false;
    this.removeDirectiveValue("script-src", "'unsafe-inline'");
    this.removeDirectiveValue("style-src", "'unsafe-inline'");
    return this;
  }

  enableUnsafeEval(): this {
    this.options.unsafeEval = true;
    this.addDirectiveValue("script-src", "'unsafe-eval'");
    return this;
  }

  disableUnsafeEval(): this {
    this.options.unsafeEval = false;
    this.removeDirectiveValue("script-src", "'unsafe-eval'");
    return this;
  }

  setReportOnly(reportOnly: boolean): this {
    this.options.reportOnly = reportOnly;
    return this;
  }

  setReportUri(uri: string): this {
    this.options.reportUri = uri;
    return this;
  }

  setReportTo(target: string): this {
    this.options.reportTo = target;
    return this;
  }

  getOptions(): Required<CSPOptions> {
    return { ...this.options };
  }

  setOptions(options: Partial<CSPOptions>): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  reset(): this {
    this.directives.clear();
    this.initializeDefaults();
    this.reports = [];
    this.nonceCache.clear();
    this.hashCache.clear();
    return this;
  }

  toJSON(): string {
    return JSON.stringify({
      header: this.generateHeader(),
      headerName: this.getHeaderName(),
      directives: this.getAllDirectives(),
      options: this.options,
      reportCount: this.reports.length,
    }, null, 2);
  }

  toMetaTag(): string {
    return `<meta http-equiv="${this.getHeaderName()}" content="${this.generateHeader()}">`;
  }

  getDirectiveCount(): number {
    return this.directives.size;
  }

  getNonceCount(): number {
    return this.nonceCache.size;
  }

  getHashCount(): number {
    return this.hashCache.size;
  }

  clearNonces(): void {
    this.nonceCache.clear();
  }

  clearHashes(): void {
    this.hashCache.clear();
  }

  isReportOnly(): boolean {
    return this.options.reportOnly;
  }

  hasReportUri(): boolean {
    return this.options.reportUri !== "";
  }

  hasReportTo(): boolean {
    return this.options.reportTo !== "";
  }

  isStrictDynamic(): boolean {
    return this.options.strictDynamic;
  }

  isUnsafeInline(): boolean {
    return this.options.unsafeInline;
  }

  isUnsafeEval(): boolean {
    return this.options.unsafeEval;
  }

  isUsingNonce(): boolean {
    return this.options.useNonce;
  }

  isUsingHash(): boolean {
    return this.options.useHash;
  }
}

export function createCSPManager(options?: CSPOptions): CSPManager {
  return new CSPManager(options);
}

export class CSRFProtection {
  private token: string = "";
  private tokenName: string = "_csrf";
  private headerName: string = "X-CSRF-Token";
  private cookieName: string = "csrf-token";
  private secret: string = "";
  private tokens: Set<string> = new Set();
  private maxTokens: number = 1000;

  constructor(options: { tokenName?: string; headerName?: string; cookieName?: string; secret?: string } = {}) {
    this.tokenName = options.tokenName ?? "_csrf";
    this.headerName = options.headerName ?? "X-CSRF-Token";
    this.cookieName = options.cookieName ?? "csrf-token";
    this.secret = options.secret ?? this.generateRandomString(32);
  }

  generateToken(): string {
    this.token = this.generateRandomString(32);
    this.tokens.add(this.token);
    while (this.tokens.size > this.maxTokens) {
      const first = this.tokens.values().next().value;
      if (first) this.tokens.delete(first);
    }
    return this.token;
  }

  /**
   * docs/security.md API: `csrf.generate()` and `csrf.verify(token, submitted)`
   * are the documented surface -- thin aliases over the internal methods.
   */
  generate(): string {
    return this.generateToken();
  }

  verify(token: string, submitted: string): boolean {
    return !!token && !!submitted && token === submitted && this.validateToken(submitted);
  }

  getToken(): string {
    if (!this.token) {
      return this.generateToken();
    }
    return this.token;
  }

  validateToken(token: string): boolean {
    return this.tokens.has(token);
  }

  consumeToken(token: string): boolean {
    if (this.tokens.has(token)) {
      this.tokens.delete(token);
      return true;
    }
    return false;
  }

  getTokenName(): string {
    return this.tokenName;
  }

  getHeaderName(): string {
    return this.headerName;
  }

  getCookieName(): string {
    return this.cookieName;
  }

  setSecret(secret: string): void {
    this.secret = secret;
  }

  getSecret(): string {
    return this.secret;
  }

  generateCookie(): string {
    return `${this.cookieName}=${this.getToken()}; Path=/; HttpOnly; SameSite=Strict`;
  }

  validateRequest(headers: Record<string, string>, body?: Record<string, unknown>): boolean {
    const token = headers[this.headerName.toLowerCase()] ?? body?.[this.tokenName] as string;
    if (!token) return false;
    return this.validateToken(token);
  }

  private generateRandomString(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    // Security tokens: crypto randomness only — never Math.random.
    const c: Crypto | undefined = (typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined);
    if (!c || !c.getRandomValues) {
      throw new Error("No crypto.getRandomValues available for token generation");
    }
    const rand = new Uint32Array(length);
    c.getRandomValues(rand);
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[rand[i] % chars.length];
    }
    return result;
  }

  clearTokens(): void {
    this.tokens.clear();
    this.token = "";
  }

  getTokenCount(): number {
    return this.tokens.size;
  }

  setMaxTokens(max: number): void {
    this.maxTokens = max;
    while (this.tokens.size > max) {
      const first = this.tokens.values().next().value;
      if (first) this.tokens.delete(first);
    }
  }

  getMetaTag(): string {
    return `<meta name="csrf-token" content="${this.getToken()}">`;
  }

  getFormField(): string {
    return `<input type="hidden" name="${this.tokenName}" value="${this.getToken()}" />`;
  }
}

export function createCSRFProtection(options?: { tokenName?: string; headerName?: string; cookieName?: string; secret?: string }): CSRFProtection {
  return new CSRFProtection(options);
}

export class RateLimiter {
  private limits: Map<string, { count: number; resetTime: number; blocked: boolean }> = new Map();
  private maxRequests: number;
  private windowMs: number;
  private blockDurationMs: number;

  constructor(options: { maxRequests?: number; windowMs?: number; blockDurationMs?: number } = {}) {
    this.maxRequests = options.maxRequests ?? 100;
    this.windowMs = options.windowMs ?? 60000;
    this.blockDurationMs = options.blockDurationMs ?? 300000;
  }

  check(identifier: string): { allowed: boolean; remaining: number; resetTime: number; blocked: boolean } {
    const now = Date.now();
    const entry = this.limits.get(identifier);
    if (entry && entry.blocked && now < entry.resetTime) {
      return { allowed: false, remaining: 0, resetTime: entry.resetTime, blocked: true };
    }
    if (!entry || now >= entry.resetTime) {
      this.limits.set(identifier, { count: 1, resetTime: now + this.windowMs, blocked: false });
      return { allowed: true, remaining: this.maxRequests - 1, resetTime: now + this.windowMs, blocked: false };
    }
    entry.count++;
    if (entry.count > this.maxRequests) {
      entry.blocked = true;
      entry.resetTime = now + this.blockDurationMs;
      return { allowed: false, remaining: 0, resetTime: entry.resetTime, blocked: true };
    }
    return { allowed: true, remaining: this.maxRequests - entry.count, resetTime: entry.resetTime, blocked: false };
  }

  isBlocked(identifier: string): boolean {
    const entry = this.limits.get(identifier);
    if (!entry) return false;
    return entry.blocked && Date.now() < entry.resetTime;
  }

  getRemaining(identifier: string): number {
    const entry = this.limits.get(identifier);
    if (!entry || Date.now() >= entry.resetTime) return this.maxRequests;
    return Math.max(0, this.maxRequests - entry.count);
  }

  getResetTime(identifier: string): number {
    const entry = this.limits.get(identifier);
    if (!entry) return 0;
    return entry.resetTime;
  }

  reset(identifier: string): void {
    this.limits.delete(identifier);
  }

  resetAll(): void {
    this.limits.clear();
  }

  setMaxRequests(max: number): void {
    this.maxRequests = max;
  }

  setWindowMs(ms: number): void {
    this.windowMs = ms;
  }

  setBlockDurationMs(ms: number): void {
    this.blockDurationMs = ms;
  }

  getMaxRequests(): number {
    return this.maxRequests;
  }

  getWindowMs(): number {
    return this.windowMs;
  }

  getBlockDurationMs(): number {
    return this.blockDurationMs;
  }

  getStats(): { totalIdentifiers: number; blockedCount: number; activeCount: number } {
    const now = Date.now();
    let blocked = 0;
    let active = 0;
    for (const entry of this.limits.values()) {
      if (entry.blocked && now < entry.resetTime) blocked++;
      else if (now < entry.resetTime) active++;
    }
    return { totalIdentifiers: this.limits.size, blockedCount: blocked, activeCount: active };
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, entry] of this.limits) {
      if (now >= entry.resetTime) {
        this.limits.delete(id);
        removed++;
      }
    }
    return removed;
  }

  getIdentifierCount(): number {
    return this.limits.size;
  }

  getIdentifiers(): string[] {
    return [...this.limits.keys()];
  }

  block(identifier: string, durationMs?: number): void {
    const now = Date.now();
    this.limits.set(identifier, {
      count: this.maxRequests + 1,
      resetTime: now + (durationMs ?? this.blockDurationMs),
      blocked: true,
    });
  }

  unblock(identifier: string): void {
    const entry = this.limits.get(identifier);
    if (entry) {
      entry.blocked = false;
      entry.count = 0;
      entry.resetTime = Date.now() + this.windowMs;
    }
  }
}

export function createRateLimiter(options?: { maxRequests?: number; windowMs?: number; blockDurationMs?: number }): RateLimiter {
  return new RateLimiter(options);
}

export class AuditLogger {
  private logs: Array<{ timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: "success" | "failure"; details?: Record<string, unknown> }> = [];
  private maxLogs: number = 10000;
  private logHandlers: Array<(log: { timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: string; details?: Record<string, unknown> }) => void> = [];

  constructor(maxLogs: number = 10000) {
    this.maxLogs = maxLogs;
  }

  log(event: string, data: { userId?: string; ip?: string; resource?: string; action?: string; result?: "success" | "failure"; details?: Record<string, unknown> } = {}): void {
    const entry = {
      timestamp: Date.now(),
      event,
      userId: data.userId,
      ip: data.ip,
      resource: data.resource,
      action: data.action,
      result: data.result ?? "success",
      details: data.details,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.logHandlers.forEach((handler) => handler(entry));
  }

  logSuccess(event: string, data: { userId?: string; ip?: string; resource?: string; action?: string; details?: Record<string, unknown> } = {}): void {
    this.log(event, { ...data, result: "success" });
  }

  logFailure(event: string, data: { userId?: string; ip?: string; resource?: string; action?: string; details?: Record<string, unknown> } = {}): void {
    this.log(event, { ...data, result: "failure" });
  }

  getLogs(filter?: { event?: string; userId?: string; result?: string; from?: number; to?: number }): Array<{ timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: string; details?: Record<string, unknown> }> {
    return this.logs.filter((log) => {
      if (filter?.event && log.event !== filter.event) return false;
      if (filter?.userId && log.userId !== filter.userId) return false;
      if (filter?.result && log.result !== filter.result) return false;
      if (filter?.from && log.timestamp < filter.from) return false;
      if (filter?.to && log.timestamp > filter.to) return false;
      return true;
    });
  }

  getLogsByEvent(event: string): Array<{ timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: string; details?: Record<string, unknown> }> {
    return this.getLogs({ event });
  }

  getLogsByUser(userId: string): Array<{ timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: string; details?: Record<string, unknown> }> {
    return this.getLogs({ userId });
  }

  getFailedLogs(): Array<{ timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: string; details?: Record<string, unknown> }> {
    return this.getLogs({ result: "failure" });
  }

  getSuccessfulLogs(): Array<{ timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: string; details?: Record<string, unknown> }> {
    return this.getLogs({ result: "success" });
  }

  getLogsInRange(from: number, to: number): Array<{ timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: string; details?: Record<string, unknown> }> {
    return this.getLogs({ from, to });
  }

  getLogCount(): number {
    return this.logs.length;
  }

  getFailedCount(): number {
    return this.getFailedLogs().length;
  }

  getSuccessRate(): number {
    if (this.logs.length === 0) return 100;
    return (this.getSuccessfulLogs().length / this.logs.length) * 100;
  }

  clear(): void {
    this.logs = [];
  }

  setMaxLogs(max: number): void {
    this.maxLogs = max;
    while (this.logs.length > max) {
      this.logs.shift();
    }
  }

  getMaxLogs(): number {
    return this.maxLogs;
  }

  onLog(handler: (log: { timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: string; details?: Record<string, unknown> }) => void): () => void {
    this.logHandlers.push(handler);
    return () => {
      const index = this.logHandlers.indexOf(handler);
      if (index !== -1) this.logHandlers.splice(index, 1);
    };
  }

  toJSON(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  getStats(): { total: number; success: number; failure: number; successRate: number; events: Record<string, number> } {
    const events: Record<string, number> = {};
    let success = 0;
    let failure = 0;
    for (const log of this.logs) {
      events[log.event] = (events[log.event] ?? 0) + 1;
      if (log.result === "success") success++;
      else failure++;
    }
    return {
      total: this.logs.length,
      success,
      failure,
      successRate: this.logs.length > 0 ? (success / this.logs.length) * 100 : 100,
      events,
    };
  }

  getRecentLogs(count: number = 10): Array<{ timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: string; details?: Record<string, unknown> }> {
    return this.logs.slice(-count);
  }

  getOldestLogs(count: number = 10): Array<{ timestamp: number; event: string; userId?: string; ip?: string; resource?: string; action?: string; result: string; details?: Record<string, unknown> }> {
    return this.logs.slice(0, count);
  }

  getEventsByType(): Record<string, number> {
    const events: Record<string, number> = {};
    for (const log of this.logs) {
      events[log.event] = (events[log.event] ?? 0) + 1;
    }
    return events;
  }

  getEventsByUser(): Record<string, number> {
    const users: Record<string, number> = {};
    for (const log of this.logs) {
      if (log.userId) {
        users[log.userId] = (users[log.userId] ?? 0) + 1;
      }
    }
    return users;
  }

  getEventsByResource(): Record<string, number> {
    const resources: Record<string, number> = {};
    for (const log of this.logs) {
      if (log.resource) {
        resources[log.resource] = (resources[log.resource] ?? 0) + 1;
      }
    }
    return resources;
  }

  getEventsByAction(): Record<string, number> {
    const actions: Record<string, number> = {};
    for (const log of this.logs) {
      if (log.action) {
        actions[log.action] = (actions[log.action] ?? 0) + 1;
      }
    }
    return actions;
  }

  getEventsByIP(): Record<string, number> {
    const ips: Record<string, number> = {};
    for (const log of this.logs) {
      if (log.ip) {
        ips[log.ip] = (ips[log.ip] ?? 0) + 1;
      }
    }
    return ips;
  }

  exportCSV(): string {
    const header = "timestamp,event,userId,ip,resource,action,result\n";
    const rows = this.logs.map((log) =>
      `${log.timestamp},${log.event},${log.userId ?? ""},${log.ip ?? ""},${log.resource ?? ""},${log.action ?? ""},${log.result}`,
    ).join("\n");
    return header + rows;
  }

  exportJSON(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export function createAuditLogger(maxLogs?: number): AuditLogger {
  return new AuditLogger(maxLogs);
}

export class SecurityHeaders {
  private headers: Map<string, string> = new Map();

  constructor() {
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    this.headers.set("X-Content-Type-Options", "nosniff");
    this.headers.set("X-Frame-Options", "DENY");
    this.headers.set("X-XSS-Protection", "1; mode=block");
    this.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    this.headers.set("X-Permitted-Cross-Domain-Policies", "none");
    this.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    this.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    this.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    this.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    this.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  }

  set(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  get(name: string): string | undefined {
    return this.headers.get(name);
  }

  has(name: string): boolean {
    return this.headers.has(name);
  }

  remove(name: string): this {
    this.headers.delete(name);
    return this;
  }

  getAll(): Record<string, string> {
    return Object.fromEntries(this.headers);
  }

  clear(): this {
    this.headers.clear();
    return this;
  }

  reset(): this {
    this.clear();
    this.initializeDefaults();
    return this;
  }

  setHSTS(maxAge: number = 31536000, includeSubDomains: boolean = true, preload: boolean = false): this {
    let value = `max-age=${maxAge}`;
    if (includeSubDomains) value += "; includeSubDomains";
    if (preload) value += "; preload";
    return this.set("Strict-Transport-Security", value);
  }

  setFrameOptions(option: "DENY" | "SAMEORIGIN" | "ALLOW-FROM"): this {
    return this.set("X-Frame-Options", option);
  }

  setContentTypeOptions(): this {
    return this.set("X-Content-Type-Options", "nosniff");
  }

  setXSSProtection(mode: "0" | "1" | "1; mode=block" = "1; mode=block"): this {
    return this.set("X-XSS-Protection", mode);
  }

  setReferrerPolicy(policy: string): this {
    return this.set("Referrer-Policy", policy);
  }

  setPermissionsPolicy(policy: string): this {
    return this.set("Permissions-Policy", policy);
  }

  setCOOP(policy: string): this {
    return this.set("Cross-Origin-Opener-Policy", policy);
  }

  setCOEP(policy: string): this {
    return this.set("Cross-Origin-Embedder-Policy", policy);
  }

  setCORP(policy: string): this {
    return this.set("Cross-Origin-Resource-Policy", policy);
  }

  toJSON(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  getHeaderCount(): number {
    return this.headers.size;
  }

  getHeaderNames(): string[] {
    return [...this.headers.keys()];
  }
}

export function createSecurityHeaders(): SecurityHeaders {
  return new SecurityHeaders();
}
