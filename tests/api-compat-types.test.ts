/**
 * Compile-time API compatibility for the consolidated utilities.
 *
 * `tsc` reporting 0 errors proves the code compiles; it does not prove the
 * public types still match what callers expect. The assertions below fail the
 * type check if a signature drifts, so a shape change cannot slip through as
 * "it still builds".
 *
 * The widened `merge` signature and the `collection-utils.remove` re-export are
 * the two places where compatibility was at risk.
 */
import { describe, test, expect } from "bun:test";

import { merge } from "../packages/shared/tw/utils/collection-utils.ts";
import { merge as mergeFromObject, mergeDeep } from "../packages/shared/tw/utils/object/manipulate.ts";
import { remove } from "../packages/shared/tw/utils/array/manipulate.ts";
import { remove as removeFromCollection } from "../packages/shared/tw/utils/collection-utils.ts";
import { compact, compactNullish } from "../packages/shared/tw/utils/array/manipulate.ts";
import { compact as compactFromCollection } from "../packages/shared/tw/utils/collection-utils.ts";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

interface User {
  name: string;
  age: number;
}

// --- the call shapes that already existed must still compile -------------------

// merge: inferred generic
const merged1 = merge({ a: 1 }, { b: 2 });
// merge: explicit generic, the object/manipulate shape
const merged2 = merge<User>({ name: "A", age: 1 }, { age: 2 });
// merge: nested
const merged3 = merge({ user: { name: "A" } }, { user: { age: 2 } });
// merge: through the object module's re-export
const merged4 = mergeFromObject({ a: 1 }, { b: 2 });
// merge: the Record<string, unknown> shape collection-utils used to take
const merged5 = merge<Record<string, unknown>>({ a: 1 }, { b: 2 });
// mergeDeep keeps its own signature
const merged6 = mergeDeep({ a: { b: 1 } }, { a: { c: 2 } });

// remove: both paths, same predicate shape
const removed1 = remove([1, 2, 3], (x) => x > 1);
const removed2 = removeFromCollection([1, 2, 3], (x) => x > 1);

// compact: all three paths
const comp1 = compact([0, 1]);
const comp2 = compactNullish([0, 1]);
const comp3 = compactFromCollection([0, 1]);

// --- the declarations must have these shapes ----------------------------------

// @ts-expect-error-only-in-reverse: these must be true
export type _MergeReturnsTargetType = Expect<Equal<typeof merged1, { a: number }>>;
export type _MergeHonoursExplicitGeneric = Expect<Equal<typeof merged2, User>>;
export type _MergeNested = Expect<Equal<typeof merged3, { user: { name: string } }>>;
export type _MergeRecordShape = Expect<Equal<typeof merged5, Record<string, unknown>>>;
export type _RemoveReturnsArray = Expect<Equal<typeof removed1, number[]>>;
export type _CompactReturnsArray = Expect<Equal<typeof comp1, number[]>>;
export type _CompactNullishReturnsArray = Expect<Equal<typeof comp2, number[]>>;

// the same name across paths must be the same function type
export type _MergePathsIdentical = Expect<Equal<typeof mergeFromObject, typeof merge>>;
export type _RemovePathsIdentical = Expect<Equal<typeof removeFromCollection, typeof remove>>;
export type _CompactPathsIdentical = Expect<Equal<typeof compactFromCollection, typeof compact>>;

describe("api compat: declarations hold at runtime too", () => {
  test("merge", () => {
    expect(merged1).toEqual({ a: 1, b: 2 });
    expect(merged2.age).toBe(2);
    expect(merged3).toEqual({ user: { name: "A", age: 2 } });
    expect(merged4).toEqual({ a: 1, b: 2 });
    expect(merged5).toEqual({ a: 1, b: 2 });
    expect(merged6).toEqual({ a: { b: 1, c: 2 } });
  });

  test("remove", () => {
    expect(removed1).toEqual([2, 3]);
    expect(removed2).toEqual([2, 3]);
  });

  test("compact", () => {
    expect(comp1).toEqual([1]);
    expect(comp2).toEqual([0, 1]);
    expect(comp3).toEqual([1]);
  });
});
