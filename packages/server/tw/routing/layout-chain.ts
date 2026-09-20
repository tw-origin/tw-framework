/**
 * Layout Chain Resolver -- Builds the full rendering context from a route match.
 *
 * Given a matched route node and its chain (root -> leaf), this module collects:
 *   - All layout.tw files in the chain (applied root-to-leaf)
 *   - All template.tw files in the chain (applied root-to-leaf)
 *   - The nearest loading.twm (from leaf up)
 *   - The nearest error.twm (from leaf up)
 *   - The nearest not-found.twm (from leaf up)
 *   - The nearest head.twm (from leaf up)
 *   - The page file to render
 *   - Render mode from page config
 *
 * @module server/routing/layout-chain
 */

import type { RouteNode, RouteFile, RouteMatchResult } from "@tw/shared";
import type { RenderMode } from "@tw/shared";

/**
 * Resolve the full rendering context from a route match.
 *
 * @param matchResult -- The raw match result from the scanner's matchRoute()
 * @returns Complete RouteMatchResult with all files resolved
 */
export function resolveLayoutChain(
  matchResult: { node: RouteNode; chain: RouteNode[]; params: Record<string, string> },
): RouteMatchResult {
  const { node, chain, params } = matchResult;

  // Collect layouts (root -> leaf order -- outermost first)
  const layouts: RouteFile[] = [];
  const templates: RouteFile[] = [];

  for (const nodeInChain of chain) {
    const layoutFile = nodeInChain.files.find(f => f.type === "layout");
    if (layoutFile) layouts.push(layoutFile);

    const templateFile = nodeInChain.files.find(f => f.type === "template");
    if (templateFile) templates.push(templateFile);
  }

  // Find nearest loading/error/not-found/head (search leaf -> root)
  // All these are .tw files now (not .twm)
  let loading: RouteFile | undefined;
  let error: RouteFile | undefined;
  let notFound: RouteFile | undefined;
  let head: RouteFile | undefined;

  for (let i = chain.length - 1; i >= 0; i--) {
    if (!loading) {
      loading = chain[i].files.find(f => f.type === "loading");
    }
    if (!error) {
      error = chain[i].files.find(f => f.type === "error");
    }
    if (!notFound) {
      notFound = chain[i].files.find(f => f.type === "not-found");
    }
    if (!head) {
      head = chain[i].files.find(f => f.type === "head");
    }
  }

  // The page file to render
  const page = node.files.find(f => f.type === "page");

  // Extract render mode from page source (default: ssr)
  let renderMode: RenderMode = "ssr";
  if (page) {
    renderMode = extractRenderMode(page);
  }

  return {
    node,
    chain,
    params,
    layouts,
    templates,
    loading,
    error,
    notFound,
    head,
    page,
    middleware: [],
    renderMode,
  };
}

/**
 * Find the global-error.twm file (should be at the root of home/).
 * This is special -- it replaces the root layout when a root-level error occurs.
 */
export function findGlobalError(rootNode: RouteNode): RouteFile | undefined {
  return rootNode.files.find(f => f.type === "global-error");
}

/**
 * Find the root not-found.twm file.
 * This is used when no route matches at all (404).
 */
export function findRootNotFound(rootNode: RouteNode): RouteFile | undefined {
  return rootNode.files.find(f => f.type === "not-found");
}

/**
 * Collect all default.twm files for parallel route slots in a given node.
 * Returns a map of slotName -> RouteFile.
 */
export function collectParallelDefaults(node: RouteNode): Map<string, RouteFile> {
  const defaults = new Map<string, RouteFile>();
  for (const child of node.children) {
    if (child.kind === "parallel" && child.slotName) {
      const defaultFile = child.files.find(f => f.type === "default");
      if (defaultFile) {
        defaults.set(child.slotName, defaultFile);
      }
    }
  }
  return defaults;
}

/**
 * Collect all parallel route pages for a given node at a specific URL.
 * Returns a map of slotName -> RouteFile (page file).
 */
export function collectParallelPages(
  node: RouteNode,
  pathParts: string[],
  index: number,
): Map<string, RouteFile> {
  const pages = new Map<string, RouteFile>();
  for (const child of node.children) {
    if (child.kind === "parallel" && child.slotName) {
      // Try to match the same path within this slot
      const pageFile = child.files.find(f => f.type === "page");
      if (pageFile) {
        pages.set(child.slotName, pageFile);
      }
      // Also check children of the slot
      if (index < pathParts.length) {
        for (const grandchild of child.children) {
          if (grandchild.kind === "static" && grandchild.segment === pathParts[index]) {
            const deepPage = grandchild.files.find(f => f.type === "page");
            if (deepPage) {
              pages.set(child.slotName, deepPage);
            }
          }
        }
      }
    }
  }
  return pages;
}

/**
 * Extract render mode from a page file's source.
 * Looks for: render static | render ssr | render island | render edge
 */
function extractRenderMode(page: RouteFile): RenderMode {
  try {
    const fs = require("node:fs");
    const source = fs.readFileSync(page.absolutePath, "utf-8");
    const m = source.match(/render\s+(static|ssr|island|edge)/);
    if (m) {
      return m[1] as RenderMode;
    }
  } catch {
    // If we can't read the file, default to ssr
  }
  return "ssr";
}
