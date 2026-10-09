import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Auth model (strategies.auth.model): how a project authenticates.
 *
 *   session (default) -- cookie sessions (SessionManager, already in @tw/security).
 *   jwt               -- signed tokens (JWTManager).
 *   oauth             -- an external identity provider (needs a client library).
 */

export type AuthModelName = "session" | "jwt" | "oauth";

export interface AuthModelInfo {
  model: AuthModelName;
  detail: string;
  /** The @tw/security export that implements it. */
  provider: string;
  packages: string[];
}

export const AUTH_MODELS: Record<AuthModelName, AuthModelInfo> = {
  session: { model: "session", detail: "cookie sessions", provider: "createSessionManager", packages: [] },
  jwt: { model: "jwt", detail: "signed tokens", provider: "createJWTManager", packages: [] },
  oauth: { model: "oauth", detail: "external identity provider", provider: "createOAuthClient", packages: ["oauth4webapi"] },
};

/** Resolve the configured auth model, defaulting to session. */
export function resolveAuthModel(cfg: any): AuthModelName {
  const m = cfg?.strategies?.auth?.model;
  return m === "jwt" || m === "oauth" ? m : "session";
}

function hasPackage(rootDir: string, name: string): boolean {
  let dir = rootDir;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "node_modules", name))) return true;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

export function describeAuthModel(model: string, rootDir: string): AuthModelInfo & { available: boolean; missing: string[] } {
  const info = AUTH_MODELS[(model as AuthModelName)] ?? AUTH_MODELS.session;
  const missing = info.packages.filter((p) => !hasPackage(rootDir, p));
  return { ...info, available: missing.length === 0, missing };
}
