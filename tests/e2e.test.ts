/** TW Framework -- End-to-End Tests */

import { describe, test, expect } from "bun:test";
import { compile, tokenize, parse } from "@tw/compiler";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const TMP_DIR = (typeof process !== "undefined" && process.env.TMPDIR) ? process.env.TMPDIR + "/tw-e2e-test" : "./.tw-e2e-test";

// Helper: write a .tw file to tmp dir
function writeTW(name: string, content: string): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, name + ".tw");
  writeFileSync(path, content);
  return path;
}

// Cleanup
function cleanup() {
  if (existsSync(TMP_DIR)) {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

describe("E2E: Full Compile Pipeline", () => {
  test("compiles a simple page", async () => {
    const source = `<div>Hello TW</div>`;
    const result = await compile(source);
    expect(result.html).toBeDefined();
    expect(result.html).toContain("Hello TW");
  });

  test("compiles with page directive", async () => {
    const source = `@page { title: "Home Page"; }\n<div>Home</div>`;
    const result = await compile(source);
    expect(result.html).toContain("Home");
  });

  test("compiles with state directive", async () => {
    const source = `@state { count = 0; }\n<div>{count}</div>`;
    const result = await compile(source);
    expect(result.html).toBeDefined();
  });

  test("compiles nested HTML structure", async () => {
    const source = `
<div class="container">
  <header>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
    </nav>
  </header>
  <main>
    <h1>Welcome</h1>
    <p>This is a paragraph.</p>
  </main>
  <footer>
    <p>(c) 2026</p>
  </footer>
</div>`;
    const result = await compile(source);
    expect(result.html).toContain("Welcome");
    expect(result.html).toContain("container");
    expect(result.html).toContain("footer");
  });

  test("compiles component usage", async () => {
    const source = `
@import { Button } from './Button.tw'
<div>
  <Button label="Click Me" />
</div>`;
    const result = await compile(source);
    expect(result.html).toBeDefined();
  });

  test("compiles control flow - if", async () => {
    const source = `
@state { show = true; }
<div>
  <if cond="{show}">
    <p>Visible</p>
  </if>
</div>`;
    const result = await compile(source);
    expect(result.html).toBeDefined();
  });

  test("compiles control flow - for", async () => {
    const source = `
@state { items = ['a', 'b', 'c']; }
<ul>
  <for item in {items}>
    <li>{item}</li>
  </for>
</ul>`;
    const result = await compile(source);
    expect(result.html).toBeDefined();
  });

  test("compiles with style block", async () => {
    const source = `
<div class="box">Styled</div>
<style scoped>
.box { color: red; padding: 10px; }
</style>`;
    const result = await compile(source);
    expect(result.html).toContain("Styled");
    expect(result.css).toBeDefined();
  });

  test("compiles with script block", async () => {
    const source = `
<div id="app">Loading...</div>
<script>
console.log("mounted");
</script>`;
    const result = await compile(source);
    expect(result.html).toContain("Loading");
    expect(result.js).toBeDefined();
  });

  test("compiles event bindings", async () => {
    const source = `
@state { count = 0; }
<button :on:click="count++">Count: {count}</button>`;
    const result = await compile(source);
    expect(result.html).toContain("Count:");
  });

  test("compiles property bindings", async () => {
    const source = `
@state { isActive = true; }
<div :class="{ active: isActive }">Bound</div>`;
    const result = await compile(source);
    expect(result.html).toContain("Bound");
  });

  test("compiles multiple directives", async () => {
    const source = `
@page { title: "Dashboard"; description: "Admin panel"; }
@state { user = "admin"; count = 0; }
@import { Sidebar } from './Sidebar.tw'
@layout "dashboard"
<div>
  <Sidebar />
  <main>Hello {user}</main>
</div>`;
    const result = await compile(source);
    expect(result.html).toContain("Hello");
  });

  test("produces diagnostics for errors", async () => {
    const source = `<div>test</div>`;
    const result = await compile(source, { diagnostics: true });
    expect(result.diagnostics).toBeDefined();
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });

  test("handles empty input gracefully", async () => {
    const result = await compile("");
    expect(result).toBeDefined();
    expect(result.html).toBeDefined();
  });

  test("handles whitespace-only input", async () => {
    const result = await compile("   \n\t  ");
    expect(result).toBeDefined();
  });

  test("compile metadata includes timing", async () => {
    const result = await compile("<div>test</div>");
    expect(result.metadata).toBeDefined();
    expect(result.metadata.totalTime).toBeGreaterThanOrEqual(0);
  });
});

describe("E2E: File-based Compilation", () => {
  test("compiles .tw file from disk", async () => {
    const path = writeTW("simple", "<div>From file</div>");
    const source = await Bun.file(path).text();
    const result = await compile(source, { filePath: path });
    expect(result.html).toContain("From file");
    cleanup();
  });

  test("compiles complex page from disk", async () => {
    const path = writeTW("complex", `
@page { title: "Test Page"; }
@state { items = ['apple', 'banana', 'cherry']; }
<div class="page">
  <h1>Test Page</h1>
  <ul>
    <for item in {items}>
      <li class="item">{item}</li>
    </for>
  </ul>
</div>
<style scoped>
.page { max-width: 800px; margin: 0 auto; }
.item { padding: 8px; }
</style>`);
    const source = await Bun.file(path).text();
    const result = await compile(source, { filePath: path });
    expect(result.html).toContain("Test Page");
    cleanup();
  });
});

describe("E2E: Lexer -> Parser -> Codegen Chain", () => {
  test("full pipeline produces valid output", async () => {
    const source = "<div class='container'><p>Hello</p></div>";

    // Step 1: Tokenize
    const tokens = tokenize(source);
    expect(tokens.length).toBeGreaterThan(0);

    // Step 2: Parse
    const program = parse(source);
    expect(program.body.length).toBe(1);

    // Step 3: Compile (includes codegen)
    const result = await compile(source);
    expect(result.html).toContain("Hello");
    expect(result.html).toContain("container");
  });

  test("pipeline handles complex template", async () => {
    const source = `
@page { title: "Complex"; }
@state { count = 42; name = "TW"; }
<div>
  <header>
    <h1>{name}</h1>
  </header>
  <main>
    <p>Count: {count}</p>
    <button :on:click="count++">Increment</button>
  </main>
</div>`;

    const tokens = tokenize(source);
    expect(tokens.length).toBeGreaterThan(5);

    const program = parse(source);
    expect(program.body.length).toBeGreaterThan(0);

    const result = await compile(source);
    expect(result.html).toBeDefined();
  });
});

describe("E2E: Output Structure", () => {
  test("compile result has all required fields", async () => {
    const result = await compile("<div>test</div>");
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("css");
    expect(result).toHaveProperty("js");
    expect(result).toHaveProperty("diagnostics");
    expect(result).toHaveProperty("metadata");
  });

  test("CSS is string", async () => {
    const result = await compile("<div>test</div>");
    expect(typeof result.css).toBe("string");
  });

  test("JS is string", async () => {
    const result = await compile("<div>test</div>");
    expect(typeof result.js).toBe("string");
  });

  test("diagnostics is array", async () => {
    const result = await compile("<div>test</div>", { diagnostics: true });
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });

  test("metadata has timing fields", async () => {
    const result = await compile("<div>test</div>");
    expect(result.metadata).toHaveProperty("totalTime");
  });
});
