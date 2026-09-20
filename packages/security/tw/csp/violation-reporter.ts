/**
 * CSP Violation Reporter -- receives, processes, and aggregates
 * Content-Security-Policy violation reports from browsers.
 *
 * @module security/csp/violation-reporter
 */

/** A CSP violation report as sent by the browser. */
export interface CSPViolationReport {
  "csp-report": {
    "document-uri": string;
    "referrer": string;
    "violated-directive": string;
    "effective-directive": string;
    "original-policy": string;
    "disposition": "enforce" | "report";
    "blocked-uri": string;
    "line-number": number;
    "column-number": number;
    "source-file": string;
    "status-code": number;
    "script-sample": string;
  };
}

/** Aggregated violation statistics for a single directive. */
export interface DirectiveStats {
  directive: string;
  violationCount: number;
  uniqueBlockedUris: Set<string>;
  lastViolation: number;
  topBlockedUris: Array<{ uri: string; count: number }>;
}

/** Summary of all violations collected. */
export interface ViolationSummary {
  totalViolations: number;
  uniqueViolations: number;
  oldestViolation: number | null;
  newestViolation: number | null;
  byDirective: Map<string, DirectiveStats>;
  bySource: Map<string, number>;
  topViolations: Array<{
    directive: string;
    blockedUri: string;
    count: number;
    lastSeen: number;
  }>;
}

/** Configuration for the violation reporter. */
export interface ViolationReporterOptions {
  maxReports?: number;
  aggregationWindow?: number;
  sampleRate?: number;
  onViolation?: (report: CSPViolationReport) => void;
  logToConsole?: boolean;
}

/** A stored violation record. */
interface StoredViolation {
  id: string;
  timestamp: number;
  directive: string;
  blockedUri: string;
  documentUri: string;
  sourceFile: string;
  lineNumber: number;
  statusCode: number;
  disposition: "enforce" | "report";
}

/**
 * CSP Violation Reporter -- collects, aggregates, and analyzes
 * Content-Security-Policy violation reports.
 */
export class CSPViolationReporter {
  private violations: StoredViolation[] = [];
  private maxReports: number;
  private aggregationWindow: number;
  private sampleRate: number;
  private onViolationCb: ((report: CSPViolationReport) => void) | null;
  private logToConsole: boolean;
  private violationCounts: Map<string, number> = new Map();

  constructor(options: ViolationReporterOptions = {}) {
    this.maxReports = options.maxReports ?? 10000;
    this.aggregationWindow = options.aggregationWindow ?? 3600000; // 1 hour
    this.sampleRate = options.sampleRate ?? 1.0;
    this.onViolationCb = options.onViolation ?? null;
    this.logToConsole = options.logToConsole ?? false;
  }

  /**
   * Processes an incoming violation report from the browser.
   * Returns 202 (accepted) if processed, or 429 if over capacity.
   */
  report(rawReport: unknown): { status: number; message: string } {
    // Sample -- skip some reports if sampleRate < 1
    if (Math.random() > this.sampleRate) {
      return { status: 202, message: "Sampled" };
    }

    const report = rawReport as CSPViolationReport;
    if (!report || !report["csp-report"]) {
      return { status: 400, message: "Invalid report format" };
    }

    const csp = report["csp-report"];
    const stored: StoredViolation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: Date.now(),
      directive: csp["violated-directive"] || "unknown",
      blockedUri: csp["blocked-uri"] || "unknown",
      documentUri: csp["document-uri"] || "",
      sourceFile: csp["source-file"] || "",
      lineNumber: csp["line-number"] || 0,
      statusCode: csp["status-code"] || 0,
      disposition: csp["disposition"] || "enforce",
    };

    // Enforce max report limit
    if (this.violations.length >= this.maxReports) {
      this.violations.shift();
    }

    this.violations.push(stored);

    // Update aggregation counts
    const key = `${stored.directive}:${stored.blockedUri}`;
    this.violationCounts.set(key, (this.violationCounts.get(key) ?? 0) + 1);

    // Log if enabled
    if (this.logToConsole) {
      console.warn(`[CSP Violation] ${stored.directive} blocked ${stored.blockedUri}`);
    }

    // Call custom handler
    if (this.onViolationCb) {
      try {
        this.onViolationCb(report);
      } catch {
        // Don't let handler errors break reporting
      }
    }

    return { status: 202, message: "Accepted" };
  }

  /**
   * Creates a Bun.serve-compatible request handler for violation reports.
   * Usage: `Bun.serve({ routes: { "/csp-report": reporter.createHandler() } })`
   */
  createHandler() {
    return async (req: Request): Promise<Response> => {
      if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      return req.json().then(
        (body) => {
          const result = this.report(body);
          return new Response(JSON.stringify(result), {
            status: result.status,
            headers: { "Content-Type": "application/json" },
          });
        },
        () => new Response("Bad Request", { status: 400 })
      );
    };
  }

  /** Returns aggregated statistics for all collected violations. */
  getSummary(): ViolationSummary {
    const byDirective = new Map<string, DirectiveStats>();
    const bySource = new Map<string, number>();

    // Prune old violations outside the aggregation window
    const cutoff = Date.now() - this.aggregationWindow;
    this.violations = this.violations.filter(v => v.timestamp >= cutoff);

    for (const v of this.violations) {
      // Aggregate by directive
      if (!byDirective.has(v.directive)) {
        byDirective.set(v.directive, {
          directive: v.directive,
          violationCount: 0,
          uniqueBlockedUris: new Set(),
          lastViolation: 0,
          topBlockedUris: [],
        });
      }
      const stats = byDirective.get(v.directive)!;
      stats.violationCount++;
      stats.uniqueBlockedUris.add(v.blockedUri);
      stats.lastViolation = Math.max(stats.lastViolation, v.timestamp);

      // Aggregate by source file
      if (v.sourceFile) {
        bySource.set(v.sourceFile, (bySource.get(v.sourceFile) ?? 0) + 1);
      }
    }

    // Build top violations
    const topViolations: ViolationSummary["topViolations"] = [];
    for (const [key, count] of this.violationCounts) {
      const [directive, ...uriParts] = key.split(":");
      const blockedUri = uriParts.join(":");
      const matching = this.violations.find(
        v => v.directive === directive && v.blockedUri === blockedUri
      );
      if (matching) {
        topViolations.push({
          directive,
          blockedUri,
          count,
          lastSeen: matching.timestamp,
        });
      }
    }
    topViolations.sort((a, b) => b.count - a.count);

    // Fill topBlockedUris per directive
    for (const stats of byDirective.values()) {
      const dirViolations = this.violations.filter(v => v.directive === stats.directive);
      const uriCounts = new Map<string, number>();
      for (const v of dirViolations) {
        uriCounts.set(v.blockedUri, (uriCounts.get(v.blockedUri) ?? 0) + 1);
      }
      stats.topBlockedUris = Array.from(uriCounts.entries())
        .map(([uri, count]) => ({ uri, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    }

    const timestamps = this.violations.map(v => v.timestamp);

    return {
      totalViolations: this.violations.length,
      uniqueViolations: this.violationCounts.size,
      oldestViolation: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestViolation: timestamps.length > 0 ? Math.max(...timestamps) : null,
      byDirective,
      bySource,
      topViolations: topViolations.slice(0, 50),
    };
  }

  /** Returns all raw violations (optionally filtered). */
  getViolations(filter?: {
    directive?: string;
    blockedUri?: string;
    since?: number;
  }): StoredViolation[] {
    let result = this.violations;
    if (filter?.directive) {
      result = result.filter(v => v.directive === filter.directive);
    }
    if (filter?.blockedUri) {
      result = result.filter(v => v.blockedUri.includes(filter.blockedUri!));
    }
    if (filter?.since) {
      result = result.filter(v => v.timestamp >= filter.since!);
    }
    return result;
  }

  /** Clears all stored violations. */
  clear(): void {
    this.violations = [];
    this.violationCounts.clear();
  }

  /** Returns the current count of stored violations. */
  get count(): number {
    return this.violations.length;
  }
}

/** Creates a new CSP violation reporter. */
export function createViolationReporter(options?: ViolationReporterOptions): CSPViolationReporter {
  return new CSPViolationReporter(options);
}
