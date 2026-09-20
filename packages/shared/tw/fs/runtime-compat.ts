/**
 * Cross-runtime fs access: Bun and Node share the node:fs API. The helpers
 * are lazy so importing this module never touches `node:fs` at load time in
 * environments without it (e.g. browser bundles that tree-shake it away).
 */
import * as nodeFs from "node:fs";

/** The synchronous fs module (Bun / Node). */
export function getFs(): typeof nodeFs {
  return nodeFs;
}

/** The promise-based fs module. */
export function getFsPromises(): typeof nodeFs.promises {
  return nodeFs.promises;
}
