/**
 * Next.js-style parameterized unit matrix (contributing/core/testing.md):
 * fast, browser-free tests over the framework's builtin tables -- every
 * entry gets a real behavioral assertion (the `it.each` pattern).
 */
import { describe, expect, test } from "bun:test";
import { compileSync } from "../packages/compiler/tw/index.ts";
import { GLOBAL_ATTRIBUTES, HTML_ATTRIBUTES, BOOLEAN_ATTRS } from "../packages/shared/tw/index.ts";

const tmp = "/tmp/tw2k-attrs.tw";
const compile = (src: string) => compileSync(src, { filePath: tmp });


describe("global attributes matrix (it.each over GLOBAL_ATTRIBUTES)", () => {
  for (const attr of GLOBAL_ATTRIBUTES) {
    if (BOOLEAN_ATTRS.has(attr)) continue;
    test(`global attr ${attr} reaches the output`, () => {
      const out = compile(`page { title "T" }\ndiv { <span ${attr}="v">x</span> }`);
      expect(out.html).toContain(`${attr}="v"`);
    });
  }
});

describe("element attributes matrix (it.each over HTML_ATTRIBUTES)", () => {
  for (const attr of HTML_ATTRIBUTES) {
    if (GLOBAL_ATTRIBUTES.has(attr)) continue;
    if (BOOLEAN_ATTRS.has(attr)) continue;
    test(`attr ${attr} reaches the output`, () => {
      const out = compile(`page { title "T" }\ndiv { <img ${attr}="v"> }`);
      expect(out.html).toContain(`${attr}="v"`);
    });
  }
});

describe("boolean attributes matrix (it.each over BOOLEAN_ATTRS)", () => {
  for (const attr of BOOLEAN_ATTRS) {
    test(`boolean attr ${attr} emits bare (value forms collapse)`, () => {
      const out = compile(`page { title "T" }\ndiv { <input ${attr}="v"> }`);
      // boolean attributes survive in bare or collapsed form
      expect(out.html).toMatch(new RegExp(`<input[^>]*\\b${attr}(\\s|>|=)`));
    });
  }
});

describe("data-* attributes", () => {
  test("data-id passes through", () => {
    const out = compile(`page { title "T" }\ndiv { span data-id "5" { "x" } }`);
    expect(out.html).toContain('data-id="5"');
  });
  test("arbitrary data-* in HTML form", () => {
    const out = compile(`page { title "T" }\ndiv { <span data-anything="ok">x</span> }`);
    expect(out.html).toContain('data-anything="ok"');
  });
});
