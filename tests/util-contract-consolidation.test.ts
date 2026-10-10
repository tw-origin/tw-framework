/**
 * compact / remove / merge — consolidated contracts.
 *
 * Each of these was duplicated across modules with different behaviour:
 *   compact  3 copies: two removed all falsy values, one removed only null/undefined
 *   remove   2 copies: one returned the removed items and mutated, one returned
 *            the kept items and did not
 *   merge    2 copies: one deep (but it turned arrays into objects), one shallow
 *            and it copied inherited properties via `for...in`
 *
 * There is now one canonical implementation each, with the other paths
 * re-exporting it. These tests pin the contract and prove the paths agree.
 */
import { describe, test, expect } from "bun:test";

import {
  compact as compactCanonical,
  compactNullish,
  remove as removeCanonical,
} from "../packages/shared/tw/utils/array/manipulate.ts";
import {
  compact as compactFromCollection,
  remove as removeFromCollection,
  merge as mergeCanonical,
} from "../packages/shared/tw/utils/collection-utils.ts";
import { compact as compactFromSorting } from "../packages/shared/tw/algorithms/sorting.ts";
import { merge as mergeFromObject, mergeDeep } from "../packages/shared/tw/utils/object/manipulate.ts";

describe("consolidation: one function behind every path", () => {
  test("compact", () => {
    expect(compactFromCollection).toBe(compactCanonical);
    expect(compactFromSorting).toBe(compactCanonical);
  });

  test("remove", () => {
    expect(removeFromCollection).toBe(removeCanonical);
  });

  test("merge", () => {
    expect(mergeFromObject).toBe(mergeCanonical);
  });
});

describe("compact: every falsy value is removed", () => {
  test("the full falsy set", () => {
    expect(compactCanonical([0, 1, false, 2, "", 3, null, undefined, NaN])).toEqual([1, 2, 3]);
  });

  test("0 is removed", () => {
    expect(compactCanonical([0, 1])).toEqual([1]);
  });

  test("false is removed", () => {
    expect(compactCanonical([false, true])).toEqual([true]);
  });

  test("empty string is removed", () => {
    expect(compactCanonical(["", "a"])).toEqual(["a"]);
  });

  test("null and undefined are removed", () => {
    expect(compactCanonical([null, 1, undefined, 2])).toEqual([1, 2]);
  });

  test("NaN is removed", () => {
    expect(compactCanonical([NaN, 1])).toEqual([1]);
  });

  test("an empty array stays empty", () => {
    expect(compactCanonical([])).toEqual([]);
  });

  test("truthy values, including 0-like objects, are kept", () => {
    expect(compactCanonical(["0", [], {}])).toEqual(["0", [], {}]);
  });

  test("all three paths return the same result", () => {
    const input = [0, 1, false, 2, "", 3, null, undefined, NaN];
    expect(compactFromCollection(input)).toEqual([1, 2, 3]);
    expect(compactFromSorting(input)).toEqual([1, 2, 3]);
  });
});

describe("compactNullish: the old collection-utils behaviour, now named", () => {
  test("removes only null and undefined", () => {
    expect(compactNullish([0, 1, false, 2, "", 3, null, undefined, NaN])).toEqual([0, 1, false, 2, "", 3, NaN]);
  });

  test("is not the same as compact", () => {
    const input = [0, "", false];
    expect(compactNullish(input)).toEqual(input);
    expect(compactCanonical(input as never[])).toEqual([]);
  });
});

describe("remove: returns matches, mutates the array", () => {
  test("matching elements are returned in original order", () => {
    const values = [1, 2, 3, 4];
    expect(removeCanonical(values, (x) => x > 2)).toEqual([3, 4]);
  });

  test("the array is mutated to the non-matching elements", () => {
    const values = [1, 2, 3, 4];
    removeCanonical(values, (x) => x > 2);
    expect(values).toEqual([1, 2]);
  });

  test("no match returns empty and leaves the array untouched", () => {
    const values = [1, 2, 3];
    expect(removeCanonical(values, () => false)).toEqual([]);
    expect(values).toEqual([1, 2, 3]);
  });

  test("all match returns everything and empties the array", () => {
    const values = [1, 2, 3];
    expect(removeCanonical(values, () => true)).toEqual([1, 2, 3]);
    expect(values).toEqual([]);
  });

  test("duplicates are all removed and order is preserved", () => {
    const values = [1, 2, 3, 2];
    expect(removeCanonical(values, (x) => x === 2)).toEqual([2, 2]);
    expect(values).toEqual([1, 3]);
  });

  test("non-matching elements keep their original order", () => {
    const values = [5, 1, 4, 2, 3];
    removeCanonical(values, (x) => x % 2 === 0);
    expect(values).toEqual([5, 1, 3]);
  });

  test("a throwing predicate leaves the array untouched", () => {
    const values = [1, 2, 3];
    expect(() => removeCanonical(values, (x) => { if (x === 2) throw new Error("boom"); return false; })).toThrow("boom");
    expect(values).toEqual([1, 2, 3]);
  });

  test("a non-array throws instead of failing silently", () => {
    expect(() => removeCanonical("abc" as unknown as string[], () => true)).toThrow(/must be an array/);
  });

  test("a non-function predicate throws", () => {
    expect(() => removeCanonical([1, 2], null as unknown as (x: number) => boolean)).toThrow(/must be a function/);
  });

  test("both import paths agree", () => {
    const a = [1, 2, 3, 4];
    const b = [1, 2, 3, 4];
    expect(removeFromCollection(a, (x) => x > 2)).toEqual(removeCanonical(b, (x) => x > 2));
    expect(a).toEqual(b);
  });
});

describe("merge: deep, arrays replaced", () => {
  test("the documented example", () => {
    const out = mergeCanonical(
      { user: { name: "A", age: 15 }, tags: ["a", "b"] },
      { user: { age: 16 }, tags: ["c"] },
    );
    expect(out).toEqual({ user: { name: "A", age: 16 }, tags: ["c"] });
  });

  test("arrays are replaced, not merged index by index", () => {
    const out = mergeCanonical({ a: [1, 2] }, { a: [3] });
    expect(out.a).toEqual([3]);
    expect(Array.isArray(out.a)).toBe(true);
  });

  test("a shorter source array does not leave a longer target array", () => {
    const out = mergeCanonical({ a: [1, 2, 3] }, { a: [] });
    expect(out.a).toEqual([]);
    expect(Array.isArray(out.a)).toBe(true);
  });

  test("three levels deep", () => {
    expect(mergeCanonical({ a: { b: { c: 1 } } }, { a: { b: { d: 2 } } })).toEqual({ a: { b: { c: 1, d: 2 } } });
  });

  test("null replaces an object", () => {
    expect(mergeCanonical({ a: { b: 1 } }, { a: null })).toEqual({ a: null });
  });

  test("an object replaces null", () => {
    expect(mergeCanonical({ a: null }, { a: { b: 1 } })).toEqual({ a: { b: 1 } });
  });

  test("primitives replace", () => {
    expect(mergeCanonical({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });

  test("empty objects merge to empty", () => {
    expect(mergeCanonical({}, {})).toEqual({});
  });

  test("an empty source leaves the target", () => {
    expect(mergeCanonical({ a: 1 }, {})).toEqual({ a: 1 });
  });

  test("a Date replaces rather than being recursed into", () => {
    const d = new Date(0);
    expect(mergeCanonical({ a: 1 }, { a: d as unknown as number }).a).toBe(d);
  });

  test("neither input is mutated", () => {
    const target = { a: { b: 1 } };
    const source = { a: { c: 2 } };
    mergeCanonical(target, source);
    expect(target).toEqual({ a: { b: 1 } });
    expect(source).toEqual({ a: { c: 2 } });
  });

  test("both import paths agree", () => {
    expect(mergeFromObject({ a: { b: 1 } }, { a: { c: 2 } })).toEqual(mergeCanonical({ a: { b: 1 } }, { a: { c: 2 } }));
  });

  test("mergeDeep behaves as merge", () => {
    expect(mergeDeep({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } });
  });
});

describe("merge: security", () => {
  test("inherited properties are not copied", () => {
    const source = Object.create({ inherited: "leaked" }) as Record<string, unknown>;
    source.own = 1;
    const out = mergeCanonical({}, source);
    expect(out).toEqual({ own: 1 });
    expect(Object.prototype.hasOwnProperty.call(out, "inherited")).toBe(false);
  });

  test("a top-level __proto__ key does not pollute Object.prototype", () => {
    delete (Object.prototype as Record<string, unknown>).polluted;
    mergeCanonical({}, JSON.parse('{"__proto__":{"polluted":"yes"}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    delete (Object.prototype as Record<string, unknown>).polluted;
  });

  test("a nested __proto__ key does not pollute", () => {
    delete (Object.prototype as Record<string, unknown>).polluted;
    mergeCanonical({}, JSON.parse('{"a":{"__proto__":{"polluted":"yes"}}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    delete (Object.prototype as Record<string, unknown>).polluted;
  });

  test("constructor.prototype does not pollute", () => {
    delete (Object.prototype as Record<string, unknown>).polluted;
    mergeCanonical({}, JSON.parse('{"constructor":{"prototype":{"polluted":"yes"}}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    delete (Object.prototype as Record<string, unknown>).polluted;
  });

  test("the result object is not given a polluted prototype", () => {
    const out = mergeCanonical({}, JSON.parse('{"__proto__":{"polluted":"yes"}}'));
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("mergeDeep is guarded the same way", () => {
    delete (Object.prototype as Record<string, unknown>).polluted;
    mergeDeep({}, JSON.parse('{"__proto__":{"polluted":"yes"}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    delete (Object.prototype as Record<string, unknown>).polluted;
  });
});
