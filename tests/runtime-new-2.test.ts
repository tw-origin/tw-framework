/**
 * Tests for new runtime modules -- hardened v14 (part 2).
 */

import { test, expect, describe } from "bun:test";

// --- Store Tests ------------------------------------------------------

describe("Store", () => {
  test("defineStore creates a store with state", () => {
    const { defineStore } = require("../packages/runtime/tw/store");
    const useCounter = defineStore("counter", {
      state: () => ({ count: 0 }),
      actions: {
        increment: (state) => { state.count++; },
        decrement: (state) => { state.count--; },
      },
    });
    const store = useCounter();
    expect(store.count).toBe(0);
    store.increment();
    expect(store.count).toBe(1);
    store.decrement();
    expect(store.count).toBe(0);
  });

  test("store snapshot", () => {
    const { defineStore, snapshotAllStores } = require("../packages/runtime/tw/store");
    const useTest = defineStore("test-snap", {
      state: () => ({ value: 42 }),
    });
    useTest(); // instantiate the store -- it only registers on first use
    const snapshots = snapshotAllStores();
    expect(snapshots["test-snap"]).toBeDefined();
    expect(snapshots["test-snap"].value).toBe(42);
  });
});

// --- Event Bus Tests --------------------------------------------------

describe("Event Bus", () => {
  test("emit and receive events", () => {
    const { createEventBus } = require("../packages/runtime/tw/event-bus");
    const bus = createEventBus();
    let received = "";
    bus.on("test-event", (data: string) => { received = data; });
    bus.emit("test-event", "hello");
    expect(received).toBe("hello");
  });

  test("off removes handler", () => {
    const { createEventBus } = require("../packages/runtime/tw/event-bus");
    const bus = createEventBus();
    let count = 0;
    const handler = () => { count++; };
    bus.on("inc", handler);
    bus.emit("inc");
    expect(count).toBe(1);
    bus.off("inc", handler);
    bus.emit("inc");
    expect(count).toBe(1);
  });

  test("once triggers only once", () => {
    const { createEventBus } = require("../packages/runtime/tw/event-bus");
    const bus = createEventBus();
    let count = 0;
    bus.once("one-shot", () => { count++; });
    bus.emit("one-shot");
    bus.emit("one-shot");
    expect(count).toBe(1);
  });

  test("wildcard pattern", () => {
    const { createEventBus } = require("../packages/runtime/tw/event-bus");
    const bus = createEventBus();
    let received: string[] = [];
    bus.on("user:*", (data: unknown, event: string) => { received.push(event); });
    bus.emit("user:created", {});
    bus.emit("user:deleted", {});
    expect(received).toEqual(["user:created", "user:deleted"]);
  });
});

// --- Media Query Tests -----------------------------------------------

describe("Media Query", () => {
  test("useViewportSize returns dimensions", () => {
    const { useViewportSize } = require("../packages/runtime/tw/media-query");
    const size = useViewportSize();
    // In test env, window may exist with dimensions
    const value = size();
    expect(typeof value.width).toBe("number");
    expect(typeof value.height).toBe("number");
  });

  test("defaultBreakpoints has expected values", () => {
    const { defaultBreakpoints } = require("../packages/runtime/tw/media-query");
    expect(defaultBreakpoints.sm).toBe(640);
    expect(defaultBreakpoints.md).toBe(768);
    expect(defaultBreakpoints.lg).toBe(1024);
  });
});

// --- Form Validation Tests -------------------------------------------

describe("Form Validation", () => {
  test("required validator", () => {
    const { validators } = require("../packages/runtime/tw/form-validation");
    const required = validators.required("This field is required");
    expect(required("")).toBe("This field is required");
    expect(required("value")).toBe(true);
  });

  test("email validator", () => {
    const { validators } = require("../packages/runtime/tw/form-validation");
    expect(validators.email("not-an-email")).toBeTruthy();
    expect(validators.email("test@example.com")).toBe(true);
  });

  test("minLength validator", () => {
    const { validators } = require("../packages/runtime/tw/form-validation");
    const min3 = validators.minLength(3, "At least 3 characters");
    expect(min3("ab")).toBe("At least 3 characters");
    expect(min3("abc")).toBe(true);
    expect(min3("abcd")).toBe(true);
  });

  test("maxLength validator", () => {
    const { validators } = require("../packages/runtime/tw/form-validation");
    const max5 = validators.maxLength(5, "At most 5 characters");
    expect(max5("abcdef")).toBe("At most 5 characters");
    expect(max5("abcde")).toBe(true);
  });
});

// --- Theme Manager Tests ----------------------------------------------

describe("Theme Manager", () => {
  test("isDarkMode returns boolean", () => {
    const { isDarkMode } = require("../packages/runtime/tw/theme-manager");
    // May be true or false depending on env
    expect(typeof isDarkMode()).toBe("boolean");
  });
});

// --- Focus Trap Tests -------------------------------------------------

describe("Focus Trap", () => {
  test("createFocusTrap returns instance", () => {
    const { createFocusTrap } = require("../packages/runtime/tw/focus-trap");
    const div = document.createElement("div");
    document.body.appendChild(div);
    const trap = createFocusTrap(div);
    expect(trap.active).toBe(false);
    trap.activate();
    expect(trap.active).toBe(true);
    trap.deactivate();
    expect(trap.active).toBe(false);
    document.body.removeChild(div);
  });
});

// --- Transition Tests -------------------------------------------------

describe("Transitions", () => {
  test("createTransitionManager returns instance", () => {
    const { createTransitionManager } = require("../packages/runtime/tw/transitions");
    const tm = createTransitionManager();
    expect(tm).toBeDefined();
  });

  test("createBuiltinTransitions returns transition set", () => {
    const { createBuiltinTransitions } = require("../packages/runtime/tw/transitions");
    const transitions = createBuiltinTransitions();
    expect(transitions.fade).toBeDefined();
    expect(transitions.slide).toBeDefined();
    expect(transitions.scale).toBeDefined();
  });
});

// --- Memory Pool Tests ------------------------------------------------

describe("Memory Pool", () => {
  test("ObjectPool acquire and release", () => {
    const { ObjectPool } = require("../packages/runtime/tw/memory-pool");
    const pool = new ObjectPool(
      () => ({ id: 0, data: "" }),
      (obj) => { obj.id = 0; obj.data = ""; },
      10,
    );
    const obj1 = pool.acquire();
    expect(obj1.id).toBe(0);
    obj1.id = 42;
    pool.release(obj1);
    const obj2 = pool.acquire();
    expect(obj2.id).toBe(0); // Should be reset
  });
});

// --- Virtual List Tests -----------------------------------------------

describe("Virtual List", () => {
  test("createVirtualList returns instance", () => {
    const { createVirtualList } = require("../packages/runtime/tw/virtual-list");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const vl = createVirtualList(container, {
      itemCount: 1000,
      itemHeight: 30,
      renderItem: (index: number) => {
        const el = document.createElement("div");
        el.textContent = `Item ${index}`;
        return el;
      },
    });
    expect(vl).toBeDefined();
    document.body.removeChild(container);
  });
});
