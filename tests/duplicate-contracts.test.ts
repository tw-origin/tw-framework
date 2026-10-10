/**
 * Duplicate-name audit, stage 2 — the fixes.
 *
 * The audit (TW-2.0.0-duplicate-audit-stage1.md) found a name defined in two or
 * more modules whose copies disagreed. This file pins the three that were
 * actually fixed, so they cannot drift back:
 *
 *  1. `chunk(arr, 0)` — three of the five copies had no `size <= 0` guard, so the
 *     loop never advanced and the process died (one segfaults, two OOM-throw).
 *     Same class as the `range` bug fixed earlier.
 *  2. `take` / `takeRight` / `drop` / `dropRight` — algorithms/sorting.ts had no
 *     default for `n`, so omitting it returned the whole array (or `[]`).
 *  3. `countOccurrences` — two different jobs under one name: a Map of counts
 *     (array/manipulate.ts) and the count of one value (algorithms/sorting.ts).
 *     The map-shaped one is now `countOccurrencesMap`.
 *
 * Plus the rest-args footgun: `product`/`average`/`variance` treated an array
 * argument as a single value, so `product([1,2,3,4])` was NaN/null. They now
 * accept a single array too.
 */
import { describe, test, expect } from "bun:test";

import { chunk as chunkSort, take as takeSort, takeRight as takeRightSort, drop as dropSort, dropRight as dropRightSort, countOccurrences as countOccurrencesSort } from "../packages/shared/tw/algorithms/sorting.ts";
import { chunk as chunkColl, take as takeColl, takeRight as takeRightColl, drop as dropColl, dropRight as dropRightColl } from "../packages/shared/tw/utils/collection-utils.ts";
import { chunk as chunkManip, countOccurrencesMap, mostFrequent, leastFrequent } from "../packages/shared/tw/utils/array/manipulate.ts";
import { chunk as chunkStr } from "../packages/shared/tw/utils/string/transform.ts";
import { chunk as chunkCompiler } from "../packages/compiler/tw/utils/collections/chunk.ts";
import { product, average, variance } from "../packages/shared/tw/utils/functional.ts";

describe("chunk(arr, 0) is guarded everywhere", () => {
  // The three unguarded copies used to segfault / OOM here; a regression would
  // kill the test process, which is exactly the failure we want visible.
  const arrCopies: [string, (a: number[], n: number) => unknown][] = [
    ["algorithms/sorting", chunkSort as any],
    ["utils/collection-utils", chunkColl as any],
    ["utils/array/manipulate", chunkManip as any],
    ["compiler/utils/collections/chunk", chunkCompiler as any],
  ];
  for (const [name, fn] of arrCopies) {
    test(`${name}: chunk([1,2,3], 0) returns [[1,2,3]]`, () => {
      expect(fn([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
    });
    test(`${name}: chunk([1,2,3], -1) returns [[1,2,3]]`, () => {
      expect(fn([1, 2, 3], -1)).toEqual([[1, 2, 3]]);
    });
  }
  test("string chunk: chunk(\"abc\", 0) returns [\"abc\"]", () => {
    expect(chunkStr("abc", 0)).toEqual(["abc"]);
  });
  test("the normal case is unchanged", () => {
    expect(chunkSort([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkStr("abcde", 2)).toEqual(["ab", "cd", "e"]);
  });
});

describe("take / takeRight / drop / dropRight defaults agree", () => {
  const A = [1, 2, 3, 4];
  test("an omitted n means 1 (lodash), in every copy", () => {
    expect(takeSort(A)).toEqual([1]);
    expect(takeColl(A)).toEqual([1]);
    expect(takeRightSort(A)).toEqual([4]);
    expect(takeRightColl(A)).toEqual([4]);
    expect(dropSort(A)).toEqual([2, 3, 4]);
    expect(dropColl(A)).toEqual([2, 3, 4]);
    expect(dropRightSort(A)).toEqual([1, 2, 3]);
    expect(dropRightColl(A)).toEqual([1, 2, 3]);
  });
  test("with an explicit n the two copies still match", () => {
    for (const n of [0, 1, 2, 4, 9]) {
      expect(takeSort(A, n)).toEqual(takeColl(A, n));
      expect(takeRightSort(A, n)).toEqual(takeRightColl(A, n));
      expect(dropSort(A, n)).toEqual(dropColl(A, n));
      expect(dropRightSort(A, n)).toEqual(dropRightColl(A, n));
    }
  });
});

describe("countOccurrences is no longer two jobs under one name", () => {
  test("sorting's countOccurrences is the count of one value", () => {
    expect(countOccurrencesSort([1, 2, 2, 3], 2)).toBe(2);
    expect(countOccurrencesSort([1, 2, 2, 3], 9)).toBe(0);
  });
  test("manipulate's map version is now countOccurrencesMap", () => {
    expect([...countOccurrencesMap([1, 2, 2, 3])]).toEqual([[1, 1], [2, 2], [3, 1]]);
  });
  test("the internal users still work through the new name", () => {
    expect(mostFrequent([1, 2, 2, 3])).toBe(2);
    expect(leastFrequent([1, 2, 2, 3])).toBe(1);
  });
});

describe("product / average / variance accept an array and rest args alike", () => {
  test("product", () => {
    expect(product(1, 2, 3, 4)).toBe(24);
    expect(product([1, 2, 3, 4])).toBe(24);
    expect(product([2, 5])).toBe(10);
  });
  test("average", () => {
    expect(average(1, 2, 3, 4)).toBe(2.5);
    expect(average([1, 2, 3, 4])).toBe(2.5);
  });
  test("variance", () => {
    expect(variance(1, 2, 3, 4)).toBe(1.25);
    expect(variance([1, 2, 3, 4])).toBe(1.25);
  });
  test("empty is still handled", () => {
    expect(average()).toBe(0);
    expect(variance()).toBe(0);
  });
});
