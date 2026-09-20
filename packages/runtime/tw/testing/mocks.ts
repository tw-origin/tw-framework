/**
 * Mock and stub utilities
 * @module runtime/testing
 */

export class Mock<T extends Record<string, unknown> = Record<string, unknown>> {
  private calls: Array<{ method: string; args: unknown[]; result: unknown; timestamp: number }> = [];
  private returnValues: Map<string, unknown> = new Map();
  private implementations: Map<string, (...args: unknown[]) => unknown> = new Map();
  private throwErrors: Map<string, Error> = new Map();
  private callCounts: Map<string, number> = new Map();
  private object: T;

  constructor(object?: T) {
    this.object = object ?? {} as T;
  }

  setup(method: string, returnValue: unknown): this { this.returnValues.set(method, returnValue); return this; }
  setupImplementation(method: string, impl: (...args: unknown[]) => unknown): this { this.implementations.set(method, impl); return this; }
  setupThrow(method: string, error: Error): this { this.throwErrors.set(method, error); return this; }

  invoke(method: string, ...args: unknown[]): unknown {
    this.callCounts.set(method, (this.callCounts.get(method) ?? 0) + 1);
    const error = this.throwErrors.get(method);
    if (error) { this.calls.push({ method, args, result: undefined, timestamp: Date.now() }); throw error; }
    const impl = this.implementations.get(method);
    if (impl) { const result = impl(...args); this.calls.push({ method, args, result, timestamp: Date.now() }); return result; }
    const returnValue = this.returnValues.get(method);
    this.calls.push({ method, args, result: returnValue, timestamp: Date.now() });
    return returnValue;
  }

  getCalls(method?: string): Array<{ method: string; args: unknown[]; result: unknown; timestamp: number }> {
    return method ? this.calls.filter((c) => c.method === method) : [...this.calls];
  }
  getCallCount(method?: string): number { return method ? (this.callCounts.get(method) ?? 0) : this.calls.length; }
  wasCalled(method: string): boolean { return (this.callCounts.get(method) ?? 0) > 0; }
  wasCalledTimes(method: string, times: number): boolean { return (this.callCounts.get(method) ?? 0) === times; }
  wasCalledWith(method: string, ...args: unknown[]): boolean { return this.calls.some((c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args)); }
  getArgs(method: string, callIndex: number = 0): unknown[] | undefined { const calls = this.getCalls(method); return calls[callIndex]?.args; }
  getReturnValue(method: string, callIndex: number = 0): unknown { const calls = this.getCalls(method); return calls[callIndex]?.result; }
  reset(): this { this.calls = []; this.returnValues.clear(); this.implementations.clear(); this.throwErrors.clear(); this.callCounts.clear(); return this; }
  getObject(): T { return this.object; }
  toJSON(): string { return JSON.stringify({ calls: this.calls.length, methods: [...this.callCounts.keys()] }, null, 2); }
}

export class Stub<T = unknown> {
  private values: Map<string, T> = new Map();
  private defaults: Map<string, T> = new Map();
  set(key: string, value: T): this { this.values.set(key, value); return this; }
  get(key: string): T | undefined { return this.values.get(key) ?? this.defaults.get(key); }
  setDefault(key: string, value: T): this { this.defaults.set(key, value); return this; }
  has(key: string): boolean { return this.values.has(key) || this.defaults.has(key); }
  remove(key: string): this { this.values.delete(key); return this; }
  clear(): this { this.values.clear(); return this; }
  clearAll(): this { this.values.clear(); this.defaults.clear(); return this; }
  keys(): string[] { return [...new Set([...this.values.keys(), ...this.defaults.keys()])]; }
  size(): number { return this.keys().length; }
  toJSON(): string { return JSON.stringify({ values: this.values.size, defaults: this.defaults.size }, null, 2); }
}

export class Spy {
  private calls: Array<{ args: unknown[]; result: unknown; error: Error | null; timestamp: number }> = [];
  private original: ((...args: unknown[]) => unknown) | null = null;
  private callThrough: boolean = false;

  constructor(original?: (...args: unknown[]) => unknown) {
    this.original = original ?? null;
    this.callThrough = !!original;
  }
  wrap(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
    return (...args: unknown[]) => {
      try {
        const result = this.callThrough ? this.original!(...args) : fn(...args);
        this.calls.push({ args, result, error: null, timestamp: Date.now() });
        return result;
      } catch (error) {
        this.calls.push({ args, result: undefined, error: error as Error, timestamp: Date.now() });
        throw error;
      }
    };
  }
  getCalls(): Array<{ args: unknown[]; result: unknown; error: Error | null; timestamp: number }> { return [...this.calls]; }
  getCallCount(): number { return this.calls.length; }
  wasCalled(): boolean { return this.calls.length > 0; }
  wasCalledTimes(times: number): boolean { return this.calls.length === times; }
  wasCalledWith(...args: unknown[]): boolean { return this.calls.some((c) => JSON.stringify(c.args) === JSON.stringify(args)); }
  getArgs(callIndex: number = 0): unknown[] | undefined { return this.calls[callIndex]?.args; }
  getReturnValue(callIndex: number = 0): unknown { return this.calls[callIndex]?.result; }
  getError(callIndex: number = 0): Error | null { return this.calls[callIndex]?.error ?? null; }
  setCallThrough(callThrough: boolean): this { this.callThrough = callThrough; return this; }
  reset(): this { this.calls = []; return this; }
  toJSON(): string { return JSON.stringify({ calls: this.calls.length }, null, 2); }
}

export function createMock<T extends Record<string, unknown> = Record<string, unknown>>(object?: T): Mock<T> { return new Mock(object); }
export function createStub<T = unknown>(): Stub<T> { return new Stub(); }
export function createSpy(original?: (...args: unknown[]) => unknown): Spy { return new Spy(original); }

