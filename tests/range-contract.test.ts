/**
 * `range` contract and consolidation.
 *
 * `range` used to be copied into five modules. Every copy had the same
 * unguarded loop:
 *
 *     for (let i = start; i < end; i += step) result.push(i);
 *
 * With non-numeric arguments `i += step` concatenates instead of adding, so
 * `"a" < "b"` stays true forever, the array grows without bound and the process
 * dies. There is now one implementation (shared/tw/utils/array/manipulate.ts)
 * and the other four modules re-export it.
 *
 * These tests pin the contract and prove the five paths still agree.
 */
import { describe, test, expect } from "bun:test";

import {
  range as canonical,
  rangeRight,
  MAX_RANGE_LENGTH,
} from "../packages/shared/tw/utils/array/manipulate.ts";
import { range as fromFunctional } from "../packages/shared/tw/utils/functional.ts";
import { range as fromFunctionIndex } from "../packages/shared/tw/utils/function/index.ts";
import { range as fromSorting } from "../packages/shared/tw/algorithms/sorting.ts";
import { range as fromCompilerGroup } from "../packages/compiler/tw/utils/collections/group.ts";

describe("range: consolidation", () => {
  test("all five modules expose the same function", () => {
    expect(fromFunctional).toBe(canonical);
    expect(fromFunctionIndex).toBe(canonical);
    expect(fromSorting).toBe(canonical);
    expect(fromCompilerGroup).toBe(canonical);
  });

  test("deep-import paths still return the same result", () => {
    expect(fromFunctional(0, 4)).toEqual([0, 1, 2, 3]);
    expect(fromFunctionIndex(0, 4)).toEqual([0, 1, 2, 3]);
    expect(fromSorting(0, 4)).toEqual([0, 1, 2, 3]);
    expect(fromCompilerGroup(0, 4)).toEqual([0, 1, 2, 3]);
  });
});

describe("range: ascending", () => {
  test("default step of 1", () => {
    expect(canonical(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  test("explicit step", () => {
    expect(canonical(0, 10, 3)).toEqual([0, 3, 6, 9]);
  });

  test("negative bounds", () => {
    expect(canonical(-3, 3)).toEqual([-3, -2, -1, 0, 1, 2]);
  });

  test("fractional step stays within bounds", () => {
    expect(canonical(0, 1, 0.5)).toEqual([0, 0.5]);
  });

  test("equal bounds are empty", () => {
    expect(canonical(5, 5)).toEqual([]);
  });
});

describe("range: descending", () => {
  test("descending with step -1", () => {
    expect(canonical(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
  });

  test("descending with a larger step", () => {
    expect(canonical(10, 0, -3)).toEqual([10, 7, 4, 1]);
  });

  test("descending across zero", () => {
    expect(canonical(2, -3, -1)).toEqual([2, 1, 0, -1, -2]);
  });
});

describe("range: wrong direction is empty, never a loop", () => {
  test("ascending step with descending bounds", () => {
    expect(canonical(0, 10, -1)).toEqual([]);
  });

  test("descending step with ascending bounds", () => {
    expect(canonical(10, 0, 1)).toEqual([]);
  });

  test("returns promptly", () => {
    const started = Date.now();
    expect(canonical(0, 1_000_000, -1)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("range: invalid input throws", () => {
  test("non-numeric strings throw instead of hanging", () => {
    expect(() => canonical("a" as unknown as number, "b" as unknown as number)).toThrow();
  });

  test("a numeric string is still rejected", () => {
    expect(() => canonical("0" as unknown as number, 5)).toThrow();
  });

  test("NaN throws", () => {
    expect(() => canonical(NaN, 5)).toThrow();
    expect(() => canonical(0, NaN)).toThrow();
    expect(() => canonical(0, 5, NaN)).toThrow();
  });

  test("Infinity throws", () => {
    expect(() => canonical(0, Infinity)).toThrow();
    expect(() => canonical(-Infinity, 0)).toThrow();
  });

  test("step of zero throws rather than looping", () => {
    expect(() => canonical(0, 10, 0)).toThrow(/step must not be zero/);
  });

  test("the message names the offending types", () => {
    expect(() => canonical("a" as unknown as number, 5)).toThrow(/finite numbers/);
  });
});

describe("range: floating-point precision", () => {
  test("0.1 accumulation stops at the bound", () => {
    const out = canonical(0, 1, 0.1);
    expect(out.length).toBe(10);
    expect(out[0]).toBe(0);
    expect(out[9]).toBeCloseTo(0.9, 10);
  });

  test("0.3 step", () => {
    expect(canonical(0, 1, 0.3).length).toBe(4);
  });

  test("descending fractional step", () => {
    const out = canonical(1, 0, -0.25);
    expect(out).toEqual([1, 0.75, 0.5, 0.25]);
  });

  test("a bound that a step lands on exactly is excluded", () => {
    expect(canonical(0, 2, 0.5)).toEqual([0, 0.5, 1, 1.5]);
  });

  test("negative fractional bounds", () => {
    expect(canonical(-1, 0, 0.5)).toEqual([-1, -0.5]);
  });
});

describe("range: maximum length", () => {
  test("the constant is exactly 100000", () => {
    expect(MAX_RANGE_LENGTH).toBe(100_000);
  });

  test("100000 elements are produced (the boundary is inclusive)", () => {
    const out = canonical(0, 100_000);
    expect(out.length).toBe(100_000);
    expect(out[0]).toBe(0);
    expect(out[99_999]).toBe(99_999);
  });

  test("100001 elements throw (one past the boundary)", () => {
    expect(() => canonical(0, 100_001)).toThrow(/MAX_RANGE_LENGTH/);
  });

  test("the boundary is inclusive for a non-unit step too", () => {
    expect(canonical(0, 200_000, 2).length).toBe(100_000);
    expect(() => canonical(0, 200_002, 2)).toThrow(/MAX_RANGE_LENGTH/);
  });

  test("a tiny step cannot allocate past the limit", () => {
    expect(() => canonical(0, 1, 1e-9)).toThrow(/MAX_RANGE_LENGTH/);
  });

  test("the error message states the length and the cap", () => {
    expect(() => canonical(0, 100_001)).toThrow(/100001 elements exceeds MAX_RANGE_LENGTH \(100000\)/);
  });
});

describe("rangeRight", () => {
  test("mirrors range", () => {
    expect(rangeRight(0, 4)).toEqual([3, 2, 1, 0]);
  });

  test("inherits the validation", () => {
    expect(() => rangeRight("a" as unknown as number, "b" as unknown as number)).toThrow();
  });
});
