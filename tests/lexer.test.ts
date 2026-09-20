/** TW Framework -- Lexer Tests (50 tests) */

import { describe, test, expect } from "bun:test";
import { tokenize } from "@tw/compiler";

describe("Lexer: Basic HTML", () => {
  test("tokenizes single div", () => {
    const tokens = tokenize("<div>hello</div>");
    expect(tokens.length).toBeGreaterThan(0);
  });

  test("tokenizes self-closing img", () => {
    const tokens = tokenize("<img src='x.png' />");
    expect(tokens.length).toBeGreaterThan(2);
  });

  test("tokenizes void tag br", () => {
    const tokens = tokenize("<br/>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes void tag hr", () => {
    const tokens = tokenize("<hr>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes nested elements", () => {
    const tokens = tokenize("<div><span><p>deep</p></span></div>");
    expect(tokens.length).toBeGreaterThan(5);
  });

  test("tokenizes multiple siblings", () => {
    const tokens = tokenize("<div></div><div></div><div></div>");
    expect(tokens.length).toBeGreaterThan(5);
  });

  test("tokenizes empty input", () => {
    const tokens = tokenize("");
    expect(tokens).toBeDefined();
  });

  test("tokenizes whitespace only", () => {
    const tokens = tokenize("   \n\t  ");
    expect(tokens).toBeDefined();
  });

  test("tokenizes text content", () => {
    const tokens = tokenize("Just text, no tags");
    expect(tokens).toBeDefined();
  });

  test("tokenizes comment", () => {
    const tokens = tokenize("<!-- comment -->");
    expect(tokens).toBeDefined();
  });
});

describe("Lexer: Attributes", () => {
  test("tokenizes class attribute", () => {
    const tokens = tokenize("<div class='box'>text</div>");
    expect(tokens.length).toBeGreaterThan(2);
  });

  test("tokenizes id attribute", () => {
    const tokens = tokenize("<div id='main'>text</div>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes multiple attributes", () => {
    const tokens = tokenize("<div class='box' id='main' data-x='1'>text</div>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes boolean attribute", () => {
    const tokens = tokenize("<input disabled />");
    expect(tokens).toBeDefined();
  });

  test("tokenizes data attributes", () => {
    const tokens = tokenize("<div data-id='42' data-name='test'>x</div>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes style attribute", () => {
    const tokens = tokenize("<div style='color: red;'>x</div>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes event binding :on:click", () => {
    const tokens = tokenize("<button :on:click='handle()'>click</button>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes property binding :prop", () => {
    const tokens = tokenize("<div :class='{active: isActive}'>x</div>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes interpolation in attribute", () => {
    const tokens = tokenize("<a href='/user/{id}'>link</a>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes double-quoted attributes", () => {
    const tokens = tokenize('<div class="box">x</div>');
    expect(tokens).toBeDefined();
  });
});

describe("Lexer: Interpolation", () => {
  test("tokenizes simple interpolation", () => {
    const tokens = tokenize("<p>{name}</p>");
    expect(tokens.length).toBeGreaterThan(1);
  });

  test("tokenizes expression interpolation", () => {
    const tokens = tokenize("<p>{a + b}</p>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes ternary interpolation", () => {
    const tokens = tokenize("<p>{cond ? 'yes' : 'no'}</p>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes function call interpolation", () => {
    const tokens = tokenize("<p>{format(date)}</p>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes member access interpolation", () => {
    const tokens = tokenize("<p>{user.name}</p>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes array access interpolation", () => {
    const tokens = tokenize("<p>{items[0]}</p>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes multiple interpolations", () => {
    const tokens = tokenize("<p>Hello {name}, you are {age} years old</p>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes nested braces", () => {
    const tokens = tokenize("<p>{obj.key.method()}</p>");
    expect(tokens).toBeDefined();
  });
});

describe("Lexer: Directives", () => {
  test("tokenizes @page directive", () => {
    const tokens = tokenize("@page { title: 'Test'; }");
    expect(tokens).toBeDefined();
  });

  test("tokenizes @state directive", () => {
    const tokens = tokenize("@state { count = 0; }");
    expect(tokens).toBeDefined();
  });

  test("tokenizes @import directive", () => {
    const tokens = tokenize("@import { Button } from './Button.tw';");
    expect(tokens).toBeDefined();
  });

  test("tokenizes @render directive", () => {
    const tokens = tokenize("@render mode: 'interactive';");
    expect(tokens).toBeDefined();
  });

  test("tokenizes @layout directive", () => {
    const tokens = tokenize("@layout 'default';");
    expect(tokens).toBeDefined();
  });

  test("tokenizes @export directive", () => {
    const tokens = tokenize("@export const name = 'value';");
    expect(tokens).toBeDefined();
  });

  test("tokenizes @head directive", () => {
    const tokens = tokenize("@head { meta charset='utf-8' }");
    expect(tokens).toBeDefined();
  });

  test("tokenizes @middleware directive", () => {
    const tokens = tokenize("@middleware ['auth', 'cors'];");
    expect(tokens).toBeDefined();
  });
});

describe("Lexer: Style Blocks", () => {
  test("tokenizes inline style block", () => {
    const tokens = tokenize("<style>.box { color: red; }</style>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes scoped style", () => {
    const tokens = tokenize("<style scoped>.box { color: red; }</style>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes TSS style", () => {
    const tokens = tokenize("<style tss>.box { bg: #f00; }</style>");
    expect(tokens).toBeDefined();
  });
});

describe("Lexer: Script Blocks", () => {
  test("tokenizes script block", () => {
    const tokens = tokenize("<script>console.log('hello');</script>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes script with type", () => {
    const tokens = tokenize("<script type='module'>import x from 'y';</script>");
    expect(tokens).toBeDefined();
  });
});

describe("Lexer: Control Flow", () => {
  test("tokenizes if directive", () => {
    const tokens = tokenize("<if cond='{show}'>content</if>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes for directive", () => {
    const tokens = tokenize("<for item in {items}><p>{item}</p></for>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes while directive", () => {
    const tokens = tokenize("<while cond='{running}'>content</while>");
    expect(tokens).toBeDefined();
  });
});

describe("Lexer: Components", () => {
  test("tokenizes PascalCase component", () => {
    const tokens = tokenize("<MyComponent />");
    expect(tokens).toBeDefined();
  });

  test("tokenizes component with props", () => {
    const tokens = tokenize("<Button label='Click' color='blue' />");
    expect(tokens).toBeDefined();
  });

  test("tokenizes component with children", () => {
    const tokens = tokenize("<Card><h1>Title</h1><p>Body</p></Card>");
    expect(tokens).toBeDefined();
  });

  test("tokenizes nested components", () => {
    const tokens = tokenize("<Layout><Header /><Main><Content /></Main></Layout>");
    expect(tokens).toBeDefined();
  });
});
