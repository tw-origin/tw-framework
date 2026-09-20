/**
 * Singleton -- ensures only one instance exists
 * @module shared/patterns
 */

export class Singleton<T> {
  private static instances: Map<string, Singleton<unknown>> = new Map();
  private value: T | undefined;
  private initialized: boolean = false;

  private constructor(private factory?: () => T) {}

  static getInstance<T>(key: string = "default", factory?: () => T): Singleton<T> {
    if (!Singleton.instances.has(key)) {
      Singleton.instances.set(key, new Singleton<T>(factory));
    }
    return Singleton.instances.get(key) as Singleton<T>;
  }

  getValue(): T | undefined {
    if (!this.initialized && this.factory) {
      this.value = this.factory();
      this.initialized = true;
    }
    return this.value;
  }

  setValue(value: T): void {
    this.value = value;
    this.initialized = true;
  }

  reset(): void {
    this.value = undefined;
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  static clear(key?: string): void {
    if (key) {
      Singleton.instances.delete(key);
    } else {
      Singleton.instances.clear();
    }
  }

  static has(key: string): boolean {
    return Singleton.instances.has(key);
  }

  static keys(): string[] {
    return [...Singleton.instances.keys()];
  }

  static count(): number {
    return Singleton.instances.size;
  }

  toJSON(): string {
    return JSON.stringify({ key: this.constructor.name, initialized: this.initialized }, null, 2);
  }
}

export function createSingleton<T>(factory?: () => T, key?: string): Singleton<T> {
  return Singleton.getInstance<T>(key, factory);
}

