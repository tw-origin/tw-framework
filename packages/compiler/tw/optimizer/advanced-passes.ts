/**
 * Advanced optimizer passes -- additional optimization passes that go beyond
 * the basic fold/inline/shake/DCE/transform pipeline.
 *
 * These passes implement optimizations found in production compilers like
 * LLVM and GCC, adapted for TW's template/component AST.
 *
 * Passes:
 * 1. Constant propagation -- track constant values through the AST
 * 2. Copy propagation -- replace variables that copy constants
 * 3. Dead store elimination -- remove assignments that are never read
 * 4. Strength reduction -- replace expensive operations with cheaper ones
 * 5. Peephole optimization -- pattern-based local rewrites
 * 6. Property access folding -- fold obj.prop when obj is known
 * 7. Template literal folding -- evaluate template literals with known parts
 * 8. Object literal folding -- fold object literals with known values
 * 9. Switch simplification -- simplify switch with constant expression
 * 10. Redundant assignment elimination -- remove duplicate assignments
 * 11. HTML whitespace optimization -- collapse unnecessary whitespace
 * 12. CSS optimization -- minify CSS in style blocks
 */

import type { Program } from "../ast/nodes";

// --- Result Type ----------------------------------------------------

export interface AdvancedOptResult {
  program: Program;
  transformsApplied: number;
  details: AdvancedOptDetail[];
}

export interface AdvancedOptDetail {
  pass: string;
  count: number;
  description: string;
}

// --- Main Entry Point ------------------------------------------------

export function optimizeAdvanced(program: Program): AdvancedOptResult {
  let current = deepClone(program);
  let totalTransforms = 0;
  const details: AdvancedOptDetail[] = [];

  // Pass 1: Constant propagation
  const r1 = constantPropagation(current);
  if (r1.changed) {
    totalTransforms += r1.count;
    details.push({ pass: "constant-prop", count: r1.count, description: "Propagated constant values" });
    current = r1.program;
  }

  // Pass 2: Copy propagation
  const r2 = copyPropagation(current);
  if (r2.changed) {
    totalTransforms += r2.count;
    details.push({ pass: "copy-prop", count: r2.count, description: "Propagated copied values" });
    current = r2.program;
  }

  // Pass 3: Dead store elimination
  const r3 = deadStoreElimination(current);
  if (r3.changed) {
    totalTransforms += r3.count;
    details.push({ pass: "dead-store", count: r3.count, description: "Removed dead stores" });
    current = r3.program;
  }

  // Pass 4: Strength reduction
  const r4 = strengthReduction(current);
  if (r4.changed) {
    totalTransforms += r4.count;
    details.push({ pass: "strength-reduction", count: r4.count, description: "Replaced expensive operations" });
    current = r4.program;
  }

  // Pass 5: Peephole optimization
  const r5 = peepholeOptimize(current);
  if (r5.changed) {
    totalTransforms += r5.count;
    details.push({ pass: "peephole", count: r5.count, description: "Applied peephole patterns" });
    current = r5.program;
  }

  // Pass 6: Property access folding
  const r6 = propertyAccessFolding(current);
  if (r6.changed) {
    totalTransforms += r6.count;
    details.push({ pass: "prop-fold", count: r6.count, description: "Folded property accesses" });
    current = r6.program;
  }

  // Pass 7: Template literal folding
  const r7 = templateLiteralFolding(current);
  if (r7.changed) {
    totalTransforms += r7.count;
    details.push({ pass: "template-fold", count: r7.count, description: "Folded template literals" });
    current = r7.program;
  }

  // Pass 8: Object literal folding
  const r8 = objectLiteralFolding(current);
  if (r8.changed) {
    totalTransforms += r8.count;
    details.push({ pass: "object-fold", count: r8.count, description: "Folded object literals" });
    current = r8.program;
  }

  // Pass 9: Switch simplification
  const r9 = switchSimplification(current);
  if (r9.changed) {
    totalTransforms += r9.count;
    details.push({ pass: "switch-simp", count: r9.count, description: "Simplified switch statements" });
    current = r9.program;
  }

  // Pass 10: Redundant assignment elimination
  const r10 = redundantAssignmentElimination(current);
  if (r10.changed) {
    totalTransforms += r10.count;
    details.push({ pass: "redundant-assign", count: r10.count, description: "Removed redundant assignments" });
    current = r10.program;
  }

  // Pass 11: HTML whitespace optimization
  const r11 = htmlWhitespaceOptimization(current);
  if (r11.changed) {
    totalTransforms += r11.count;
    details.push({ pass: "html-ws", count: r11.count, description: "Optimized HTML whitespace" });
    current = r11.program;
  }

  // Pass 12: CSS optimization
  const r12 = cssOptimization(current);
  if (r12.changed) {
    totalTransforms += r12.count;
    details.push({ pass: "css-opt", count: r12.count, description: "Optimized CSS in style blocks" });
    current = r12.program;
  }

  return { program: current, transformsApplied: totalTransforms, details };
}

// --- Pass 1: Constant Propagation -----------------------------------

interface ConstInfo {
  name: string;
  value: string;
  isLiteral: boolean;
}

function constantPropagation(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);
  const constants = new Map<string, ConstInfo>();

  // Collect constants from state declarations
  walkAST(cloned, (node: any) => {
    if (node.type === "StateDirective" && node.declarations) {
      for (const decl of node.declarations) {
        if (decl.value && isLiteral(decl.value)) {
          constants.set(decl.name, { name: decl.name, value: decl.value, isLiteral: true });
        }
      }
    }
  });

  // Propagate constants in expressions
  walkAST(cloned, (node: any) => {
    const exprs = getExpressions(node);
    for (const expr of exprs) {
      let newExpr = expr;
      for (const [name, info] of constants) {
        const regex = new RegExp(`(?<![.\\w])${escapeRegex(name)}(?!\\w)`, "g");
        newExpr = newExpr.replace(regex, info.value);
      }
      if (newExpr !== expr) {
        setExpression(node, expr, newExpr);
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 2: Copy Propagation ----------------------------------------

function copyPropagation(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  // Find assignments like: let b = a; (where a is a known constant)
  // Then replace b with a in subsequent expressions
  const copies = new Map<string, string>(); // b -> a

  walkAST(cloned, (node: any) => {
    if (node.type === "StateDirective" && node.declarations) {
      for (const decl of node.declarations) {
        // If the value is just an identifier, it's a copy
        const trimmed = (decl.value || "").trim();
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)) {
          copies.set(decl.name, trimmed);
        }
      }
    }
  });

  // Replace copies
  walkAST(cloned, (node: any) => {
    const exprs = getExpressions(node);
    for (const expr of exprs) {
      let newExpr = expr;
      for (const [copy, original] of copies) {
        const regex = new RegExp(`(?<![.\\w])${escapeRegex(copy)}(?!\\w)`, "g");
        newExpr = newExpr.replace(regex, original);
      }
      if (newExpr !== expr) {
        setExpression(node, expr, newExpr);
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 3: Dead Store Elimination ----------------------------------

function deadStoreElimination(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  // Find state variables that are assigned but never read
  const assignments = new Map<string, number>(); // name -> assignment count
  const reads = new Map<string, number>(); // name -> read count

  walkAST(cloned, (node: any) => {
    if (node.type === "StateDirective" && node.declarations) {
      for (const decl of node.declarations) {
        assignments.set(decl.name, (assignments.get(decl.name) || 0) + 1);
      }
    }
    // Count reads in expressions
    const exprs = getExpressions(node);
    for (const expr of exprs) {
      const idents = extractIdents(expr);
      for (const id of idents) {
        reads.set(id, (reads.get(id) || 0) + 1);
      }
    }
  });

  // Remove declarations that are never read
  walkAST(cloned, (node: any) => {
    if (node.type === "StateDirective" && node.declarations) {
      const filtered = node.declarations.filter((decl: any) => {
        const readCount = reads.get(decl.name) || 0;
        if (readCount === 0) {
          count++;
          return false;
        }
        return true;
      });
      node.declarations = filtered;
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 4: Strength Reduction --------------------------------------

function strengthReduction(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    const exprs = getExpressions(node);
    for (const expr of exprs) {
      let newExpr = expr;

      // x * 2 -> x + x (addition is faster than multiplication)
      newExpr = newExpr.replace(/(\w+)\s*\*\s*2\b/g, "$1 + $1");
      // x * 1 -> x
      newExpr = newExpr.replace(/(\w+)\s*\*\s*1\b/g, "$1");
      // x / 1 -> x
      newExpr = newExpr.replace(/(\w+)\s*\/\s*1\b/g, "$1");
      // x * 0 -> 0
      newExpr = newExpr.replace(/(\w+)\s*\*\s*0\b/g, "0");
      // x + 0 -> x
      newExpr = newExpr.replace(/(\w+)\s*\+\s*0\b/g, "$1");
      // x - 0 -> x
      newExpr = newExpr.replace(/(\w+)\s*-\s*0\b/g, "$1");
      // x ** 2 -> x * x (exponentiation is slower than multiplication)
      newExpr = newExpr.replace(/(\w+)\s*\*\*\s*2\b/g, "$1 * $1");
      // Math.pow(x, 2) -> x * x
      newExpr = newExpr.replace(/Math\.pow\((\w+),\s*2\)/g, "$1 * $1");
      // Math.pow(x, 0.5) -> Math.sqrt(x)
      newExpr = newExpr.replace(/Math\.pow\((\w+),\s*0\.5\)/g, "Math.sqrt($1)");

      if (newExpr !== expr) {
        setExpression(node, expr, newExpr);
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 5: Peephole Optimization ----------------------------------

function peepholeOptimize(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    const exprs = getExpressions(node);
    for (const expr of exprs) {
      let newExpr = expr;

      // !!x -> Boolean(x) is NOT simpler -- skip
      // x + "" -> String(x)
      newExpr = newExpr.replace(/(\w+)\s*\+\s*""/g, "String($1)");
      // "" + x -> String(x)
      newExpr = newExpr.replace(/""\s*\+\s*(\w+)/g, "String($1)");
      // +x -> Number(x) -- only if not preceded by another operator
      newExpr = newExpr.replace(/(?<![+\-*/%(=<>!&|:])\+(\w+)/g, "Number($1)");
      // x * 1 === x -> true (identity check)
      newExpr = newExpr.replace(/(\w+)\s*\*\s*1\s*===\s*\1/g, "true");
      // typeof x === "undefined" -> x === undefined
      newExpr = newExpr.replace(/typeof\s+(\w+)\s*===\s*"undefined"/g, "$1 === undefined");
      // Array.isArray(x) === false -> !Array.isArray(x)
      newExpr = newExpr.replace(/Array\.isArray\((\w+)\)\s*===\s*false/g, "!Array.isArray($1)");
      // x !== null && x !== undefined -> x != null
      newExpr = newExpr.replace(/(\w+)\s*!==\s*null\s*&&\s*\1\s*!==\s*undefined/g, "$1 != null");
      // x === null || x === undefined -> x == null
      newExpr = newExpr.replace(/(\w+)\s*===\s*null\s*\|\|\s*\1\s*===\s*undefined/g, "$1 == null");

      if (newExpr !== expr) {
        setExpression(node, expr, newExpr);
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 6: Property Access Folding --------------------------------

const KNOWN_PROPERTIES = new Map<string, Record<string, string>>([
  ["Math", { PI: "3.141592653589793", E: "2.718281828459045", LN2: "0.6931471805599453", LN10: "2.302585092994046", SQRT2: "1.4142135623730951" }],
]);

function propertyAccessFolding(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    const exprs = getExpressions(node);
    for (const expr of exprs) {
      let newExpr = expr;

      // Fold Math.PI -> 3.14159...
      for (const [obj, props] of (KNOWN_PROPERTIES as any)) {
        for (const [prop, value] of props) {
          const regex = new RegExp(`\\b${obj}\\.${prop}\\b`, "g");
          newExpr = newExpr.replace(regex, value);
        }
      }

      if (newExpr !== expr) {
        setExpression(node, expr, newExpr);
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 7: Template Literal Folding -------------------------------

function templateLiteralFolding(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    const exprs = getExpressions(node);
    for (const expr of exprs) {
      let newExpr = expr;

      // Fold template literals with all-literal parts: `hello ${"world"}` -> "helloworld"
      // Pattern: `literal ${"literal"} literal` -> "literal literal literal"
      newExpr = newExpr.replace(/`([^`]*)\$\{"([^"]*)"\}([^`]*)`/g, (_, pre, inner, post) => `"${pre}${inner}${post}"`);
      // Fold `${"literal"}` -> "literal"
      newExpr = newExpr.replace(/\$\{"([^"]*)"\}/g, '"$1"');
      // Fold `${number}` -> number (e.g., ${42} -> 42)
      newExpr = newExpr.replace(/\$\{(\d+(?:\.\d+)?)\}/g, "$1");

      if (newExpr !== expr) {
        setExpression(node, expr, newExpr);
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 8: Object Literal Folding ---------------------------------

function objectLiteralFolding(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    const exprs = getExpressions(node);
    for (const expr of exprs) {
      let newExpr = expr;

      // Fold object property access: {a: 1}.a -> 1
      newExpr = newExpr.replace(/\{(\w+):\s*([^}]+)\}\.\1/g, "$2");
      // Fold array index: [a, b, c][0] -> a (for numeric indices)
      newExpr = newExpr.replace(/\[([^\]]+)\]\[(\d+)\]/g, (_, items, idx) => {
        const arr = items.split(",").map((s: string) => s.trim());
        const i = parseInt(idx, 10);
        return i >= 0 && i < arr.length ? arr[i] : _;
      });

      if (newExpr !== expr) {
        setExpression(node, expr, newExpr);
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 9: Switch Simplification ----------------------------------

function switchSimplification(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    if (node.type !== "Switch") return;

    // If the switch expression is a constant, resolve it
    if (node.expression && isLiteral(node.expression)) {
      const constValue = node.expression;
      for (const caseNode of node.cases || []) {
        if (caseNode.value === constValue) {
          // Replace switch with the matching case body
          node.type = "Fragment";
          node.children = caseNode.body || [];
          delete node.expression;
          delete node.cases;
          count++;
          return;
        }
      }
      // No matching case -- check for default
      if (node.default) {
        node.type = "Fragment";
        node.children = node.default.body || [];
        delete node.expression;
        delete node.cases;
        delete node.default;
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 10: Redundant Assignment Elimination ----------------------

function redundantAssignmentElimination(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  // Find state variables that are assigned the same value multiple times
  const assignments = new Map<string, string[]>(); // name -> values

  walkAST(cloned, (node: any) => {
    if (node.type === "StateDirective" && node.declarations) {
      for (const decl of node.declarations) {
        if (!assignments.has(decl.name)) {
          assignments.set(decl.name, []);
        }
        assignments.get(decl.name)!.push(decl.value || "");
      }
    }
  });

  // Remove redundant assignments (same value assigned multiple times)
  walkAST(cloned, (node: any) => {
    if (node.type === "StateDirective" && node.declarations) {
      const seen = new Map<string, string>(); // name -> last value
      const filtered = node.declarations.filter((decl: any) => {
        const lastValue = seen.get(decl.name);
        if (lastValue === decl.value) {
          count++;
          return false; // Redundant -- same value
        }
        seen.set(decl.name, decl.value || "");
        return true;
      });
      node.declarations = filtered;
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 11: HTML Whitespace Optimization --------------------------

function htmlWhitespaceOptimization(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    if (node.type === "Text" && !node.isInterpolated) {
      const original = node.value || "";
      // Collapse multiple whitespace into single space
      let optimized = original.replace(/[ \t]+/g, " ");
      // Remove leading/trailing whitespace if it's between block elements
      optimized = optimized.replace(/\n\s*\n/g, "\n");
      // Trim if the text is just whitespace
      if (/^\s*$/.test(optimized)) {
        optimized = optimized.trim();
      }
      if (optimized !== original) {
        node.value = optimized;
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 12: CSS Optimization --------------------------------------

function cssOptimization(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    if (node.type === "StyleBlock" && node.content) {
      const original = node.content;
      let optimized = original;
      // Remove comments
      optimized = optimized.replace(/\/\*[\s\S]*?\*\//g, "");
      // Remove leading/trailing whitespace on each line
      optimized = optimized.replace(/^\s+/gm, "").replace(/\s+$/gm, "");
      // Collapse multiple semicolons
      optimized = optimized.replace(/;+/g, ";");
      // Remove last semicolon before }
      optimized = optimized.replace(/;\s*}/g, "}");
      // Remove unnecessary whitespace around : and ;
      optimized = optimized.replace(/\s*:\s*/g, ":").replace(/\s*;\s*/g, ";");
      // Remove unnecessary whitespace around { and }
      optimized = optimized.replace(/\s*{\s*/g, "{").replace(/\s*}\s*/g, "}");
      // Collapse multiple newlines
      optimized = optimized.replace(/\n+/g, "\n").trim();

      if (optimized !== original) {
        node.content = optimized;
        count++;
      }
    }

    // Also optimize inline styles
    if (node.type === "Element" && node.styles) {
      const seen = new Map<string, string>();
      const unique = node.styles.filter((style: any) => {
        if (seen.has(style.property)) {
          count++;
          return false;
        }
        seen.set(style.property, style.value);
        return true;
      });
      node.styles = unique;
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Helpers --------------------------------------------------------

function walkAST(node: any, visitor: (node: any) => void): void {
  if (!node || typeof node !== "object") return;
  visitor(node);
  const childKeys = ["body", "children", "elseBody", "directives", "props", "declarations", "cases", "default"];
  for (const key of childKeys) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        walkAST(child, visitor);
      }
    }
  }
}

function getExpressions(node: any): string[] {
  const exprs: string[] = [];
  if (node.type === "Text" && node.isInterpolated) exprs.push(node.value);
  if (node.type === "Element") {
    for (const attr of node.attrs || []) {
      if (attr.isInterpolated) exprs.push(attr.value);
    }
    for (const binding of node.bindings || []) {
      exprs.push(binding.expression);
    }
    for (const ev of node.events || []) {
      exprs.push(ev.handler);
    }
  }
  if (node.type === "If") exprs.push(node.condition);
  if (node.type === "For") exprs.push(node.iterable);
  if (node.type === "While") exprs.push(node.condition);
  if (node.type === "Switch") exprs.push(node.expression || "");
  return exprs;
}

function setExpression(node: any, oldExpr: string, newExpr: string): void {
  if (node.type === "Text" && node.value === oldExpr) {
    node.value = newExpr;
  } else if (node.type === "Element") {
    for (const attr of node.attrs || []) {
      if (attr.value === oldExpr) { attr.value = newExpr; return; }
    }
    for (const binding of node.bindings || []) {
      if (binding.expression === oldExpr) { binding.expression = newExpr; return; }
    }
    for (const ev of node.events || []) {
      if (ev.handler === oldExpr) { ev.handler = newExpr; return; }
    }
  } else if (node.type === "If" && node.condition === oldExpr) {
    node.condition = newExpr;
  } else if (node.type === "For" && node.iterable === oldExpr) {
    node.iterable = newExpr;
  } else if (node.type === "While" && node.condition === oldExpr) {
    node.condition = newExpr;
  } else if (node.type === "Switch" && node.expression === oldExpr) {
    node.expression = newExpr;
  }
}

function extractIdents(expr: string): string[] {
  const result: string[] = [];
  const cleaned = expr.replace(/["'`][^"'`]*["'`]/g, "");
  const regex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    if (!JS_KEYWORDS.has(match[0])) result.push(match[0]);
  }
  return result;
}

function isLiteral(value: string): boolean {
  const v = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(v)) return true;
  if (/^["'`].*["'`]$/.test(v)) return true;
  if (v === "true" || v === "false" || v === "null" || v === "undefined") return true;
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); } catch { /* ignored */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

const JS_KEYWORDS = new Set([
  "true", "false", "null", "undefined", "NaN", "Infinity",
  "if", "else", "for", "while", "return", "break", "continue",
  "var", "let", "const", "function", "new", "delete", "void",
  "typeof", "instanceof", "in", "of", "this", "super", "import", "export",
  "async", "await", "yield", "class", "extends", "static",
  "Math", "JSON", "Object", "Array", "String", "Number", "Boolean",
  "console", "window", "document", "globalThis", "process",
  "parseInt", "parseFloat", "isNaN", "isFinite",
]);
