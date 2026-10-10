/**
 * zip family — the approved contract.
 *
 * One copy padded to the longer array; four truncated. Now all four array paths
 * re-export the padding implementation, and the return type carries `undefined`
 * so the type matches the runtime.
 */
import { describe, test, expect } from "bun:test";

import {
  zip as zipCanonical,
  zipWith as zipWithCanonical,
  unzip as unzipCanonical,
} from "../packages/shared/tw/utils/array/manipulate.ts";
import { zip as zipFromCollection, unzip as unzipFromCollection } from "../packages/shared/tw/utils/collection-utils.ts";
import { zip as zipFromSorting, unzip as unzipFromSorting } from "../packages/shared/tw/algorithms/sorting.ts";
import { zip as zipFromCompilerGroup } from "../packages/compiler/tw/utils/collections/group.ts";

// compile-time: the padded return type must carry `undefined`
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

const typedZip = zipCanonical([1, 2], ["a"]);
export type _ZipTypeCarriesUndefined = Expect<Equal<typeof typedZip, Array<[number | undefined, string | undefined]>>>;

describe("zip: pad to the longer array with undefined", () => {
  test("equal lengths", () => {
    expect(zipCanonical([1, 2, 3], ["a", "b", "c"])).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
  });

  test("first longer", () => {
    expect(zipCanonical([1, 2, 3], ["a"])).toEqual([[1, "a"], [2, undefined], [3, undefined]]);
  });

  test("second longer", () => {
    expect(zipCanonical([1], ["a", "b"])).toEqual([[1, "a"], [undefined, "b"]]);
  });

  test("the pad value is undefined, not null", () => {
    const row = zipCanonical([1, 2], ["a"])[1];
    expect(row[1]).toBeUndefined();
    expect(row[1] === null).toBe(false);
  });

  test("one empty", () => {
    expect(zipCanonical([1, 2], [])).toEqual([[1, undefined], [2, undefined]]);
  });

  test("both empty", () => {
    expect(zipCanonical([], [])).toEqual([]);
  });

  test("all four array paths agree", () => {
    const a = [1, 2, 3];
    const b = ["a"];
    const expected = [[1, "a"], [2, undefined], [3, undefined]];
    expect(zipFromCollection(a, b)).toEqual(expected);
    expect(zipFromSorting(a, b)).toEqual(expected);
    expect(zipFromCompilerGroup(a, b)).toEqual(expected);
  });

  test("the four paths are the same function", () => {
    expect(zipFromCollection).toBe(zipCanonical);
    expect(zipFromSorting).toBe(zipCanonical);
    expect(zipFromCompilerGroup).toBe(zipCanonical);
  });
});

describe("zipWith: same length rule", () => {
  test("equal lengths", () => {
    expect(zipWithCanonical([1, 2], [10, 20], (x, y) => (x ?? 0) + (y ?? 0))).toEqual([11, 22]);
  });

  test("pads and passes undefined to the iteratee", () => {
    const seen: Array<[number | undefined, number | undefined]> = [];
    const out = zipWithCanonical([1, 2, 3], [10], (x, y) => {
      seen.push([x, y]);
      return x;
    });
    expect(out.length).toBe(3);
    expect(seen[1]).toEqual([2, undefined]);
  });
});

describe("unzip: existing behaviour preserved", () => {
  test("transposes", () => {
    expect(unzipCanonical([[1, "a"], [2, "b"]])).toEqual([[1, 2], ["a", "b"]]);
  });

  test("empty", () => {
    expect(unzipCanonical([])).toEqual([]);
  });

  test("pads uneven inner arrays", () => {
    expect(unzipCanonical([[1, "a"], [2]])).toEqual([[1, 2], ["a", undefined]]);
  });

  test("the sorting copy keeps its tuple shape and agrees", () => {
    expect(unzipFromSorting([[1, "a"], [2, "b"]])).toEqual([[1, 2], ["a", "b"]]);
    expect(unzipFromCollection([[1, "a"], [2, "b"]])).toEqual(unzipCanonical([[1, "a"], [2, "b"]]));
  });
});
