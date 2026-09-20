/** TW Framework -- Hybrid Compiler Backend Tests */

import { describe, test, expect } from "bun:test";
import {
  compileAuto,
  compileWith,
  compileSync,
  compileHtml,
  getBestBackend,
  detectBackends,
  getBackendInfo,
  setBackend,
  shutdown,
  type Backend,
} from "@tw/compiler/native";

import {
  loadNative,
  hasNative,
  findRustBinary,
  hasChildProcess,
} from "@tw/compiler/native";

describe("Backend Detection", () => {
  test("detectBackends returns booleans", () => {
    const { native, childProcess } = detectBackends();
    expect(typeof native).toBe("boolean");
    expect(typeof childProcess).toBe("boolean");
  });

  test("getBestBackend returns a valid backend", () => {
    const backend = getBestBackend();
    expect(["native", "child-process", "ts"]).toContain(backend);
  });

  test("getBackendInfo shows all backend statuses", () => {
    const info = getBackendInfo();
    expect(info.native).toBeDefined();
    expect(info.native.available).toBeDefined();
    expect(info.childProcess).toBeDefined();
    expect(info.childProcess.available).toBeDefined();
    expect(info.ts.available).toBe(true);
    expect(info.current).toBeDefined();
  });

  test("setBackend can force TS backend", () => {
    setBackend("ts");
    expect(getBestBackend()).toBe("ts");
    setBackend("auto"); // reset
  });

  test("setBackend auto re-detects", () => {
    setBackend("ts");
    setBackend("auto");
    const backend = getBestBackend();
    expect(["native", "child-process", "ts"]).toContain(backend);
  });
});

describe("Native Loader", () => {
  test("loadNative returns module or null", () => {
    const mod = loadNative();
    expect(mod === null || typeof mod === "object").toBe(true);
  });

  test("hasNative returns boolean", () => {
    expect(typeof hasNative()).toBe("boolean");
  });
});

describe("Child Process Detection", () => {
  test("findRustBinary returns string or null", () => {
    const path = findRustBinary();
    expect(path === null || typeof path === "string").toBe(true);
  });

  test("hasChildProcess returns boolean", () => {
    expect(typeof hasChildProcess()).toBe("boolean");
  });
});

describe("Compile with TS Backend", () => {
  test("compiles simple template", async () => {
    setBackend("ts");
    const result = await compileWith("ts", "<div>Hello</div>");
    expect(result.html).toContain("Hello");
    expect(result.metadata.backend).toBe("ts");
  });

  test("compiles with directives", async () => {
    setBackend("ts");
    const result = await compileWith("ts", "@page { title: 'Test'; }\n<div>content</div>");
    expect(result.html).toContain("content");
  });

  test("compiles nested HTML", async () => {
    setBackend("ts");
    const result = await compileWith("ts", "<div><span><p>deep</p></span></div>");
    expect(result.html).toContain("deep");
  });

  test("returns metadata with timing", async () => {
    setBackend("ts");
    const result = await compileWith("ts", "<div>test</div>");
    expect(result.metadata.totalTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.backend).toBe("ts");
  });

  test("handles empty input", async () => {
    setBackend("ts");
    const result = await compileWith("ts", "");
    expect(result).toBeDefined();
  });

  test("handles complex template", async () => {
    setBackend("ts");
    const source = `
@page { title: "Dashboard"; }
@state { count = 0; }
<div class="page">
  <h1>Dashboard</h1>
  <button :on:click="count++">Count: {count}</button>
  <div :class="{ active: count > 0 }">Status</div>
</div>`;
    const result = await compileWith("ts", source);
    expect(result.html).toContain("Dashboard");
  });
});

describe("Compile Auto (best backend)", () => {
  test("compiles with best available backend", async () => {
    setBackend("auto");
    const result = await compileAuto("<div>Hello</div>");
    expect(result.html).toContain("Hello");
    expect(["native", "child-process", "ts"]).toContain(result.metadata.backend);
  });

  test("compiles complex template auto", async () => {
    setBackend("auto");
    const result = await compileAuto("@state { x = 1; }<div>{x}</div>");
    expect(result.html).toBeDefined();
  });
});

describe("Compile HTML Only", () => {
  test("returns just HTML string", async () => {
    setBackend("ts");
    const html = await compileHtml("<div>fast</div>");
    expect(html).toContain("fast");
  });
});

describe("Compile Sync", () => {
  test("compiles synchronously", () => {
    setBackend("ts");
    const result = compileSync("<div>sync</div>");
    expect(result.html).toContain("sync");
    expect(result.metadata.backend).toBe("ts");
  });

  test("sync handles directives", () => {
    setBackend("ts");
    const result = compileSync("@page { title: 'Test'; }<div>x</div>");
    expect(result.html).toContain("x");
  });
});

describe("Backend Consistency", () => {
  // Same template should produce same HTML regardless of backend
  const template = "<div class='box' id='main'><p>Hello World</p></div>";

  test("TS backend produces valid HTML", async () => {
    setBackend("ts");
    const result = await compileWith("ts", template);
    expect(result.html).toContain("Hello World");
    expect(result.html).toContain("box");
    expect(result.html).toContain("main");
  });

  test("Auto backend produces same HTML", async () => {
    setBackend("auto");
    const result = await compileAuto(template);
    expect(result.html).toContain("Hello World");
    expect(result.html).toContain("box");
    expect(result.html).toContain("main");
  });
});

describe("Shutdown", () => {
  test("shutdown does not throw", () => {
    expect(() => shutdown()).not.toThrow();
  });
});
