/**
 * Tests for Phase 3 runtime features:
 * - Scheduler
 * - Event Delegation
 * - Hydration
 * - Dependency Graph (Reactivity)
 * - Component System
 * - Compression
 * - Security Headers
 * - Code Splitter
 */

import { describe, test, expect } from "bun:test";

// --- Scheduler Tests -------------------------------------------------

describe("Scheduler", () => {
  test("schedule() queues a job for the next frame", () => {
    const { schedule, flushSync, reset } = require("../packages/runtime/tw/scheduler");
    reset();
    let ran = false;
    schedule(() => { ran = true; }, "high");
    flushSync();
    expect(ran).toBe(true);
  });

  test("cancel() removes a scheduled job", () => {
    const { schedule, cancel, flushSync, reset } = require("../packages/runtime/tw/scheduler");
    reset();
    let ran = false;
    const id = schedule(() => { ran = true; }, "normal");
    cancel(id);
    flushSync();
    expect(ran).toBe(false);
  });

  test("high priority runs before low priority", () => {
    const { schedule, flushSync, reset } = require("../packages/runtime/tw/scheduler");
    reset();
    const order: string[] = [];
    schedule(() => { order.push("low"); }, "low");
    schedule(() => { order.push("high"); }, "high");
    schedule(() => { order.push("normal"); }, "normal");
    flushSync();
    expect(order.indexOf("high")).toBeLessThanOrEqual(order.indexOf("normal"));
  });

  test("getStats() returns scheduler statistics", () => {
    const { schedule, flushSync, getStats, reset } = require("../packages/runtime/tw/scheduler");
    reset();
    schedule(() => {}, "high");
    schedule(() => {}, "normal");
    flushSync();
    const stats = getStats();
    expect(stats.totalJobsRun).toBeGreaterThan(0);
  });

  test("nextTick() schedules a low priority job", () => {
    const { nextTick, flushSync, reset } = require("../packages/runtime/tw/scheduler");
    reset();
    let ran = false;
    nextTick(() => { ran = true; });
    flushSync();
    expect(ran).toBe(true);
  });

  test("batch updates with coalescing", () => {
    const { schedule, flushSync, reset, getStats } = require("../packages/runtime/tw/scheduler");
    reset();
    let renderCount = 0;
    const renderFn = () => { renderCount++; };
    // Schedule multiple updates for same component
    schedule(renderFn, "normal", "comp1");
    schedule(renderFn, "normal", "comp1");
    schedule(renderFn, "normal", "comp1");
    flushSync();
    // Should coalesce -- only one render runs
    expect(renderCount).toBe(1);
  });
});

// --- Event Delegation Tests ------------------------------------------

describe("Event Delegation", () => {
  test("parseEventModifiers parses common modifiers", () => {
    const { parseEventModifiers } = require("../packages/runtime/tw/event-delegation");
    const { event, options } = parseEventModifiers("click.stop.prevent");
    expect(event).toBe("click");
    expect(options.stop).toBe(true);
    expect(options.prevent).toBe(true);
  });

  test("parseEventModifiers parses key modifiers", () => {
    const { parseEventModifiers } = require("../packages/runtime/tw/event-delegation");
    const { event, options } = parseEventModifiers("keydown.enter");
    expect(event).toBe("keydown");
    expect(options.keys).toContain("enter");
  });

  test("parseEventModifiers parses throttle and debounce", () => {
    const { parseEventModifiers } = require("../packages/runtime/tw/event-delegation");
    const { options } = parseEventModifiers("input.debounce:300");
    expect(options.debounce).toBe(300);
  });

  test("parseEventModifiers parses once modifier", () => {
    const { parseEventModifiers } = require("../packages/runtime/tw/event-delegation");
    const { options } = parseEventModifiers("click.once");
    expect(options.once).toBe(true);
  });

  test("parseEventModifiers parses self modifier", () => {
    const { parseEventModifiers } = require("../packages/runtime/tw/event-delegation");
    const { options } = parseEventModifiers("click.self");
    expect(options.self).toBe(true);
  });

  test("buildSelector creates data attribute selector", () => {
    const { buildSelector } = require("../packages/runtime/tw/event-delegation");
    const selector = buildSelector("click", "increment");
    expect(selector).toBe('[data-click="increment"]');
  });
});

// --- Reactivity (Dependency Graph) Tests -----------------------------

describe("Reactivity -- Dependency Graph", () => {
  test("signal() creates a reactive signal", () => {
    const { signal } = require("../packages/runtime/tw/dependency-graph");
    const count = signal(0);
    expect(count()).toBe(0);
    count.set(5);
    expect(count()).toBe(5);
  });

  test("signal.update() updates value with function", () => {
    const { signal } = require("../packages/runtime/tw/dependency-graph");
    const count = signal(10);
    count.update(n => n + 1);
    expect(count()).toBe(11);
  });

  test("signal.peek() reads without tracking", () => {
    const { signal, effect } = require("../packages/runtime/tw/dependency-graph");
    const count = signal(0);
    let runs = 0;
    effect(() => {
      count.peek();
      runs++;
    });
    count.set(5);
    // peek() should not create a dependency
    expect(runs).toBe(1);
  });

  test("effect() re-runs when dependency changes", () => {
    const { signal, effect } = require("../packages/runtime/tw/dependency-graph");
    const count = signal(0);
    let observed = -1;
    effect(() => {
      observed = count();
    });
    expect(observed).toBe(0);
    count.set(42);
    expect(observed).toBe(42);
  });

  test("computed() caches value", () => {
    const { signal, computed } = require("../packages/runtime/tw/dependency-graph");
    const count = signal(5);
    let computeCount = 0;
    const double = computed(() => {
      computeCount++;
      return count() * 2;
    });
    expect(double()).toBe(10);
    expect(double()).toBe(10);
    expect(computeCount).toBe(1); // Cached
    count.set(10);
    expect(double()).toBe(20);
    expect(computeCount).toBe(2); // Recomputed
  });

  test("batch() groups multiple updates", () => {
    const { signal, effect, batch } = require("../packages/runtime/tw/dependency-graph");
    const a = signal(1);
    const b = signal(2);
    let sum = 0;
    let runs = 0;
    effect(() => {
      sum = a() + b();
      runs++;
    });
    expect(runs).toBe(1);
    batch(() => {
      a.set(10);
      b.set(20);
    });
    expect(sum).toBe(30);
    expect(runs).toBe(2); // Only one re-run for both changes
  });

  test("ref() creates a ref with .value", () => {
    const { ref } = require("../packages/runtime/tw/dependency-graph");
    const count = ref(0);
    expect(count.value).toBe(0);
    count.value = 5;
    expect(count.value).toBe(5);
  });

  test("reactive() creates a reactive proxy", () => {
    const { reactive, effect } = require("../packages/runtime/tw/dependency-graph");
    const state = reactive({ count: 0, name: "TW" });
    let observed = "";
    effect(() => {
      observed = `${state.name}: ${state.count}`;
    });
    expect(observed).toBe("TW: 0");
    state.count = 5;
    expect(observed).toBe("TW: 5");
  });

  test("watch() calls callback on change", () => {
    const { signal, watch } = require("../packages/runtime/tw/dependency-graph");
    const count = signal(0);
    let newval = -1;
    let oldval = -1;
    const unwatch = watch(count, (n, o) => {
      newval = n;
      oldval = o;
    });
    count.set(42);
    expect(newval).toBe(42);
    expect(oldval).toBe(0);
    unwatch();
    count.set(100);
    expect(newval).toBe(42); // Unwatched
  });

  test("isSignal() identifies signals", () => {
    const { signal, isSignal } = require("../packages/runtime/tw/dependency-graph");
    const s = signal(0);
    expect(isSignal(s)).toBe(true);
    expect(isSignal(42)).toBe(false);
    expect(isSignal("hello")).toBe(false);
  });

  test("untrack() prevents dependency tracking", () => {
    const { signal, effect, untrack } = require("../packages/runtime/tw/dependency-graph");
    const a = signal(1);
    const b = signal(2);
    let observed = 0;
    let runs = 0;
    effect(() => {
      observed = a() + untrack(() => b());
      runs++;
    });
    expect(runs).toBe(1);
    b.set(10);
    expect(runs).toBe(1); // b is untracked, no re-run
    a.set(5);
    expect(runs).toBe(2); // a is tracked
    expect(observed).toBe(15);
  });

  test("ReactiveScope dispose() cleans up effects", () => {
    const { signal, createScope, effect } = require("../packages/runtime/tw/dependency-graph");
    const scope = createScope();
    const count = signal(0);
    let runs = 0;
    scope.track(effect(() => {
      count();
      runs++;
    }));
    count.set(5);
    expect(runs).toBe(2);
    scope.dispose();
    count.set(10);
    expect(runs).toBe(2); // No more runs after dispose
  });
});

// --- Hydration Tests --------------------------------------------------

describe("Hydration", () => {
  test("serializeHydrationData serializes data to JSON", () => {
    const { serializeHydrationData } = require("../packages/runtime/tw/hydration");
    const data = { nodes: [{ id: "n1", path: "0", tag: "div" }] };
    const json = serializeHydrationData(data);
    expect(typeof json).toBe("string");
    expect(json).toContain("n1");
  });

  test("deserializeHydrationData deserializes JSON", () => {
    const { deserializeHydrationData } = require("../packages/runtime/tw/hydration");
    const json = '{"nodes":[{"id":"n1","path":"0","tag":"div"}]}';
    const data = deserializeHydrationData(json);
    expect(data).not.toBeNull();
    expect(data!.nodes.length).toBe(1);
    expect(data!.nodes[0].id).toBe("n1");
  });

  test("deserializeHydrationData returns null for invalid JSON", () => {
    const { deserializeHydrationData } = require("../packages/runtime/tw/hydration");
    const data = deserializeHydrationData("not json");
    expect(data).toBeNull();
  });

  test("generateHydrationScript creates a script tag", () => {
    const { generateHydrationScript } = require("../packages/runtime/tw/hydration");
    const script = generateHydrationScript(
      { nodes: [{ id: "n1", path: "0", tag: "div" }] },
      { count: 5 }
    );
    expect(script).toContain("<script>");
    expect(script).toContain("__TW_HYDRATION_DATA__");
    expect(script).toContain("__TW_STATE__");
    expect(script).toContain("</script>");
  });
});

// --- Compression Tests -----------------------------------------------

describe("Compression", () => {
  test("shouldCompress returns true for text/html", () => {
    const { shouldCompress } = require("../packages/server/tw/compression");
    expect(shouldCompress("text/html")).toBe(true);
    expect(shouldCompress("text/css")).toBe(true);
    expect(shouldCompress("application/json")).toBe(true);
  });

  test("shouldCompress returns false for images", () => {
    const { shouldCompress } = require("../packages/server/tw/compression");
    expect(shouldCompress("image/png")).toBe(false);
    expect(shouldCompress("image/jpeg")).toBe(false);
  });

  test("isLargeEnough returns false for small data", () => {
    const { isLargeEnough } = require("../packages/server/tw/compression");
    expect(isLargeEnough(100)).toBe(false);
    expect(isLargeEnough(2048)).toBe(true);
  });

  test("negotiateEncoding selects best encoding", () => {
    const { negotiateEncoding } = require("../packages/server/tw/compression");
    expect(negotiateEncoding("gzip, deflate, br")).toBe("brotli");
    expect(negotiateEncoding("gzip")).toBe("gzip");
    expect(negotiateEncoding("deflate")).toBe("deflate");
    expect(negotiateEncoding("")).toBeNull();
  });

  test("createCompressionHeaders returns correct headers", () => {
    const { createCompressionHeaders } = require("../packages/server/tw/compression");
    const headers = createCompressionHeaders("gzip", 1000, 300);
    expect(headers["Content-Encoding"]).toBe("gzip");
    expect(headers["Vary"]).toBe("Accept-Encoding");
    expect(headers["X-Original-Size"]).toBe("1000");
    expect(headers["X-Compressed-Size"]).toBe("300");
  });

  test("StreamingCompressor collects chunks", () => {
    const { StreamingCompressor } = require("../packages/server/tw/compression");
    const compressor = new StreamingCompressor("gzip");
    compressor.push("hello ");
    compressor.push("world");
    expect(compressor.uncompressedSize).toBe(11);
  });
});

// --- Security Headers Tests ------------------------------------------

describe("Security Headers", () => {
  test("buildCSPHeader builds CSP from directives", () => {
    const { buildCSPHeader } = require("../packages/server/tw/security-headers");
    const csp = buildCSPHeader({
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "object-src": ["'none'"],
    });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
  });

  test("buildHSTSHeader builds HSTS header", () => {
    const { buildHSTSHeader } = require("../packages/server/tw/security-headers");
    const hsts = buildHSTSHeader({ maxAge: 31536000, includeSubDomains: true, preload: true });
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  });

  test("generateSecurityHeaders generates all headers", () => {
    const { generateSecurityHeaders } = require("../packages/server/tw/security-headers");
    const headers = generateSecurityHeaders({
      hsts: { maxAge: 31536000 },
      frameOptions: "DENY",
      contentTypeOptions: true,
    });
    expect(headers["Content-Security-Policy"]).toBeDefined();
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
  });

  test("createDevCSP includes unsafe-inline for development", () => {
    const { createDevCSP, buildCSPHeader } = require("../packages/server/tw/security-headers");
    const devCSP = createDevCSP();
    const cspStr = buildCSPHeader(devCSP);
    expect(cspStr).toContain("'unsafe-inline'");
    expect(cspStr).toContain("localhost");
  });

  test("createProdCSP does not include unsafe-inline", () => {
    const { createProdCSP, buildCSPHeader } = require("../packages/server/tw/security-headers");
    const prodCSP = createProdCSP();
    const cspStr = buildCSPHeader(prodCSP);
    expect(cspStr).not.toContain("'unsafe-inline'");
    expect(cspStr).not.toContain("'unsafe-eval'");
  });

  test("buildPermissionsPolicyHeader builds policy", () => {
    const { buildPermissionsPolicyHeader } = require("../packages/server/tw/security-headers");
    const policy = buildPermissionsPolicyHeader({
      camera: [],
      microphone: [],
      geolocation: ["'self'"],
    });
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("geolocation=('self')");
  });

  test("generateNonce produces a string", () => {
    const { generateNonce } = require("../packages/server/tw/security-headers");
    const nonce = generateNonce();
    expect(typeof nonce).toBe("string");
    expect(nonce.length).toBeGreaterThan(0);
  });

  test("generateNonceForCSP adds nonce to script-src", () => {
    const { generateNonceForCSP, createProdCSP } = require("../packages/server/tw/security-headers");
    const { nonce, csp } = generateNonceForCSP(createProdCSP());
    expect(typeof nonce).toBe("string");
    expect(csp["script-src"]).toContain(`'nonce-${nonce}'`);
  });
});

// --- Code Splitter Tests ---------------------------------------------


// --- Component System Tests ------------------------------------------

describe("Component System", () => {
  test("memo() caches based on props", () => {
    const { memo, h } = require("../packages/runtime/tw/component");
    let renderCount = 0;
    const Comp = memo((props: { value: number }) => {
      renderCount++;
      return h("div", {}, String(props.value));
    });
    const result1 = Comp({ value: 1 });
    const result2 = Comp({ value: 1 }); // Same props -- cached
    expect(renderCount).toBe(1);
    const result3 = Comp({ value: 2 }); // Different props -- re-render
    expect(renderCount).toBe(2);
  });

  test("h() creates element VNode", () => {
    const { h } = require("../packages/runtime/tw/component");
    const vnode = h("div", { class: "container" }, "Hello");
    expect(vnode.type).toBe("element");
    expect(vnode.tag).toBe("div");
    expect(vnode.props).toEqual({ class: "container" });
    expect(vnode.children).toHaveLength(1);
  });

  test("createRef() creates a ref object", () => {
    const { createRef } = require("../packages/runtime/tw/component");
    const ref = createRef();
    expect(ref).toBeDefined();
    expect(ref.current).toBeNull();
  });

  test("registerComponent and getComponent work", () => {
    const { registerComponent, getComponent, isRegisteredComponent, TWComponent } = require("../packages/runtime/tw/component");
    class TestComp extends TWComponent {
      render() { return null; }
    }
    registerComponent("TestComp", TestComp as any);
    expect(isRegisteredComponent("TestComp")).toBe(true);
    expect(getComponent("TestComp")).toBe(TestComp);
    expect(isRegisteredComponent("NonExistent")).toBe(false);
  });
});
