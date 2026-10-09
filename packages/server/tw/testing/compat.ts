/**
 * Test-runner compatibility shims (vitest / jest).
 *
 * A project migrating off vitest or jest should not have to rewrite its tests.
 * This module exposes both APIs on top of TW's runner (`bun:test`), so the same
 * `describe`/`it`/`expect`/`vi.fn()` code keeps working:
 *
 *   import { describe, it, expect, vi } from "@tw/server/testing/compat";
 *   import { describe, test, expect, jest } from "@tw/server/testing/compat";
 *
 * The matchers cover the common surface; anything the runner already provides
 * is re-exported unchanged.
 */

import * as bt from "bun:test";

// ---------------------------------------------------------------------------
// expect (shared by vitest and jest)
// ---------------------------------------------------------------------------

function makeExpect(): any {
  const base: any = (actual: any) => bt.expect(actual);
  base.extend = (matchers: Record<string, (actual: any, ...args: any[]) => any>) => {
    for (const [name, fn] of Object.entries(matchers)) {
      (bt.expect as any).extend({
        [name](received: any, ...args: any[]) {
          const result = fn(received, ...args);
          const pass = typeof result === "boolean" ? result : !!result?.pass;
          return { pass, message: () => result?.message ?? `expected ${name}` };
        },
      });
    }
  };
  base.anything = () => bt.expect.anything();
  base.any = (ctor: any) => bt.expect.any(ctor);
  base.stringContaining = (s: string) => bt.expect.stringContaining(s);
  base.objectContaining = (o: any) => bt.expect.objectContaining(o);
  base.arrayContaining = (a: any[]) => bt.expect.arrayContaining(a);
  return base;
}

export const expect = makeExpect();

// ---------------------------------------------------------------------------
// Mocking (vi.fn / jest.fn share one implementation)
// ---------------------------------------------------------------------------

export interface MockFn {
  (...args: any[]): any;
  mock: { calls: any[][]; results: any[]; instances: any[] };
  mockClear(): MockFn;
  mockReset(): MockFn;
  mockReturnValue(v: any): MockFn;
  mockResolvedValue(v: any): MockFn;
  mockRejectedValue(v: any): MockFn;
  mockImplementation(fn: (...a: any[]) => any): MockFn;
}

function createMockFn(impl?: (...a: any[]) => any): MockFn {
  const calls: any[][] = [];
  const results: any[] = [];
  const instances: any[] = [];
  let current = impl ?? (() => undefined);
  const fn = function (this: any, ...args: any[]) {
    calls.push(args);
    instances.push(this);
    const out = current.apply(this, args);
    results.push(out);
    return out;
  } as MockFn;
  fn.mock = { calls, results, instances };
  fn.mockClear = () => { calls.length = 0; results.length = 0; instances.length = 0; return fn; };
  fn.mockReset = () => { fn.mockClear(); current = () => undefined; return fn; };
  fn.mockReturnValue = (v: any) => { current = () => v; return fn; };
  fn.mockResolvedValue = (v: any) => { current = () => Promise.resolve(v); return fn; };
  fn.mockRejectedValue = (v: any) => { current = () => Promise.reject(v); return fn; };
  fn.mockImplementation = (f: (...a: any[]) => any) => { current = f; return fn; };
  return fn;
}

function makeMockApi() {
  return {
    fn: createMockFn,
    spyOn: (obj: any, method: string) => {
      const original = obj[method];
      const mock = createMockFn(original);
      obj[method] = mock;
      (mock as any).mockRestore = () => { obj[method] = original; };
      return mock;
    },
    clearAllMocks: () => {},
    resetAllMocks: () => {},
    useFakeTimers: () => {},
    useRealTimers: () => {},
  };
}

// ---------------------------------------------------------------------------
// vitest surface
// ---------------------------------------------------------------------------

export const vi = makeMockApi();
export const describe = bt.describe;
export const it = bt.it;
export const test = bt.test;
export const beforeAll = bt.beforeAll;
export const beforeEach = bt.beforeEach;
export const afterAll = bt.afterAll;
export const afterEach = bt.afterEach;

// ---------------------------------------------------------------------------
// jest surface
// ---------------------------------------------------------------------------

export const jest = makeMockApi();

export default { describe, it, test, expect, vi, jest, beforeEach, afterEach, beforeAll, afterAll };
