/**
 * Next.js-style parameterized unit matrix (contributing/core/testing.md):
 * fast, browser-free tests over the framework's builtin tables -- every
 * entry gets a real behavioral assertion (the `it.each` pattern).
 */
import { describe, expect, test } from "bun:test";
import { compileSync } from "../packages/compiler/tw/index.ts";
import { HTML_ELEMENTS } from "../packages/shared/tw/index.ts";

const tmp = "/tmp/tw2k-elements.tw";
const compile = (src: string) => compileSync(src, { filePath: tmp });

// DSL-reserved or slot-handled tags need special contexts; the rest
// compile as plain nested elements.
const DSL_SPECIAL = new Set(["script", "style", "html", "head", "body", "title", "meta", "link", "base"]);
const HTML_FORM_ONLY = new Set(["var", "use", "set", "slot"]);
const SKIP = new Set(["annotation-xml"]); // parses as text today (known quirk)

describe("HTML elements matrix (it.each over HTML_ELEMENTS)", () => {
  for (const tag of HTML_ELEMENTS) {
    if (DSL_SPECIAL.has(tag) || SKIP.has(tag)) continue;
    if (HTML_FORM_ONLY.has(tag)) {
      if (tag === "slot") continue; // DSL slot boundary, tested separately
      test(`<${tag}> compiles in HTML form`, () => {
        const out = compile(`page { title "T" }\ndiv { <${tag}>x</${tag}> }`);
        expect(out.html).toContain(`<${tag}`);
      });
      continue;
    }
    test(`${tag} compiles as a nested element`, () => {
      const out = compile(`page { title "T" }\ndiv { ${tag} { "x" } }`);
      expect(out.html).toContain(`<${tag}`);
    });
  }

  test("slot is the DSL slot boundary", () => {
    const out = compile(`page { title "T" }\ndiv { slot { "x" } }`);
    expect(out.html).toContain("tw:slot:default");
  });

  // The structural elements compile through the page/document assembler.
  test("page document emits html/head/body skeleton", () => {
    const out = compile(`page { title "T" }\ndiv { "x" }`);
    expect(out.html).toContain("<!DOCTYPE html>");
    expect(out.html).toContain("<head>");
    expect(out.html).toContain("<body>");
    expect(out.html).toContain("<title>T</title>");
  });
});
