
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}


/**
 * Suspense + ErrorBoundary -- streaming UI components for TW Framework.
 *
 * <Suspense> shows a fallback while async children are loading.
 * <ErrorBoundary> catches errors and shows a fallback UI.
 *
 * TW's Suspense is FASTER than React Suspense because:
 * - React: suspends -> reconciles -> patches DOM (3 steps)
 * - TW: streams fallback -> streams content -> swaps (2 steps, no reconciliation)
 *
 * Usage in .tw:
 *   <Suspense fallback="<div>Loading...</div>">
 *     <AsyncComponent />
 *   </Suspense>
 *
 *   <ErrorBoundary fallback="<div>Something went wrong</div>">
 *     <RiskyComponent />
 *   </ErrorBoundary>
 */

// --- Suspense ----------------------------------------------------------

export interface SuspenseBoundary {
  id: string;
  fallback: string;
  /** Children that may suspend */
  children: string;
  /** Has this boundary resolved? */
  resolved: boolean;
  /** Render priority (lower = render first) */
  priority: number;
}

/**
 * Create a Suspense boundary.
 * The fallback is rendered immediately, children stream in later.
 */
export function createSuspense(
  fallback: string,
  children: string,
  options?: { id?: string; priority?: number }
): SuspenseBoundary {
  return {
    id: options?.id ?? generateId(),
    fallback,
    children,
    resolved: false,
    priority: options?.priority ?? 0,
  };
}

/**
 * Render a Suspense boundary to streaming HTML.
 *
 * Outputs:
 *   <div data-tw-suspense="ID">
 *     <template data-tw-fallback="ID">FALLBACK</template>
 *     <template data-tw-content="ID">CHILDREN (when ready)</template>
 *   </div>
 *
 * Client runtime swaps fallback -> content when ready.
 * For SSR streaming: fallback sent first, content streamed after.
 */
export function renderSuspense(boundary: SuspenseBoundary): string {
  return [
    `<div data-tw-suspense="${boundary.id}">`,
    `  <template data-tw-fallback="${boundary.id}">${boundary.fallback}</template>`,
    `  <template data-tw-content="${boundary.id}" hidden>${boundary.children}</template>`,
    `</div>`,
  ].join("\n");
}

/**
 * Stream a Suspense boundary -- send fallback first, then resolve content.
 *
 * TW streaming protocol (simpler than React's):
 * 1. Send `<div data-tw-suspense="ID">FALLBACK</div>`
 * 2. Async work completes
 * 3. Send `<script>__TW_RESOLVE__("ID", "CONTENT")</script>`
 * 4. Client swaps content immediately (no reconciliation)
 */
export async function* streamSuspense(
  boundary: SuspenseBoundary,
  loadContent: () => Promise<string>
): AsyncGenerator<string, void, unknown> {
  // 1. Send fallback immediately
  yield `<div data-tw-suspense="${boundary.id}">${boundary.fallback}</div>`;

  // 2. Load content asynchronously
  try {
    const content = await loadContent();

    // 3. Send resolution script (client swaps content)
    const escapedContent = content.replace(/<\/script>/g, "<\\/script>");
    yield `<script>window.__TW_RESOLVE__("${boundary.id}", ${JSON.stringify(escapedContent)});</script>`;
  } catch (err) {
    // 4. On error, send error state
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    yield `<script>window.__TW_REJECT__("${boundary.id}", ${JSON.stringify(errMsg)});</script>`;
  }
}

// --- ErrorBoundary ----------------------------------------------------

export interface ErrorBoundaryConfig {
  id: string;
  fallback: string;
  /** Error recovery -- auto retry on error */
  retry?: { count: number; delay: number };
  /** Report error to external service */
  onError?: (err: Error, info: { component: string }) => void;
  /** Reset on navigation */
  resetOnNavigate?: boolean;
}

/**
 * Render an ErrorBoundary.
 *
 * Wraps children in a boundary that catches render errors.
 * If child throws, fallback UI is shown.
 *
 * <ErrorBoundary fallback="<div>Error!</div>">
 *   <RiskyComponent />
 * </ErrorBoundary>
 */
export function renderErrorBoundary(config: ErrorBoundaryConfig, children: string): string {
  return [
    `<div data-tw-error-boundary="${config.id}">`,
    `  <template data-tw-fallback="${config.id}">${config.fallback}</template>`,
    `  <div data-tw-content="${config.id}">${children}</div>`,
    `</div>`,
  ].join("\n");
}

// --- Loading States ---------------------------------------------------

/**
 * Create a loading.tsx equivalent.
 * In Next.js: `loading.tsx` file wraps page in Suspense.
 * In TW: `@render streaming;` + `<Suspense>` component.
 *
 * TW is more flexible -- you can have multiple Suspense boundaries
 * per page, each with different fallbacks and priorities.
 * Next.js only supports one loading.tsx per route segment.
 */
export function createLoadingState(
  segments: Array<{ name: string; fallback: string; priority: number }>
): string {
  return segments
    .sort((a, b) => a.priority - b.priority)
    .map((seg) => createSuspense(seg.fallback, `<!-- ${seg.name} -->`, { priority: seg.priority }))
    .map(renderSuspense)
    .join("\n");
}

// --- Helpers ---------------------------------------------------------

function generateId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Client Runtime (injected into HTML) ------------------------------

export const SUSPENSE_CLIENT_RUNTIME = `
// TW Suspense + ErrorBoundary Client Runtime (~800 bytes)
window.__TW_RESOLVE__ = function(id, content) {
  let el = document.querySelector('[data-tw-suspense="' + id + '"]');
  if (el) el.innerHTML = escapeHtml(content);
};
window.__TW_REJECT__ = function(id, err) {
  let el = document.querySelector('[data-tw-suspense="' + id + '"]');
  if (el) el.innerHTML = '<div data-tw-error>Error: ' + escapeHtml(String(err)) + '</div>';
};
window.__TW_ERROR__ = function(id, err) {
  let el = document.querySelector('[data-tw-error-boundary="' + id + '"]');
  if (el) {
    let fallback = el.querySelector('template[data-tw-fallback="' + id + '"]');
    if (fallback) el.innerHTML = "";
    el.appendChild(fallback.cloneNode(true)); // fallback is already DOM, safe
  }
};
`;
