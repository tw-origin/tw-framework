/**
 * Plugin hooks system -- lifecycle hooks, event hooks, middleware hooks.
 * @module plugins/hooks
 */

export type HookName = string;
export type HookHandler<T = unknown> = (context: T, next?: () => void) => T | void | Promise<T | void>;

export interface HookEntry<T = unknown> {
  name: string;
  handler: HookHandler<T>;
  priority: number;
  once: boolean;
  called: boolean;
}

export interface HookContext<T = unknown> {
  name: string;
  data: T;
  shared: Record<string, unknown>;
  aborted: boolean;
  error: Error | null;
}

export class HookSystem {
  private hooks: Map<HookName, HookEntry[]> = new Map();
  private waterfalls: Map<HookName, HookEntry[]> = new Map();
  private bailHooks: Map<HookName, HookEntry[]> = new Map();
  private seriesHooks: Map<HookName, HookEntry[]> = new Map();
  private parallelHooks: Map<HookName, HookEntry[]> = new Map();
  private stats = { totalCalls: 0, totalHandlers: 0, totalErrors: 0, totalAborts: 0 };

  tap<T>(name: HookName, handler: HookHandler<T>, options: { priority?: number; once?: boolean } = {}): () => void {
    return this.addHook(this.hooks, name, handler, options);
  }

  tapWaterfall<T>(name: HookName, handler: (value: T, previous: T) => T | Promise<T>, options: { priority?: number; once?: boolean } = {}): () => void {
    return this.addHook(this.waterfalls, name, handler as HookHandler<T>, options);
  }

  tapBail<T>(name: HookName, handler: HookHandler<T>, options: { priority?: number; once?: boolean } = {}): () => void {
    return this.addHook(this.bailHooks, name, handler, options);
  }

  tapSeries<T>(name: HookName, handler: HookHandler<T>, options: { priority?: number; once?: boolean } = {}): () => void {
    return this.addHook(this.seriesHooks, name, handler, options);
  }

  tapParallel<T>(name: HookName, handler: HookHandler<T>, options: { priority?: number; once?: boolean } = {}): () => void {
    return this.addHook(this.parallelHooks, name, handler, options);
  }

  private addHook<T>(map: Map<HookName, HookEntry[]>, name: HookName, handler: HookHandler<T>, options: { priority?: number; once?: boolean }): () => void {
    const entry: HookEntry = {
      name,
      handler: handler as HookHandler,
      priority: options.priority ?? 0,
      once: options.once ?? false,
      called: false,
    };
    if (!map.has(name)) {
      map.set(name, []);
    }
    map.get(name)!.push(entry);
    map.get(name)!.sort((a, b) => b.priority - a.priority);
    this.stats.totalHandlers++;
    return () => {
      const entries = map.get(name);
      if (entries) {
        const index = entries.indexOf(entry);
        if (index !== -1) {
          entries.splice(index, 1);
          this.stats.totalHandlers--;
        }
        if (entries.length === 0) {
          map.delete(name);
        }
      }
    };
  }

  async call<T>(name: HookName, data: T): Promise<T> {
    this.stats.totalCalls++;
    const handlers = this.hooks.get(name) ?? [];
    const context: HookContext<T> = { name, data, shared: {}, aborted: false, error: null };
    for (const entry of handlers) {
      if (entry.once && entry.called) continue;
      entry.called = true;
      try {
        await entry.handler(context.data);
      } catch (error) {
        this.stats.totalErrors++;
        context.error = error as Error;
        console.error(`Hook "${name}" error:`, error);
      }
      if (context.aborted) {
        this.stats.totalAborts++;
        break;
      }
    }
    return context.data;
  }

  async callWaterfall<T>(name: HookName, initial: T): Promise<T> {
    this.stats.totalCalls++;
    const handlers = this.waterfalls.get(name) ?? [];
    let value = initial;
    for (const entry of handlers) {
      if (entry.once && entry.called) continue;
      entry.called = true;
      try {
        const result = await (entry.handler as any)(value, value);
        if (result !== undefined) {
          value = result as T;
        }
      } catch (error) {
        this.stats.totalErrors++;
        console.error(`Waterfall hook "${name}" error:`, error);
      }
    }
    return value;
  }

  async callBail<T>(name: HookName, data: T): Promise<T | undefined> {
    this.stats.totalCalls++;
    const handlers = this.bailHooks.get(name) ?? [];
    for (const entry of handlers) {
      if (entry.once && entry.called) continue;
      entry.called = true;
      try {
        const result = await entry.handler(data);
        if (result !== undefined) {
          return result as T;
        }
      } catch (error) {
        this.stats.totalErrors++;
        console.error(`Bail hook "${name}" error:`, error);
        return undefined;
      }
    }
    return undefined;
  }

  async callSeries<T>(name: HookName, data: T): Promise<void> {
    this.stats.totalCalls++;
    const handlers = this.seriesHooks.get(name) ?? [];
    for (const entry of handlers) {
      if (entry.once && entry.called) continue;
      entry.called = true;
      try {
        await entry.handler(data);
      } catch (error) {
        this.stats.totalErrors++;
        console.error(`Series hook "${name}" error:`, error);
      }
    }
  }

  async callParallel<T>(name: HookName, data: T): Promise<void> {
    this.stats.totalCalls++;
    const handlers = this.parallelHooks.get(name) ?? [];
    const promises = handlers.filter((entry) => !(entry.once && entry.called)).map((entry) => {
      entry.called = true;
      return (entry.handler(data) as Promise<unknown>).catch((error) => {
        this.stats.totalErrors++;
        console.error(`Parallel hook "${name}" error:`, error);
      });
    });
    await Promise.all(promises);
  }

  hasHook(name: HookName): boolean {
    return this.hooks.has(name) || this.waterfalls.has(name) || this.bailHooks.has(name) || this.seriesHooks.has(name) || this.parallelHooks.has(name);
  }

  getHookNames(): HookName[] {
    return [...new Set([...this.hooks.keys(), ...this.waterfalls.keys(), ...this.bailHooks.keys(), ...this.seriesHooks.keys(), ...this.parallelHooks.keys()])];
  }

  getHandlerCount(name: HookName): number {
    return (this.hooks.get(name)?.length ?? 0) + (this.waterfalls.get(name)?.length ?? 0) + (this.bailHooks.get(name)?.length ?? 0) + (this.seriesHooks.get(name)?.length ?? 0) + (this.parallelHooks.get(name)?.length ?? 0);
  }

  getTotalHandlerCount(): number {
    return this.stats.totalHandlers;
  }

  removeHook(name: HookName): void {
    this.hooks.delete(name);
    this.waterfalls.delete(name);
    this.bailHooks.delete(name);
    this.seriesHooks.delete(name);
    this.parallelHooks.delete(name);
  }

  clear(): void {
    this.hooks.clear();
    this.waterfalls.clear();
    this.bailHooks.clear();
    this.seriesHooks.clear();
    this.parallelHooks.clear();
    this.stats = { totalCalls: 0, totalHandlers: 0, totalErrors: 0, totalAborts: 0 };
  }

  getStats(): { totalCalls: number; totalHandlers: number; totalErrors: number; totalAborts: number; hookCount: number } {
    return {
      ...this.stats,
      hookCount: this.getHookNames().length,
    };
  }

  resetStats(): void {
    this.stats = { totalCalls: 0, totalHandlers: this.stats.totalHandlers, totalErrors: 0, totalAborts: 0 };
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createHookSystem(): HookSystem {
  return new HookSystem();
}

export class LifecycleHooks {
  private system: HookSystem;

  constructor(system?: HookSystem) {
    this.system = system ?? new HookSystem();
  }

  onBeforeMount(handler: HookHandler<unknown>): () => void {
    return this.system.tap("beforeMount", handler);
  }

  onMounted(handler: HookHandler<unknown>): () => void {
    return this.system.tap("mounted", handler);
  }

  onBeforeUpdate(handler: HookHandler<unknown>): () => void {
    return this.system.tap("beforeUpdate", handler);
  }

  onUpdated(handler: HookHandler<unknown>): () => void {
    return this.system.tap("updated", handler);
  }

  onBeforeUnmount(handler: HookHandler<unknown>): () => void {
    return this.system.tap("beforeUnmount", handler);
  }

  onUnmounted(handler: HookHandler<unknown>): () => void {
    return this.system.tap("unmounted", handler);
  }

  onBeforeCreate(handler: HookHandler<unknown>): () => void {
    return this.system.tap("beforeCreate", handler);
  }

  onCreated(handler: HookHandler<unknown>): () => void {
    return this.system.tap("created", handler);
  }

  onActivated(handler: HookHandler<unknown>): () => void {
    return this.system.tap("activated", handler);
  }

  onDeactivated(handler: HookHandler<unknown>): () => void {
    return this.system.tap("deactivated", handler);
  }

  onErrorCaptured(handler: HookHandler<{ error: Error; instance: any }>): () => void {
    return this.system.tap("errorCaptured", handler);
  }

  onRenderTracked(handler: HookHandler<unknown>): () => void {
    return this.system.tap("renderTracked", handler);
  }

  onRenderTriggered(handler: HookHandler<unknown>): () => void {
    return this.system.tap("renderTriggered", handler);
  }

  onBeforeRouteEnter(handler: HookHandler<unknown>): () => void {
    return this.system.tap("beforeRouteEnter", handler);
  }

  onBeforeRouteLeave(handler: HookHandler<unknown>): () => void {
    return this.system.tap("beforeRouteLeave", handler);
  }

  onBeforeRouteUpdate(handler: HookHandler<unknown>): () => void {
    return this.system.tap("beforeRouteUpdate", handler);
  }

  async callBeforeMount(data?: any): Promise<void> {
    await this.system.call("beforeMount", data);
  }

  async callMounted(data?: any): Promise<void> {
    await this.system.call("mounted", data);
  }

  async callBeforeUpdate(data?: any): Promise<void> {
    await this.system.call("beforeUpdate", data);
  }

  async callUpdated(data?: any): Promise<void> {
    await this.system.call("updated", data);
  }

  async callBeforeUnmount(data?: any): Promise<void> {
    await this.system.call("beforeUnmount", data);
  }

  async callUnmounted(data?: any): Promise<void> {
    await this.system.call("unmounted", data);
  }

  async callBeforeCreate(data?: any): Promise<void> {
    await this.system.call("beforeCreate", data);
  }

  async callCreated(data?: any): Promise<void> {
    await this.system.call("created", data);
  }

  async callActivated(data?: any): Promise<void> {
    await this.system.call("activated", data);
  }

  async callDeactivated(data?: any): Promise<void> {
    await this.system.call("deactivated", data);
  }

  async callErrorCaptured(data: { error: Error; instance: any }): Promise<void> {
    await this.system.call("errorCaptured", data);
  }

  async callRenderTracked(data?: any): Promise<void> {
    await this.system.call("renderTracked", data);
  }

  async callRenderTriggered(data?: any): Promise<void> {
    await this.system.call("renderTriggered", data);
  }

  async callBeforeRouteEnter(data?: any): Promise<void> {
    await this.system.call("beforeRouteEnter", data);
  }

  async callBeforeRouteLeave(data?: any): Promise<void> {
    await this.system.call("beforeRouteLeave", data);
  }

  async callBeforeRouteUpdate(data?: any): Promise<void> {
    await this.system.call("beforeRouteUpdate", data);
  }

  getSystem(): HookSystem {
    return this.system;
  }

  getStats(): ReturnType<HookSystem["getStats"]> {
    return this.system.getStats();
  }

  clear(): void {
    this.system.clear();
  }
}

export function createLifecycleHooks(system?: HookSystem): LifecycleHooks {
  return new LifecycleHooks(system);
}

export class EventSystem {
  private events: Map<string, HookEntry[]> = new Map();
  private system: HookSystem;

  constructor(system?: HookSystem) {
    this.system = system ?? new HookSystem();
  }

  on(event: string, handler: HookHandler<unknown>): () => void {
    return this.system.tap(`event:${event}`, handler);
  }

  once(event: string, handler: HookHandler<unknown>): () => void {
    return this.system.tap(`event:${event}`, handler, { once: true });
  }

  async emit(event: string, data?: any): Promise<void> {
    await this.system.call(`event:${event}`, data);
  }

  async emitWaterfall<T>(event: string, initial: T): Promise<T> {
    return this.system.callWaterfall(`event:${event}`, initial);
  }

  off(event: string, handler?: HookHandler<unknown>): void {
    this.system.removeHook(`event:${event}`);
  }

  hasEvent(event: string): boolean {
    return this.system.hasHook(`event:${event}`);
  }

  getEventNames(): string[] {
    return this.system.getHookNames()
      .filter((name) => name.startsWith("event:"))
      .map((name) => name.slice(6));
  }

  getListenerCount(event: string): number {
    return this.system.getHandlerCount(`event:${event}`);
  }

  clear(): void {
    for (const event of this.getEventNames()) {
      this.system.removeHook(`event:${event}`);
    }
  }

  getStats(): ReturnType<HookSystem["getStats"]> {
    return this.system.getStats();
  }
}

export function createEventSystem(system?: HookSystem): EventSystem {
  return new EventSystem(system);
}

export class MiddlewareSystem {
  private system: HookSystem;

  constructor(system?: HookSystem) {
    this.system = system ?? new HookSystem();
  }

  use(name: string, handler: HookHandler<unknown>, options?: { priority?: number; once?: boolean }): () => void {
    return this.system.tap(`middleware:${name}`, handler, options);
  }

  useWaterfall(name: string, handler: (value: any, previous: any) => unknown | Promise<unknown>, options?: { priority?: number; once?: boolean }): () => void {
    return this.system.tapWaterfall(`middleware:${name}`, handler, options);
  }

  useBefore(name: string, handler: HookHandler<unknown>): () => void {
    return this.system.tap(`middleware:before:${name}`, handler, { priority: 10 });
  }

  useAfter(name: string, handler: HookHandler<unknown>): () => void {
    return this.system.tap(`middleware:after:${name}`, handler, { priority: -10 });
  }

  useBail(name: string, handler: HookHandler<unknown>): () => void {
    return this.system.tapBail(`middleware:${name}`, handler);
  }

  async run(name: string, data?: any): Promise<void> {
    await this.system.call(`middleware:before:${name}`, data);
    await this.system.call(`middleware:${name}`, data);
    await this.system.call(`middleware:after:${name}`, data);
  }

  async runWaterfall<T>(name: string, initial: T): Promise<T> {
    let value = initial;
    value = await this.system.callWaterfall(`middleware:before:${name}`, value);
    value = await this.system.callWaterfall(`middleware:${name}`, value);
    value = await this.system.callWaterfall(`middleware:after:${name}`, value);
    return value;
  }

  async runBail<T>(name: string, data: T): Promise<T | undefined> {
    return this.system.callBail(`middleware:${name}`, data);
  }

  hasMiddleware(name: string): boolean {
    return this.system.hasHook(`middleware:${name}`);
  }

  getMiddlewareNames(): string[] {
    return this.system.getHookNames()
      .filter((name) => name.startsWith("middleware:"))
      .map((name) => name.slice(11))
      .filter((name, index, arr) => arr.indexOf(name) === index);
  }

  getMiddlewareCount(name: string): number {
    return this.system.getHandlerCount(`middleware:${name}`);
  }

  remove(name: string): void {
    this.system.removeHook(`middleware:before:${name}`);
    this.system.removeHook(`middleware:${name}`);
    this.system.removeHook(`middleware:after:${name}`);
  }

  clear(): void {
    for (const name of this.getMiddlewareNames()) {
      this.remove(name);
    }
  }

  getStats(): ReturnType<HookSystem["getStats"]> {
    return this.system.getStats();
  }
}

export function createMiddlewareSystem(system?: HookSystem): MiddlewareSystem {
  return new MiddlewareSystem(system);
}

export class HookMiddleware {
  private hooks: HookSystem;
  private lifecycle: LifecycleHooks;
  private events: EventSystem;
  private middleware: MiddlewareSystem;

  constructor() {
    this.hooks = new HookSystem();
    this.lifecycle = new LifecycleHooks(this.hooks);
    this.events = new EventSystem(this.hooks);
    this.middleware = new MiddlewareSystem(this.hooks);
  }

  getHooks(): HookSystem {
    return this.hooks;
  }

  getLifecycle(): LifecycleHooks {
    return this.lifecycle;
  }

  getEvents(): EventSystem {
    return this.events;
  }

  getMiddleware(): MiddlewareSystem {
    return this.middleware;
  }

  getStats(): ReturnType<HookSystem["getStats"]> {
    return this.hooks.getStats();
  }

  clear(): void {
    this.hooks.clear();
  }

  resetStats(): void {
    this.hooks.resetStats();
  }
}

export function createHookMiddleware(): HookMiddleware {
  return new HookMiddleware();
}
