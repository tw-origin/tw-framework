import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Data layer (strategies.data.layer): how a page reaches its data.
 *
 *   routes  (default) -- TW API routes (.twm) + server actions. No dependency.
 *   graphql           -- a GraphQL endpoint + typed client (needs `graphql`).
 *   trpc              -- tRPC-style typed procedures (needs @trpc/server).
 */

export type DataLayerName = "routes" | "graphql" | "trpc";

export interface DataLayerInfo {
  layer: DataLayerName;
  detail: string;
  packages: string[];
}

export const DATA_LAYERS: Record<DataLayerName, DataLayerInfo> = {
  routes: { layer: "routes", detail: "API routes (.twm) + server actions", packages: [] },
  graphql: { layer: "graphql", detail: "GraphQL endpoint + typed client", packages: ["graphql"] },
  trpc: { layer: "trpc", detail: "tRPC-style typed procedures", packages: ["@trpc/server"] },
};

/** Resolve the configured data layer, defaulting to routes. */
export function resolveDataLayer(cfg: any): DataLayerName {
  const l = cfg?.strategies?.data?.layer;
  return l === "graphql" || l === "trpc" ? l : "routes";
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

/** Describe a data layer and whether its packages are present. */
export function describeDataLayer(layer: string, rootDir: string): DataLayerInfo & { available: boolean; missing: string[] } {
  const info = DATA_LAYERS[(layer as DataLayerName)] ?? DATA_LAYERS.routes;
  const missing = info.packages.filter((p) => !hasPackage(rootDir, p));
  return { ...info, available: missing.length === 0, missing };
}
