/**
 * compact / remove / merge — edge cases before release.
 *
 * Covers sparse arrays, special objects (Date, RegExp, Map, Set, class
 * instances), null-prototype objects, circular references, and the input
 * mutation guarantee. These are the cases that would otherwise be discovered
 * after shipping.
 */
import { describe, test, expect } from "bun:test";

import {
  compact as compactCanonical,
  compactNullish,
  remove as removeCanonical,
} from "../packages/shared/tw/utils/array/manipulate.ts";
import { compact as compactFromCollection, compactNullish as compactNullishFromCollection } from "../packages/shared/tw/utils/collection-utils.ts";
import { compact as compactFromSorting, compactNullish as compactNullishFromSorting } from "../packages/shared/tw/algorithms/sorting.ts";
import { merge } from "../packages/shared/tw/utils/collection-utils.ts";
import { mergeDeep } from "../packages/shared/tw/utils/object/manipulate.ts";

describe("compactNullish: reachable and correct", () => {
  test("preserves 0, false and empty string", () => {
    expect(compactNullish([0, false, "", "a", 1])).toEqual([0, false, "", "a", 1]);
  });

  test("removes only null and undefined", () => {
    expect(compactNullish([null, 0, undefined, false, "", NaN])).toEqual([0, false, "", NaN]);
  });

  test("NaN is preserved, unlike compact", () => {
    expect(compactNullish([NaN])).toEqual([NaN]);
    expect(compactCanonical([NaN])).toEqual([]);
  });

  test("is reachable from the deep-import paths", () => {
    const a = compactNullish([0, null, 1]);
    const b = compactNullishFromCollection([0, null, 1]);
    const c = compactNullishFromSorting([0, null, 1]);
    expect(a).toEqual([0, 1]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  test("compactNullish is a different function from compact on every path", () => {
    expect(compactNullishFromCollection).not.toBe(compactFromCollection);
    expect(compactNullishFromSorting).not.toBe(compactFromSorting);
    expect(compactNullishFromCollection).toBe(compactNullish);
    expect(compactNullishFromSorting).toBe(compactNullish);
  });

  test("empty array stays empty", () => {
    expect(compactNullish([])).toEqual([]);
  });
});

describe("compact: sparse arrays", () => {
  test("holes are dropped (filter does not visit them)", () => {
    const sparse = [1, , 3] as number[];
    expect(compactCanonical(sparse)).toEqual([1, 3]);
  });

  test("explicit undefined is dropped too", () => {
    expect(compactCanonical([1, undefined, 3])).toEqual([1, 3]);
  });

  test("compactNullish keeps holes out but preserves 0", () => {
    const sparse = [0, , 2] as number[];
    expect(compactNullish(sparse)).toEqual([0, 2]);
  });
});

describe("remove: sparse arrays", () => {
  test("a hole is presented to the predicate as undefined", () => {
    const sparse = [1, , 3] as number[];
    const seen: unknown[] = [];
    removeCanonical(sparse, (x) => {
      seen.push(x);
      return false;
    });
    expect(seen.length).toBe(3);
    expect(seen[1]).toBeUndefined();
  });

  test("a hole can be matched and removed", () => {
    const sparse = [1, , 3] as number[];
    const removed = removeCanonical(sparse, (x) => x === undefined);
    expect(removed.length).toBe(1);
    expect(removed[0]).toBeUndefined();
    expect(sparse.length).toBe(2);
    expect(sparse).toEqual([1, 3]);
  });

  test("the array length reflects the holes being removed", () => {
    const sparse = [1, , , 4] as number[];
    removeCanonical(sparse, (x) => x === undefined);
    expect(sparse).toEqual([1, 4]);
  });
});

describe("merge: nested arrays and objects inside arrays", () => {
  test("an array of objects is replaced whole, not merged", () => {
    const out = merge({ list: [{ id: 1, name: "a" }] }, { list: [{ id: 1 }] });
    expect(out.list).toEqual([{ id: 1 }]);
    expect(Array.isArray(out.list)).toBe(true);
  });

  test("nested arrays inside objects are replaced", () => {
    const out = merge({ a: { b: [1, [2, 3]] } }, { a: { b: [[4]] } });
    expect(out.a.b).toEqual([[4]]);
  });

  test("a nested object holding an array keeps the array as an array", () => {
    const out = merge({ a: { tags: ["x"] } }, { a: { name: "n" } });
    expect(out.a.tags).toEqual(["x"]);
    expect(out.a.name).toBe("n");
  });
});

describe("merge: undefined and null in the source", () => {
  test("an explicit undefined overwrites", () => {
    const out = merge({ a: 1 }, { a: undefined });
    expect(Object.prototype.hasOwnProperty.call(out, "a")).toBe(true);
    expect(out.a).toBeUndefined();
  });

  test("null overwrites an object", () => {
    expect(merge({ a: { b: 1 } }, { a: null })).toEqual({ a: null });
  });

  test("null overwrites an array", () => {
    expect(merge({ a: [1] }, { a: null })).toEqual({ a: null });
  });
});

describe("merge: special objects are replaced, never emptied", () => {
  test("Date", () => {
    const d = new Date(1000);
    const out = merge({ a: { x: 1 } }, { a: d as unknown as Record<string, unknown> });
    expect(out.a).toBe(d);
    expect(out.a instanceof Date).toBe(true);
  });

  test("RegExp", () => {
    const r = /abc/g;
    const out = merge({ a: 1 }, { a: r as unknown as number });
    expect(out.a).toBe(r);
    expect(out.a instanceof RegExp).toBe(true);
  });

  test("Map", () => {
    const m = new Map([["k", 1]]);
    const out = merge({ a: 1 }, { a: m as unknown as number });
    expect(out.a).toBe(m);
    expect(out.a instanceof Map).toBe(true);
  });

  test("Set", () => {
    const s = new Set([1]);
    const out = merge({ a: 1 }, { a: s as unknown as number });
    expect(out.a).toBe(s);
    expect(out.a instanceof Set).toBe(true);
  });

  test("a class instance keeps its prototype", () => {
    class Point {
      constructor(public x: number) {}
    }
    const p = new Point(1);
    const out = merge({ a: { y: 2 } }, { a: p as unknown as Record<string, unknown> });
    expect(out.a).toBe(p);
    expect(out.a instanceof Point).toBe(true);
  });

  test("a Date inside a deeper level is not turned into {}", () => {
    const d = new Date(0);
    const out = merge({ a: { b: { c: 1 } } }, { a: { b: { d: d as unknown as number } } });
    expect(out.a.b.d).toBe(d);
    expect(out.a.b.d instanceof Date).toBe(true);
  });
});

describe("merge: null-prototype objects", () => {
  test("a null-prototype source is merged, not replaced", () => {
    const source = Object.assign(Object.create(null), { b: 2 });
    const out = merge({ a: 1 }, source as Record<string, unknown>);
    expect(out.a).toBe(1);
    expect(out.b).toBe(2);
  });

  test("a nested null-prototype object merges recursively", () => {
    const nested = Object.assign(Object.create(null), { c: 3 });
    const out = merge({ a: { b: 1 } }, { a: nested });
    expect(out.a.b).toBe(1);
    expect(out.a.c).toBe(3);
  });
});

describe("merge: circular references fail predictably", () => {
  test("a circular source that would be recursed into throws", () => {
    const circular: Record<string, unknown> = { n: {} };
    (circular.n as Record<string, unknown>).self = circular.n;
    const target = { n: { self: {} } };
    expect(() => merge(target, circular)).toThrow(/circular reference/);
  });

  test("the error is not a stack overflow", () => {
    const circular: Record<string, unknown> = { n: {} };
    (circular.n as Record<string, unknown>).self = circular.n;
    let message = "";
    try {
      merge({ n: { self: {} } }, circular);
    } catch (e: unknown) {
      message = (e as Error).message;
    }
    expect(message).toContain("circular reference");
    expect(message).not.toContain("call stack");
  });

  test("a circular source with no matching target key is assigned, not recursed", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const out = merge({ a: 1 }, circular);
    expect(out.a).toBe(1);
    expect((out as Record<string, unknown>).self).toBe(circular);
  });

  test("mergeDeep reports it the same way", () => {
    const circular: Record<string, unknown> = { n: {} };
    (circular.n as Record<string, unknown>).self = circular.n;
    expect(() => mergeDeep({ n: { self: {} } }, circular)).toThrow(/circular reference/);
  });
});

describe("merge: inputs are never mutated", () => {
  test("a deep merge leaves both inputs alone", () => {
    const target = { a: { b: 1 }, c: [1] };
    const source = { a: { d: 2 }, c: [2] };
    merge(target, source);
    expect(target).toEqual({ a: { b: 1 }, c: [1] });
    expect(source).toEqual({ a: { d: 2 }, c: [2] });
  });

  test("the target's nested object is not shared into the result", () => {
    const target = { a: { b: 1 } };
    const out = merge(target, { a: { c: 2 } });
    (out.a as Record<string, unknown>).b = 99;
    expect(target.a.b).toBe(1);
  });
});
