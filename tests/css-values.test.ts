import { describe, test, expect } from "bun:test";
import { validateCssValues } from "../packages/compiler/tw/codegen/css-values.ts";

// Value-level checks are optional and warning-only (TW310). These tests cover
// both states: css-tree absent (the default, since the framework declares no
// dependency on it) and present.

const absent = async () => { throw new Error("Cannot find package 'css-tree'"); };

/** A stand-in with just enough surface for the walker. */
function fakeTree(bad: Record<string, string>) {
  const decls = Object.entries(bad).map(([prop, value]) => ({
    type: "Declaration", property: prop, value: { type: "Raw", value },
    loc: { start: { line: 1, column: 1 } },
  }));
  return {
    parse: () => ({ type: "StyleSheet", children: [] }),
    walk: (_ast: any, visitor: any) => { for (const d of decls) visitor.enter(d); },
    generate: () => "",
    lexer: { matchDeclaration: (node: any) => bad[node.property] ? { error: { message: "invalid value for " + node.property } } : {} },
  };
}

describe("value-level CSS checks (TW310)", () => {
  test("skipped when css-tree is absent, and nothing is reported", async () => {
    const r = await validateCssValues(".a { color: red }", absent);
    expect(r.skipped).toBe(true);
    expect(r.findings).toEqual([]);
  });

  test("a broken value is a warning, not an error", async () => {
    const r = await validateCssValues(".a { color: red }", async () => fakeTree({ color: "12px" }));
    expect(r.skipped).toBe(false);
    expect(r.findings.length).toBe(1);
    expect(r.findings[0].code).toBe("TW310");
    expect(r.findings[0].message).toContain("color");
  });

  test("a clean stylesheet produces no findings", async () => {
    const r = await validateCssValues(".a { color: red }", async () => fakeTree({}));
    expect(r.skipped).toBe(false);
    expect(r.findings).toEqual([]);
  });

  test("a loader that returns something unusable counts as skipped", async () => {
    expect((await validateCssValues(".a { color: red }", async () => ({}))).skipped).toBe(true);
  });

  test("a stylesheet the parser cannot read is not a value finding", async () => {
    const broken = { parse: () => { throw new Error("parse failed"); }, walk: () => {}, lexer: { matchDeclaration: () => ({}) } };
    expect((await validateCssValues(".a {", async () => broken)).findings).toEqual([]);
  });

  test("positions are carried through", async () => {
    const tree = fakeTree({ color: "12px" });
    tree.walk = (_a: any, v: any) => v.enter({ type: "Declaration", property: "color", value: {}, loc: { start: { line: 7, column: 12 } } });
    const r = await validateCssValues(".a { color: 12px }", async () => tree);
    expect(r.findings[0].line).toBe(7);
    expect(r.findings[0].col).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Regressions found while validating against a real css-tree 3.2.1 install.
// ---------------------------------------------------------------------------

/**
 * Reproduces the exact shapes css-tree reports on valid modern CSS: @property
 * descriptors, custom properties, and values containing var(). Deterministic,
 * so CI covers the filters even when css-tree is not installed.
 */
function modernCssTree() {
  const nodes = [
    { type: "Declaration", property: "syntax", value: {}, loc: { start: { line: 1, column: 17 } } },
    { type: "Declaration", property: "inherits", value: {}, loc: { start: { line: 1, column: 36 } } },
    { type: "Declaration", property: "--custom", value: {}, loc: { start: { line: 6, column: 7 } } },
    { type: "Declaration", property: "padding", value: {}, loc: { start: { line: 6, column: 22 } }, raw: "var(--custom, 2px)" },
  ];
  return {
    parse: () => ({ type: "StyleSheet", children: [] }),
    walk: (ast: any, visitor: any) => {
      if (visitor.visit === "Atrule") {
        visitor.enter({ type: "Atrule", name: "property", block: { children: nodes.slice(0, 2) } });
        return;
      }
      for (const n of nodes) visitor.enter(n);
    },
    generate: (node: any) => nodes.find((n) => n.value === node)?.raw ?? "",
    lexer: {
      matchDeclaration: (node: any) => {
        if (node.property === "--custom") return { error: { message: "Lexer matching doesn't applicable for custom properties" } };
        if (node.property === "padding") return { error: { message: "Matching for a tree with var() is not supported" } };
        return { error: { message: "Unknown property `" + node.property + "`" } };
      },
    },
  };
}

describe("valid modern CSS produces no TW310", () => {
  test("descriptor at-rules, custom properties and var() values are not findings", async () => {
    const r = await validateCssValues("@property --x { syntax: '<color>'; inherits: false }\n.a { --custom: 1px; padding: var(--custom, 2px) }", async () => modernCssTree());
    expect(r.skipped).toBe(false);
    expect(r.findings).toEqual([]);
  });

  test("a genuinely unknown property is still reported alongside them", async () => {
    const tree = modernCssTree();
    tree.walk = (_a: any, v: any) => {
      if (v.visit === "Atrule") { v.enter({ type: "Atrule", name: "property", block: { children: [] } }); return; }
      v.enter({ type: "Declaration", property: "fd", value: {}, loc: { start: { line: 9, column: 4 } } });
    };
    const r = await validateCssValues(".a { fd: column }", async () => tree);
    expect(r.findings.length).toBe(1);
    expect(r.findings[0].message).toContain("fd");
  });
});

describe("css-tree is resolved from the project root", () => {
  test("a css-tree installed only in the project is found", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "tw-csstree-"));
    mkdirSync(join(root, "node_modules", "css-tree"), { recursive: true });
    writeFileSync(join(root, "package.json"), '{"name":"p","private":true}');
    writeFileSync(join(root, "node_modules", "css-tree", "package.json"), '{"name":"css-tree","version":"9.9.9","main":"index.js"}');
    writeFileSync(join(root, "node_modules", "css-tree", "index.js"), "module.exports = { marker: 'from-project-root' };");
    const { projectCssTreeLoader } = await import("../apps/cli/tw/commands/check.ts");
    const loader = await projectCssTreeLoader(root);
    expect(typeof loader).toBe("function");
    const mod = await loader!();
    expect(mod.marker).toBe("from-project-root");
    rmSync(root, { recursive: true, force: true });
  });

  test("a project without css-tree yields no loader", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "tw-nocsstree-"));
    writeFileSync(join(root, "package.json"), '{"name":"p","private":true}');
    const { projectCssTreeLoader } = await import("../apps/cli/tw/commands/check.ts");
    expect(await projectCssTreeLoader(root)).toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("known limitation: an unknown property is not flagged when its value uses var()", () => {
  // Documented in docs/css-validation.md.
  test("fd: var(--x) produces no finding today", async () => {
    const tree = {
      parse: () => ({}),
      walk: (_a: any, v: any) => v.enter({ type: "Declaration", property: "fd", value: {}, loc: { start: { line: 1, column: 6 } } }),
      generate: () => "var(--x)",
      lexer: { matchDeclaration: () => ({ error: { message: "Unknown property `fd`" } }) },
    };
    expect((await validateCssValues(".a { fd: var(--x) }", async () => tree)).findings).toEqual([]);
  });
});
