/**
 * ACL (Access Control List) -- fine-grained per-resource access control.
 *
 * @module security/permissions/acl
 */

/** An ACL entry. */
export interface ACLEntry {
  resource: string;
  principal: string; // user ID or role name
  permissions: string[];
  effect: "allow" | "deny";
}

/** ACL check result. */
export interface ACLCheckResult {
  allowed: boolean;
  matchedEntries: ACLEntry[];
  reason: string;
}

/**
 * ACL Manager -- manages per-resource access control lists
 * with allow/deny rules and principal matching.
 */
export class ACLManager {
  private entries: ACLEntry[] = [];
  private indexByResource: Map<string, ACLEntry[]> = new Map();

  /** Adds an ACL entry. */
  add(entry: ACLEntry): this {
    this.entries.push(entry);
    this.indexEntry(entry);
    return this;
  }

  /** Adds a batch of entries. */
  addAll(entries: ACLEntry[]): this {
    for (const entry of entries) {
      this.entries.push(entry);
      this.indexEntry(entry);
    }
    return this;
  }

  /** Removes all entries for a resource. */
  removeForResource(resource: string): number {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.resource !== resource);
    this.indexByResource.delete(resource);
    return before - this.entries.length;
  }

  /** Removes all entries for a principal. */
  removeForPrincipal(principal: string): number {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.principal !== principal);
    this.rebuildIndex();
    return before - this.entries.length;
  }

  /**
   * Checks if a principal has permission to perform an action on a resource.
   * Deny rules take precedence over allow rules.
   */
  check(principal: string, resource: string, action: string): ACLCheckResult {
    const entries = this.getEntriesForResource(resource);
    const matched: ACLEntry[] = [];

    // Check deny rules first (deny takes precedence)
    for (const entry of entries) {
      if (entry.principal === principal || entry.principal === "*") {
        if (entry.permissions.includes(action) || entry.permissions.includes("*")) {
          if (entry.effect === "deny") {
            matched.push(entry);
            return {
              allowed: false,
              matchedEntries: matched,
              reason: `Denied by rule: ${entry.principal} cannot ${action} on ${resource}`,
            };
          }
          matched.push(entry);
        }
      }
    }

    // Check allow rules
    for (const entry of matched) {
      if (entry.effect === "allow") {
        return {
          allowed: true,
          matchedEntries: matched,
          reason: `Allowed by rule: ${entry.principal} can ${action} on ${resource}`,
        };
      }
    }

    return {
      allowed: false,
      matchedEntries: [],
      reason: "No matching rule found -- default deny",
    };
  }

  /** Checks multiple principals (e.g., user + roles). */
  checkAny(principals: string[], resource: string, action: string): ACLCheckResult {
    for (const principal of principals) {
      const result = this.check(principal, resource, action);
      if (result.allowed) return result;
    }

    // Check all deny rules
    for (const principal of principals) {
      const result = this.check(principal, resource, action);
      if (!result.allowed && result.matchedEntries.length > 0) {
        return result;
      }
    }

    return {
      allowed: false,
      matchedEntries: [],
      reason: "No principal has permission",
    };
  }

  /** Gets all entries for a resource. */
  getEntriesForResource(resource: string): ACLEntry[] {
    return this.indexByResource.get(resource) ?? [];
  }

  /** Gets all entries for a principal. */
  getEntriesForPrincipal(principal: string): ACLEntry[] {
    return this.entries.filter(e => e.principal === principal);
  }

  /** Returns all entries. */
  getAllEntries(): ACLEntry[] {
    return [...this.entries];
  }

  private indexEntry(entry: ACLEntry): void {
    if (!this.indexByResource.has(entry.resource)) {
      this.indexByResource.set(entry.resource, []);
    }
    this.indexByResource.get(entry.resource)!.push(entry);
  }

  private rebuildIndex(): void {
    this.indexByResource.clear();
    for (const entry of this.entries) {
      this.indexEntry(entry);
    }
  }

  /** Returns statistics. */
  getStats(): {
    totalEntries: number;
    totalResources: number;
    allowRules: number;
    denyRules: number;
  } {
    let allow = 0;
    let deny = 0;
    for (const entry of this.entries) {
      if (entry.effect === "allow") allow++;
      else deny++;
    }
    return {
      totalEntries: this.entries.length,
      totalResources: this.indexByResource.size,
      allowRules: allow,
      denyRules: deny,
    };
  }
}

/** Creates a new ACL manager. */
export function createACL(): ACLManager {
  return new ACLManager();
}
