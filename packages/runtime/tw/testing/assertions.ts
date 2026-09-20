/**
 * Assertion utilities
 * @module runtime/testing
 */

export class Assert {
  static equal(actual: unknown, expected: unknown, message?: string): void {
    if (actual !== expected) throw new Error(message ?? `Expected ${expected}, got ${actual}`);
  }
  static notEqual(actual: unknown, expected: unknown, message?: string): void {
    if (actual === expected) throw new Error(message ?? `Expected not ${expected}, got ${actual}`);
  }
  static deepEqual(actual: unknown, expected: unknown, message?: string): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message ?? `Deep equal failed`);
  }
  static true(value: boolean, message?: string): void { if (!value) throw new Error(message ?? `Expected true`); }
  static false(value: boolean, message?: string): void { if (value) throw new Error(message ?? `Expected false`); }
  static null(value: unknown, message?: string): void { if (value !== null) throw new Error(message ?? `Expected null`); }
  static notNull(value: unknown, message?: string): void { if (value === null) throw new Error(message ?? `Expected not null`); }
  static undefined(value: unknown, message?: string): void { if (value !== undefined) throw new Error(message ?? `Expected undefined`); }
  static defined(value: unknown, message?: string): void { if (value === undefined) throw new Error(message ?? `Expected defined`); }
  static truthy(value: unknown, message?: string): void { if (!value) throw new Error(message ?? `Expected truthy`); }
  static falsy(value: unknown, message?: string): void { if (value) throw new Error(message ?? `Expected falsy`); }
  static array(value: unknown, message?: string): void { if (!Array.isArray(value)) throw new Error(message ?? `Expected array`); }
  static object(value: unknown, message?: string): void { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message ?? `Expected object`); }
  static string(value: unknown, message?: string): void { if (typeof value !== "string") throw new Error(message ?? `Expected string`); }
  static number(value: unknown, message?: string): void { if (typeof value !== "number") throw new Error(message ?? `Expected number`); }
  static boolean(value: unknown, message?: string): void { if (typeof value !== "boolean") throw new Error(message ?? `Expected boolean`); }
  static function2(value: unknown, message?: string): void { if (typeof value !== "function") throw new Error(message ?? `Expected function`); }
  static instanceOf(value: unknown, type: new (...args: unknown[]) => unknown, message?: string): void { if (!(value instanceof type)) throw new Error(message ?? `Expected instance of ${type.name}`); }
  static throws(fn: () => unknown, message?: string): void { let threw = false; try { fn(); } catch { threw = true; } if (!threw) throw new Error(message ?? `Expected to throw`); }
  static notThrows(fn: () => unknown, message?: string): void { try { fn(); } catch (e) { throw new Error(message ?? `Expected not to throw: ${e}`); } }
  static contains(haystack: string | unknown[], needle: unknown, message?: string): void { if (typeof haystack === "string") { if (!haystack.includes(needle as string)) throw new Error(message ?? `Expected to contain`); } else if (Array.isArray(haystack)) { if (!haystack.includes(needle)) throw new Error(message ?? `Expected to contain`); } }
  static greaterThan(actual: number, expected: number, message?: string): void { if (!(actual > expected)) throw new Error(message ?? `Expected ${actual} > ${expected}`); }
  static lessThan(actual: number, expected: number, message?: string): void { if (!(actual < expected)) throw new Error(message ?? `Expected ${actual} < ${expected}`); }
  static greaterThanOrEqual(actual: number, expected: number, message?: string): void { if (!(actual >= expected)) throw new Error(message ?? `Expected ${actual} >= ${expected}`); }
  static lessThanOrEqual(actual: number, expected: number, message?: string): void { if (!(actual <= expected)) throw new Error(message ?? `Expected ${actual} <= ${expected}`); }
  static inRange(value: number, min: number, max: number, message?: string): void { if (value < min || value > max) throw new Error(message ?? `Expected ${value} in range [${min}, ${max}]`); }
  static match(value: string, pattern: RegExp, message?: string): void { if (!pattern.test(value)) throw new Error(message ?? `Expected to match`); }
  static length(value: string | unknown[], expected: number, message?: string): void { if (value.length !== expected) throw new Error(message ?? `Expected length ${expected}, got ${value.length}`); }
  static empty(value: string | unknown[] | Record<string, unknown>, message?: string): void { if (Array.isArray(value) || typeof value === "string") { if (value.length > 0) throw new Error(message ?? `Expected empty`); } else { if (Object.keys(value).length > 0) throw new Error(message ?? `Expected empty`); } }
  static notEmpty(value: string | unknown[] | Record<string, unknown>, message?: string): void { if (Array.isArray(value) || typeof value === "string") { if (value.length === 0) throw new Error(message ?? `Expected not empty`); } else { if (Object.keys(value).length === 0) throw new Error(message ?? `Expected not empty`); } }
  static fail(message: string): void { throw new Error(message); }
  static pass(): void {}
}

