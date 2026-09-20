/**
 * Builder -- constructs complex objects step by step
 * @module shared/patterns
 */

export class Builder<T = Record<string, unknown>> {
  private parts: Partial<T> = {};
  private validators: Map<string, (value: unknown) => boolean> = new Map();
  private defaults: Partial<T> = {};
  private required: Set<string> = new Set();

  set<K extends keyof T>(key: K, value: T[K]): this {
    this.parts[key] = value;
    return this;
  }

  setMany(values: Partial<T>): this {
    Object.assign(this.parts, values);
    return this;
  }

  setDefault<K extends keyof T>(key: K, value: T[K]): this {
    this.defaults[key] = value;
    return this;
  }

  setDefaults(defaults: Partial<T>): this {
    Object.assign(this.defaults, defaults);
    return this;
  }

  require(key: keyof T): this {
    this.required.add(key as string);
    return this;
  }

  requireAll(keys: Array<keyof T>): this {
    for (const key of keys) this.required.add(key as string);
    return this;
  }

  setValidator(key: keyof T, validator: (value: unknown) => boolean): this {
    this.validators.set(key as string, validator);
    return this;
  }

  validate(): string[] {
    const errors: string[] = [];
    for (const key of this.required) {
      if (!(key in this.parts) && !(key in this.defaults)) {
        errors.push(`Missing required field: ${key}`);
      }
    }
    for (const [key, validator] of this.validators) {
      if (key in this.parts) {
        if (!validator(this.parts[key as keyof T])) {
          errors.push(`Validation failed for: ${key}`);
        }
      }
    }
    return errors;
  }

  isValid(): boolean {
    return this.validate().length === 0;
  }

  build(): T {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Build failed: ${errors.join("; ")}`);
    }
    return { ...this.defaults, ...this.parts } as T;
  }

  buildOrThrow(): T {
    return this.build();
  }

  buildOrNull(): T | null {
    if (!this.isValid()) return null;
    return { ...this.defaults, ...this.parts } as T;
  }

  reset(): this {
    this.parts = {};
    return this;
  }

  resetAll(): this {
    this.parts = {};
    this.defaults = {};
    this.required.clear();
    this.validators.clear();
    return this;
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    return this.parts[key] ?? this.defaults[key];
  }

  has(key: keyof T): boolean {
    return key in this.parts || key in this.defaults;
  }

  remove(key: keyof T): this {
    delete this.parts[key];
    return this;
  }

  getParts(): Partial<T> {
    return { ...this.parts };
  }

  getDefaults(): Partial<T> {
    return { ...this.defaults };
  }

  getRequired(): string[] {
    return [...this.required];
  }

  getValidators(): string[] {
    return [...this.validators.keys()];
  }

  toJSON(): string {
    return JSON.stringify({ parts: this.parts, defaults: this.defaults, required: [...this.required] }, null, 2);
  }
}

export function createBuilder<T = Record<string, unknown>>(): Builder<T> {
  return new Builder<T>();
}

