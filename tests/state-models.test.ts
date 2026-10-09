import { describe, test, expect } from "bun:test";
import { resolveStateModel, describeStateModel, STATE_MODELS } from "../packages/shared/tw/config/state-models.ts";
import { runWithHooks, useState, useReducer, useMemo, useRef, useEffect, disposeHooks } from "../packages/runtime/tw/hooks.ts";

// strategies.state.model: signals (default) | hooks | store.
// The hooks model provides React-style hooks for TW components.

describe("state model: resolution", () => {
  test("defaults to signals", () => {
    expect(resolveStateModel({})).toBe("signals");
    expect(resolveStateModel({ strategies: { state: { model: "bogus" } } })).toBe("signals");
  });
  test("hooks and store are read from the strategy", () => {
    expect(resolveStateModel({ strategies: { state: { model: "hooks" } } })).toBe("hooks");
    expect(resolveStateModel({ strategies: { state: { model: "store" } } })).toBe("store");
  });
});

describe("state model: renderer requirements", () => {
  test("hooks needs a React-compatible renderer", () => {
    const bad = describeStateModel("hooks", "tw-vdom");
    expect(bad.available).toBe(false);
    expect(String(bad.fix)).toContain("render.engine");
    expect(describeStateModel("hooks", "preact").available).toBe(true);
    expect(describeStateModel("hooks", "react").available).toBe(true);
  });
  test("signals and store run on every renderer", () => {
    for (const engine of ["tw-vdom", "react", "preact"]) {
      expect(describeStateModel("signals", engine).available).toBe(true);
      expect(describeStateModel("store", engine).available).toBe(true);
    }
  });
  test("every model is described", () => {
    expect(Object.keys(STATE_MODELS).sort()).toEqual(["hooks", "signals", "store"]);
  });
});

describe("hooks: state", () => {
  test("useState holds a value across renders and updates it", () => {
    const inst: any = { __twRerender: () => {} };
    runWithHooks(inst, () => {
      const [n, setN] = useState(0);
      expect(n).toBe(0);
      setN(5);
    });
    runWithHooks(inst, () => {
      const [n] = useState(0);
      expect(n).toBe(5);
    });
    disposeHooks(inst);
  });

  test("useState accepts a lazy initialiser", () => {
    const inst: any = {};
    runWithHooks(inst, () => {
      const [v] = useState(() => 42);
      expect(v).toBe(42);
    });
    disposeHooks(inst);
  });

  test("useReducer dispatches through the reducer", () => {
    const inst: any = {};
    const reducer = (s: number, a: { type: string }) => (a.type === "inc" ? s + 1 : s);
    runWithHooks(inst, () => {
      const [, dispatch] = useReducer(reducer, 0);
      dispatch({ type: "inc" });
    });
    runWithHooks(inst, () => {
      const [s] = useReducer(reducer, 0);
      expect(s).toBe(1);
    });
    disposeHooks(inst);
  });
});

describe("hooks: memo, ref, effect", () => {
  test("useMemo recomputes only when deps change", () => {
    const inst: any = {};
    let calls = 0;
    runWithHooks(inst, () => { expect(useMemo(() => { calls++; return 1; }, [1])).toBe(1); });
    runWithHooks(inst, () => { expect(useMemo(() => { calls++; return 2; }, [1])).toBe(1); });
    expect(calls).toBe(1);
    runWithHooks(inst, () => { expect(useMemo(() => { calls++; return 3; }, [2])).toBe(3); });
    expect(calls).toBe(2);
    disposeHooks(inst);
  });

  test("useRef keeps the same box", () => {
    const inst: any = {};
    let first: any;
    runWithHooks(inst, () => { first = useRef(0); first.current = 9; });
    runWithHooks(inst, () => { expect(useRef(0)).toBe(first); expect(first.current).toBe(9); });
    disposeHooks(inst);
  });

  test("useEffect runs after the render and its cleanup on dispose", () => {
    const inst: any = {};
    const log: string[] = [];
    runWithHooks(inst, () => {
      useEffect(() => { log.push("effect"); return () => log.push("cleanup"); }, []);
    });
    expect(log).toEqual(["effect"]);
    disposeHooks(inst);
    expect(log).toEqual(["effect", "cleanup"]);
  });

  test("an effect with unchanged deps does not re-run", () => {
    const inst: any = {};
    let runs = 0;
    runWithHooks(inst, () => { useEffect(() => { runs++; }, [1]); });
    runWithHooks(inst, () => { useEffect(() => { runs++; }, [1]); });
    expect(runs).toBe(1);
    disposeHooks(inst);
  });
});

describe("hooks: outside a render", () => {
  test("calling a hook outside runWithHooks throws", () => {
    expect(() => useState(0)).toThrow(/inside a component render/);
    expect(() => useRef(0)).toThrow(/inside a component render/);
  });
});
