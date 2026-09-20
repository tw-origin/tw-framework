/**
 * Error Recovery -- retry mechanisms and fallback rendering.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Configurable max retries
 * - Fallback component rendering
 * - Error boundary chain
 * - Recovery actions (retry, reset, navigate)
 * - Error reporting (to external service)
 * - Error deduplication
 */

import type { VNode } from "./types";

// --- Types ------------------------------------------------------------

export interface ErrorRecoveryOptions {
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  fallback?: VNode | null;
  onError?: (error: Error, context: ErrorContext) => void;
  onRetry?: (attempt: number) => void;
  onMaxRetriesExceeded?: (error: Error) => void;
  reportErrors?: boolean;
  reportUrl?: string;
}

export interface ErrorContext {
  componentId: string;
  componentName: string;
  attempt: number;
  error: Error;
  timestamp: number;
}

export interface RecoveryHandle {
  retry: () => Promise<boolean>;
  reset: () => void;
  isRetrying: boolean;
  attempts: number;
}

// --- Error Recovery Manager ------------------------------------------

interface RecoveryInstance {
  error: Error | null;
  attempts: number;
  isRetrying: boolean;
  options: Required<Omit<ErrorRecoveryOptions, "onError" | "onRetry" | "onMaxRetriesExceeded" | "fallback">> & {
    onError?: (error: Error, context: ErrorContext) => void;
    onRetry?: (attempt: number) => void;
    onMaxRetriesExceeded?: (error: Error) => void;
    fallback?: VNode | null;
  };
  lastErrorTime: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

class ErrorRecoveryManager {
  private instances = new Map<string, RecoveryInstance>();
  private errorLog: Array<{ componentId: string; error: string; timestamp: number }> = [];
  private maxLogSize = 200;
  private seenErrors = new Set<string>();

  /**
   * Register a component for error recovery.
   */
  register(componentId: string, options: ErrorRecoveryOptions = {}): RecoveryHandle {
    const instance: RecoveryInstance = {
      error: null,
      attempts: 0,
      isRetrying: false,
      options: {
        maxRetries: options.maxRetries ?? 3,
        retryDelay: options.retryDelay ?? 1000,
        backoffMultiplier: options.backoffMultiplier ?? 2,
        reportErrors: options.reportErrors ?? false,
        reportUrl: options.reportUrl ?? "",
        onError: options.onError,
        onRetry: options.onRetry,
        onMaxRetriesExceeded: options.onMaxRetriesExceeded,
        fallback: options.fallback ?? null,
      },
      lastErrorTime: 0,
      retryTimer: null,
    };

    this.instances.set(componentId, instance);

    return {
      retry: async () => this.doRetry(componentId),
      reset: () => {
        instance.error = null;
        instance.attempts = 0;
        instance.isRetrying = false;
        if (instance.retryTimer) {
          clearTimeout(instance.retryTimer);
          instance.retryTimer = null;
        }
      },
      get isRetrying() { return instance.isRetrying; },
      get attempts() { return instance.attempts; },
    };
  }

  /**
   * Report an error.
   */
  reportError(componentId: string, componentName: string, error: Error): void {
    const instance = this.instances.get(componentId);
    if (!instance) return;

    instance.error = error;
    instance.lastErrorTime = Date.now();

    // Log error with deduplication
    const errorKey = `${componentId}:${error.message}`;
    if (!this.seenErrors.has(errorKey)) {
      this.seenErrors.add(errorKey);
      this.errorLog.push({ componentId, error: error.message, timestamp: Date.now() });
      if (this.errorLog.length > this.maxLogSize) this.errorLog.shift();
    }

    const ctx: ErrorContext = {
      componentId,
      componentName,
      attempt: instance.attempts,
      error,
      timestamp: Date.now(),
    };

    if (instance.options.onError) {
      try { instance.options.onError(error, ctx); }
      catch (e) { console.error("[TW ErrorRecovery] onError callback failed:", e); }
    }

    if (instance.options.reportErrors && instance.options.reportUrl) {
      this.reportToService(instance.options.reportUrl, error, ctx).catch(() => {});
    }
  }

  /**
   * Attempt to retry after an error.
   */
  async doRetry(componentId: string): Promise<boolean> {
    const instance = this.instances.get(componentId);
    if (!instance || !instance.error) return false;

    if (instance.attempts >= instance.options.maxRetries) {
      if (instance.options.onMaxRetriesExceeded) {
        instance.options.onMaxRetriesExceeded(instance.error);
      }
      return false;
    }

    instance.attempts++;
    instance.isRetrying = true;

    if (instance.options.onRetry) {
      instance.options.onRetry(instance.attempts);
    }

    // Exponential backoff
    const delay = instance.options.retryDelay * Math.pow(instance.options.backoffMultiplier, instance.attempts - 1);

    await new Promise<void>((resolve) => {
      instance.retryTimer = setTimeout(() => {
        instance.retryTimer = null;
        resolve();
      }, delay);
    });

    instance.isRetrying = false;
    instance.error = null;

    return true;
  }

  /**
   * Get error log.
   */
  getErrorLog(): Array<{ componentId: string; error: string; timestamp: number }> {
    return [...this.errorLog];
  }

  /**
   * Clear all errors and cleanup timers.
   */
  clearAll(): void {
    for (const instance of this.instances.values()) {
      if (instance.retryTimer) {
        clearTimeout(instance.retryTimer);
        instance.retryTimer = null;
      }
    }
    this.instances.clear();
    this.errorLog = [];
    this.seenErrors.clear();
  }

  /**
   * Report error to external service.
   */
  private async reportToService(url: string, error: Error, context: ErrorContext): Promise<void> {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: { message: error.message, stack: error.stack },
          context,
        }),
      });
    } catch {
      // Silently fail -- don't let error reporting crash the app
    }
  }
}

// --- Global Manager --------------------------------------------------

let globalErrorRecovery: ErrorRecoveryManager | null = null;

export function getErrorRecovery(): ErrorRecoveryManager {
  if (!globalErrorRecovery) globalErrorRecovery = new ErrorRecoveryManager();
  return globalErrorRecovery;
}

export function withErrorRecovery<T>(
  componentId: string,
  fn: () => Promise<T>,
  options?: ErrorRecoveryOptions,
): Promise<T> {
  const manager = getErrorRecovery();
  const handle = manager.register(componentId, options);

  return fn().catch(async (error: Error) => {
    manager.reportError(componentId, componentId, error);
    const retried = await handle.retry();
    if (retried) {
      return fn();
    }
    throw error;
  });
}

// --- Error Boundary Helper --------------------------------------------

export interface ErrorBoundary {
  hasError: boolean;
  error: Error | null;
  reset: () => void;
  fallback: VNode | null;
  catch: (error: Error) => void;
}

export function createErrorBoundary(
  fallback: VNode | null,
  onError?: (error: Error) => void,
): ErrorBoundary {
  let hasError = false;
  let currentError: Error | null = null;

  return {
    get hasError() { return hasError; },
    get error() { return currentError; },
    get fallback() { return fallback; },
    reset: () => { hasError = false; currentError = null; },
    catch: (error: Error) => {
      hasError = true;
      currentError = error;
      if (onError) onError(error);
    },
  };
}
