/**
 * Regression tests for the 12 confirmed compiler bugs fixed this round.
 * Each test pins the behaviour that was broken before the fix.
 */
import { describe, test, expect } from "bun:test";
import { parse, compileSync } from "../packages/compiler/tw/index.ts";
import { compileTSS } from "../packages/compiler/tw/codegen/tss.ts";
import { foldExpression } from "../packages/compiler/tw/optimizer/constant-folding.ts";
import { evaluate } from "../packages/compiler/tw/eval/evaluate.ts";

const nodes = (src: string): any[] => (parse(src) as any).body;
const walk = (n: any, acc: any[] = []): any[] => {
  if (!n || typeof n !== "object") return acc;
  acc.push(n);
  for (const k of ["body", "children", "elseBody"]) {
    if (Array.isArray(n[k])) for (const c of n[k]) walk(c, acc);
  }
  return acc;
};

describe("bug 1/2: component attribute-prop form", () => {
  test('Card title="x" { } expands like the inside-braces form', () => {
    const body = nodes('div { Card title="x" { span "hi" } }');
    const all = walk({ body });
    const card = all.find((n) => n.type === "Element" && n.tag === "Card");
    expect(card).toBeDefined();
    expect(card.attrs.map((a: any) => `${a.name}=${a.value}`)).toContain("title=x");
    expect(all.some((n) => n.type === "Text" && String(n.value).includes("Card title"))).toBe(false);
    expect(all.some((n) => n.type === "Element" && n.tag === "span")).toBe(true);
  });

  test("Card title={expr} { } captures the expression as a dynamic prop", () => {
    const all = walk({ body: nodes("div { Card title={post.title} { span \"hi\" } }") });
    const card = all.find((n) => n.type === "Element" && n.tag === "Card");
    const title = card.attrs.find((a: any) => a.name === "title");
    expect(title.value).toBe("post.title");
    expect(title.isInterpolated).toBe(true);
  });

  test('a non-first prop name "{interp}" no longer becomes an element', () => {
    const all = walk({ body: nodes('div { Card title="x" name "{interp}" { span "hi" } }') });
    const card = all.find((n) => n.type === "Element" && n.tag === "Card");
    expect(card.attrs.map((a: any) => a.name)).toEqual(["title", "name"]);
    expect(all.some((n) => n.type === "Element" && n.tag === "name")).toBe(false);
  });
});

describe("bug 3: for-loop iterable is a full member expression", () => {
  const forNode = (src: string): any => walk({ body: nodes(src) }).find((n) => n.type === "For");

  test("statement form keeps obj.list", () => {
    expect(forNode('for x in {obj.list} { span "{x}" }').iterable).toBe("obj.list");
  });
  test("tag form keeps list.items", () => {
    expect(forNode("<for item in {list.items}> {item} </for>").iterable).toBe("list.items");
  });
});

describe("bug 4: evaluator member/index access", () => {
  const vars = { obj: JSON.stringify({ k: "K" }), arr: JSON.stringify([10, 20, 30]), varName: "k" };
  test("string index", () => expect(evaluate('obj["k"]', vars)).toBe("K"));
  test("variable index", () => expect(evaluate("obj[varName]", vars)).toBe("K"));
  test("arithmetic index", () => expect(evaluate("arr[1+1]", vars)).toBe("30"));
  test("plain member access still works", () => expect(evaluate("obj.k", vars)).toBe("K"));
});

describe("bug 5: interpolated URL attributes are sanitized", () => {
  test("href={url} -> javascript: is neutralised", () => {
    const r: any = compileSync('<a href="{url}">x</a>', { stateVars: { url: "javascript:alert(1)" } } as any);
    expect(r.html).not.toContain("javascript:alert");
    expect(r.html).toContain('href="#"');
  });
});

describe("bug 6: TW303 brace scan ignores block comments", () => {
  test("a /* { } */ comment does not unbalance the scan", () => {
    expect(() => compileTSS(".a { color red } /* } { } */")).not.toThrow();
  });
  test("genuinely unbalanced braces still throw TW303", () => {
    expect(() => compileTSS(".a { color red")).toThrow(/TW303/);
  });
});

describe("bug 7: inline style blocks preserve value-internal punctuation", () => {
  test("url(data:...) is not re-spaced", () => {
    const all = walk({ body: nodes("style { .a { background: url(data:image/png;base64,AAA) } }") });
    const block = all.find((n) => n.type === "StyleBlock");
    expect(block.content).toContain("url(data:image/png;base64,AAA)");
    expect(block.content).not.toContain("data: image");
  });
});

describe("bug 8: event/binding/directive values are escaped", () => {
  test("an event handler containing && is HTML-escaped", () => {
    const r: any = compileSync('button on:click "a && b" "Go"', { filePath: "p.tw" });
    expect(r.html).toContain("data-tw-event-click=\"a &amp;&amp; b\"");
  });
});

describe("bug 9: addScope only scopes real selectors", () => {
  const SRC = `page { title "T" render ssr }
div.box { span "hi" }
<style scoped>
:root { --brand: red }
.box { color: red }
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
</style>`;
  test(":root and @keyframes names are untouched; .box is scoped", () => {
    const r: any = compileSync(SRC, { filePath: "p.tw", compiler: { minifyCSS: false } } as any);
    expect(r.css).toContain(":root");
    expect(r.css).not.toMatch(/:root\[data-tw-scope/);
    expect(r.css).not.toMatch(/fade\[data-tw-scope/);
    expect(r.css).toMatch(/\.box\[data-tw-scope=/);
  });
});

describe("bug 10: documented TSS shorthands", () => {
  test("max-w / min-w / box expand to real CSS", () => {
    const out = compileTSS(".a { max-w 800px; min-w 100px; box border-box }");
    expect(out).toContain("max-width: 800px");
    expect(out).toContain("min-width: 100px");
    expect(out).toContain("box-sizing: border-box");
    expect(out).not.toContain("max-w:");
  });
});

describe("bug 11: binary/octal literals", () => {
  test("full literal, sign preserved", () => {
    expect(foldExpression("0b111111111").folded).toBe("511");
    expect(foldExpression("-0b101").folded).toBe("-5");
    expect(foldExpression("0o17").folded).toBe("15");
    expect(foldExpression("-0o17").folded).toBe("-15");
  });
});

describe("bug 12: TW006 / TW003 allow-list", () => {
  const codes = (src: string): string[] =>
    ((compileSync(src, { filePath: "p.tw" }) as any).diagnostics || []).map((d: any) => d.code);

  test("component props are not flagged", () => {
    expect(codes('Button { label "Save" variant "primary" }')).not.toContain("TW003");
    expect(codes('Card title="x" variant="y" { span "c" }')).not.toContain("TW006");
  });
  test("tw-* attributes and meta property are not flagged", () => {
    expect(codes('<img tw-optimize src="/a.png" alt="a" width="1" height="1" />')).not.toContain("TW006");
    expect(codes('<meta property="og:title" content="T" />')).not.toContain("TW006");
  });
  test("real typos still report", () => {
    expect(codes("<spann>hi</spann>")).toContain("TW003");
    expect(codes('<div bogusattr="1">x</div>')).toContain("TW006");
  });
});
