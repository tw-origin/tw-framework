/** TW Framework -- Deep Codegen Tests */

import { describe, test, expect } from "bun:test";
import {
  StreamingHTMLGenerator,
  streamHTML,
  chunksToHTML,
  splitCriticalChunks,
  VDOMCodeBuilder,
  generateStaticVDOM,
  extractCSS,
  minifyCSS,
  mergeCSS,
  generateBundle,
  generateRuntimeCode,
  generateBootstrapCode,
  generateTemplateFunction,
  generateArrowTemplate,
  minifyHTML as minifyHTMLDeep,
  minifyHTMLWithStats,
  SourceMapBuilder,
  createSourceMapBuilder,
  generateSourceMap,
  deepGenerate,
  generateHTMLOnly,
  generateCSSOnly,
  generateJSOnly,
  generateStreaming,
  DEFAULT_CODEGEN_OPTIONS,
} from "@tw/compiler";

import type { Program } from "@tw/compiler";

// --- Helper: Create a minimal program AST -----------------------------

function makeProgram(body: any[], directives: any[] = []): Program {
  return {
    type: "Program",
    body,
    directives,
  } as any;
}

function makeElement(tag: string, attrs: any[] = [], children: any[] = [], styles: any[] = []): any {
  return {
    type: "Element",
    tag,
    attrs,
    children,
    styles,
    events: [],
    bindings: [],
    directives: [],
    selfClosing: false,
    loc: { start: { line: 1, col: 1, offset: 0 } },
  };
}

function makeText(value: string, isInterpolated = false): any {
  return { type: "Text", value, isInterpolated, loc: { start: { line: 1, col: 1, offset: 0 } } };
}

function makeStyleBlock(content: string, scoped = false): any {
  return { type: "StyleBlock", content, scoped, loc: { start: { line: 1, col: 1, offset: 0 } } };
}

function makeIf(condition: string, body: any[], elseBody: any[] = []): any {
  return { type: "If", condition, body, elseBody, loc: { start: { line: 1, col: 1, offset: 0 } } };
}

function makeFor(varName: string, iterable: string, body: any[], indexName?: string): any {
  return { type: "For", varName, iterable, body, indexName, loc: { start: { line: 1, col: 1, offset: 0 } } };
}

// --- Streaming HTML Tests --------------------------------------------

describe("Streaming HTML Generator", () => {
  test("generates chunks from simple AST", () => {
    const program = makeProgram([
      makeElement("div", [], [makeText("Hello")]),
    ]);

    const ctx: any = {
      mode: "ssr", indent: 0, inHead: false, inBody: false,
      componentStack: [], stateVars: {}, hasVdom: false,
      hasInteractivity: false, inlineStyles: [], inlineScripts: [],
      hydrationMarkers: [], chunks: [], currentChunk: "",
    };

    const chunks = streamHTML(program, ctx);
    expect(chunks.length).toBeGreaterThan(0);

    const html = chunksToHTML(chunks);
    expect(html).toContain("<div>");
    expect(html).toContain("Hello");
    expect(html).toContain("</div>");
  });

  test("includes DOCTYPE", () => {
    const program = makeProgram([makeElement("div")]);
    const ctx: any = {
      mode: "ssr", indent: 0, inHead: false, inBody: false,
      componentStack: [], stateVars: {}, hasVdom: false,
      hasInteractivity: false, inlineStyles: [], inlineScripts: [],
      hydrationMarkers: [], chunks: [], currentChunk: "",
    };

    const chunks = streamHTML(program, ctx);
    const html = chunksToHTML(chunks);
    expect(html).toContain("<!DOCTYPE html>");
  });

  test("splitCriticalChunks separates critical and deferred", () => {
    const program = makeProgram([makeElement("div")]);
    const ctx: any = {
      mode: "ssr", indent: 0, inHead: false, inBody: false,
      componentStack: [], stateVars: {}, hasVdom: false,
      hasInteractivity: false, inlineStyles: [], inlineScripts: [],
      hydrationMarkers: [], chunks: [], currentChunk: "",
    };

    const chunks = streamHTML(program, ctx);
    const { critical, deferred } = splitCriticalChunks(chunks);
    expect(critical.length + deferred.length).toBe(chunks.length);
  });

  test("streaming generator emits text", () => {
    const gen = new StreamingHTMLGenerator({} as any);
    gen.doctype();
    gen.htmlOpen("en");
    gen.headOpen();
    gen.headClose();
    gen.bodyOpen();
    gen.text("Hello World");
    gen.bodyClose();
    gen.htmlClose();

    const html = gen.toString();
    expect(html).toContain("<html");
    expect(html).toContain("Hello World");
  });

  test("streaming generator handles void elements", () => {
    const gen = new StreamingHTMLGenerator({} as any);
    gen.voidElement("img", 'src="test.jpg" alt="test"');
    const html = gen.toString();
    expect(html).toContain("<img");
    expect(html).toContain("src=\"test.jpg\"");
  });
});

// --- VDOM Code Generator Tests ---------------------------------------

describe("VDOM Code Generator", () => {
  test("generates h() calls for elements", () => {
    const program = makeProgram([
      makeElement("div", [{ name: "class", value: "container" }], [makeText("Hello")]),
    ]);

    const builder = new VDOMCodeBuilder();
    const code = builder.generateModule(program);

    expect(code).toContain("h(");
    expect(code).toContain("div");
    expect(code).toContain("class");
    expect(code).toContain("render()");
  });

  test("generates t() for text nodes", () => {
    const program = makeProgram([
      makeElement("p", [], [makeText("Hello")]),
    ]);

    const builder = new VDOMCodeBuilder();
    const code = builder.generateModule(program);
    expect(code).toContain("t(");
  });

  test("generates ternary for if nodes", () => {
    const program = makeProgram([
      makeIf("show", [makeElement("div")], [makeElement("span")]),
    ]);

    const builder = new VDOMCodeBuilder();
    const code = builder.generateModule(program);
    expect(code).toContain("?");
    expect(code).toContain(":");
  });

  test("generates map for for nodes", () => {
    const program = makeProgram([
      makeFor("item", "items", [makeElement("li", [], [makeText("test")])]),
    ]);

    const builder = new VDOMCodeBuilder();
    const code = builder.generateModule(program);
    expect(code).toContain(".map(");
  });

  test("generates static VDOM JSON", () => {
    const program = makeProgram([
      makeElement("div", [{ name: "class", value: "test" }], [makeText("Hello")]),
    ]);

    const json = generateStaticVDOM(program);
    const parsed = JSON.parse(json);
    expect(parsed[0].t).toBe("div");
    expect(parsed[0].a.class).toBe("test");
  });

  test("handles interpolated text", () => {
    const program = makeProgram([
      makeElement("h1", [], [makeText("{title}", true)]),
    ]);

    const builder = new VDOMCodeBuilder();
    const code = builder.generateModule(program);
    expect(code).toContain("title");
  });

  test("generates node VDOM expression", () => {
    const node = makeElement("div", [], [makeText("test")]);
    const b = new VDOMCodeBuilder();
    const expr = b.generateFromAST(node);
    expect(expr).toContain("h(");
  });
});

// --- CSS Extraction Tests ---------------------------------------------

describe("CSS Extractor", () => {
  test("extracts CSS from style blocks", () => {
    const program = makeProgram([
      makeStyleBlock(".card { padding: 16px; margin: 0; }"),
      makeElement("div", [{ name: "class", value: "card" }]),
    ]);

    const result = extractCSS(program);
    expect(result.rules.length).toBeGreaterThan(0);
    expect(result.css).toContain("card");
    expect(result.css).toContain("padding");
  });

  test("minifies CSS", () => {
    const css = ".test {\n  padding: 0px;\n  color: #ffffff;\n  margin: 0px;\n}";
    const minified = minifyCSS(css);
    expect(minified).not.toContain("\n");
    expect(minified).not.toContain("0px");
    expect(minified).toContain("#fff");
  });

  test("removes unused selectors", () => {
    const program = makeProgram([
      makeStyleBlock(".used { color: red; } .unused { color: blue; }"),
      makeElement("div", [{ name: "class", value: "used" }]),
    ]);

    const result = extractCSS(program);
    expect(result.css).toContain("used");
    expect(result.removedSelectors).toContain(".unused");
  });

  test("splits critical and non-critical CSS", () => {
    const program = makeProgram([
      makeStyleBlock("body { font-size: 14px; } .card:hover { color: red; }"),
      makeElement("body", [{ name: "class", value: "card" }]),
    ]);

    const result = extractCSS(program);
    expect(result.criticalCSS).toContain("body");
    expect(result.nonCriticalCSS).toContain("hover");
  });

  test("merges duplicate CSS", () => {
    const css1 = ".test { color: red; }";
    const css2 = ".test { background: blue; }";
    const merged = mergeCSS([css1, css2]);
    expect(merged).toContain("color:red");
    expect(merged).toContain("background:blue");
    // Should be a single rule (merged)
    const matches = merged.match(/\.test\{/g);
    expect(matches?.length).toBe(1);
  });

  test("handles media queries", () => {
    const program = makeProgram([
      makeStyleBlock("@media (max-width: 768px) { .card { padding: 8px; } }"),
      makeElement("div", [{ name: "class", value: "card" }]),
    ]);

    const result = extractCSS(program);
    expect(result.css).toContain("@media");
  });

  test("compression ratio is calculated", () => {
    const program = makeProgram([
      makeStyleBlock(".test { padding: 16px; margin: 0px; color: #ffffff; }"),
    ]);

    const result = extractCSS(program);
    expect(result.compressionRatio).toBeGreaterThanOrEqual(0);
    expect(result.compressionRatio).toBeLessThanOrEqual(1);
  });
});

// --- JS Bundle Tests --------------------------------------------------

describe("JS Bundle Builder", () => {
  test("generates runtime code", () => {
    const runtime = generateRuntimeCode();
    expect(runtime).toContain("function h(");
    expect(runtime).toContain("function diff(");
    expect(runtime).toContain("function patch(");
    expect(runtime).toContain("createElement");
    expect(runtime).toContain("registerHandler");
  });

  test("generates bootstrap code", () => {
    const bootstrap = generateBootstrapCode();
    expect(bootstrap).toContain("__TW_HYDRATION__");
    expect(bootstrap).toContain("attachEvents");
  });

  test("generates complete bundle", () => {
    const program = makeProgram([
      makeElement("div", [], [
        makeElement("button", [{ name: "class", value: "btn" }]),
      ]),
    ]);

    const bundle = generateBundle(program, { minify: false, includeRuntime: true, treeShake: false });
    expect(bundle.code).toContain("h(");
    expect(bundle.code).toContain("render()");
    expect(bundle.metadata.componentCount).toBeGreaterThanOrEqual(0);
    expect(bundle.metadata.totalSize).toBeGreaterThan(0);
  });

  test("bundle without runtime", () => {
    const program = makeProgram([makeElement("div")]);
    const bundle = generateBundle(program, {
      minify: false,
      includeRuntime: false,
      treeShake: false,
    });
    expect(bundle.runtime).toBe("");
    expect(bundle.app.length).toBeGreaterThan(0);
  });

  test("tree shaking removes unused code", () => {
    const program = makeProgram([makeElement("div")]);
    const bundle = generateBundle(program, {
      minify: false,
      includeRuntime: false,
      treeShake: true,
    });
    expect(bundle.code).not.toContain("undefined");
  });
});

// --- Template Generator Tests -----------------------------------------

describe("Template Generator", () => {
  test("generates template function", () => {
    const program = makeProgram([
      makeElement("div", [{ name: "class", value: "container" }], [makeText("Hello")]),
    ]);

    const templateFn = generateTemplateFunction(program);
    expect(templateFn).toContain("function render(");
    expect(templateFn).toContain("return");
    expect(templateFn).toContain("<div");
    expect(templateFn).toContain("Hello");
  });

  test("generates arrow function template", () => {
    const program = makeProgram([
      makeElement("span", [], [makeText("test")]),
    ]);

    const arrow = generateArrowTemplate(program);
    expect(arrow).toContain("=>");
    expect(arrow).toContain("span");
  });

  test("handles interpolated values", () => {
    const program = makeProgram([
      makeElement("h1", [], [makeText("Hello {name}!", true)]),
    ]);

    const templateFn = generateTemplateFunction(program);
    expect(templateFn).toContain("${");
    expect(templateFn).toContain("data.name");
  });

  test("handles for loops in template", () => {
    const program = makeProgram([
      makeFor("item", "items", [makeElement("li", [], [makeText("test")])]),
    ]);

    const templateFn = generateTemplateFunction(program);
    expect(templateFn).toContain(".map(");
    expect(templateFn).toContain(".join(");
  });

  test("handles conditionals in template", () => {
    const program = makeProgram([
      makeIf("show", [makeElement("div")], [makeElement("span")]),
    ]);

    const templateFn = generateTemplateFunction(program);
    expect(templateFn).toContain("?");
    expect(templateFn).toContain(":");
  });
});

// --- HTML Minifier Tests ----------------------------------------------

describe("HTML Minifier", () => {
  test("removes comments", () => {
    const html = "<div><!-- comment --><p>Hello</p></div>";
    const minified = minifyHTMLDeep(html);
    expect(minified).not.toContain("<!--");
    expect(minified).toContain("Hello");
  });

  test("keeps conditional comments", () => {
    const html = "<!--[if IE]><p>IE</p><![endif]--><div>Content</div>";
    const minified = minifyHTMLDeep(html);
    expect(minified).toContain("[if IE]");
  });

  test("collapses whitespace", () => {
    const html = "<div>\n\n  <p>Hello</p>\n\n</div>";
    const minified = minifyHTMLDeep(html);
    expect(minified).not.toContain("\n\n");
    expect(minified).not.toContain("  ");
  });

  test("removes redundant attributes", () => {
    const html = '<script type="text/javascript">console.log(1)</script>';
    const minified = minifyHTMLDeep(html);
    expect(minified).not.toContain('type="text/javascript"');
  });

  test("collapses boolean attributes", () => {
    const html = '<input disabled="disabled" />';
    const minified = minifyHTMLDeep(html);
    expect(minified).toContain("disabled");
    expect(minified).not.toContain('disabled="disabled"');
  });

  test("removes empty attributes", () => {
    const html = '<div class="" data-x="y">content</div>';
    const minified = minifyHTMLDeep(html);
    expect(minified).not.toContain('class=""');
    expect(minified).toContain('data-x="y"');
  });

  test("preserves content in pre tags", () => {
    const html = "<pre>\n  code\n  block\n</pre>";
    const minified = minifyHTMLDeep(html);
    expect(minified).toContain("code");
    // Pre content should be preserved
    expect(minified).toContain("<pre>");
  });

  test("minifyHTMLWithStats returns stats", () => {
    const html = "<div>\n  <p>Hello</p>\n</div>";
    const { html: minified, stats } = minifyHTMLWithStats(html);
    expect(stats.originalSize).toBe(html.length);
    expect(stats.minifiedSize).toBeLessThanOrEqual(stats.originalSize);
    expect(stats.saved).toBeGreaterThanOrEqual(0);
    expect(stats.ratio).toBeGreaterThan(0);
    expect(stats.ratio).toBeLessThanOrEqual(1);
  });
});

// --- Source Map Tests ------------------------------------------------

describe("Source Map Generator", () => {
  test("creates a source map builder", () => {
    const builder = createSourceMapBuilder();
    expect(builder).toBeInstanceOf(SourceMapBuilder);
  });

  test("adds sources and names", () => {
    const builder = new SourceMapBuilder();
    builder.addSource("app.tw", "source content");
    builder.addName("myVar");

    const map = builder.build();
    expect(map.sources).toContain("app.tw");
    expect(map.sourcesContent).toContain("source content");
    expect(map.names).toContain("myVar");
  });

  test("encodes VLQ mappings", () => {
    const builder = new SourceMapBuilder();
    builder.addSource("app.tw");
    builder.addMapping({
      generatedLine: 0,
      generatedColumn: 0,
      sourceIndex: 0,
      originalLine: 0,
      originalColumn: 0,
    });

    const map = builder.build();
    expect(map.version).toBe(3);
    expect(map.mappings.length).toBeGreaterThan(0);
  });

  test("generates source map from code", () => {
    const code = "function render() { return '<div></div>'; }";
    const map = generateSourceMap(code, "app.tw", "source");
    expect(map.sources[0]).toBe("app.tw");
    expect(map.sourcesContent[0]).toBe("source");
    expect(map.mappings.length).toBeGreaterThan(0);
  });

  test("builds JSON string", () => {
    const builder = new SourceMapBuilder();
    builder.addSource("test.tw");
    builder.addMapping({
      generatedLine: 0,
      generatedColumn: 0,
      sourceIndex: 0,
      originalLine: 0,
      originalColumn: 0,
    });

    const json = builder.toJSON("output.js");
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(3);
    expect(parsed.file).toBe("output.js");
  });
});

// --- Orchestrator Tests -----------------------------------------------

describe("Codegen Orchestrator", () => {
  test("runs full codegen pipeline", () => {
    const program = makeProgram([
      makeStyleBlock(".card { color: red; }"),
      makeElement("div", [{ name: "class", value: "card" }], [makeText("Hello")]),
    ]);

    const result = deepGenerate(program, {
      minify: false,
      sourceMap: false,
      extractCSS: true,
      generateJS: true,
      generateVDOM: true,
    });

    expect(result.html).toContain("Hello");
    expect(result.css).toContain("card");
    expect(result.js).toContain("h(");
    expect(result.metadata.renderTime).toBeGreaterThanOrEqual(0);
    expect(result.totalSize).toBeGreaterThan(0);
  });

  test("generateHTMLOnly returns just HTML", () => {
    const program = makeProgram([
      makeElement("div", [], [makeText("Test")]),
    ]);

    const html = generateHTMLOnly(program, false);
    expect(html).toContain("<div>");
    expect(html).toContain("Test");
  });

  test("generateCSSOnly returns CSS extraction", () => {
    const program = makeProgram([
      makeStyleBlock(".test { color: blue; }"),
      makeElement("div", [{ name: "class", value: "test" }]),
    ]);

    const result = generateCSSOnly(program);
    expect(result.css).toContain("test");
    expect(result.css).toContain("blue");
  });

  test("generateJSOnly returns JS bundle", () => {
    const program = makeProgram([
      makeElement("div"),
    ]);

    const bundle = generateJSOnly(program, false);
    expect(bundle.code).toContain("h(");
    expect(bundle.metadata.totalSize).toBeGreaterThan(0);
  });

  test("generateStreaming returns chunks", () => {
    const program = makeProgram([
      makeElement("div", [], [makeText("Stream")]),
    ]);

    const chunks = generateStreaming(program);
    expect(chunks.length).toBeGreaterThan(0);
    const html = chunksToHTML(chunks);
    expect(html).toContain("Stream");
  });

  test("DEFAULT_CODEGEN_OPTIONS has expected values", () => {
    expect(DEFAULT_CODEGEN_OPTIONS.mode).toBe("ssr");
    expect(DEFAULT_CODEGEN_OPTIONS.minify).toBe(true);
    expect(DEFAULT_CODEGEN_OPTIONS.extractCSS).toBe(true);
    expect(DEFAULT_CODEGEN_OPTIONS.generateJS).toBe(true);
  });

  test("orchestrator with streaming mode", () => {
    const program = makeProgram([
      makeElement("div", [], [makeText("Streaming mode")]),
    ]);

    const result = deepGenerate(program, { mode: "streaming", minify: false });
    expect(result.html).toContain("Streaming mode");
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  test("orchestrator returns metadata", () => {
    const program = makeProgram([
      makeElement("div", [], [
        makeElement("span", [], [makeText("text")]),
      ]),
    ]);

    const result = deepGenerate(program, { minify: false, sourceMap: false });
    expect(result.metadata.elementCount).toBeGreaterThan(0);
    expect(result.metadata.nodeCount).toBeGreaterThan(0);
    expect(result.metadata.htmlSize).toBeGreaterThan(0);
  });
});
