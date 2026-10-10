/** Grouping utilities for arrays. */

export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

export function countBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of arr) {
    const key = keyFn(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

export function indexBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T> {
  const result: Record<string, T> = {};
  for (const item of arr) {
    result[keyFn(item)] = item;
  }
  return result;
}

export function sortBy<T>(arr: T[], compareFn: (a: T, b: T) => number): T[] {
  return [...arr].sort(compareFn);
}

export function sortByKey<T>(arr: T[], keyFn: (item: T) => string | number, direction: "asc" | "desc" = "asc"): T[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...arr].sort((a, b) => {
    const aKey = keyFn(a);
    const bKey = keyFn(b);
    if (aKey < bKey) return -1 * factor;
    if (aKey > bKey) return 1 * factor;
    return 0;
  });
}

// Canonical implementation lives in @tw/shared. Re-exported here so the original
// deep-import path keeps working unchanged. The compiler already depends on
// @tw/shared elsewhere, so this adds no new dependency edge.
export { range, MAX_RANGE_LENGTH } from "@tw/shared";

// Canonical implementation lives in @tw/shared. Re-exported so the original
// deep-import path keeps working unchanged.
export { zip } from "@tw/shared";
