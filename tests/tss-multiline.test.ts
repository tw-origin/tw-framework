import { describe, test, expect } from "bun:test";
import { compileTSS } from "../packages/compiler/tw/codegen/tss.ts";

// TSS output used to be built as a flat list of strings, and every rule was
// wrapped in its own copy of any enclosing at-rule. That broke multi-line input
// in several ways: a nested @media produced a selector-less garbage rule,
// @keyframes emitted one block per frame (the later one overriding the earlier,
// so the animation lost frames), and lines starting with `-` (custom properties
// and vendor prefixes) were pasted into the previous declaration's value.

describe("TSS: multi-line blocks", () => {
  test("declarations on separate lines without semicolons", () => {
    expect(compileTSS(".card {\n  bg #fff\n  p 16px\n  br 8px\n}")).toBe(
      ".card { background: #fff; padding: 16px; border-radius: 8px }",
    );
  });

  test("declarations on separate lines with semicolons", () => {
    expect(compileTSS(".card {\n  bg #fff;\n  p 16px;\n}")).toBe(
      ".card { background: #fff; padding: 16px }",
    );
  });

  test("custom properties are declarations, not part of the previous value", () => {
    expect(compileTSS(":root {\n  --main #fff\n  --gap 8px\n}")).toBe(
      ":root { --main: #fff; --gap: 8px }",
    );
  });

  test("vendor-prefixed properties are declarations", () => {
    expect(compileTSS(".x {\n  -webkit-transform none\n  -moz-user-select none\n}")).toBe(
      ".x { -webkit-transform: none; -moz-user-select: none }",
    );
  });

  test("declarations before and after a nested rule stay on the parent", () => {
    expect(compileTSS(".card {\n  p 8px\n  .title {\n    fs 12px\n  }\n  m 0\n}")).toBe(
      ".card { padding: 8px; margin: 0 }\n.card .title { font-size: 12px }",
    );
  });
});

describe("TSS: at-rules", () => {
  test("a nested @media keeps its selector", () => {
    expect(compileTSS(".card {\n  p 8px\n  @media (max-width: 600px) {\n    p 4px\n  }\n}")).toBe(
      ".card { padding: 8px }\n@media (max-width: 600px) { .card { padding: 4px } }",
    );
  });

  test("@media wraps every inner rule once, not one block per rule", () => {
    const out = compileTSS("@media (max-width: 600px) {\n  .a { p 1px }\n  .b { p 2px }\n}");
    expect(out).toBe("@media (max-width: 600px) { .a { padding: 1px } .b { padding: 2px } }");
    expect(out.split("@media").length - 1).toBe(1);
  });

  test("@keyframes keeps all frames in one block", () => {
    const out = compileTSS("@keyframes spin {\n  0% {\n    tf rotate(0deg)\n  }\n  100% {\n    tf rotate(360deg)\n  }\n}");
    expect(out).toBe("@keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }");
    expect(out.split("@keyframes").length - 1).toBe(1);
  });

  test("@font-face keeps its declarations bare", () => {
    expect(compileTSS('@font-face {\n  ff "Inter"\n  src url(/i.woff2)\n}')).toBe(
      '@font-face { font-family: "Inter"; src: url(/i.woff2) }',
    );
  });

  test("@supports nests rules normally", () => {
    expect(compileTSS("@supports (display: grid) {\n  .g { d grid }\n}")).toBe(
      "@supports (display: grid) { .g { display: grid } }",
    );
  });
});

describe("TSS: output shape", () => {
  test("no empty rule is emitted for an empty block", () => {
    expect(compileTSS(".x {\n}")).toBe("");
  });

  test("a colon inside a url() is not treated as the property separator", () => {
    expect(compileTSS(".x {\n  bg url(https://a.com/i.png)\n}")).toBe(
      ".x { background: url(https://a.com/i.png) }",
    );
  });

  test("plain CSS passes through with one space after the colon", () => {
    expect(compileTSS(".x {\n  color:red;\n  padding:4px;\n}")).toBe(
      ".x { color: red; padding: 4px }",
    );
  });

  test("nested selectors and & combine correctly", () => {
    expect(compileTSS(".a {\n  .b {\n    c red\n  }\n}")).toBe(".a .b { color: red }");
    expect(compileTSS(".a {\n  &:hover {\n    c blue\n  }\n}")).toBe(".a:hover { color: blue }");
    expect(compileTSS(".a {\n  > .b {\n    c red\n  }\n}")).toBe(".a > .b { color: red }");
  });
});

describe("TSS: strings and statement at-rules", () => {
  test("@import is a statement, not a declaration", () => {
    expect(compileTSS(`@import url("a.css");\n.x { c red }`)).toBe(
      '@import url("a.css");\n.x { color: red }',
    );
  });

  test("@charset is a statement, not a declaration", () => {
    expect(compileTSS(`@charset "utf-8";\n.x { c red }`)).toBe(
      '@charset "utf-8";\n.x { color: red }',
    );
  });

  test("a semicolon inside a string does not split the declaration", () => {
    expect(compileTSS('.x {\n  content "a;b"\n}')).toBe('.x { content: "a;b" }');
  });

  test("a brace inside a string does not break the block", () => {
    expect(compileTSS('.x {\n  content "a}b"\n}')).toBe('.x { content: "a}b" }');
  });

  test("an escaped quote inside a string is respected", () => {
    expect(compileTSS('.x {\n  content "a\\"b;c"\n}')).toBe('.x { content: "a\\"b;c" }');
  });

  test("nested @media keeps both queries", () => {
    expect(compileTSS("@media (min-width: 600px) {\n  @media (max-width: 900px) {\n    .a { c red }\n  }\n}")).toBe(
      "@media (min-width: 600px) { @media (max-width: 900px) { .a { color: red } } }",
    );
  });

  test("keyframes with from/to", () => {
    expect(compileTSS("@keyframes f {\n  from { op 0 }\n  to { op 1 }\n}")).toBe(
      "@keyframes f { from { opacity: 0 } to { opacity: 1 } }",
    );
  });

  test("two declarations on one line", () => {
    expect(compileTSS(".x { c red; p 4px }")).toBe(".x { color: red; padding: 4px }");
  });

  test("a selector split across lines keeps both selectors", () => {
    expect(compileTSS(".a,\n.b {\n  c red\n}")).toBe(".a,\n.b { color: red }");
  });

  test("calc() and repeat() values are untouched", () => {
    expect(compileTSS(".x {\n  w calc(100% - 8px)\n}")).toBe(".x { width: calc(100% - 8px) }");
    expect(compileTSS(".x {\n  gtc repeat(3, 1fr)\n}")).toBe(".x { grid-template-columns: repeat(3, 1fr) }");
  });
});

describe("TSS: whitespace and layer blocks", () => {
  test("a multi-line value is collapsed onto one line", () => {
    const out = compileTSS(".h {\n  bg linear-gradient(\n    to right,\n    #fff,\n    #000\n  )\n}");
    expect(out).not.toContain("\n");
    expect(out).toBe(".h { background: linear-gradient( to right, #fff, #000 ) }");
  });

  test("spaces inside a string are preserved when collapsing", () => {
    expect(compileTSS('.x {\n  content "a   b"\n}')).toBe('.x { content: "a   b" }');
  });

  test("@layer block keeps its rules inside", () => {
    expect(compileTSS("@layer base {\n  .a { c red }\n}")).toBe("@layer base { .a { color: red } }");
  });

  test("@layer statement stays a statement", () => {
    expect(compileTSS("@layer a, b;\n.x { c red }")).toBe("@layer a, b;\n.x { color: red }");
  });

  test("@supports selector() keeps its condition", () => {
    expect(compileTSS("@supports selector(:has(a)) {\n  .a { c red }\n}")).toBe(
      "@supports selector(:has(a)) { .a { color: red } }",
    );
  });
});

describe("TSS: container queries, @property and stray tokens", () => {
  test("@container nested in a selector keeps the selector", () => {
    expect(compileTSS(".card {\n  @container (min-width: 400px) {\n    p 8px\n  }\n}")).toBe(
      "@container (min-width: 400px) { .card { padding: 8px } }",
    );
  });

  test("@container with a name at the top level", () => {
    expect(compileTSS("@container sidebar (min-width: 400px) {\n  .a { c red }\n}")).toBe(
      "@container sidebar (min-width: 400px) { .a { color: red } }",
    );
  });

  test("@property keeps its descriptors", () => {
    expect(compileTSS('@property --x {\n  syntax "<color>"\n  inherits false\n  initial-value red\n}')).toBe(
      '@property --x { syntax: "<color>"; inherits: false; initial-value: red }',
    );
  });

  test("a property with no value is dropped, not merged into the next line", () => {
    expect(compileTSS(".x {\n  c\n  p 4px\n}")).toBe(".x { padding: 4px }");
  });

  test("a bare property at the end of a block is dropped", () => {
    expect(compileTSS(".x {\n  p 4px\n  c\n}")).toBe(".x { padding: 4px }");
  });

  test(":not() with a comma keeps its arguments", () => {
    expect(compileTSS(".a:not(.b, .c) {\n  c red\n}")).toBe(".a:not(.b, .c) { color: red }");
  });

  test("decimal keyframe percentages", () => {
    expect(compileTSS("@keyframes k {\n  33.3% { op .3 }\n  66.6% { op .6 }\n}")).toBe(
      "@keyframes k { 33.3% { opacity: .3 } 66.6% { opacity: .6 } }",
    );
  });

  test("& at the end of a nested selector", () => {
    expect(compileTSS(".a {\n  .b & {\n    c red\n  }\n}")).toBe(".b .a { color: red }");
  });
});

describe("TSS: layers, property descriptors and $vars in strings", () => {
  test("@layer wrapping @media", () => {
    expect(compileTSS("@layer base {\n  @media (min-width: 600px) {\n    .a { c red }\n  }\n}")).toBe(
      "@layer base { @media (min-width: 600px) { .a { color: red } } }",
    );
  });

  test("@layer > selector > @media puts the declarations under the selector", () => {
    expect(compileTSS("@layer base {\n  .a {\n    @media (min-width: 600px) {\n      c red\n    }\n  }\n}")).toBe(
      "@layer base { @media (min-width: 600px) { .a { color: red } } }",
    );
  });

  test("@layer holding one @media with two rules keeps a single wrapper", () => {
    const out = compileTSS("@layer base {\n  @media (min-width: 600px) {\n    .a { c red }\n    .b { c blue }\n  }\n}");
    expect(out).toBe("@layer base { @media (min-width: 600px) { .a { color: red } .b { color: blue } } }");
    expect(out.split("@media").length - 1).toBe(1);
  });

  test("a $var used as an @property syntax value is substituted", () => {
    expect(compileTSS('$t: "<color>"\n@property --x {\n  syntax $t\n  inherits false\n}')).toBe(
      '@property --x { syntax: "<color>"; inherits: false }',
    );
  });

  test("a $var inside a quoted string is substituted (documented behaviour)", () => {
    expect(compileTSS('$name: hello\n.x {\n  content "$name"\n}')).toBe('.x { content: "hello" }');
    expect(compileTSS('$n: 3\n.x {\n  content "count: $n"\n}')).toBe('.x { content: "count: 3" }');
  });
});

describe("TSS: every documented shorthand exists", () => {
  // docs/tss-syntax.md lists these; nine of them were never in the shorthand
  // table, so `br-tl 4px` emitted the literal property `br-tl` and the corner
  // stayed square. This test is the contract between the doc and the compiler.
  const documented: [string, string][] = [
    ["br-tl", "border-top-left-radius"],
    ["br-tr", "border-top-right-radius"],
    ["br-bl", "border-bottom-left-radius"],
    ["br-br", "border-bottom-right-radius"],
    ["fl", "float"],
    ["cl", "clear"],
    ["dir", "direction"],
    ["ww", "word-wrap"],
    ["va", "vertical-align"],
  ];

  for (const [shorthand, property] of documented) {
    test(`${shorthand} expands to ${property}`, () => {
      expect(compileTSS(`.x {\n  ${shorthand} 4px\n}`)).toBe(`.x { ${property}: 4px }`);
    });
  }
});
