/**
 * On-demand ISR invalidation registry.
 *
 * `revalidatePath`/`revalidateRoute` are injected into .twm handlers via
 * `import { ... } from "tw"`. The serve path registers its RenderPipeline
 * here once (per server instance) so the calls reach the live caches.
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
