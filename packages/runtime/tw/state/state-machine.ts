/**
 * Finite state machine -- typed state transitions with guards and actions.
 * @module runtime/state
 */

export type State = string;
export type Event = string;

export interface Transition<S extends State, E extends Event> {
  from: S;
  to: S;
  event: E;
  guard?: (context: unknown) => boolean;
  action?: (context: unknown, event: E) => void;
}

export interface StateMachineConfig<S extends State, E extends Event> {
  initial: S;
  states: Record<S, { on?: Partial<Record<E, S | { target: S; guard?: (context: unknown) => boolean; action?: (context: unknown, event: E) => void }>>; entry?: (context: unknown) => void; exit?: (context: unknown) => void }>;
  context?: unknown;
}

export interface StateMachineOptions {
  strict?: boolean;
  log?: boolean;
}

export class StateMachine<S extends State = string, E extends Event = string> {
  private current: S;
  private states: StateMachineConfig<S, E>["states"];
  private context: unknown;
  private options: StateMachineOptions;
  private history: Array<{ state: S; event?: E; timestamp: number }> = [];
  private listeners: Set<(state: S, event: E | undefined) => void> = new Set();
  private transitionCount: number = 0;

  constructor(config: StateMachineConfig<S, E>, options: StateMachineOptions = {}) {
    this.current = config.initial;
    this.states = config.states;
    this.context = config.context ?? {};
    this.options = { strict: options.strict ?? false, log: options.log ?? false };
    this.history.push({ state: this.current, timestamp: Date.now() });
    this.executeEntryActions(this.current);
  }

  canTransition(event: E): boolean {
    const state = this.states[this.current];
    if (!state?.on) return false;
    const transition = state.on[event];
    if (transition === undefined) return false;
    const target = typeof transition === "string" ? transition : transition.target;
    const guard = typeof transition === "string" ? undefined : transition.guard;
    if (guard && !guard(this.context)) return false;
    return this.states[target as S] !== undefined;
  }

  send(event: E): boolean {
    const state = this.states[this.current];
    if (!state?.on) {
      if (this.options.strict) throw new Error(`No transitions from state "${this.current}"`);
      return false;
    }
    const transition = state.on[event];
    if (transition === undefined) {
      if (this.options.strict) throw new Error(`No transition for event "${event}" from state "${this.current}"`);
      return false;
    }
    const target = typeof transition === "string" ? transition : transition.target;
    const guard = typeof transition === "string" ? undefined : transition.guard;
    const action = typeof transition === "string" ? undefined : transition.action;
    if (guard && !guard(this.context)) {
      if (this.options.strict) throw new Error(`Guard failed for event "${event}" from state "${this.current}"`);
      return false;
    }
    this.executeExitActions(this.current);
    if (action) action(this.context, event);
    this.current = target as S;
    this.transitionCount++;
    this.history.push({ state: this.current, event, timestamp: Date.now() });
    this.executeEntryActions(this.current);
    this.notifyListeners(event);
    if (this.options.log) {
      console.log(`Transition: ${event} -> ${target}`);
    }
    return true;
  }

  private executeEntryActions(state: S): void {
    const stateConfig = this.states[state];
    if (stateConfig?.entry) {
      stateConfig.entry(this.context);
    }
  }

  private executeExitActions(state: S): void {
    const stateConfig = this.states[state];
    if (stateConfig?.exit) {
      stateConfig.exit(this.context);
    }
  }

  private notifyListeners(event: E): void {
    this.listeners.forEach((listener) => listener(this.current, event));
  }

  getState(): S {
    return this.current;
  }

  getContext(): unknown {
    return this.context;
  }

  setContext(context: unknown): void {
    this.context = context;
  }

  getHistory(): Array<{ state: S; event?: E; timestamp: number }> {
    return [...this.history];
  }

  getTransitionCount(): number {
    return this.transitionCount;
  }

  onTransition(listener: (state: S, event: E | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  is(state: S): boolean {
    return this.current === state;
  }

  matches(states: S[]): boolean {
    return states.includes(this.current);
  }

  getAvailableEvents(): E[] {
    const state = this.states[this.current];
    if (!state?.on) return [];
    return Object.keys(state.on) as E[];
  }

  getStates(): S[] {
    return Object.keys(this.states) as S[];
  }

  getStateConfig(state: S): { on?: Partial<Record<E, S | { target: S; guard?: (context: unknown) => boolean; action?: (context: unknown, event: E) => void }>>; entry?: (context: unknown) => void; exit?: (context: unknown) => void } | undefined {
    return this.states[state];
  }

  hasState(state: S): boolean {
    return state in this.states;
  }

  reset(): void {
    this.current = Object.keys(this.states)[0] as S;
    this.history = [{ state: this.current, timestamp: Date.now() }];
    this.transitionCount = 0;
    this.listeners.clear();
  }

  toJSON(): string {
    return JSON.stringify({
      current: this.current,
      history: this.history,
      transitionCount: this.transitionCount,
      states: Object.keys(this.states),
      availableEvents: this.getAvailableEvents(),
    }, null, 2);
  }
}

export function createStateMachine<S extends State, E extends Event>(config: StateMachineConfig<S, E>, options?: StateMachineOptions): StateMachine<S, E> {
  return new StateMachine(config, options);
}

export class MiddlewareManager<T> {
  private middlewares: Array<(context: T, next: (ctx: T) => Promise<void>) => Promise<void>> = [];
  private errorHandlers: Array<(error: Error, context: T) => void> = [];

  use(middleware: (context: T, next: (ctx: T) => Promise<void>) => Promise<void>): this {
    this.middlewares.push(middleware);
    return this;
  }

  onError(handler: (error: Error, context: T) => void): this {
    this.errorHandlers.push(handler);
    return this;
  }

  async execute(context: T): Promise<void> {
    const middlewares = [...this.middlewares];
    const execute = async (ctx: T, index: number): Promise<void> => {
      if (index >= middlewares.length) return;
      await middlewares[index](ctx, (c) => execute(c, index + 1));
    };
    try {
      await execute(context, 0);
    } catch (error) {
      for (const handler of this.errorHandlers) {
        handler(error as Error, context);
      }
      throw error;
    }
  }

  remove(middleware: (context: T, next: (ctx: T) => Promise<void>) => Promise<void>): this {
    const index = this.middlewares.indexOf(middleware);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
    }
    return this;
  }

  clear(): this {
    this.middlewares = [];
    return this;
  }

  size(): number {
    return this.middlewares.length;
  }

  hasMiddlewares(): boolean {
    return this.middlewares.length > 0;
  }

  getMiddlewares(): Array<(context: T, next: (ctx: T) => Promise<void>) => Promise<void>> {
    return [...this.middlewares];
  }
}

export function createMiddlewareManager<T>(): MiddlewareManager<T> {
  return new MiddlewareManager<T>();
}

export class PluginManager<T> {
  private plugins: Map<string, { name: string; install: (app: T) => void; uninstall?: (app: T) => void; version?: string }> = new Map();
  private app: T;
  private installed: Set<string> = new Set();

  constructor(app: T) {
    this.app = app;
  }

  register(name: string, plugin: { name?: string; install: (app: T) => void; uninstall?: (app: T) => void; version?: string }): this {
    this.plugins.set(name, { name: plugin.name ?? name, install: plugin.install, uninstall: plugin.uninstall, version: plugin.version });
    return this;
  }

  unregister(name: string): this {
    this.uninstall(name);
    this.plugins.delete(name);
    return this;
  }

  install(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin || this.installed.has(name)) return false;
    try {
      plugin.install(this.app);
      this.installed.add(name);
      return true;
    } catch (error) {
      console.error(`Failed to install plugin "${name}":`, error);
      return false;
    }
  }

  installAll(): void {
    for (const name of this.plugins.keys()) {
      this.install(name);
    }
  }

  uninstall(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin || !this.installed.has(name)) return false;
    try {
      plugin.uninstall?.(this.app);
      this.installed.delete(name);
      return true;
    } catch (error) {
      console.error(`Failed to uninstall plugin "${name}":`, error);
      return false;
    }
  }

  uninstallAll(): void {
    for (const name of [...this.installed]) {
      this.uninstall(name);
    }
  }

  isInstalled(name: string): boolean {
    return this.installed.has(name);
  }

  isRegistered(name: string): boolean {
    return this.plugins.has(name);
  }

  getPlugin(name: string): { name: string; version?: string } | undefined {
    const plugin = this.plugins.get(name);
    return plugin ? { name: plugin.name, version: plugin.version } : undefined;
  }

  getPlugins(): Array<{ name: string; version?: string }> {
    return [...this.plugins.values()].map((p) => ({ name: p.name, version: p.version }));
  }

  getInstalledPlugins(): string[] {
    return [...this.installed];
  }

  getRegisteredPlugins(): string[] {
    return [...this.plugins.keys()];
  }

  clear(): void {
    this.uninstallAll();
    this.plugins.clear();
  }

  size(): number {
    return this.plugins.size;
  }

  installedCount(): number {
    return this.installed.size;
  }
}

export function createPluginManager<T>(app: T): PluginManager<T> {
  return new PluginManager(app);
}

export class ErrorBoundary {
  private handlers: Set<(error: Error, info?: unknown) => void> = new Set();
  private fallbackRender: ((error: Error, reset: () => void) => unknown) | null = null;
  private onError: ((error: Error, info?: unknown) => void) | null = null;
  private hasError: boolean = false;
  private lastError: Error | null = null;
  private errorCount: number = 0;
  private maxErrors: number = 10;

  constructor(options: { fallbackRender?: (error: Error, reset: () => void) => unknown; onError?: (error: Error, info?: unknown) => void; maxErrors?: number } = {}) {
    this.fallbackRender = options.fallbackRender ?? null;
    this.onError = options.onError ?? null;
    this.maxErrors = options.maxErrors ?? 10;
  }

  catch(error: Error, info?: unknown): void {
    this.hasError = true;
    this.lastError = error;
    this.errorCount++;
    if (this.errorCount <= this.maxErrors) {
      this.onError?.(error, info);
      this.handlers.forEach((handler) => handler(error, info));
    }
  }

  catchSync<T>(fn: () => T, info?: unknown): T | undefined {
    try {
      return fn();
    } catch (error) {
      this.catch(error as Error, info);
      return undefined;
    }
  }

  async catchAsync<T>(fn: () => Promise<T>, info?: unknown): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      this.catch(error as Error, info);
      return undefined;
    }
  }

  render(): unknown {
    if (this.hasError && this.lastError && this.fallbackRender) {
      return this.fallbackRender(this.lastError, () => this.reset());
    }
    return null;
  }

  reset(): void {
    this.hasError = false;
    this.lastError = null;
  }

  hasErrorCheck(): boolean {
    return this.hasError;
  }

  getLastError(): Error | null {
    return this.lastError;
  }

  getErrorCount(): number {
    return this.errorCount;
  }

  on(handler: (error: Error, info?: unknown) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  setFallbackRender(fn: (error: Error, reset: () => void) => unknown): void {
    this.fallbackRender = fn;
  }

  setOnError(fn: (error: Error, info?: unknown) => void): void {
    this.onError = fn;
  }

  setMaxErrors(max: number): void {
    this.maxErrors = max;
  }

  getMaxErrors(): number {
    return this.maxErrors;
  }

  clear(): void {
    this.hasError = false;
    this.lastError = null;
    this.errorCount = 0;
    this.handlers.clear();
  }
}

export function createErrorBoundary(options?: { fallbackRender?: (error: Error, reset: () => void) => unknown; onError?: (error: Error, info?: unknown) => void; maxErrors?: number }): ErrorBoundary {
  return new ErrorBoundary(options);
}

export class AsyncQueue<T> {
  private queue: T[] = [];
  private waiters: Array<(value: T) => void> = [];
  private closed: boolean = false;
  private maxSize: number;

  constructor(maxSize: number = Infinity) {
    this.maxSize = maxSize;
  }

  enqueue(value: T): boolean {
    if (this.closed) return false;
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter(value);
    } else if (this.queue.length < this.maxSize) {
      this.queue.push(value);
    } else {
      return false;
    }
    return true;
  }

  dequeue(): Promise<T> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!);
    }
    if (this.closed) {
      return Promise.reject(new Error("Queue is closed"));
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  tryDequeue(): T | undefined {
    return this.queue.shift();
  }

  size(): number {
    return this.queue.length;
  }

  waiterCount(): number {
    return this.waiters.length;
  }

  isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters) {
      waiter(undefined as T);
    }
    this.waiters = [];
  }

  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  clear(): void {
    this.queue = [];
  }

  peek(): T | undefined {
    return this.queue[0];
  }

  peekLast(): T | undefined {
    return this.queue[this.queue.length - 1];
  }

  toArray(): T[] {
    return [...this.queue];
  }

  getMaxSize(): number {
    return this.maxSize;
  }

  setMaxSize(max: number): void {
    this.maxSize = max;
  }
}

export function createAsyncQueue<T>(maxSize?: number): AsyncQueue<T> {
  return new AsyncQueue<T>(maxSize);
}

export class Channel<T> {
  private buffer: T[] = [];
  private sendWaiters: Array<() => void> = [];
  private receiveWaiters: Array<{ resolve: (value: T) => void; reject: (error: Error) => void }> = [];
  private closed: boolean = false;
  private capacity: number;

  constructor(capacity: number = 0) {
    this.capacity = capacity;
  }

  send(value: T): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("Channel is closed"));
    }
    if (this.receiveWaiters.length > 0) {
      const waiter = this.receiveWaiters.shift()!;
      waiter.resolve(value);
      return Promise.resolve();
    }
    if (this.buffer.length < this.capacity) {
      this.buffer.push(value);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.sendWaiters.push(() => resolve());
      this.buffer.push(value);
    });
  }

  receive(): Promise<T> {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift()!;
      if (this.sendWaiters.length > 0) {
        const waiter = this.sendWaiters.shift()!;
        waiter();
      }
      return Promise.resolve(value);
    }
    if (this.closed) {
      return Promise.reject(new Error("Channel is closed"));
    }
    return new Promise((resolve, reject) => {
      this.receiveWaiters.push({ resolve, reject });
    });
  }

  trySend(value: T): boolean {
    if (this.closed) return false;
    if (this.receiveWaiters.length > 0) {
      const waiter = this.receiveWaiters.shift()!;
      waiter.resolve(value);
      return true;
    }
    if (this.buffer.length < this.capacity) {
      this.buffer.push(value);
      return true;
    }
    return false;
  }

  tryReceive(): T | undefined {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift()!;
      if (this.sendWaiters.length > 0) {
        const waiter = this.sendWaiters.shift()!;
        waiter();
      }
      return value;
    }
    return undefined;
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.receiveWaiters) {
      waiter.reject(new Error("Channel is closed"));
    }
    this.receiveWaiters = [];
    for (const waiter of this.sendWaiters) {
      waiter();
    }
    this.sendWaiters = [];
  }

  isClosed(): boolean {
    return this.closed;
  }

  getCapacity(): number {
    return this.capacity;
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  hasSendWaiters(): boolean {
    return this.sendWaiters.length > 0;
  }

  hasReceiveWaiters(): boolean {
    return this.receiveWaiters.length > 0;
  }

  getSendWaiterCount(): number {
    return this.sendWaiters.length;
  }

  getReceiveWaiterCount(): number {
    return this.receiveWaiters.length;
  }

  isBufferFull(): boolean {
    return this.buffer.length >= this.capacity;
  }

  isBufferEmpty(): boolean {
    return this.buffer.length === 0;
  }

  clear(): void {
    this.buffer = [];
  }
}

export function createChannel<T>(capacity?: number): Channel<T> {
  return new Channel<T>(capacity);
}

export class Semaphore {
  private permits: number;
  private maxPermits: number;
  private waiters: Array<() => void> = [];

  constructor(permits: number = 1) {
    this.permits = permits;
    this.maxPermits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    if (this.permits < this.maxPermits) {
      if (this.waiters.length > 0) {
        const waiter = this.waiters.shift()!;
        waiter();
      } else {
        this.permits++;
      }
    }
  }

  tryAcquire(): boolean {
    if (this.permits > 0) {
      this.permits--;
      return true;
    }
    return false;
  }

  getPermits(): number {
    return this.permits;
  }

  getMaxPermits(): number {
    return this.maxPermits;
  }

  getWaiterCount(): number {
    return this.waiters.length;
  }

  hasWaiters(): boolean {
    return this.waiters.length > 0;
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  reset(): void {
    this.permits = this.maxPermits;
    for (const waiter of this.waiters) {
      waiter();
    }
    this.waiters = [];
  }
}

export function createSemaphore(permits?: number): Semaphore {
  return new Semaphore(permits);
}

export class Mutex {
  private semaphore: Semaphore;
  private locked: boolean = false;
  private lockHolder: string | null = null;

  constructor() {
    this.semaphore = new Semaphore(1);
  }

  async acquire(holder?: string): Promise<void> {
    await this.semaphore.acquire();
    this.locked = true;
    this.lockHolder = holder ?? null;
  }

  release(): void {
    this.semaphore.release();
    this.locked = false;
    this.lockHolder = null;
  }

  tryAcquire(holder?: string): boolean {
    if (this.semaphore.tryAcquire()) {
      this.locked = true;
      this.lockHolder = holder ?? null;
      return true;
    }
    return false;
  }

  isLocked(): boolean {
    return this.locked;
  }

  getLockHolder(): string | null {
    return this.lockHolder;
  }

  async withLock<T>(fn: () => Promise<T>, holder?: string): Promise<T> {
    await this.acquire(holder);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export function createMutex(): Mutex {
  return new Mutex();
}

export class ReadWriteLock {
  private readers: number = 0;
  private writers: number = 0;
  private writeWaiters: Array<() => void> = [];
  private readWaiters: Array<() => void> = [];

  async acquireRead(): Promise<void> {
    if (this.writers === 0) {
      this.readers++;
      return;
    }
    return new Promise((resolve) => {
      this.readWaiters.push(() => {
        this.readers++;
        resolve();
      });
    });
  }

  releaseRead(): void {
    this.readers--;
    if (this.readers === 0 && this.writeWaiters.length > 0) {
      const waiter = this.writeWaiters.shift()!;
      waiter();
    }
  }

  async acquireWrite(): Promise<void> {
    if (this.readers === 0 && this.writers === 0) {
      this.writers++;
      return;
    }
    return new Promise((resolve) => {
      this.writeWaiters.push(() => {
        this.writers++;
        resolve();
      });
    });
  }

  releaseWrite(): void {
    this.writers--;
    if (this.writeWaiters.length > 0) {
      const waiter = this.writeWaiters.shift()!;
      waiter();
    } else {
      for (const waiter of this.readWaiters) {
        waiter();
      }
      this.readWaiters = [];
    }
  }

  tryAcquireRead(): boolean {
    if (this.writers === 0) {
      this.readers++;
      return true;
    }
    return false;
  }

  tryAcquireWrite(): boolean {
    if (this.readers === 0 && this.writers === 0) {
      this.writers++;
      return true;
    }
    return false;
  }

  getReaderCount(): number {
    return this.readers;
  }

  getWriterCount(): number {
    return this.writers;
  }

  getWriteWaiterCount(): number {
    return this.writeWaiters.length;
  }

  getReadWaiterCount(): number {
    return this.readWaiters.length;
  }

  async withReadLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireRead();
    try {
      return await fn();
    } finally {
      this.releaseRead();
    }
  }

  async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireWrite();
    try {
      return await fn();
    } finally {
      this.releaseWrite();
    }
  }
}

export function createReadWriteLock(): ReadWriteLock {
  return new ReadWriteLock();
}

export class Lazy<T> {
  private value: T | undefined;
  private initialized: boolean = false;
  private factory: () => T;

  constructor(factory: () => T) {
    this.factory = factory;
  }

  get(): T {
    if (!this.initialized) {
      this.value = this.factory();
      this.initialized = true;
    }
    return this.value as T;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.value = undefined;
    this.initialized = false;
  }

  map<R>(mapper: (value: T) => R): Lazy<R> {
    return new Lazy(() => mapper(this.get()));
  }
}

export function createLazy<T>(factory: () => T): Lazy<T> {
  return new Lazy(factory);
}

export class Deferred<T> {
  public promise: Promise<T>;
  public resolve!: (value: T | PromiseLike<T>) => void;
  public reject!: (reason?: any) => void;
  private settled: boolean = false;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = (value) => {
        this.settled = true;
        resolve(value);
      };
      this.reject = (reason) => {
        this.settled = true;
        reject(reason);
      };
    });
  }

  isSettled(): boolean {
    return this.settled;
  }
}

export function createDeferred<T>(): Deferred<T> {
  return new Deferred<T>();
}
