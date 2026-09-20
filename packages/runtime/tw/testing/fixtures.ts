/**
 * Test fixtures and data generators
 * @module runtime/testing
 */

export class Fixture<T = Record<string, unknown>> {
  private defaults: T;
  private overrides: Partial<T>[] = [];
  private count: number = 1;
  private generator: ((index: number) => Partial<T>) | null = null;

  constructor(defaults: T) { this.defaults = defaults; }

  setDefaults(defaults: T): this { this.defaults = defaults; return this; }
  addOverride(override: Partial<T>): this { this.overrides.push(override); return this; }
  setCount(count: number): this { this.count = count; return this; }
  setGenerator(generator: (index: number) => Partial<T>): this { this.generator = generator; return this; }

  build(): T {
    let result = { ...this.defaults };
    if (this.overrides.length > 0) {
      result = { ...result, ...this.overrides[this.overrides.length - 1] };
    }
    if (this.generator) {
      result = { ...result, ...this.generator(0) };
    }
    return result;
  }

  buildMany(count?: number): T[] {
    const n = count ?? this.count;
    const results: T[] = [];
    for (let i = 0; i < n; i++) {
      let result = { ...this.defaults };
      if (i < this.overrides.length) {
        result = { ...result, ...this.overrides[i] };
      }
      if (this.generator) {
        result = { ...result, ...this.generator(i) };
      }
      results.push(result);
    }
    return results;
  }

  buildWith(override: Partial<T>): T {
    return { ...this.defaults, ...override };
  }

  buildManyWith(overrides: Partial<T>[]): T[] {
    return overrides.map((o) => ({ ...this.defaults, ...o }));
  }

  reset(): this { this.overrides = []; this.count = 1; this.generator = null; return this; }
  toJSON(): string { return JSON.stringify({ defaults: this.defaults, count: this.count }, null, 2); }
}

export class FixtureFactory {
  private fixtures: Map<string, Fixture> = new Map();

  register<T>(name: string, defaults: T): Fixture<T> {
    const fixture = new Fixture(defaults);
    this.fixtures.set(name, fixture as any);
    return fixture;
  }

  get<T>(name: string): Fixture<T> | undefined {
    return this.fixtures.get(name) as Fixture<T> | undefined;
  }

  build<T>(name: string, override?: Partial<T>): T | undefined {
    const fixture = this.fixtures.get(name);
    if (!fixture) return undefined;
    return (override ? fixture.buildWith(override as any) : fixture.build()) as T;
  }

  buildMany<T>(name: string, count?: number): T[] | undefined {
    const fixture = this.fixtures.get(name);
    if (!fixture) return undefined;
    return fixture.buildMany(count) as any;
  }

  has(name: string): boolean { return this.fixtures.has(name); }
  remove(name: string): this { this.fixtures.delete(name); return this; }
  clear(): this { this.fixtures.clear(); return this; }
  names(): string[] { return [...this.fixtures.keys()]; }
  count(): number { return this.fixtures.size; }
  toJSON(): string { return JSON.stringify({ fixtures: [...this.fixtures.keys()] }, null, 2); }
}

export function randomString(length: number = 10): string {
  return Math.random().toString(36).slice(2, 2 + length);
}
export function randomInteger(min: number = 0, max: number = 100): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function randomFloat(min: number = 0, max: number = 1, decimals: number = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}
export function randomBoolean(): boolean { return Math.random() > 0.5; }
export function randomDate(min: Date = new Date(2000, 0, 1), max: Date = new Date()): Date {
  return new Date(min.getTime() + Math.random() * (max.getTime() - min.getTime()));
}
export function randomElement<T>(array: T[]): T { return array[Math.floor(Math.random() * array.length)]; }
export function randomElements<T>(array: T[], count: number): T[] {
  return [...array].sort(() => Math.random() - 0.5).slice(0, count);
}
export function randomObject(keys: string[], valueGenerator?: (key: string) => unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = valueGenerator ? valueGenerator(key) : randomString();
  }
  return result;
}
export function randomArray<T>(length: number, generator: (index: number) => T): T[] {
  return Array.from({ length }, (_, i) => generator(i));
}

export function createFixture<T>(defaults: T): Fixture<T> { return new Fixture(defaults); }
export function createFixtureFactory(): FixtureFactory { return new FixtureFactory(); }

