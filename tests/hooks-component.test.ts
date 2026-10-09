import { describe, test, expect } from "bun:test";
import { defineComponent } from "../packages/runtime/tw/component.ts";
import { h } from "../packages/runtime/tw/render.ts";
import { useState, useMemo, useReducer, useRef, useEffect, runEffects } from "../packages/runtime/tw/hooks.ts";

// strategies.state.model = "hooks": a component's `setup` can call the hooks,
// and a hook's state change re-renders the component (the `__twRerender`
// bridge). Effects are queued, not run, during SSR.

describe("hooks in a component: setup", () => {
  test("useState in setup renders its initial value", () => {
    const C = defineComponent({
      setup() {
        const [n] = useState(3);
        return () => h("div", null, `n=${n}`);
      },
    });
    const inst: any = (C as any)({});
    // defineComponent returns a VNode tree; render to HTML for the assertion.
    const { renderToString } = require("../packages/runtime/tw/render.ts");
    expect(renderToString(inst)).toContain("n=3");
  });

  test("useMemo computes once and caches by deps", () => {
    let calls = 0;
    const C = defineComponent({
      setup() {
        const v = useMemo(() => { calls++; return 41 + 1; }, [1]);
        return () => h("p", null, `v=${v}`);
      },
    });
    (C as any)({});
    expect(calls).toBe(1);
  });

  test("useRef keeps a stable box across renders", () => {
    const seen: any[] = [];
    const C = defineComponent({
      setup() {
        const r = useRef(0);
        seen.push(r);
        r.current++;
        return () => h("span", null, `${r.current}`);
      },
    });
    (C as any)({});
    expect(seen[0].current).toBe(1);
  });

  test("hooks outside a render still throw", () => {
    expect(() => useState(1)).toThrow(/render/);
  });
});

describe("hooks in a component: re-render", () => {
  test("a state setter re-renders and notifies onUpdate", () => {
    let setter: any;
    const updates: string[] = [];
    const C = defineComponent({
      setup() {
        const [n, setN] = useState(0);
        setter = setN;
        return () => h("b", null, `count:${n}`);
      },
    });
    const inst: any = (C as any)({});
    const { renderToString } = require("../packages/runtime/tw/render.ts");
    expect(renderToString(inst)).toContain("count:0");
    // Wire the re-render bridge the way a client renderer would.
    const hookInstance = inst.__instance;
    expect(hookInstance).toBeDefined();
    hookInstance.onUpdate = (tree: any) => updates.push(renderToString(tree));
    setter(5);
    expect(updates.at(-1)).toContain("count:5");
  });

  test("useReducer dispatch re-renders through the same bridge", () => {
    let dispatch: any;
    const C = defineComponent({
      setup() {
        const [s, d] = useReducer((state: number, action: number) => state + action, 10);
        dispatch = d;
        return () => h("i", null, `r=${s}`);
      },
    });
    const inst: any = (C as any)({});
    const { renderToString } = require("../packages/runtime/tw/render.ts");
    let seen = "";
    inst.__instance.onUpdate = (tree: any) => { seen = renderToString(tree); };
    dispatch(5);
    expect(seen).toContain("r=15");
  });
});

describe("hooks in a component: effects", () => {
  test("useEffect is queued but not run during SSR render", () => {
    let ran = false;
    const C = defineComponent({
      setup() {
        useEffect(() => { ran = true; });
        return () => h("div", null, "x");
      },
    });
    (C as any)({});
    expect(ran).toBe(false);
  });
});
