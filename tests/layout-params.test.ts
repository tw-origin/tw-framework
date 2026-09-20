import { describe, test, expect } from "bun:test";
import { compileSync, generateWithLayoutChain } from "@tw/compiler";

describe("dynamic route params: both {slug} and {params.slug}", () => {
  test("flat param renders", () => {
    const r = compileSync('div { h1 "Post: {slug}" }', { stateVars: { slug: "abc" } } as any);
    expect(r.html).toContain("Post: abc");
  });

  test("docs form params.slug renders (v25 fix)", () => {
    const r = compileSync('div { h1 "Post: {params.slug}" }', {
      stateVars: { slug: "abc", params: { slug: "abc" } },
    } as any);
    expect(r.html).toContain("Post: abc");
  });

  test("nested param object with no flat var still resolves via params object", () => {
    const r = compileSync('div { p "{params.id}-{params.page}" }', {
      stateVars: { params: { id: "7", page: "2" } },
    } as any);
    expect(r.html).toContain("7-2");
  });
});

describe("layout slot handling (v25 fix: no-slot layouts must not drop content)", () => {
  const page = compileSync('div.page { h1 "PAGE CONTENT" }');
  const pageProgram = (page as any).ast ?? (page as any).program;

  test("layout WITH slot { } places the page content", () => {
    const layout = compileSync('html { body { header "chrome" slot { } footer "end" } }');
    const out = generateWithLayoutChain([(layout as any).ast], pageProgram);
    expect(out).toContain("PAGE CONTENT");
    expect(out).toContain("chrome");
  });

  test("layout WITHOUT slot falls back to appending before </body>", () => {
    const layout = compileSync('html { body { header "chrome-only" p "no slot here" } }');
    const out = generateWithLayoutChain([(layout as any).ast], pageProgram);
    expect(out).toContain("PAGE CONTENT");
    expect(out).toContain("chrome-only");
  });

  test("{{children}} layout still keeps the page content (fallback)", () => {
    // {{children}} is a render-pipeline marker; through the compiler path
    // the no-slot fallback must still keep the page content.
    const layout = compileSync('html { body { header "h" main "{{children}}" } }');
    const out = generateWithLayoutChain([(layout as any).ast], pageProgram);
    expect(out).toContain("PAGE CONTENT");
  });

  test("nested layouts: inner without slot keeps content, outer with slot places it", () => {
    const outer = compileSync('html { body { section "outer" slot { } } }');
    const inner = compileSync('aside "inner-chrome"');
    const out = generateWithLayoutChain([(outer as any).ast, (inner as any).ast], pageProgram);
    expect(out).toContain("PAGE CONTENT");
    expect(out).toContain("inner-chrome");
  });
});
