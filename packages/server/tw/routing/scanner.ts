/**
 * Route Scanner -- Builds a complete route tree from the home/ directory.
 *
 * CORE ROUTING RULE:
 *   - Every route is a DIRECTORY containing page.tw
 *   - about.tw is NOT a route. Use about/page.tw instead.
 *   - layout.tw, loading.tw, error.tw, etc. are special files inside directories
 *   - route.twm is for API endpoints (server-side)
 *   - middleware.twm is for middleware (server-side, root level only)
 *
 * Walks the filesystem recursively and produces a RouteNode tree that captures:
 *   - Static segments: home/about/page.tw -> /about
 *   - Dynamic segments: home/blog/[slug]/page.tw -> /blog/:slug
 *   - Catch-all: home/docs/[...rest]/page.tw -> /docs/*
 *   - Optional catch-all: home/shop/[[...slug]]/page.tw -> /shop[/:slug*]
 *   - Route groups: home/(marketing)/about/page.tw -> /about (group hidden from URL)
 *   - Parallel routes: home/dashboard/@analytics/page.tw -> slot
 *   - Intercepting routes: home/(..)photo/[id]/page.tw -> intercepts /photo/:id
 *   - Private folders: home/_components -> excluded entirely
 *   - Special files: layout.tw, loading.tw, error.tw, not-found.tw, etc.
 *
 * @module server/routing/scanner
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";
import {
  TW_EXTENSION,
  TWM_EXTENSION,
  ROUTE_EXTENSIONS,
  getRouteFileType,
  isPrivateFolder,
  extractGroupName,
  parseInterceptingFolder,
  parseSegment,
  isParallelSlot,
  extractSlotName,
  type RouteFileType,
} from "@tw/shared";
import type { RouteNode, RouteFile, SegmentKind } from "@tw/shared";

/** Options for the route scanner. */
export interface ScannerOptions {
  /** Absolute path to the home directory. */
  homeDir: string;
  /** Root directory of the project (for computing relative paths). */
  rootDir: string;
}

/**
 * Scan the home directory and build a complete route tree.
 *
 * @returns The root RouteNode. Returns null if homeDir doesn't exist.
 */
export function scanRouteTree(opts: ScannerOptions): RouteNode | null {
  if (!existsSync(opts.homeDir)) return null;

  const root: RouteNode = {
    segment: "",
    relativePath: "",
    absolutePath: opts.homeDir,
    kind: "static",
    isCatchAll: false,
    isOptionalCatchAll: false,
    groups: [],
    files: [],
    children: [],
  };

  scanDirectory(opts.homeDir, "", [], root, opts);
  return root;
}

/**
 * Scan a single directory and populate its children and files.
 *
 * Key rule: Only page.tw and index.tw are route entries.
 * Files like about.tw are NOT recognized as routes -- use about/page.tw.
 */
function scanDirectory(
  dirPath: string,
  urlPath: string,
  groups: string[],
  parentNode: RouteNode,
  opts: ScannerOptions,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    console.warn(`[scanner] Cannot read directory: ${dirPath}`);
    return;
  }

  // First pass: collect special files (.tw and .twm) in this directory
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const ext = extname(entry);

    if (!ROUTE_EXTENSIONS.has(ext)) continue;

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const baseName = basename(entry, ext);
    const fileType = getRouteFileType(baseName);

    if (fileType === null) {
      // NOT a special file -- this is an error in the routing system.
      // about.tw, pricing.tw, contact.tw are NOT valid routes.
      // Only page.tw / index.tw / layout.tw / loading.tw / etc. are recognized.
      // Non-special .tw files are ignored by the scanner.
      // Non-special .twm files are also ignored.
      // The developer must use directory/page.tw pattern.
      continue;
    }

    // It's a special file -- add it to this node's files
    const routeFile: RouteFile = {
      type: fileType,
      baseName,
      extension: ext,
      absolutePath: fullPath,
      relativePath: relative(opts.rootDir, fullPath),
    };
    parentNode.files.push(routeFile);
  }

  // Second pass: process subdirectories
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    // Skip private folders: _components, _lib, etc.
    if (isPrivateFolder(entry)) {
      continue;
    }

    // Route group: (marketing) -- doesn't affect URL
    const groupName = extractGroupName(entry);
    if (groupName) {
      const child: RouteNode = {
        segment: "",
        relativePath: relative(opts.homeDir, fullPath),
        absolutePath: fullPath,
        kind: "group" as SegmentKind,
        groupName,
        isCatchAll: false,
        isOptionalCatchAll: false,
        groups: [...groups, groupName],
        files: [],
        children: [],
      };
      parentNode.children.push(child);
      scanDirectory(fullPath, urlPath, [...groups, groupName], child, opts);
      continue;
    }

    // Intercepting route: (..)photo, (.)photo, (...)photo
    const intercept = parseInterceptingFolder(entry);
    if (intercept) {
      const interceptedPath = goUp(urlPath, intercept.levels);
      const child: RouteNode = {
        segment: intercept.target,
        relativePath: relative(opts.homeDir, fullPath),
        absolutePath: fullPath,
        kind: "intercepting" as SegmentKind,
        interceptLevels: intercept.levels,
        interceptTarget: intercept.target,
        isCatchAll: false,
        isOptionalCatchAll: false,
        groups: [...groups],
        files: [],
        children: [],
      };
      parentNode.children.push(child);
      scanDirectory(fullPath, interceptedPath + "/" + intercept.target, [...groups], child, opts);
      continue;
    }

    // Parallel route slot: @sidebar
    const slotName = extractSlotName(entry);
    if (slotName) {
      const child: RouteNode = {
        segment: entry,
        relativePath: relative(opts.homeDir, fullPath),
        absolutePath: fullPath,
        kind: "parallel" as SegmentKind,
        slotName,
        isCatchAll: false,
        isOptionalCatchAll: false,
        groups: [...groups],
        files: [],
        children: [],
      };
      parentNode.children.push(child);
      scanDirectory(fullPath, urlPath, [...groups], child, opts);
      continue;
    }

    // Dynamic segment: [id], [...rest], [[...optional]]
    const parsed = parseSegment(entry);
    if (parsed.type === "dynamic") {
      const child: RouteNode = {
        segment: ":" + parsed.name,
        relativePath: relative(opts.homeDir, fullPath),
        absolutePath: fullPath,
        kind: "dynamic" as SegmentKind,
        paramName: parsed.name,
        isCatchAll: false,
        isOptionalCatchAll: false,
        groups: [...groups],
        files: [],
        children: [],
      };
      const newUrlPath = urlPath + "/:" + parsed.name;
      parentNode.children.push(child);
      scanDirectory(fullPath, newUrlPath, [...groups], child, opts);
      continue;
    }

    if (parsed.type === "catch-all") {
      const child: RouteNode = {
        segment: "*",
        relativePath: relative(opts.homeDir, fullPath),
        absolutePath: fullPath,
        kind: "catch-all" as SegmentKind,
        paramName: parsed.name,
        isCatchAll: true,
        isOptionalCatchAll: false,
        groups: [...groups],
        files: [],
        children: [],
      };
      const newUrlPath = urlPath + "/*";
      parentNode.children.push(child);
      scanDirectory(fullPath, newUrlPath, [...groups], child, opts);
      continue;
    }

    if (parsed.type === "optional-catch-all") {
      const child: RouteNode = {
        segment: "*",
        relativePath: relative(opts.homeDir, fullPath),
        absolutePath: fullPath,
        kind: "optional-catch-all" as SegmentKind,
        paramName: parsed.name,
        isCatchAll: true,
        isOptionalCatchAll: true,
        groups: [...groups],
        files: [],
        children: [],
      };
      const newUrlPath = urlPath + "/*";
      parentNode.children.push(child);
      scanDirectory(fullPath, newUrlPath, [...groups], child, opts);
      continue;
    }

    // Static segment: about, blog, users
    const child: RouteNode = {
      segment: entry,
      relativePath: relative(opts.homeDir, fullPath),
      absolutePath: fullPath,
      kind: "static" as SegmentKind,
      isCatchAll: false,
      isOptionalCatchAll: false,
      groups: [...groups],
      files: [],
      children: [],
    };
    const newUrlPath = urlPath + "/" + entry;
    parentNode.children.push(child);
    scanDirectory(fullPath, newUrlPath, [...groups], child, opts);
  }
}

/**
 * Move up the URL path by N levels.
 * "/dashboard/users" with levels=2 -> "/dashboard"
 */
function goUp(urlPath: string, levels: number): string {
  let result = urlPath;
  for (let i = 0; i < levels; i++) {
    const idx = result.lastIndexOf("/");
    if (idx <= 0) {
      result = "";
    } else {
      result = result.slice(0, idx);
    }
  }
  return result;
}

// --- Route Matching -------------------------------------------------

/**
 * Match a URL pathname against the route tree.
 *
 * @returns match result if matched, null if not found.
 */
export function matchRoute(
  root: RouteNode,
  pathname: string,
): { node: RouteNode; chain: RouteNode[]; params: Record<string, string> } | null {
  const pathParts = pathname.split("/").filter(Boolean);
  return matchNode(root, pathParts, 0, [], {});
}

function matchNode(
  node: RouteNode,
  pathParts: string[],
  index: number,
  chain: RouteNode[],
  params: Record<string, string>,
): { node: RouteNode; chain: RouteNode[]; params: Record<string, string> } | null {
  const currentChain = [...chain, node];

  // If we've consumed all path parts, check if this node has a page file
  // or an API route file (route.twm) -- both terminate a match.
  if (index >= pathParts.length) {
    const hasPage = node.files.some(f => f.type === "page" || f.type === "route");
    if (hasPage) {
      return { node, chain: currentChain, params };
    }

    // Check if any child is an optional catch-all with a page
    for (const child of node.children) {
      if (child.kind === "optional-catch-all") {
        const result = matchNode(child, pathParts, index, currentChain, { ...params });
        if (result) return result;
      }
    }

    return null;
  }

  const currentPart = pathParts[index];

  // Try matching children in priority order:
  // 1. Static exact match
  for (const child of node.children) {
    if (child.kind === "static" && child.segment === currentPart) {
      const result = matchNode(child, pathParts, index + 1, currentChain, { ...params });
      if (result) return result;
    }
  }

  // 2. Dynamic segment match
  for (const child of node.children) {
    if (child.kind === "dynamic") {
      const newParams = { ...params, [child.paramName!]: decodeURIComponent(currentPart) };
      const result = matchNode(child, pathParts, index + 1, currentChain, newParams);
      if (result) return result;
    }
  }

  // 3. Optional catch-all (matches zero or more segments)
  for (const child of node.children) {
    if (child.kind === "optional-catch-all") {
      const hasPage = child.files.some(f => f.type === "page");
      if (index >= pathParts.length) {
        // No segments remain -- zero-segment match (param = "")
        if (hasPage) {
          return { node: child, chain: [...currentChain, child], params: { ...params, [child.paramName!]: "" } };
        }
      } else {
        // One or more segments remain -- match them all first
        const catchAllParams = pathParts.slice(index).map(p => decodeURIComponent(p)).join("/");
        const newParams = { ...params, [child.paramName!]: catchAllParams };
        const result = matchNode(child, pathParts, pathParts.length, currentChain, newParams);
        if (result) return result;
        // Fall back to a zero-segment match if the multi match failed
        if (hasPage) {
          return { node: child, chain: [...currentChain, child], params: { ...params, [child.paramName!]: "" } };
        }
      }
    }
  }

  // 4. Catch-all (matches one or more segments)
  for (const child of node.children) {
    if (child.kind === "catch-all") {
      const catchAllParams = pathParts.slice(index).map(p => decodeURIComponent(p)).join("/");
      const newParams = { ...params, [child.paramName!]: catchAllParams };
      const result = matchNode(child, pathParts, pathParts.length, currentChain, newParams);
      if (result) return result;
    }
  }

  // 5. Route groups (transparent -- try matching their children)
  for (const child of node.children) {
    if (child.kind === "group") {
      const result = matchNode(child, pathParts, index, currentChain, { ...params });
      if (result) return result;
    }
  }

  // 6. Intercepting routes (try matching at current level)
  for (const child of node.children) {
    if (child.kind === "intercepting" && child.segment === currentPart) {
      const result = matchNode(child, pathParts, index + 1, currentChain, { ...params });
      if (result) return result;
    }
  }

  // 7. Parallel routes (transparent for URL matching -- try their children)
  for (const child of node.children) {
    if (child.kind === "parallel") {
      const result = matchNode(child, pathParts, index, currentChain, { ...params });
      if (result) return result;
    }
  }

  return null;
}

// --- Flat Route List -------------------------------------------------

/**
 * Flatten the route tree into a list of all route paths with their page files.
 * Useful for debugging and build-time manifest generation.
 */
export function flattenRoutes(root: RouteNode): Array<{
  urlPath: string;
  node: RouteNode;
  files: RouteFile[];
}> {
  const result: Array<{ urlPath: string; node: RouteNode; files: RouteFile[] }> = [];
  flattenNode(root, "", result);
  return result;
}

function flattenNode(
  node: RouteNode,
  urlPath: string,
  result: Array<{ urlPath: string; node: RouteNode; files: RouteFile[] }>,
): void {
  // If this node has page files, add it to the result
  const pageFiles = node.files.filter(f => f.type === "page");
  if (pageFiles.length > 0) {
    result.push({
      urlPath: urlPath || "/",
      node,
      files: node.files,
    });
  }

  for (const child of node.children) {
    let childPath = urlPath;
    switch (child.kind) {
      case "static":
        childPath = urlPath + "/" + child.segment;
        break;
      case "dynamic":
        childPath = urlPath + "/:" + child.paramName;
        break;
      case "catch-all":
        childPath = urlPath + "/*";
        break;
      case "optional-catch-all":
        childPath = urlPath + "[/*]";
        break;
      case "group":
        break;
      case "parallel":
        break;
      case "intercepting":
        childPath = urlPath + "/" + child.interceptTarget;
        break;
      case "private":
        break;
    }
    flattenNode(child, childPath, result);
  }
}

/**
 * Print the route tree as a human-readable string (for debugging).
 */
export function printRouteTree(root: RouteNode): string {
  const lines: string[] = [];
  printNode(root, "", true, lines);
  return lines.join("\n");
}

function printNode(node: RouteNode, prefix: string, isLast: boolean, lines: string[]): void {
  const connector = isLast ? "\u2514\u2500\u2500 " : "\u251c\u2500\u2500 ";
  let label = node.segment || "home/";

  if (node.kind === "group") label = `(${node.groupName})`;
  else if (node.kind === "parallel") label = `@${node.slotName}`;
  else if (node.kind === "intercepting") {
    const dots = ".".repeat(node.interceptLevels ?? 1);
    label = `(${dots})${node.interceptTarget}`;
  } else if (node.kind === "dynamic") label = `[${node.paramName}]`;
  else if (node.kind === "catch-all") label = `[...${node.paramName}]`;
  else if (node.kind === "optional-catch-all") label = `[[...${node.paramName}]]`;

  const fileStr = node.files.length > 0
    ? " [" + node.files.map(f => f.baseName + f.extension).join(", ") + "]"
    : "";

  lines.push(`${prefix}${connector}${label}${fileStr}`);

  const childPrefix = prefix + (isLast ? "    " : "\u2502   ");
  for (let i = 0; i < node.children.length; i++) {
    printNode(node.children[i], childPrefix, i === node.children.length - 1, lines);
  }
}
