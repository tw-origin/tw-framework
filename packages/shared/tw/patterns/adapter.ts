/**
 * Adapter -- bridges incompatible interfaces
 * @module shared/patterns
 */

export interface Target {
  request(): string;
}

export class Adapter implements Target {
  constructor(private adaptee: { specificRequest(): string }) {}
  request(): string { return this.adaptee.specificRequest(); }
}

export class AdapterMap<TInput, TOutput> {
  private adapters: Map<string, (input: TInput) => TOutput> = new Map();
  register(type: string, adapter: (input: TInput) => TOutput): this {
    this.adapters.set(type, adapter);
    return this;
  }
  unregister(type: string): this { this.adapters.delete(type); return this; }
  adapt(type: string, input: TInput): TOutput {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error(`No adapter for type: ${type}`);
    return adapter(input);
  }
  hasAdapter(type: string): boolean { return this.adapters.has(type); }
  getAdapterTypes(): string[] { return [...this.adapters.keys()]; }
  count(): number { return this.adapters.size; }
  clear(): this { this.adapters.clear(); return this; }
}

export function createAdapterMap<TInput, TOutput>(): AdapterMap<TInput, TOutput> {
  return new AdapterMap();
}

