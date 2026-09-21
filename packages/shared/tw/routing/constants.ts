/**
 * Routing Constants -- Special file names, conventions, and defaults.
 *
 * TW Framework uses a file-system based routing system.
 * The "home/" directory is the root routing directory and is not included in the URL.
 *
 * CORE ROUTING RULE:
 *   Directory  ->  URL segment
 *   page.tw    ->  Route entry point
 *   layout.tw  ->  Automatic parent wrapper
 *   [...]      ->  Dynamic route
 *   [[...]]    ->  Optional catch-all
 *   (...)      ->  Route group
 *   @name      ->  Parallel slot
 *   route.twm  ->  Server/API endpoint
 *
 * Special files recognized inside any route segment:
 *   page.tw          -- Route page (renders HTML, has state/events)
 *   layout.tw        -- Layout component that wraps all children (automatic)
 *   template.tw      -- Like layout but re-renders on every navigation
 *   loading.tw       -- Loading UI (shown during async data fetch)
 *   error.tw         -- Error boundary (catches render errors in subtree)
 *   not-found.tw     -- 404 UI (shown when child route not found)
 *   global-error.tw  -- Root-level error boundary (replaces root layout on error)
 *   default.tw       -- Fallback content for unmatched parallel route slot
 *   head.tw          -- Per-route <head> content (meta tags, OG tags)
 *
 * Server/API files (use .twm):
 *   route.twm        -- API endpoint (JS functions, returns JSON)
 *   middleware.twm   -- Middleware rules (runs before routes)
 *
 * IMPORTANT: about.tw is NOT a route. Use about/page.tw instead.
 * Every route must be a directory containing page.tw.
 *
 * Folder conventions:
 *   (group)          -- Route group: doesn't affect URL
 *   [param]          -- Dynamic segment: /users/[id] -> /users/42
 *   [...catchAll]    -- Catch-all: /docs/[...rest] -> /docs/a/b/c
 *   [[...optional]]  -- Optional catch-all: /shop/[[...slug]] -> /shop, /shop/a/b
 *   @slot            -- Parallel route slot
 *   (..)intercept    -- Intercepting route: (..)photo/[id] -> modal interception
 *   _private         -- Private folder: excluded from routing
 *
 * @module shared/routing/constants
 */

/** Extension for TW UI files (pages, layouts, components, all special UI files). */
export const TW_EXTENSION = ".tw";

/** Extension for TW Module files (API routes, middleware -- server-side only). */
export const TWM_EXTENSION = ".twm";

/** Extension for TW Style Sheet files. */
export const TSS_EXTENSION = ".tss";

/** All route file extensions recognized by the scanner. */
export const ROUTE_EXTENSIONS = new Set([TW_EXTENSION, TWM_EXTENSION]);

/** All special file types recognized by the TW routing system. */
export type RouteFileType =
  | "page"
  | "layout"
  | "template"
  | "loading"
  | "error"
  | "not-found"
  | "global-error"
  | "default"
  | "head"
  | "route"
  | "middleware"
  | "intercept-page";

/**
 * Map of special file base names (without extension) to their type.
 */
export const SPECIAL_FILES: Record<string, RouteFileType> = {
  "page": "page",
  "index": "page",
  // Intercepting routes (docs/intercepting-routes.md): a `(.)page.tw`
  // beside a page renders INSTEAD of it on SPA navigation (X-TW-Navigate).
  "(.)page": "intercept-page",
  "layout": "layout",
  "template": "template",
  "loading": "loading",
  "error": "error",
  "not-found": "not-found",
  "global-error": "global-error",
  "default": "default",
  "head": "head",
  "route": "route",
  "middleware": "middleware",
};

/**
 * Files that use .tw extension (UI components -- compiled with full pipeline).
 * These have state, events, interactivity, or at minimum produce HTML.
 */
export const TW_FILE_TYPES = new Set<RouteFileType>([
  "page",
  "intercept-page",
  "layout",
  "template",
  "loading",
  "error",
  "not-found",
  "global-error",
  "default",
  "head",
]);

/**
 * Files that use .twm extension (server-side only -- JS functions, not markup).
 */
export const TWM_FILE_TYPES = new Set<RouteFileType>([
  "route",
  "middleware",
]);

/**
 * Get the route file type from a filename.
 * @param baseName -- filename without extension (e.g. "layout", "page", "index")
 * @returns RouteFileType or null if it's not a special file
 */
export function getRouteFileType(baseName: string): RouteFileType | null {
  return SPECIAL_FILES[baseName] ?? null;
}

/**
 * Get the expected extension for a route file type.
 * .tw for all UI special files (page, layout, template, loading, error, etc.)
 * .twm for server-side files (route, middleware)
 */
export function getExtensionForType(type: RouteFileType): string {
  if (TWM_FILE_TYPES.has(type)) return TWM_EXTENSION;
  return TW_EXTENSION;
}

/**
 * Check if a file type should be compiled as a full TW component (with state, events, VDOM).
 */
export function isInteractiveFile(type: RouteFileType): boolean {
  return TW_FILE_TYPES.has(type);
}

/**
 * Check if a file type is an API route (JS functions, returns JSON).
 */
export function isApiRoute(type: RouteFileType): boolean {
  return type === "route";
}

/**
 * Check if a file type is middleware.
 */
export function isMiddlewareFile(type: RouteFileType): boolean {
  return type === "middleware";
}

// --- Folder Conventions ---------------------------------------------

/**
 * Check if a folder name is a private folder (starts with _).
 * Private folders are excluded from routing entirely.
 */
export function isPrivateFolder(name: string): boolean {
  return name.startsWith("_");
}

/**
 * Check if a folder name is a route group (parenthesized).
 * Route groups don't affect the URL path.
 */
export function isRouteGroup(name: string): boolean {
  const m = name.match(/^\(([^)]+)\)$/);
  return m !== null && !name.match(/^\(\.{1,3}/);
}

/** Extract the group name from "(marketing)" -> "marketing". */
export function extractGroupName(name: string): string | null {
  const m = name.match(/^\(([^)]+)\)$/);
  if (!m) return null;
  if (m[1].startsWith(".")) return null; // intercepting, not group
  return m[1];
}

/**
 * Check if a folder name is an intercepting route.
 * Matches: (.)name, (..)name, (...)name
 */
export function isInterceptingFolder(name: string): boolean {
  return /^\(\.{1,3}[^)]+\)$/.test(name);
}

/** Parse intercepting route: "(..)photo" -> { levels: 2, target: "photo" } */
export function parseInterceptingFolder(name: string): { levels: number; target: string } | null {
  const m = name.match(/^\((\.{1,3})([^)]+)\)$/);
  if (!m) return null;
  return { levels: m[1].length, target: m[2] };
}

/**
 * Check if a folder name is a dynamic segment.
 * Matches: [id], [slug], [...rest], [[...optional]]
 */
export function isDynamicFolder(name: string): boolean {
  return /^\[.+\]$/.test(name);
}

/** Parse dynamic segment into its kind and param name. */
export interface ParsedSegment {
  type: "static" | "dynamic" | "catch-all" | "optional-catch-all";
  name: string;
}

/** Parse a folder/file name into a route segment. */
export function parseSegment(name: string): ParsedSegment {
  // Optional catch-all: [[...slug]]
  const optCatchAll = name.match(/^\[\[\.\.\.([^\]]+)\]\]$/);
  if (optCatchAll) return { type: "optional-catch-all", name: optCatchAll[1] };

  // Catch-all: [...slug]
  const catchAll = name.match(/^\[\.\.\.([^\]]+)\]$/);
  if (catchAll) return { type: "catch-all", name: catchAll[1] };

  // Dynamic: [id]
  const dynamic = name.match(/^\[([^\]]+)\]$/);
  if (dynamic) return { type: "dynamic", name: dynamic[1] };

  return { type: "static", name };
}

/**
 * Check if a folder name is a parallel route slot.
 * @slot -> true
 */
export function isParallelSlot(name: string): boolean {
  return name.startsWith("@");
}

/** Extract slot name from "@sidebar" -> "sidebar". */
export function extractSlotName(name: string): string | null {
  if (!name.startsWith("@")) return null;
  return name.slice(1);
}

// --- Render Modes ---------------------------------------------------

export type RenderMode = "static" | "ssr" | "island" | "edge" | "csr" | "stream" | "ppr" | "signalStream";

export const VALID_RENDER_MODES = new Set<RenderMode>(["static", "ssr", "island", "edge", "csr", "stream", "ppr", "signalStream"]);
