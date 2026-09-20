/** TW Framework -- Compiler Pipeline Tests */

import { describe, test, expect } from "bun:test";
import { tokenize } from "@tw/compiler";
import { parse } from "@tw/compiler";
import { compile } from "@tw/compiler";

describe("Lexer", () => {
  test("should tokenize basic HTML", () => {
    const tokens = tokenize("<div>hello</div>");
    expect(tokens).toBeDefined();
    expect(Array.isArray(tokens)).toBe(true);
    expect(tokens.length).toBeGreaterThan(0);
  });

  test("should tokenize self-closing tags", () => {
    const tokens = tokenize("<img src='test.png' />");
    expect(tokens.length).toBeGreaterThan(0);
  });

  test("should tokenize attributes", () => {
    const tokens = tokenize("<a href='/'>Link</a>");
    expect(tokens.length).toBeGreaterThan(0);
  });

  test("should handle interpolation", () => {
    const tokens = tokenize("<p>{count}</p>");
    expect(tokens.length).toBeGreaterThan(0);
  });

  test("should handle empty input", () => {
    const tokens = tokenize("");
    expect(tokens).toBeDefined();
  });

  test("should handle nested elements", () => {
    const tokens = tokenize("<div><span>nested</span></div>");
    expect(tokens.length).toBeGreaterThan(3);
  });
});

describe("Parser", () => {
  test("should parse basic HTML", () => {
    const result = parse("<div>hello</div>");
    expect(result).toBeDefined();
    expect(result.body).toBeDefined();
    expect(result.body.length).toBeGreaterThan(0);
  });

  test("should parse elements with attributes", () => {
    const result = parse("<div class='container' id='main'>content</div>");
    expect(result.body[0].type).toBe("Element");
  });

  test("should parse multiple elements", () => {
    const result = parse("<div>first</div><div>second</div>");
    expect(result.body.length).toBe(2);
  });

  test("should parse directives", () => {
    const result = parse("@page { title: 'Test'; }");
    expect(result.directives).toBeDefined();
  });

  test("should parse self-closing tags", () => {
    const result = parse("<br /><img src='x.png' />");
    expect(result.body.length).toBe(2);
  });

  test("should handle nested elements", () => {
    const result = parse("<div><span>text</span></div>");
    const div = result.body[0];
    expect(div.type).toBe("Element");
    expect(div.children).toBeDefined();
    expect(div.children.length).toBe(1);
  });
});

describe("Compile Pipeline", () => {
  test("should compile basic template", async () => {
    const result = await compile("<div>Hello World</div>");
    expect(result.html).toBeDefined();
    expect(result.html).toContain("Hello World");
  });

  test("should compile with state", async () => {
    const source = `
@state {
  name = "World";
}
<div>Hello {name}</div>
`;
    const result = await compile(source);
    expect(result.html).toBeDefined();
  });

  test("should compile directives", async () => {
    const source = `
@page {
  title: "Test Page";
}
<div>Content</div>
`;
    const result = await compile(source);
    expect(result.html).toBeDefined();
  });

  test("should produce CSS from styles", async () => {
    const source = `
<div class="box">test</div>
<style>
  .box { color: red; }
</style>
`;
    const result = await compile(source);
    expect(result.css).toBeDefined();
  });

  test("should handle empty input", async () => {
    const result = await compile("");
    expect(result).toBeDefined();
  });
});
