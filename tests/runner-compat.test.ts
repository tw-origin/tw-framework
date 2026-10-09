import { describe, test, expect as btExpect } from "bun:test";
import { describe as vDescribe, it, test as vTest, expect, vi, jest } from "../packages/server/tw/testing/compat.ts";

// vitest / jest compatibility shims over TW's runner.

describe("runner compat: vitest surface", () => {
  test("describe/it/expect are wired to the runner", () => {
    expect(typeof vDescribe).toBe("function");
    expect(typeof it).toBe("function");
    expect(typeof vTest).toBe("function");
    expect(expect(2 + 2).toBe).toBeDefined();
  });

  test("vi.fn records calls and returns values", () => {
    const fn = vi.fn((a: number) => a * 2);
    btExpect(fn(3)).toBe(6);
    btExpect(fn(4)).toBe(8);
    btExpect(fn.mock.calls.length).toBe(2);
    btExpect(fn.mock.calls[0]).toEqual([3]);
  });

  test("vi.fn supports return / resolved / rejected", async () => {
    const r = vi.fn().mockReturnValue("x");
    btExpect(r()).toBe("x");
    const p = vi.fn().mockResolvedValue("ok");
    btExpect(await p()).toBe("ok");
    const e = vi.fn().mockRejectedValue(new Error("no"));
    await btExpect(e()).rejects.toThrow(/no/);
  });

  test("vi.spyOn wraps and restores a method", () => {
    const obj = { greet: (n: string) => `hi ${n}` };
    const spy = vi.spyOn(obj, "greet");
    obj.greet("Ada");
    btExpect(spy.mock.calls.length).toBe(1);
    (spy as any).mockRestore();
    btExpect(obj.greet("Ada")).toBe("hi Ada");
  });

  test("expect.extend adds a custom matcher", () => {
    expect.extend({
      toBeEven(received: number) {
        return { pass: received % 2 === 0, message: () => "not even" };
      },
    });
    expect(4).toBeEven();
  });
});

describe("runner compat: jest surface", () => {
  test("jest.fn mirrors vi.fn", () => {
    const fn = jest.fn().mockReturnValue(42);
    btExpect(fn()).toBe(42);
    btExpect(fn.mock.calls.length).toBe(1);
  });
  test("jest.spyOn mirrors vi.spyOn", () => {
    const o = { add: (a: number, b: number) => a + b };
    const spy = jest.spyOn(o, "add");
    btExpect(o.add(1, 2)).toBe(3);
    btExpect(spy.mock.calls[0]).toEqual([1, 2]);
    (spy as any).mockRestore();
  });
  test("mockClear empties recorded calls", () => {
    const fn = vi.fn();
    fn(1); fn(2);
    fn.mockClear();
    btExpect(fn.mock.calls.length).toBe(0);
  });
});
