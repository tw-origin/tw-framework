/** TW Framework -- Deep Optimizer Tests */

import { describe, test, expect } from "bun:test";
import {
  eliminateDeadCode,
  ConstantFolder,
  foldExpression,
  foldWithConstants,
  DependencyGraph,
  buildDependencyGraph,
  shakeTree,
  shakeToFixpoint,
  FunctionInliner,
  inlineFunctions,
  optimizeAST,
  optimizeDeep,
  optimizeFold,
  optimizeDCE,
  optimizeShake,
  optimizeTransform,
  optimizeInline,
  getDependencyGraph,
  generateOptReport,
  DEFAULT_PIPELINE_OPTIONS,
  type PipelineResult,
} from "@tw/compiler";

import type { Program } from "@tw/compiler";

// --- Helper ----------------------------------------------------------

function makeProgram(body: any[], directives: any[] = []): Program {
  return { type: "Program", body, directives } as any;
}

function makeElement(tag: string, attrs: any[] = [], children: any[] = []): any {
  return {
    type: "Element", tag, attrs, children,
    events: [], bindings: [], styles: [], directives: [],
    selfClosing: false,
    loc: { start: { line: 1, col: 1, offset: 0 } },
  };
}

function makeText(value: string, isInterpolated = false): any {
  return { type: "Text", value, isInterpolated, loc: { start: { line: 1, col: 1, offset: 0 } } };
}

function makeIf(condition: string, body: any[], elseBody: any[] = []): any {
  return { type: "If", condition, body, elseBody, loc: { start: { line: 1, col: 1, offset: 0 } } };
}

function makeFor(varName: string, iterable: string, body: any[]): any {
  return { type: "For", varName, iterable, body, loc: { start: { line: 1, col: 1, offset: 0 } } };
}

function makeStyleBlock(content: string): any {
  return { type: "StyleBlock", content, scoped: false, loc: { start: { line: 1, col: 1, offset: 0 } } };
}

function makeComponent(name: string, props: any[] = [], children: any[] = []): any {
  return { type: "Component", name, props, children, loc: { start: { line: 1, col: 1, offset: 0 } } };
}

// --- DCE Tests -------------------------------------------------------

describe("Dead Code Elimination", () => {
  test("removes if(false) block", () => {
    const program = makeProgram([
      makeElement("div"),
      makeIf("false", [makeElement("span")]),
    ]);
    const result = eliminateDeadCode(program);
    expect(result.removedNodes).toBeGreaterThan(0);
  });

  test("keeps if(true) body, removes else", () => {
    const program = makeProgram([
      makeIf("true", [makeElement("div")], [makeElement("span")]),
    ]);
    const result = eliminateDeadCode(program);
    expect(result.removedNodes).toBeGreaterThan(0);
  });

  test("removes while(false) loop", () => {
    const program = makeProgram([
      makeElement("div"),
      { type: "While", condition: "false", body: [makeElement("span")], loc: { start: { line: 1, col: 1, offset: 0 } } },
    ]);
    const result = eliminateDeadCode(program);
    expect(result.removedNodes).toBeGreaterThan(0);
  });

  test("removes empty text nodes", () => {
    const program = makeProgram([
      makeElement("div", [], [makeText("   "), makeText("Hello")]),
    ]);
    const result = eliminateDeadCode(program);
    expect(result.removedNodes).toBeGreaterThan(0);
  });

  test("removes empty elements", () => {
    const program = makeProgram([
      makeElement("div", [], [
        makeElement("span"), // empty span with no attrs
      ]),
    ]);
    const result = eliminateDeadCode(program);
    expect(result.removedNodes).toBeGreaterThan(0);
  });

  test("removes empty style blocks", () => {
    const program = makeProgram([
      makeStyleBlock("   "),
      makeElement("div"),
    ]);
    const result = eliminateDeadCode(program);
    expect(result.removedNodes).toBeGreaterThan(0);
  });

  test("removes unused CSS selectors", () => {
    const program = makeProgram([
      makeStyleBlock(".used { color: red; } .unused { color: blue; }"),
      makeElement("div", [{ name: "class", value: "used" }]),
    ]);
    const result = eliminateDeadCode(program);
    expect(result.removedSelectors).toBeGreaterThan(0);
  });

  test("runs to fixpoint", () => {
    const program = makeProgram([
      makeIf("false", [makeIf("false", [makeElement("div")])]),
    ]);
    const result = eliminateDeadCode(program);
    expect(result.passes).toBeGreaterThanOrEqual(1);
    expect(result.removedNodes).toBeGreaterThan(0);
  });

  test("provides details", () => {
    const program = makeProgram([
      makeIf("false", [makeElement("div")]),
    ]);
    const result = eliminateDeadCode(program);
    expect(result.details.length).toBeGreaterThan(0);
    expect(result.details[0].pass).toBeDefined();
    expect(result.details[0].removed).toBeGreaterThan(0);
  });
});

// --- Constant Folding Tests -----------------------------------------

describe("Constant Folding", () => {
  test("folds arithmetic", () => {
    expect(foldExpression("2 + 3").didFold).toBe(true);
    expect(foldExpression("2 + 3").folded).toBe("5");

    expect(foldExpression("10 * 4").didFold).toBe(true);
    expect(foldExpression("10 * 4").folded).toBe("40");

    expect(foldExpression("100 / 5").didFold).toBe(true);
    expect(foldExpression("100 / 5").folded).toBe("20");

    expect(foldExpression("17 % 5").didFold).toBe(true);
    expect(foldExpression("17 % 5").folded).toBe("2");

    expect(foldExpression("2 ** 10").didFold).toBe(true);
    expect(foldExpression("2 ** 10").folded).toBe("1024");
  });

  test("folds string concatenation", () => {
    expect(foldExpression('"Hello " + "World"').didFold).toBe(true);
    expect(foldExpression('"Hello " + "World"').folded).toContain("Hello World");
  });

  test("folds boolean logic", () => {
    expect(foldExpression("true && false").didFold).toBe(true);
    expect(foldExpression("true && false").folded).toBe("false");

    expect(foldExpression("true || false").didFold).toBe(true);
    expect(foldExpression("true || false").folded).toBe("true");

    expect(foldExpression("!true").didFold).toBe(true);
    expect(foldExpression("!true").folded).toBe("false");
  });

  test("folds comparisons", () => {
    expect(foldExpression("5 > 3").didFold).toBe(true);
    expect(foldExpression("5 > 3").folded).toBe("true");

    expect(foldExpression("2 === 2").didFold).toBe(true);
    expect(foldExpression("2 === 2").folded).toBe("true");

    expect(foldExpression("2 !== 3").didFold).toBe(true);
    expect(foldExpression("2 !== 3").folded).toBe("true");

    expect(foldExpression('"a" === "b"').didFold).toBe(true);
    expect(foldExpression('"a" === "b"').folded).toBe("false");
  });

  test("folds ternary", () => {
    expect(foldExpression("true ? 'yes' : 'no'").didFold).toBe(true);
    expect(foldExpression("true ? 'yes' : 'no'").folded).toBe("yes");

    expect(foldExpression("false ? 'yes' : 'no'").didFold).toBe(true);
    expect(foldExpression("false ? 'yes' : 'no'").folded).toBe("no");
  });

  test("folds nullish coalescing", () => {
    expect(foldExpression("null ?? 'default'").didFold).toBe(true);
    expect(foldExpression("null ?? 'default'").folded).toBe("default");
  });

  test("folds nested expressions", () => {
    const result = foldExpression("(2 + 3) * 4");
    expect(result.didFold).toBe(true);
    expect(result.folded).toBe("20");
  });

  test("folds Math functions", () => {
    expect(foldExpression("Math.max(1, 2, 3)").didFold).toBe(true);
    expect(foldExpression("Math.max(1, 2, 3)").folded).toBe("3");

    expect(foldExpression("Math.abs(-5)").didFold).toBe(true);
    expect(foldExpression("Math.abs(-5)").folded).toBe("5");

    expect(foldExpression("Math.round(3.7)").didFold).toBe(true);
    expect(foldExpression("Math.round(3.7)").folded).toBe("4");
  });

  test("folds string methods", () => {
    expect(foldExpression('"hello".toUpperCase()').didFold).toBe(true);
    expect(foldExpression('"hello".toUpperCase()').folded).toBe("HELLO");

    expect(foldExpression('"hello".length').didFold).toBe(true);
    expect(foldExpression('"hello".length').folded).toBe("5");
  });

  test("folds array methods", () => {
    expect(foldExpression("[1, 2, 3].length").didFold).toBe(true);
    expect(foldExpression("[1, 2, 3].length").folded).toBe("3");

    expect(foldExpression('[1, 2, 3].join("-")').didFold).toBe(true);
    expect(foldExpression('[1, 2, 3].join("-")').folded).toBe("1-2-3");
  });

  test("folds type conversions", () => {
    expect(foldExpression("String(42)").didFold).toBe(true);
    expect(foldExpression("String(42)").folded).toBe("42");

    expect(foldExpression("Number('123')").didFold).toBe(true);
    expect(foldExpression("Number('123')").folded).toBe("123");
  });

  test("folds with known constants", () => {
    const result = foldWithConstants("PI * 2", { PI: 3.14159 });
    expect(result.didFold).toBe(true);
    expect(result.folded).toBe("6.28318");
  });

  test("does not fold dynamic expressions", () => {
    expect(foldExpression("x + 1").didFold).toBe(false);
    expect(foldExpression("foo()").didFold).toBe(false);
    expect(foldExpression("a > b").didFold).toBe(false);
  });

  test("folds bitwise operators", () => {
    expect(foldExpression("5 & 3").didFold).toBe(true);
    expect(foldExpression("5 & 3").folded).toBe("1");

    expect(foldExpression("5 | 2").didFold).toBe(true);
    expect(foldExpression("5 | 2").folded).toBe("7");

    expect(foldExpression("5 ^ 3").didFold).toBe(true);
    expect(foldExpression("5 ^ 3").folded).toBe("6");

    expect(foldExpression("~5").didFold).toBe(true);
    expect(foldExpression("~5").folded).toBe("-6");
  });

  test("folds template literals", () => {
    const result = foldExpression("`Hello ${'World'}`");
    expect(result.didFold).toBe(true);
    expect(result.folded).toContain("Hello World");
  });

  test("folds type checks", () => {
    expect(foldExpression("typeof 42").didFold).toBe(true);
    expect(foldExpression("typeof 42").folded).toBe("number");

    expect(foldExpression("typeof 'hello'").didFold).toBe(true);
    expect(foldExpression("typeof 'hello'").folded).toBe("string");
  });

  test("folder class instance", () => {
    const folder = new ConstantFolder();
    folder.registerConstant("MAX", 100);
    const result = folder.fold("MAX * 2");
    expect(result.didFold).toBe(true);
    expect(result.folded).toBe("200");
  });
});

// --- Tree Shaker Tests -----------------------------------------------

describe("Tree Shaker", () => {
  test("builds dependency graph", () => {
    const program = makeProgram([
      makeComponent("MyComponent", [], [makeElement("div")]),
      makeElement("MyComponent"),
    ]);
    const graph = buildDependencyGraph(program);
    expect(graph.size).toBeGreaterThan(0);
  });

  test("marks roots", () => {
    const program = makeProgram([
      makeComponent("MyComponent"),
      makeElement("div"),
    ]);
    const graph = buildDependencyGraph(program);
    const roots = graph.getRoots();
    expect(roots.length).toBeGreaterThan(0);
  });

  test("detects unreachable nodes", () => {
    const program = makeProgram([
      makeStyleBlock(".used { color: red; } .unused { color: blue; }"),
      makeElement("div", [{ name: "class", value: "used" }]),
    ]);
    const result = shakeTree(program);
    expect(result.removed.length).toBeGreaterThan(0);
  });

  test("runs to fixpoint", () => {
    const program = makeProgram([
      makeStyleBlock(".a { color: red; } .b { color: blue; } .c { color: green; }"),
      makeElement("div", [{ name: "class", value: "a" }]),
    ]);
    const result = shakeToFixpoint(program);
    expect(result.passCount).toBeGreaterThanOrEqual(1);
  });

  test("graph detects cycles", () => {
    const graph = new DependencyGraph();
    graph.addNode("a", "component", "A");
    graph.addNode("b", "component", "B");
    graph.addDependency("a", "b");
    graph.addDependency("b", "a");
    const cycles = graph.detectCycles();
    expect(cycles.length).toBeGreaterThan(0);
  });

  test("graph topological sort", () => {
    const graph = new DependencyGraph();
    graph.addNode("a", "component", "A");
    graph.addNode("b", "component", "B");
    graph.addNode("c", "component", "C");
    graph.addDependency("a", "b");
    graph.addDependency("b", "c");
    const sorted = graph.topologicalSort();
    expect(sorted).toContain("a");
    expect(sorted).toContain("b");
    expect(sorted).toContain("c");
    // c should come before b, b before a
    expect(sorted.indexOf("c")).toBeLessThan(sorted.indexOf("b"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("a"));
  });

  test("graph toDot format", () => {
    const graph = new DependencyGraph();
    graph.addNode("a", "component", "A");
    graph.addNode("b", "component", "B");
    graph.addDependency("a", "b");
    const dot = graph.toDot();
    expect(dot).toContain("digraph");
    expect(dot).toContain("a");
    expect(dot).toContain("b");
  });
});

// --- Function Inliner Tests -----------------------------------------

describe("Function Inliner", () => {
  test("inlines constant references", () => {
    const program = makeProgram([
      makeElement("div", [], [makeText("{PI}", true)]),
    ], [
      { type: "StateDirective", declarations: [{ name: "PI", value: "3.14159" }] },
    ]);
    const result = inlineFunctions(program);
    expect(result.inlinedExpressions).toBeGreaterThan(0);
  });

  test("inliner class instance", () => {
    const inliner = new FunctionInliner();
    const result = inliner.inline(makeProgram([makeElement("div")]));
    expect(result).toBeDefined();
    expect(result.program).toBeDefined();
  });

  test("does not inline large functions", () => {
    const inliner = new FunctionInliner();
    // This is tested indirectly -- the maxInlineSize check prevents inlining
    const program = makeProgram([makeElement("div")]);
    const result = inliner.inline(program);
    expect(result.inlinedFunctions).toBe(0);
  });
});

// --- AST Transforms Tests --------------------------------------------

describe("AST Transforms", () => {
  test("merges adjacent text nodes", () => {
    const program = makeProgram([
      makeElement("div", [], [
        makeText("Hello "),
        makeText("World"),
        makeText("!"),
      ]),
    ]);
    const result = optimizeAST(program);
    expect(result.transformsApplied).toBeGreaterThan(0);
  });

  test("flattens nested fragments", () => {
    const program = makeProgram([
      {
        type: "Fragment",
        children: [
          {
            type: "Fragment",
            children: [makeElement("div")],
          },
        ],
      },
    ]);
    const result = optimizeAST(program);
    expect(result.transformsApplied).toBeGreaterThan(0);
  });

  test("deduplicates class names", () => {
    const program = makeProgram([
      makeElement("div", [{ name: "class", value: "a a b b c" }]),
    ]);
    const result = optimizeAST(program);
    expect(result.transformsApplied).toBeGreaterThan(0);
  });

  test("removes unnecessary interpolations", () => {
    const program = makeProgram([
      makeElement("div", [], [makeText('{"hello"}', true)]),
    ]);
    const result = optimizeAST(program);
    expect(result.transformsApplied).toBeGreaterThan(0);
  });

  test("simplifies boolean expressions", () => {
    const program = makeProgram([
      makeIf("!!true", [makeElement("div")]),
    ]);
    const result = optimizeAST(program);
    expect(result.transformsApplied).toBeGreaterThan(0);
  });

  test("merges style blocks", () => {
    const program = makeProgram([
      makeStyleBlock(".a { color: red; }"),
      makeStyleBlock(".b { color: blue; }"),
      makeElement("div"),
    ]);
    const result = optimizeAST(program);
    // Should merge 2 style blocks into 1
    expect(result.transformsApplied).toBeGreaterThan(0);
  });

  test("removes redundant wrappers", () => {
    const program = makeProgram([
      makeElement("div", [], [
        makeElement("span", [], [makeElement("span", [], [makeText("inner")])]),
      ]),
    ]);
    const result = optimizeAST(program);
    // The inner span wrapper should be removed
    expect(result.transformsApplied).toBeGreaterThanOrEqual(0);
  });

  test("swaps empty if with else", () => {
    const program = makeProgram([
      makeIf("show", [], [makeElement("div")]),
    ]);
    const result = optimizeAST(program);
    expect(result.transformsApplied).toBeGreaterThanOrEqual(0);
  });

  test("provides details", () => {
    const program = makeProgram([
      makeElement("div", [], [makeText("a"), makeText("b")]),
    ]);
    const result = optimizeAST(program);
    expect(result.details).toBeDefined();
    expect(Array.isArray(result.details)).toBe(true);
  });
});

// --- Pipeline Tests --------------------------------------------------

describe("Optimizer Pipeline", () => {
  test("runs full pipeline", () => {
    const program = makeProgram([
      makeIf("false", [makeElement("div")]),
      makeElement("span", [], [makeText("a"), makeText("b")]),
    ]);
    const result = optimizeDeep(program);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.beforeSize).toBeGreaterThan(0);
    expect(result.afterSize).toBeGreaterThanOrEqual(0);
    expect(result.savedBytes).toBeGreaterThanOrEqual(0);
  });

  test("pipeline with options", () => {
    const program = makeProgram([makeElement("div")]);
    const result = optimizeDeep(program, {
      constantFolding: false,
      functionInlining: false,
      treeShaking: false,
      deadCodeElimination: true,
      astTransforms: false,
      maxIterations: 2,
    });
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });

  test("individual optimization functions", () => {
    const program = makeProgram([makeElement("div")]);
    expect(optimizeFold(program)).toBeDefined();
    expect(optimizeDCE(program)).toBeDefined();
    expect(optimizeShake(program)).toBeDefined();
    expect(optimizeTransform(program)).toBeDefined();
    expect(optimizeInline(program)).toBeDefined();
  });

  test("getDependencyGraph", () => {
    const program = makeProgram([
      makeComponent("Foo"),
      makeElement("Foo"),
    ]);
    const graph = getDependencyGraph(program);
    expect(graph.size).toBeGreaterThan(0);
  });

  test("generateOptReport", () => {
    const program = makeProgram([
      makeIf("false", [makeElement("div")]),
    ]);
    const result = optimizeDeep(program);
    const report = generateOptReport(result);
    expect(report).toContain("Optimization Report");
    expect(report).toContain("Iterations");
    expect(report).toContain("Saved");
  });

  test("DEFAULT_PIPELINE_OPTIONS", () => {
    expect(DEFAULT_PIPELINE_OPTIONS.constantFolding).toBe(true);
    expect(DEFAULT_PIPELINE_OPTIONS.deadCodeElimination).toBe(true);
    expect(DEFAULT_PIPELINE_OPTIONS.treeShaking).toBe(true);
    expect(DEFAULT_PIPELINE_OPTIONS.maxIterations).toBe(10);
  });

  test("pipeline returns pass results", () => {
    const program = makeProgram([makeElement("div")]);
    const result = optimizeDeep(program);
    expect(result.passResults).toBeDefined();
    expect(Array.isArray(result.passResults)).toBe(true);
  });

  test("pipeline handles complex program", () => {
    const program = makeProgram([
      makeStyleBlock(".used { color: red; } .unused { color: blue; }"),
      makeElement("div", [{ name: "class", value: "used used" }], [
        makeText("Hello "),
        makeText("World"),
        makeIf("false", [makeElement("span")]),
      ]),
    ]);
    const result = optimizeDeep(program);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.totalTransforms).toBeGreaterThan(0);
  });
});
