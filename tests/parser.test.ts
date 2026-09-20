/** TW Framework -- Parser & AST Tests (50 tests) */

import { describe, test, expect } from "bun:test";
import { parse, parseWithDetails } from "@tw/compiler";
import { isElement, isComponent, isIfNode, isForNode, isScriptBlock, isStyleBlock } from "@tw/compiler";

describe("Parser: Basic HTML", () => {
  test("parses single element", () => {
    const result = parse("<div>hello</div>");
    expect(result.body.length).toBe(1);
    expect(isElement(result.body[0])).toBe(true);
  });

  test("parses text content", () => {
    const result = parse("<p>Hello World</p>");
    expect(result.body.length).toBe(1);
  });

  test("parses self-closing tag", () => {
    const result = parse("<br />");
    expect(result.body.length).toBe(1);
  });

  test("parses void tag without slash", () => {
    const result = parse("<img src='x.png'>");
    expect(result.body.length).toBe(1);
  });

  test("parses multiple root elements", () => {
    const result = parse("<div>a</div><div>b</div>");
    expect(result.body.length).toBe(2);
  });

  test("parses deeply nested elements", () => {
    const result = parse("<div><span><p><b>deep</b></p></span></div>");
    expect(result.body[0].type).toBe("Element");
  });

  test("parses empty element", () => {
    const result = parse("<div></div>");
    expect(result.body[0].type).toBe("Element");
  });

  test("parses element with only text", () => {
    const result = parse("<p>Just text</p>");
    expect(result.body.length).toBe(1);
  });

  test("parses mixed content", () => {
    const result = parse("<div>text<span>more</span>end</div>");
    expect(result.body.length).toBe(1);
  });

  test("parses comment", () => {
    const result = parse("<!-- comment --><div>x</div>");
    expect(result).toBeDefined();
  });
});

describe("Parser: Attributes", () => {
  test("parses class attribute", () => {
    const result = parse("<div class='box'>x</div>");
    expect(isElement(result.body[0])).toBe(true);
  });

  test("parses multiple attributes", () => {
    const result = parse("<div class='box' id='main' data-x='1'>x</div>");
    const el = result.body[0] as any;
    expect(el.attrs).toBeDefined();
    expect(el.attrs.length).toBe(3);
  });

  test("parses boolean attribute", () => {
    const result = parse("<input disabled />");
    expect(result.body[0].type).toBe("Element");
  });

  test("parses style attribute", () => {
    const result = parse("<div style='color:red'>x</div>");
    expect(result.body[0].type).toBe("Element");
  });

  test("parses event binding", () => {
    const result = parse("<button :on:click='handle()'>x</button>");
    const el = result.body[0] as any;
    expect(el.bindings).toBeDefined();
  });

  test("parses property binding", () => {
    const result = parse("<div :class='{active: isActive}'>x</div>");
    const el = result.body[0] as any;
    expect(el.bindings).toBeDefined();
  });

  test("parses double-quoted attrs", () => {
    const result = parse('<div class="box" id="main">x</div>');
    const el = result.body[0] as any;
    expect(el.attrs.length).toBe(2);
  });

  test("parses no attributes", () => {
    const result = parse("<div>x</div>");
    const el = result.body[0] as any;
    expect(el.attrs).toBeDefined();
    expect(el.attrs.length).toBe(0);
  });
});

describe("Parser: Directives", () => {
  test("parses @page directive", () => {
    const result = parse("@page { title: 'Test'; }");
    expect(result.directives).toBeDefined();
    expect(result.directives.length).toBeGreaterThan(0);
  });

  test("parses @state directive", () => {
    const result = parse("@state { count = 0; name = 'test'; }");
    expect(result.directives.length).toBeGreaterThan(0);
  });

  test("parses @import directive", () => {
    const result = parse("@import { Button } from './Button.tw';");
    expect(result.directives.length).toBeGreaterThan(0);
  });

  test("parses @render directive", () => {
    const result = parse("@render mode: 'interactive';");
    expect(result.directives.length).toBeGreaterThan(0);
  });

  test("parses @layout directive", () => {
    const result = parse("@layout 'default';");
    expect(result.directives.length).toBeGreaterThan(0);
  });

  test("parses @export directive", () => {
    const result = parse("@export const name = 'value';");
    expect(result.directives.length).toBeGreaterThan(0);
  });

  test("parses multiple directives", () => {
    const result = parse("@page { title: 'Test'; } @state { count = 0; } <div>x</div>");
    expect(result.directives.length).toBe(2);
  });

  test("parses directive then HTML", () => {
    const result = parse("@page { title: 'Test'; }<div>content</div>");
    expect(result.directives.length).toBe(1);
    expect(result.body.length).toBe(1);
  });
});

describe("Parser: Components", () => {
  test("parses self-closing component", () => {
    const result = parse("<MyComponent />");
    expect(isComponent(result.body[0])).toBe(true);
  });

  test("parses component with props", () => {
    const result = parse("<Button label='Click' color='blue' />");
    expect(isComponent(result.body[0])).toBe(true);
  });

  test("parses component with children", () => {
    const result = parse("<Card><h1>Title</h1></Card>");
    expect(isComponent(result.body[0])).toBe(true);
  });

  test("parses nested components", () => {
    const result = parse("<Layout><Header /><Main /></Layout>");
    expect(isComponent(result.body[0])).toBe(true);
  });

  test("distinguishes component from element", () => {
    const result = parse("<div></div><MyComp />");
    expect(isElement(result.body[0])).toBe(true);
    expect(isComponent(result.body[1])).toBe(true);
  });
});

describe("Parser: Control Flow", () => {
  test("parses if node", () => {
    const result = parse("<if cond='{show}'>visible</if>");
    expect(isIfNode(result.body[0])).toBe(true);
  });

  test("parses for node", () => {
    const result = parse("<for item in {items}><p>{item}</p></for>");
    expect(isForNode(result.body[0])).toBe(true);
  });

  test("parses if with else", () => {
    const result = parse("<if cond='{show}'>yes<else />no</if>");
    expect(isIfNode(result.body[0])).toBe(true);
  });
});

describe("Parser: Script & Style", () => {
  test("parses script block", () => {
    const result = parse("<script>console.log('x');</script>");
    expect(isScriptBlock(result.body[0])).toBe(true);
  });

  test("parses style block", () => {
    const result = parse("<style>.box { color: red; }</style>");
    expect(isStyleBlock(result.body[0])).toBe(true);
  });

  test("parses scoped style", () => {
    const result = parse("<style scoped>.x { color: red; }</style>");
    expect(isStyleBlock(result.body[0])).toBe(true);
  });
});

describe("Parser: parseWithDetails", () => {
  test("returns program and metadata", () => {
    const result = parseWithDetails("<div>test</div>", { filePath: "test.tw" });
    expect(result.program).toBeDefined();
    expect(result.program.body.length).toBe(1);
  });

  test("tracks fromCache flag", () => {
    const result = parseWithDetails("<div>test</div>");
    expect(result.fromCache).toBeDefined();
  });
});

describe("Parser: Error Recovery", () => {
  test("handles unclosed tag gracefully", () => {
    const result = parse("<div>unclosed");
    expect(result).toBeDefined();
  });

  test("handles mismatched tags", () => {
    const result = parse("<div><span></div></span>");
    expect(result).toBeDefined();
  });

  test("handles malformed attributes", () => {
    const result = parse("<div class=>text</div>");
    expect(result).toBeDefined();
  });

  test("handles empty directives", () => {
    const result = parse("@page {} <div>x</div>");
    expect(result).toBeDefined();
  });
});

describe("Parser: Interpolation", () => {
  test("parses text with interpolation", () => {
    const result = parse("<p>Hello {name}</p>");
    expect(result.body[0].type).toBe("Element");
  });

  test("parses multiple interpolations in text", () => {
    const result = parse("<p>{a} and {b}</p>");
    expect(result).toBeDefined();
  });

  test("parses interpolation in attribute value", () => {
    const result = parse("<a href='/user/{id}'>link</a>");
    expect(result).toBeDefined();
  });
});
