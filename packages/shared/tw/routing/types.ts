/**
 * Routing Types -- Route tree node, match result, and render context.
 *
 * @module shared/routing/types
 */

import type { RouteFileType, RenderMode } from "./constants";

/** The kind of route segment a folder represents. */
export type SegmentKind =
  | "static"        // /about
  | "dynamic"       // /users/:id
  | "catch-all"     // /docs/*
  | "optional-catch-all" // /shop[[/*]]
  | "group"         // (marketing) -- doesn't affect URL
  | "parallel"     // @sidebar -- parallel slot
  | "intercepting" // (..)photo -- intercepting route
  | "private";     // _components -- excluded from routing

/** A single node in the route tree. */
export interface RouteNode {
  /** URL path segment this node represents (e.g. "about", ":id", "*"). Empty for root. */
  segment: string;
  /** Filesystem path relative to home/ (e.g. "blog/[slug]"). */
  relativePath: string;
  /** Absolute filesystem path of the directory or file. */
  absolutePath: string;
  /** What kind of segment this is. */
  kind: SegmentKind;
  /** Group name if this is a route group. */
  groupName?: string;
  /** Slot name if this is a parallel route. */
  slotName?: string;
  /** Intercept levels if this is an intercepting route. */
  interceptLevels?: number;
  /** Intercept target if this is an intercepting route. */
  interceptTarget?: string;
  /** Dynamic param name if this is a dynamic segment. */
  paramName?: string;
  /** Is this a catch-all segment? */
  isCatchAll: boolean;
  /** Is this an optional catch-all? */
  isOptionalCatchAll: boolean;
  /** Route groups this node belongs to (inherited from ancestors). */
  groups: string[];
  /** Special files found in this segment's directory. */
  files: RouteFile[];
  /** Child route nodes. */
  children: RouteNode[];
}

/** A special file within a route segment. */
export interface RouteFile {
  /** File type (page, layout, loading, error, etc.). */
  type: RouteFileType;
  /** Filename without extension (e.g. "layout", "page", "index"). */
  baseName: string;
  /** File extension (.tw or .twm). */
  extension: string;
  /** Absolute file path. */
  absolutePath: string;
  /** Relative path from project root. */
  relativePath: string;
}

/** Result of matching a URL to a route. */
export interface RouteMatchResult {
  /** The matched route node (leaf/page node). */
  node: RouteNode;
  /** All nodes from root to the matched node (layout chain). */
  chain: RouteNode[];
  /** Extracted path parameters. */
  params: Record<string, string>;
  /** Layout files to apply (root -> leaf order). */
  layouts: RouteFile[];
  /** Loading file if present in the chain. */
  loading?: RouteFile;
  /** Error file if present in the chain. */
  error?: RouteFile;
  /** Not-found file if present in the chain. */
  notFound?: RouteFile;
  /** Template files to apply (root -> leaf order). */
  templates: RouteFile[];
  /** The page file to render. */
  page?: RouteFile;
  /** Middleware files to run (root -> leaf order). */
  middleware: RouteFile[];
  /** Head file for this route. */
  head?: RouteFile;
  /** Render mode from page config. */
  renderMode?: RenderMode;
}

/** Full HTML document render result. */
export interface RouteRenderResult {
  /** Complete HTML document ready to serve. */
  html: string;
  /** Extracted CSS (already inlined in html). */
  css: string;
  /** Extracted JS (already inlined in html). */
  js: string;
  /** HTTP status code. */
  status: number;
  /** Response headers. */
  headers: Record<string, string>;
  /** Whether this was a cached response. */
  fromCache: boolean;
  /** ISR: served stale while a background re-render refreshes the cache. */
  stale?: boolean;
  /** Render time in milliseconds. */
  durationMs: number;
}

/** Options for the render pipeline. */
export interface RenderPipelineOptions {
  /** Root directory of the project. */
  rootDir: string;
  /** Home directory (absolute or relative to rootDir). */
  homeDir: string;
  /** Enable SSR caching. */
  enableCache?: boolean;
  /** Cache TTL in milliseconds. */
  cacheTTL?: number;
  /** Inject dev-only HMR client script. */
  dev?: boolean;
}

/** Internal compiled file cache entry. */
export interface CompiledFileEntry {
  html: string;
  css: string;
  js: string;
  hasInteractivity: boolean;
  isMarkupOnly: boolean;
  compiledAt: number;
}
