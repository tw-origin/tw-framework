import { describe, test, expect } from "bun:test";
import { compileSCSS } from "../packages/compiler/tw/codegen/scss.ts";
import { detectTailwind, runTailwind } from "../packages/compiler/tw/codegen/tailwind.ts";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The styling engines behind strategies.css.engine: TW's own TSS, plain CSS,
// the SCSS compiler, and Tailwind.

describe("scss: control flow", () => {
  test("@for through is inclusive, @for to is exclusive", () => {
    const inc = compileSCSS("@for $i from 1 through 3 { .c#{$i} { z-index: $i; } }");
    expect(inc).toContain(".c1"); expect(inc).toContain(".c3");
    const exc = compileSCSS("@for $i from 1 to 3 { .r#{$i} { z-index: $i; } }");
    expect(exc).toContain(".r1"); expect(exc).toContain(".r2"); expect(exc).not.toContain(".r3");
  });
  test("@for loop variable feeds arithmetic", () => {
    const out = compileSCSS("@for $i from 1 through 3 { .col-#{$i} { width: $i * 10px; } }");
    expect(out).toContain("width: 10px"); expect(out).toContain("width: 30px");
  });
  test("@while repeats until the condition is false", () => {
    const out = compileSCSS("$i: 1; @while $i <= 3 { .w#{$i} { top: $i * 1px; } $i: $i + 1; }");
    expect(out).toContain(".w1"); expect(out).toContain(".w3"); expect(out).toContain("top: 3px");
  });
});

describe("scss: functions and extend", () => {
  test("@function with @return is callable", () => {
    expect(compileSCSS("@function double($n) { @return $n * 2; } .a { width: double(5px); }")).toContain("width: 10px");
  });
  test("@function respects parameter defaults", () => {
    expect(compileSCSS("@function pad($n: 4px) { @return $n; } .a { padding: pad(); }")).toContain("padding: 4px");
  });
  test("@extend joins the extending selector onto the target", () => {
    const out = compileSCSS(".base { color: red; } .btn { @extend .base; padding: 2px; }");
    expect(out).toContain(".base, .btn"); expect(out).toContain("color: red"); expect(out).toContain("padding: 2px");
  });
});

describe("scss: variables, maps and lists", () => {
  test("!default keeps an already-set variable", () => {
    expect(compileSCSS("$c: blue; $c: red !default; .d { color: $c; }")).toContain("color: blue");
    expect(compileSCSS("$c: red !default; .d { color: $c; }")).toContain("color: red");
  });
  test("map-get reads a map literal", () => {
    expect(compileSCSS("$m: (a: 1, b: 2); .x { z-index: map-get($m, b); }")).toContain("z-index: 2");
  });
  test("nth and length operate on lists", () => {
    const out = compileSCSS("$l: 10px 20px 30px; .y { padding: nth($l, 2); margin: length($l); }");
    expect(out).toContain("padding: 20px"); expect(out).toContain("margin: 3");
  });
});

describe("scss: warning accuracy", () => {
  test("supported at-rules compile without warning; only @import/@use/@forward warn", () => {
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (m: string) => { warns.push(String(m)); };
    let out = "";
    try {
      out = compileSCSS("@function f($x) { @return $x } @for $i from 1 through 2 { .g#{$i} { width: f(4px); } }");
      compileSCSS('@import "other"; .c { color: red; }');
    } finally { console.warn = orig; }
    expect(out).toContain("width: 4px");
    expect(warns.some((w) => w.includes("function"))).toBe(false);
    expect(warns.some((w) => w.includes("for"))).toBe(false);
    expect(warns.some((w) => w.includes("@import"))).toBe(true);
  });
});

describe("tailwind engine availability", () => {
  test("detectTailwind reports unavailable when tailwindcss is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-no-tw-"));
    try {
      const info = detectTailwind(dir);
      expect(info.available).toBe(false);
      expect(info.detail).toContain("not installed");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("runTailwind throws a teaching error when tailwindcss is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-no-tw-"));
    try { expect(() => runTailwind({ rootDir: dir, content: [] })).toThrow(/tailwindcss/); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("detectTailwind reports availability once tailwindcss is present", () => {
    const dir = mkdtempSync(join(tmpdir(), "tw-tw-"));
    try {
      const pkgDir = join(dir, "node_modules", "tailwindcss");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "tailwindcss", version: "3.4.19" }));
      writeFileSync(join(pkgDir, "lib-cli.js"), "");
      const info = detectTailwind(dir);
      expect(info.available).toBe(true); expect(info.major).toBe(3);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
