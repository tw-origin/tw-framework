/** TW Framework -- Runtime Tests */

import { describe, test, expect } from "bun:test";
import { createVNode, createTextVNode, diff, reactive, ref, computed } from "@tw/runtime";

describe("VDOM", () => {
  test("createVNode should create element vnode", () => {
    const vnode = createVNode("div", { id: "test" }, []);
    expect(vnode.type).toBe("element");
    expect(vnode.tag).toBe("div");
    expect(vnode.props).toBeDefined();
    expect(vnode.children).toBeDefined();
  });

  test("createTextVNode should create text node", () => {
    const vnode = createTextVNode("hello");
    expect(vnode.type).toBe("text");
    expect(vnode.text).toBe("hello");
  });

  test("diff should detect no changes", () => {
    const old = createVNode("div", {}, [createTextVNode("hello")]);
    const next = createVNode("div", {}, [createTextVNode("hello")]);
    const patches = diff(old, next);
    expect(patches).toBeDefined();
  });

  test("diff should detect text changes", () => {
    const old = createVNode("div", {}, [createTextVNode("hello")]);
    const next = createVNode("div", {}, [createTextVNode("world")]);
    const patches = diff(old, next);
    expect(patches).toBeDefined();
  });
});

describe("Reactivity", () => {
  test("ref should hold value", () => {
    const count = ref(0);
    expect(count.value).toBe(0);
    count.value = 5;
    expect(count.value).toBe(5);
  });

  test("computed should calculate derived value", () => {
    const a = ref(2);
    const b = ref(3);
    const sum = computed(() => a.value + b.value);
    expect(sum()).toBe(5);
    a.value = 10;
    expect(sum()).toBe(13);
  });

  test("reactive should track object changes", () => {
    const state = reactive({ count: 0, name: "test" });
    expect(state.count).toBe(0);
    state.count = 10;
    expect(state.count).toBe(10);
  });
});
