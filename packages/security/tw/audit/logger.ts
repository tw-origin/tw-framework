/**
 * Audit Logger -- records security-relevant events for compliance
 * and forensic analysis. Supports structured logging, filtering,
 * and export to external systems.
 *
 * @module security/audit/logger
 */

/** An audit event. */
export interface AuditEvent {
  id: string;
  timestamp: number;
  type: "auth" | "access" | "mutation" | "security" | "system" | "error";
  action: string;
  actor: string;        // user ID or "system"
  resource: string;     // resource being accessed
  result: "success" | "failure" | "denied";
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/** Audit log filter. */
export interface AuditFilter {
  type?: AuditEvent["type"];
  action?: string;
  actor?: string;
  resource?: string;
  result?: AuditEvent["result"];
  since?: number;
  until?: number;
  limit?: number;
}

/** Audit log configuration. */
export interface AuditConfig {
  maxEvents?: number;
  flushInterval?: number;
  onFlush?: (events: AuditEvent[]) => void;
  hashChain?: boolean;
}

/**
 * Audit Logger -- records and manages security audit events
 * with optional hash chaining for tamper detection.
 */
export class AuditLogger {
  private events: AuditEvent[] = [];
  private maxEvents: number;
  private flushInterval: number;
  private onFlushCb: ((events: AuditEvent[]) => void) | null;
  private hashChain: boolean;
  private lastHash: string = "";
  private pendingEvents: AuditEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null;

  constructor(config: AuditConfig = {}) {
    this.maxEvents = config.maxEvents ?? 100000;
    this.flushInterval = config.flushInterval ?? 5000;
    this.onFlushCb = config.onFlush ?? null;
    this.hashChain = config.hashChain ?? true;
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
    if (typeof this.flushTimer.unref === "function") {
      this.flushTimer.unref();
    }
  }

  /** Records an audit event. */
  log(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
    const fullEvent: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    // Hash chaining for tamper detection
    if (this.hashChain) {
      const hashInput = JSON.stringify(fullEvent) + this.lastHash;
      this.lastHash = this.simpleHash(hashInput);
    }

    this.events.push(fullEvent);
    this.pendingEvents.push(fullEvent);

    // Enforce max events
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    return fullEvent;
  }

  /** Convenience: logs an auth event. */
  auth(action: string, actor: string, result: AuditEvent["result"], metadata?: Record<string, unknown>): AuditEvent {
    return this.log({ type: "auth", action, actor, resource: "auth", result, metadata });
  }

  /** Convenience: logs an access event. */
  access(action: string, actor: string, resource: string, result: AuditEvent["result"]): AuditEvent {
    return this.log({ type: "access", action, actor, resource, result });
  }

  /** Convenience: logs a security event. */
  security(action: string, actor: string, result: AuditEvent["result"], metadata?: Record<string, unknown>): AuditEvent {
    return this.log({ type: "security", action, actor, resource: "security", result, metadata });
  }

  /** Queries events with a filter. */
  query(filter?: AuditFilter): AuditEvent[] {
    let results = [...this.events];

    if (filter?.type) results = results.filter(e => e.type === filter.type);
    if (filter?.action) results = results.filter(e => e.action.includes(filter.action!));
    if (filter?.actor) results = results.filter(e => e.actor === filter.actor);
    if (filter?.resource) results = results.filter(e => e.resource.includes(filter.resource!));
    if (filter?.result) results = results.filter(e => e.result === filter.result);
    if (filter?.since) results = results.filter(e => e.timestamp >= filter.since!);
    if (filter?.until) results = results.filter(e => e.timestamp <= filter.until!);

    if (filter?.limit) {
      results = results.slice(-filter.limit);
    }

    return results;
  }

  /** Flushes pending events to the onFlush callback. */
  flush(): void {
    if (this.pendingEvents.length === 0) return;
    if (this.onFlushCb) {
      this.onFlushCb([...this.pendingEvents]);
    }
    this.pendingEvents = [];
  }

  /** Exports all events as JSON. */
  export(): string {
    return JSON.stringify(this.events, null, 2);
  }

  /** Exports events as CSV. */
  exportCSV(): string {
    const headers = ["id", "timestamp", "type", "action", "actor", "resource", "result", "ip"];
    const rows = this.events.map(e => [
      e.id, e.timestamp, e.type, e.action, e.actor, e.resource, e.result, e.ip ?? ""
    ]);
    return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  }

  /** Clears all events. */
  clear(): void {
    this.events = [];
    this.pendingEvents = [];
    this.lastHash = "";
  }

  /** Returns the hash chain for verification. */
  getHashChain(): string {
    return this.lastHash;
  }

  /** Verifies the hash chain integrity. */
  verifyIntegrity(): boolean {
    if (!this.hashChain) return true;
    let expectedHash = "";
    for (const event of this.events) {
      const hashInput = JSON.stringify(event) + expectedHash;
      expectedHash = this.simpleHash(hashInput);
    }
    return expectedHash === this.lastHash;
  }

  /** Returns statistics. */
  getStats(): {
    totalEvents: number;
    byType: Record<string, number>;
    byResult: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const byResult: Record<string, number> = {};
    for (const event of this.events) {
      byType[event.type] = (byType[event.type] ?? 0) + 1;
      byResult[event.result] = (byResult[event.result] ?? 0) + 1;
    }
    return { totalEvents: this.events.length, byType, byResult };
  }

  /** Destroys the audit logger. */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  /** Simple hash function for chain integrity (not cryptographic). */
  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
}

/** Creates a new audit logger. */
export function createAuditLogger(config?: AuditConfig): AuditLogger {
  return new AuditLogger(config);
}
