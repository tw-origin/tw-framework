/**
 * On-demand ISR invalidation registry.
 *
 * `revalidatePath`/`revalidateRoute`/`revalidateTag` are injected into
 * .twm handlers via `import { ... } from "tw"`. The serve path registers
 * its RenderPipeline here once (per server instance) so the calls reach
 * the live caches.
 */
import type { RenderPipeline } from "./render-pipeline";

let activePipeline: RenderPipeline | null = null;

/** Called by the server when the SSR render pipeline is created. */
export function setActivePipeline(p: RenderPipeline | null): void {
  activePipeline = p;
}

/** The pipeline currently serving SSR renders (null outside a server). */
export function getActivePipeline(): RenderPipeline | null {
  return activePipeline;
}

/**
 * Drop cached page renders for a path (exact match, or prefix matching with
 * { prefix: true }). Returns the number of dropped entries.
 */
export function revalidatePath(pathname: string, opts?: { prefix?: boolean }): number {
  return activePipeline ? activePipeline.revalidatePath(pathname, opts) : 0;
}

// --- Cache tags (docs/cache-tags.md) ------------------------------------------

/**
 * Tag invalidator for the .twm route caches (routeCache + cached-handler
 * cache in twm-loader). Registered at module load to avoid a circular
 * import; entries carry their own tags (single source of truth).
 */
let twmTagInvalidator: ((tag: string) => number) | null = null;

/** Called by twm-loader when its caches exist (always, at import time). */
export function registerTwmTagInvalidator(fn: (tag: string) => number): void {
  twmTagInvalidator = fn;
}

/**
 * `revalidateTag("products")` from `"tw"`: expire every cached entry whose
 * `cache { tag "products" }` family matches -- page renders AND cached
 * handler responses. Next request for those routes renders fresh.
 * Returns the total number of dropped entries.
 */
export function revalidateTag(tag: string): number {
  let dropped = 0;
  if (activePipeline) dropped += activePipeline.revalidateTag(tag);
  if (twmTagInvalidator) dropped += twmTagInvalidator(tag);
  return dropped;
}
