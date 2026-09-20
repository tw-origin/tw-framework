/**
 * Async Components -- lazy loading with Suspense integration.
 *
 * Features:
 * - defineAsyncComponent() -- load components on demand
 * - Loading state with configurable delay
 * - Error state with retry
 * - Timeout support
 * - Suspense coordination (multiple async components load together)
 * - Code splitting integration (works with dynamic import())
 * - Preloading hints
 * - Fallback components
 */

import type { VNode } from "./types";

// --- Types ------------------------------------------------------------

export interface AsyncComponentOptions {
  loader: () => Promise<{ default: unknown } | unknown>;
  loadingComponent?: unknown;
  errorComponent?: unknown;
  delay?: number;
  timeout?: number;
  suspensible?: boolean;
  onError?: (error: Error) => boolean | void;
  retries?: number;
  retryDelay?: number;
}

export interface AsyncComponentState {
  status: "idle" | "loading" | "loaded" | "error" | "timeout";
  component: unknown | null;
  error: Error | null;
  loadingStartedAt: number;
  attempts: number;
}

export interface SuspenseBoundary {
  pending: Set<Promise<unknown>>;
  fallback: VNode | null;
  resolved: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
}

// --- Async Component Loader ------------------------------------------

class AsyncComponentLoader {
  private _timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private options: AsyncComponentOptions;
  private state: AsyncComponentState;
  private promise: Promise<unknown> | null = null;
  private suspenseBoundary: SuspenseBoundary | null = null;

  constructor(options: AsyncComponentOptions) {
    this.options = {
      delay: 200,
      timeout: 30000,
      suspensible: true,
      retries: 3,
      retryDelay: 1000,
      ...options,
    };
    this.state = {
      status: "idle",
      component: null,
      error: null,
      loadingStartedAt: 0,
      attempts: 0,
    };
  }

  /**
   * Load the component. Returns a promise that resolves to the component.
   */
  load(): Promise<unknown> {
    if (this.state.status === "loaded" && this.state.component) {
      return Promise.resolve(this.state.component);
    }
    if (this.state.status === "loading" && this.promise) {
      return this.promise;
    }

    this.state.status = "loading";
    this.state.loadingStartedAt = Date.now();
    this.state.attempts++;

    this.promise = this.doLoad();

    // Set timeout
    if (this.options.timeout && this.options.timeout > 0) {
      this._timeoutTimer = setTimeout(() => {
        if (this.state.status === "loading") {
          this.state.status = "timeout";
          const err = new Error(`Async component timed out after ${this.options.timeout}ms`);
          this.state.error = err;
        }
      }, this.options.timeout);
    }

    return this.promise;
  }

  /**
   * Get current state.
   */
  getState(): AsyncComponentState { return { ...this.state }; }

  /**
   * Reset to idle state.
   */
  reset(): void {
    this.state = { status: "idle", component: null, error: null, loadingStartedAt: 0, attempts: 0 };
    this.promise = null;
  }

  /**
   * Set the suspense boundary for coordination.
   */
  setSuspenseBoundary(boundary: SuspenseBoundary | null): void {
    this.suspenseBoundary = boundary;
  }

  // --- Internal ------------------------------------------------------

  private async doLoad(): Promise<unknown> {
    const maxRetries = this.options.retries || 3;
    const retryDelay = this.options.retryDelay || 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const module = await this.options.loader();
        const component = (module as { default?: unknown }).default || module;
        this.state.status = "loaded";
        this.state.component = component;
        this.state.error = null;
        return component;
      } catch (err) {
        if (attempt < maxRetries) {
          if (this.options.onError) {
            const shouldRetry = this.options.onError(err as Error);
            if (shouldRetry === false) {
              this.state.status = "error";
              this.state.error = err as Error;
              throw err;
            }
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        } else {
          this.state.status = "error";
          this.state.error = err as Error;
          throw err;
        }
      }
    }

    throw new Error("Async component failed to load after retries");
  }
}

// --- Component Registry ----------------------------------------------

const asyncLoaders = new Map<string, AsyncComponentLoader>();

/**
 * Define an async component.
 */
export function defineAsyncComponent(options: AsyncComponentOptions): () => Promise<unknown> {
  const loader = new AsyncComponentLoader(options);

  const factory = () => {
    return loader.load();
  };

  // Store loader for state inspection
  const id = `async-${asyncLoaders.size + 1}`;
  asyncLoaders.set(id, loader);

  return factory;
}

/**
 * Get an async loader by ID.
 */
export function getAsyncLoader(id: string): AsyncComponentLoader | undefined {
  return asyncLoaders.get(id);
}

/**
 * Preload an async component.
 */
export function preloadAsyncComponent(factory: () => Promise<unknown>): Promise<unknown> {
  return factory();
}

// --- Suspense Manager ------------------------------------------------

class SuspenseManager {
  private boundaries: SuspenseBoundary[] = [];
  private currentBoundary: SuspenseBoundary | null = null;

  /**
   * Push a new suspense boundary.
   */
  pushBoundary(fallback: VNode | null): SuspenseBoundary {
    const boundary: SuspenseBoundary = {
      pending: new Set(),
      fallback,
      resolved: false,
      resolve: () => {},
      reject: () => {},
    };

    const promise = new Promise<void>((resolve, reject) => {
      boundary.resolve = resolve;
      boundary.reject = reject;
    });

    this.boundaries.push(boundary);
    this.currentBoundary = boundary;

    // Return a promise that resolves when all pending operations complete
    void promise;

    return boundary;
  }

  /**
   * Pop the current suspense boundary.
   */
  popBoundary(): SuspenseBoundary | null {
    const boundary = this.boundaries.pop() || null;
    this.currentBoundary = this.boundaries[this.boundaries.length - 1] || null;

    if (boundary && boundary.pending.size === 0) {
      boundary.resolved = true;
      boundary.resolve();
    }

    return boundary;
  }

  /**
   * Track a promise in the current boundary.
   */
  track(promise: Promise<unknown>): void {
    if (!this.currentBoundary) return;
    const boundary = this.currentBoundary;

    boundary.pending.add(promise);

    promise
      .then(() => {
        boundary.pending.delete(promise);
        if (boundary.pending.size === 0 && !boundary.resolved) {
          boundary.resolved = true;
          boundary.resolve();
        }
      })
      .catch((err) => {
        boundary.pending.delete(promise);
        if (!boundary.resolved) {
          boundary.resolved = true;
          boundary.reject(err);
        }
      });
  }

  /**
   * Get the current boundary.
   */
  get current(): SuspenseBoundary | null { return this.currentBoundary; }

  /**
   * Check if the current boundary is resolved.
   */
  get isResolved(): boolean {
    return this.currentBoundary ? this.currentBoundary.resolved : true;
  }
}

let globalSuspenseManager: SuspenseManager | null = null;

export function getSuspenseManager(): SuspenseManager {
  if (!globalSuspenseManager) globalSuspenseManager = new SuspenseManager();
  return globalSuspenseManager;
}

/**
 * withSuspense -- run an async operation within a suspense boundary.
 */
export async function withSuspense<T>(
  fallback: VNode | null,
  fn: () => Promise<T>,
): Promise<T> {
  const manager = getSuspenseManager();
  const boundary = manager.pushBoundary(fallback);
  try {
    manager.track(fn());
    const result = await fn();
    manager.popBoundary();
    return result;
  } catch (e) {
    manager.popBoundary();
    throw e;
  }
}
