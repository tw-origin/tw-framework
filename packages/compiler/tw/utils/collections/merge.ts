/** Object merging utilities. */

export function mergeObjects(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key])) {
      result[key] = mergeObjects(result[key] ?? {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function deepMerge<T>(...objects: Partial<T>[]): T {
  // Prototype pollution protection
  let result: any = {};
  for (const obj of objects) {
    result = mergeObjects(result, obj);
  }
  return result as T;
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result: any = {};
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result: any = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

export function invert(obj: Record<string, string | number>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[String(value)] = key;
  }
  return result;
}

export function mapValues<T, U>(obj: Record<string, T>, mapper: (value: T, key: string) => U): Record<string, U> {
  const result: Record<string, U> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = mapper(value, key);
  }
  return result;
}

export function mapKeys<T>(obj: Record<string, T>, mapper: (key: string, value: T) => string): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = mapper(key, value);
    result[newKey] = value;
  }
  return result;
}

export function filterValues<T>(obj: Record<string, T>, predicate: (value: T, key: string) => boolean): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value, key)) {
      result[key] = value;
    }
  }
  return result;
}
