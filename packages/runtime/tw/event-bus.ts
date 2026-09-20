/**
 * EventBus -- global pub/sub event system.
 *
 * Features:
 * - Wildcard subscriptions (* matches all events)
 * - Pattern matching (user.* matches user.created, user.deleted)
 * - Priority-based execution
 * - One-time subscriptions
 * - Async event handlers
 * - Error isolation (one handler failure doesn't block others)
 * - Event interception (stop propagation)
 * - Typed events
 * - Event history (for debugging)
 * - Namespaces
 */

// --- Types ------------------------------------------------------------

export type EventHandler<T = unknown> = (data: T, event: EventMeta) => void | Promise<void>;

export interface EventMeta {
  name: string;
  namespace: string;
  timestamp: number;
  propagationStopped: boolean;
  defaultPrevented: boolean;
  priority: number;
}

export interface Subscription {
  unsubscribe: () => void;
}

export interface EventOptions {
  priority?: number;
  once?: boolean;
  namespace?: string;
}

interface Listener {
  handler: EventHandler;
  priority: number;
  once: boolean;
  namespace: string;
}

// --- EventBus Class --------------------------------------------------

class EventBus {
  private listeners = new Map<string, Listener[]>();
  private wildcardListeners: Listener[] = [];
  private history: Array<{ name: string; data: unknown; timestamp: number }> = [];
  private maxHistory = 100;
  private isPublishing = false;

  /**
   * Subscribe to an event.
   */
  on<T = unknown>(event: string, handler: EventHandler<T>, options: EventOptions = {}): Subscription {
    const listener: Listener = {
      handler: handler as EventHandler,
      priority: options.priority ?? 0,
      once: options.once ?? false,
      namespace: options.namespace ?? "default",
    };

    if (event === "*") {
      this.wildcardListeners.push(listener);
      return { unsubscribe: () => this.removeListener(this.wildcardListeners, listener) };
    }

    if (event.includes("*")) {
      // Glob-style pattern subscription (e.g. "user:*", "user.*").
      // The handler receives the concrete event name as its second argument.
      const regex = patternToRegex(event);
      const patternListener: Listener = {
        handler: (((data: unknown, meta: EventMeta) => {
          if (regex.test(meta.name)) {
            (handler as unknown as (data: unknown, name: string) => void)(data, meta.name);
          }
        }) as any) as EventHandler,
        priority: options.priority ?? 0,
        once: options.once ?? false,
        namespace: options.namespace ?? "default",
      };
      this.wildcardListeners.push(patternListener);
      return { unsubscribe: () => this.removeListener(this.wildcardListeners, patternListener) };
    }

    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const list = this.listeners.get(event)!;
    list.push(listener);
    // Sort by priority (higher first)
    list.sort((a, b) => b.priority - a.priority);

    return { unsubscribe: () => this.removeListener(list, listener) };
  }

  /**
   * Subscribe to an event pattern (e.g., "user.*" matches "user.created").
   */
  onPattern<T = unknown>(pattern: string, handler: EventHandler<T>, options: EventOptions = {}): Subscription {
    const regex = patternToRegex(pattern);
    const wrappedHandler: EventHandler<T> = (data, meta) => {
      if (regex.test(meta.name)) {
        handler(data, meta);
      }
    };
    return this.on("*", wrappedHandler, options);
  }

  /**
   * Subscribe to an event once.
   */
  once<T = unknown>(event: string, handler: EventHandler<T>, options?: EventOptions): Subscription {
    return this.on(event, handler, { ...options, once: true });
  }

  /**
   * Publish an event.
   */
  async emit<T = unknown>(event: string, data?: T, options: { namespace?: string } = {}): Promise<void> {
    const meta: EventMeta = {
      name: event,
      namespace: options.namespace ?? "default",
      timestamp: Date.now(),
      propagationStopped: false,
      defaultPrevented: false,
      priority: 0,
    };

    // Record in history
    this.history.push({ name: event, data, timestamp: meta.timestamp });
    if (this.history.length > this.maxHistory) this.history.shift();

    // Get listeners for this event
    const listeners = [
      ...(this.listeners.get(event) || []),
      ...this.wildcardListeners,
    ];

    for (const listener of listeners) {
      if (meta.propagationStopped) break;

      // Remove "once" listeners *before* invoking the handler (not after the
      // loop) -- since this method is async and callers routinely don't
      // await it, a second un-awaited emit() for the same event can run
      // before a deferred cleanup step, firing the listener twice.
      if (listener.once) {
        const list = this.listeners.get(event);
        if (list) this.removeListener(list, listener);
        this.removeListener(this.wildcardListeners, listener);
      }

      try {
        await listener.handler(data, meta);
      } catch (e) {
        console.error(`[TW EventBus] Handler error for '${event}':`, e);
      }
    }
  }

  /**
   * Publish an event synchronously (doesn't await async handlers).
   */
  emitSync<T = unknown>(event: string, data?: T, options: { namespace?: string } = {}): void {
    const meta: EventMeta = {
      name: event,
      namespace: options.namespace ?? "default",
      timestamp: Date.now(),
      propagationStopped: false,
      defaultPrevented: false,
      priority: 0,
    };

    this.history.push({ name: event, data, timestamp: meta.timestamp });
    if (this.history.length > this.maxHistory) this.history.shift();

    const listeners = [
      ...(this.listeners.get(event) || []),
      ...this.wildcardListeners,
    ];

    const toRemove: Listener[] = [];

    for (const listener of listeners) {
      if (meta.propagationStopped) break;
      try {
        const result = listener.handler(data, meta);
        if (result instanceof Promise) {
          result.catch(e => console.error(`[TW EventBus] Async handler error for '${event}':`, e));
        }
      } catch (e) {
        console.error(`[TW EventBus] Handler error for '${event}':`, e);
      }
      if (listener.once) toRemove.push(listener);
    }

    for (const listener of toRemove) {
      const list = this.listeners.get(event);
      if (list) this.removeListener(list, listener);
      this.removeListener(this.wildcardListeners, listener);
    }
  }

  /**
   * Remove all listeners for an event.
   */
  off(event: string): void {
    this.listeners.delete(event);
  }

  /**
   * Remove all listeners.
   */
  offAll(): void {
    this.listeners.clear();
    this.wildcardListeners = [];
  }

  /**
   * Get event history.
   */
  getHistory(): Array<{ name: string; data: unknown; timestamp: number }> {
    return [...this.history];
  }

  /**
   * Get listener count for an event.
   */
  listenerCount(event: string): number {
    return (this.listeners.get(event)?.length || 0) + this.wildcardListeners.length;
  }

  /**
   * Check if an event has listeners.
   */
  hasListeners(event: string): boolean {
    return this.listenerCount(event) > 0;
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.history = [];
  }

  private removeListener(list: Listener[], listener: Listener): void {
    const idx = list.indexOf(listener);
    if (idx >= 0) list.splice(idx, 1);
  }
}

// --- Pattern Matching ------------------------------------------------

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

// --- Global Event Bus ------------------------------------------------

let globalEventBus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!globalEventBus) globalEventBus = new EventBus();
  return globalEventBus;
}

export function on<T = unknown>(event: string, handler: EventHandler<T>, options?: EventOptions): Subscription {
  return getEventBus().on(event, handler, options);
}

export function once<T = unknown>(event: string, handler: EventHandler<T>, options?: EventOptions): Subscription {
  return getEventBus().once(event, handler, options);
}

export function emit<T = unknown>(event: string, data?: T, options?: { namespace?: string }): Promise<void> {
  return getEventBus().emit(event, data, options);
}

export function emitSync<T = unknown>(event: string, data?: T, options?: { namespace?: string }): void {
  getEventBus().emitSync(event, data, options);
}

export function off(event: string): void {
  getEventBus().off(event);
}

export function offAll(): void {
  getEventBus().offAll();
}

export function createEventBus(): EventBus {
  return new EventBus();
}
