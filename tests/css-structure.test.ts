import { describe, test, expect } from "bun:test";
import { validateCssStructure } from "../packages/compiler/tw/codegen/tss.ts";

// Phase 2 structural checks for `tw check`. Zero dependency, and deliberately
// narrow: only what is unambiguously invalid. Unknown properties and invalid
// values are NOT reported here -- that needs a spec grammar, and guessing would
// flag valid modern CSS.

const css = (src: string) => validateCssStructure(src, "/tmp/x/style.css");
const tss = (src: string) => validateCssStructure(src, "/tmp/x/style.tss");

describe("valid modern CSS is never flagged", () => {
  test("nesting, custom properties and vendor prefixes", () => {
    expect(css(`
      :root { --main: #fff; --gap: 8px; }
      .a { color: var(--main, red); -webkit-transform: none; }
      .b { & > .c { padding: 4px; } }
    `)).toEqual([]);
  });

  test("@layer, @container, @property, @supports selector()", () => {
    expect(css(`
      @layer base { .a { color: red; } }
      @container (min-width: 400px) { .b { padding: 8px; } }
      @property --x { syntax: "<color>"; inherits: false; }
      @supports selector(:has(a)) { .c { color: blue; } }
    `)).toEqual([]);
  });

  test("modern functions and selectors", () => {
    expect(css(`
      .a { color: color-mix(in srgb, red 50%, blue); }
      .b:has(> img) { margin: 0; }
      .c:is(.d, .e) { padding: 1px; }
      .f { background: linear-gradient(to right, #fff, #000); }
    `)).toEqual([]);
  });

  test("@keyframes with from/to and decimal percentages", () => {
    expect(css(`@keyframes k { from { opacity: 0; } 33.3% { opacity: .3; } to { opacity: 1; } }`)).toEqual([]);
  });

  test("a string containing a brace or a semicolon", () => {
    expect(css(`.a { content: "a;b}c"; }`)).toEqual([]);
  });

  test("TSS declarations without colons are valid in a .tss file", () => {
    expect(tss(`.card { bg #fff; p 16px; br 8px; }`)).toEqual([]);
  });
});

describe("definitely-invalid CSS is reported", () => {
  test("an unclosed block is TW303 with line and column", () => {
    const f = css(".a {\n  color: red;\n");
    expect(f.length).toBe(1);
    expect(f[0].code).toBe("TW303");
    expect(f[0].line).toBe(1);
    expect(f[0].col).toBe(4);
  });

  test("a stray closing brace is TW303", () => {
    const f = css(".a { color: red; }\n}\n");
    expect(f.length).toBe(1);
    expect(f[0].code).toBe("TW303");
    expect(f[0].line).toBe(2);
  });

  test("an empty value is TW304", () => {
    const f = css(".a { color: ; }");
    expect(f.length).toBe(1);
    expect(f[0].code).toBe("TW304");
  });

  test("an unknown at-rule is TW305", () => {
    const f = css("@medias (max-width: 10px) { .a { color: red; } }");
    expect(f.some((x) => x.code === "TW305")).toBe(true);
  });

  test("a colon-less declaration in a .css file is TW306", () => {
    const f = css(".a { color red; }");
    expect(f.length).toBe(1);
    expect(f[0].code).toBe("TW306");
  });

  test("the same colon-less line is fine in a .tss file", () => {
    expect(tss(".a { color red; }")).toEqual([]);
  });

  test("a comment containing braces does not unbalance the scan", () => {
    expect(css("/* { */ .a { color: red; } /* } */")).toEqual([]);
  });
});
