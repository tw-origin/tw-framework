/**
 * RBAC (Role-Based Access Control) -- manages roles, permissions,
 * and access checks for users.
 *
 * @module security/permissions/rbac
 */

/** Permission definition. */
export interface Permission {
  resource: string;
  action: string;
}

/** Role definition with permissions. */
export interface Role {
  name: string;
  permissions: Permission[];
  inherits?: string[];
  description?: string;
}

/** User assignment. */
export interface UserAssignment {
  userId: string;
  roles: string[];
}

/** Access check result. */
export interface AccessResult {
  allowed: boolean;
  matchedRole: string | null;
  matchedPermission: Permission | null;
  reason: string;
}

/**
 * RBAC Manager -- role-based access control with inheritance,
 * wildcards, and permission composition.
 */
export class RBACManager {
  private roles: Map<string, Role> = new Map();
  private userAssignments: Map<string, Set<string>> = new Map();
  private permissionCache: Map<string, Permission[]> = new Map();
  private cacheEnabled: boolean = true;

  /** Registers a new role. */
  addRole(role: Role): this {
    this.roles.set(role.name, role);
    this.invalidateCache();
    return this;
  }

  /** Removes a role. */
  removeRole(name: string): this {
    this.roles.delete(name);
    // Remove from all user assignments
    for (const roles of this.userAssignments.values()) {
      roles.delete(name);
    }
    this.invalidateCache();
    return this;
  }

  /** Gets a role by name. */
  getRole(name: string): Role | undefined {
    return this.roles.get(name);
  }

  /** Gets all roles. */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  /** Assigns roles to a user. */
  assignRoles(userId: string, ...roleNames: string[]): this {
    if (!this.userAssignments.has(userId)) {
      this.userAssignments.set(userId, new Set());
    }
    const roles = this.userAssignments.get(userId)!;
    for (const name of roleNames) {
      if (this.roles.has(name)) {
        roles.add(name);
      }
    }
    return this;
  }

  /** Removes roles from a user. */
  revokeRoles(userId: string, ...roleNames: string[]): this {
    const roles = this.userAssignments.get(userId);
    if (roles) {
      for (const name of roleNames) {
        roles.delete(name);
      }
    }
    return this;
  }

  /** Gets all roles for a user. */
  getUserRoles(userId: string): string[] {
    const roles = this.userAssignments.get(userId);
    return roles ? Array.from(roles) : [];
  }

  /** Gets all permissions for a user (including inherited). */
  getUserPermissions(userId: string): Permission[] {
    const roleNames = this.getUserRoles(userId);
    const permissions: Permission[] = [];
    const seen = new Set<string>();

    for (const roleName of roleNames) {
      const rolePerms = this.resolvePermissions(roleName, seen);
      for (const perm of rolePerms) {
        const key = `${perm.resource}:${perm.action}`;
        if (!seen.has(key)) {
          seen.add(key);
          permissions.push(perm);
        }
      }
    }

    return permissions;
  }

  /** Recursively resolves permissions including inherited roles. */
  private resolvePermissions(roleName: string, seen: Set<string>): Permission[] {
    if (seen.has(roleName)) return [];
    seen.add(roleName);

    if (this.cacheEnabled) {
      const cached = this.permissionCache.get(roleName);
      if (cached) return cached;
    }

    const role = this.roles.get(roleName);
    if (!role) return [];

    const permissions = [...role.permissions];

    // Resolve inherited roles
    if (role.inherits) {
      for (const inheritedName of role.inherits) {
        const inheritedPerms = this.resolvePermissions(inheritedName, seen);
        permissions.push(...inheritedPerms);
      }
    }

    if (this.cacheEnabled) {
      this.permissionCache.set(roleName, permissions);
    }

    return permissions;
  }

  /**
   * Checks if a user has a specific permission.
   * Supports wildcards: resource="*" or action="*".
   */
  can(userId: string, resource: string, action: string): AccessResult {
    const permissions = this.getUserPermissions(userId);

    for (const perm of permissions) {
      const resourceMatch = perm.resource === "*" || perm.resource === resource ||
        this.matchesWildcard(perm.resource, resource);
      const actionMatch = perm.action === "*" || perm.action === action ||
        this.matchesWildcard(perm.action, action);

      if (resourceMatch && actionMatch) {
        // Find which role granted this
        const roleNames = this.getUserRoles(userId);
        let matchedRole = null;
        for (const roleName of roleNames) {
          const role = this.roles.get(roleName);
          if (role) {
            const hasPerm = role.permissions.some(
              p => (p.resource === perm.resource || p.resource === "*") &&
                   (p.action === perm.action || p.action === "*")
            );
            if (hasPerm) {
              matchedRole = roleName;
              break;
            }
          }
        }

        return {
          allowed: true,
          matchedRole,
          matchedPermission: perm,
          reason: `Granted by role: ${matchedRole}`,
        };
      }
    }

    return {
      allowed: false,
      matchedRole: null,
      matchedPermission: null,
      reason: "No matching permission found",
    };
  }

  /** Checks if user has ALL of the specified permissions. */
  canAll(userId: string, permissions: Permission[]): boolean {
    return permissions.every(p => this.can(userId, p.resource, p.action).allowed);
  }

  /** Checks if user has ANY of the specified permissions. */
  canAny(userId: string, permissions: Permission[]): boolean {
    return permissions.some(p => this.can(userId, p.resource, p.action).allowed);
  }

  /** Matches a wildcard pattern (e.g., "user:*" matches "user:read"). */
  private matchesWildcard(pattern: string, value: string): boolean {
    if (!pattern.includes("*")) return pattern === value;
    const regexStr = pattern.replace(/\*/g, ".*");
    return new RegExp(`^${regexStr}$`).test(value);
  }

  /** Clears the permission cache. */
  private invalidateCache(): void {
    this.permissionCache.clear();
  }

  /** Enables or disables caching. */
  setCaching(enabled: boolean): void {
    this.cacheEnabled = enabled;
    if (!enabled) this.invalidateCache();
  }

  /** Returns statistics. */
  getStats(): {
    totalRoles: number;
    totalUsers: number;
    cacheSize: number;
  } {
    return {
      totalRoles: this.roles.size,
      totalUsers: this.userAssignments.size,
      cacheSize: this.permissionCache.size,
    };
  }
}

/** Creates a new RBAC manager. */
export function createRBAC(): RBACManager {
  return new RBACManager();
}

/** Helper to define a permission. */
export function perm(resource: string, action: string): Permission {
  return { resource, action };
}
