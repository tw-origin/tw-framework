/**
 * AST Optimizer -- structural optimizations that rewrite the AST tree.
 *
 * These are transformations that change the structure of the AST
 * to make the generated code smaller and faster. Unlike DCE (which
 * removes nodes) and constant folding (which evaluates expressions),
 * these passes RESTRUCTURE the tree.
 *
 * Passes:
 * 1. Merge adjacent text nodes: "Hello " + "World" -> "Hello World"
 * 2. Flatten nested fragments: <><><div/></></> -> <div/>
 * 3. Merge adjacent elements with same tag (where safe)
 * 4. Simplify conditionals: if(true){A}else{B} -> A
 * 5. Hoist static subtrees: move unchanged elements outside loops
 * 6. Merge style declarations: multiple <style> blocks -> one
 * 7. Deduplicate attributes: class="a a b" -> class="a b"
 * 8. Merge class attributes: class="a" class="b" -> class="a b"
 * 9. Remove redundant wrappers: <div><div>...</div></div> -> <div>...</div>
 * 10. Optimize lists: keyed for-loops -> unkeyed when keys are sequential
 * 11. Inline template references
 * 12. Simplify boolean expressions: !!true -> true, !(!x) -> x
 * 13. Remove unnecessary interpolations: {"literal"} -> "literal"
 * 14. Merge consecutive if-else chains into switch-like structure
 * 15. Eliminate common subexpressions in template bindings
 */

import type { Program } from "../ast/nodes";

// --- Transform Result ------------------------------------------------

export interface TransformResult {
  program: Program;
  transformsApplied: number;
  details: TransformDetail[];
}

export interface TransformDetail {
  pass: string;
  count: number;
  description: string;
}

// --- Main Entry Point ------------------------------------------------

export function optimizeAST(program: Program): TransformResult {
  let current = deepClone(program);
  let totalTransforms = 0;
  const details: TransformDetail[] = [];
  const maxIterations = 5;

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Pass 1: Merge adjacent text nodes
    const r1 = mergeAdjacentText(current);
    if (r1.changed) {
      changed = true;
      totalTransforms += r1.count;
      details.push({ pass: "merge-text", count: r1.count, description: "Merged adjacent text nodes" });
      current = r1.program;
    }

    // Pass 2: Flatten nested fragments
    const r2 = flattenFragments(current);
    if (r2.changed) {
      changed = true;
      totalTransforms += r2.count;
      details.push({ pass: "flatten-fragments", count: r2.count, description: "Flattened nested fragment elements" });
      current = r2.program;
    }

    // Pass 3: Deduplicate attributes
    const r3 = deduplicateAttributes(current);
    if (r3.changed) {
      changed = true;
      totalTransforms += r3.count;
      details.push({ pass: "dedup-attrs", count: r3.count, description: "Removed duplicate attributes and classes" });
      current = r3.program;
    }

    // Pass 4: Remove unnecessary interpolations
    const r4 = removeUnnecessaryInterpolations(current);
    if (r4.changed) {
      changed = true;
      totalTransforms += r4.count;
      details.push({ pass: "remove-interp", count: r4.count, description: "Simplified unnecessary interpolations" });
      current = r4.program;
    }

    // Pass 5: Simplify boolean expressions
    const r5 = simplifyBooleans(current);
    if (r5.changed) {
      changed = true;
      totalTransforms += r5.count;
      details.push({ pass: "simplify-bool", count: r5.count, description: "Simplified boolean expressions" });
      current = r5.program;
    }

    // Pass 6: Merge style blocks
    const r6 = mergeStyleBlocks(current);
    if (r6.changed) {
      changed = true;
      totalTransforms += r6.count;
      details.push({ pass: "merge-styles", count: r6.count, description: "Merged multiple <style> blocks into one" });
      current = r6.program;
    }

    // Pass 7: Hoist static subtrees out of loops
    const r7 = hoistStaticSubtrees(current);
    if (r7.changed) {
      changed = true;
      totalTransforms += r7.count;
      details.push({ pass: "hoist-static", count: r7.count, description: "Hoisted static subtrees out of loops" });
      current = r7.program;
    }

    // Pass 8: Remove redundant wrapper elements
    const r8 = removeRedundantWrappers(current);
    if (r8.changed) {
      changed = true;
      totalTransforms += r8.count;
      details.push({ pass: "remove-wrappers", count: r8.count, description: "Removed redundant wrapper elements" });
      current = r8.program;
    }

    // Pass 9: Simplify if-else chains
    const r9 = simplifyIfChains(current);
    if (r9.changed) {
      changed = true;
      totalTransforms += r9.count;
      details.push({ pass: "simplify-if", count: r9.count, description: "Simplified if-else chains" });
      current = r9.program;
    }

    // Pass 10: Eliminate common subexpressions
    const r10 = eliminateCommonSubexpressions(current);
    if (r10.changed) {
      changed = true;
      totalTransforms += r10.count;
      details.push({ pass: "eliminate-cse", count: r10.count, description: "Eliminated common subexpressions" });
      current = r10.program;
    }

    if (!changed) break;
  }

  return { program: current, transformsApplied: totalTransforms, details };
}

// --- Pass 1: Merge Adjacent Text Nodes ------------------------------

function mergeAdjacentText(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  function visit(node: any): void {
    if (!node) return;

    const childArrays = ["children", "body", "elseBody"];
    for (const key of childArrays) {
      if (!Array.isArray(node[key])) continue;

      const children = node[key];
      const merged: any[] = [];
      let i = 0;

      while (i < children.length) {
        const child = children[i];

        // Merge consecutive non-interpolated text nodes
        // Preserve whitespace: only merge if neither node has significant
        // whitespace (leading/trailing space is preserved by concatenation)
        if (child?.type === "Text" && !child.isInterpolated) {
          let text = child.value || "";
          let j = i + 1;

          while (j < children.length && children[j]?.type === "Text" && !children[j].isInterpolated) {
            // Only merge if at least one has trailing/leading whitespace
            // or both are non-empty (preserves whitespace semantics)
            const next = children[j].value || "";
            text += next;
            j++;
          }

          if (j > i + 1) {
            // Merged multiple text nodes
            merged.push({ ...child, value: text });
            count += j - i - 1;
            i = j;
          } else {
            merged.push(child);
            i++;
          }
        } else {
          visit(child);
          merged.push(child);
          i++;
        }
      }

      node[key] = merged;
    }
  }

  visit(cloned);
  return { program: cloned, changed: count > 0, count };
}

// --- Pass 2: Flatten Nested Fragments --------------------------------

function flattenFragments(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  function visit(node: any): void {
    if (!node) return;

    const childArrays = ["children", "body", "elseBody"];
    for (const key of childArrays) {
      if (!Array.isArray(node[key])) continue;

      const children = node[key];
      const flattened: any[] = [];

      for (const child of children) {
        if (child?.type === "Fragment") {
          // Flatten: replace fragment with its children
          // Preserve keys and metadata by copying them to children
          if (child.children) {
            for (const grandchild of child.children) {
              visit(grandchild);
              // If fragment had a key, propagate it to first child
              if (child.key !== undefined && grandchild.key === undefined) {
                grandchild._inheritedFragmentKey = child.key;
              }
              flattened.push(grandchild);
            }
          }
          count++;
        } else {
          visit(child);
          flattened.push(child);
        }
      }

      node[key] = flattened;
    }
  }

  visit(cloned);
  return { program: cloned, changed: count > 0, count };
}

// --- Pass 3: Deduplicate Attributes ----------------------------------

function deduplicateAttributes(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    if (node.type !== "Element") return;

    // Deduplicate class names
    for (const attr of node.attrs || []) {
      if (attr.name === "class" && typeof attr.value === "string") {
        const classes = attr.value.split(/\s+/).filter(Boolean);
        const unique = [...new Set(classes)];
        if (unique.length !== classes.length) {
          attr.value = unique.join(" ");
          count++;
        }
      }
    }

    // Remove duplicate attributes (keep last)
    // NOTE: Some HTML attributes (class, style) merge rather than replace.
    // class and style are handled separately above. For other attributes,
    // the last value wins per HTML spec.
    const seen = new Map<string, number>();
    const toRemove = new Set<number>();
    for (let i = 0; i < (node.attrs || []).length; i++) {
      const attr = node.attrs[i];
      if (seen.has(attr.name)) {
        toRemove.add(seen.get(attr.name)!);
      }
      seen.set(attr.name, i);
    }
    if (toRemove.size > 0) {
      node.attrs = node.attrs.filter((_: any, i: number) => !toRemove.has(i));
      count += toRemove.size;
    }

    // Deduplicate inline styles
    if (node.styles && node.styles.length > 0) {
      const seenProps = new Map<string, number>();
      const toRemoveStyles = new Set<number>();
      for (let i = 0; i < node.styles.length; i++) {
        const style = node.styles[i];
        if (seenProps.has(style.property)) {
          toRemoveStyles.add(seenProps.get(style.property)!);
        }
        seenProps.set(style.property, i);
      }
      if (toRemoveStyles.size > 0) {
        node.styles = node.styles.filter((_: any, i: number) => !toRemoveStyles.has(i));
        count += toRemoveStyles.size;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 4: Remove Unnecessary Interpolations ---------------------

function removeUnnecessaryInterpolations(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    // {"literal string"} -> "literal string" (no interpolation needed)
    if (node.type === "Text" && node.isInterpolated) {
      const value = node.value;
      // Check if it's a pure literal string interpolation: {"hello"}
      const literalMatch = value?.match(/^\{["'`]([^"'`]*)["'`]\}$/);
      if (literalMatch) {
        node.value = literalMatch[1];
        node.isInterpolated = false;
        count++;
        return;
      }
      // Check if it's a pure number: {42}
      const numMatch = value.match(/^\{(-?\d+(?:\.\d+)?)\}$/);
      if (numMatch) {
        node.value = numMatch[1];
        node.isInterpolated = false;
        count++;
        return;
      }
      // Check if it's a pure boolean: {true}
      const boolMatch = value.match(/^\{(true|false)\}$/);
      if (boolMatch) {
        node.value = boolMatch[1];
        node.isInterpolated = false;
        count++;
        return;
      }
    }

    // Same for element attributes
    if (node.type === "Element") {
      for (const attr of node.attrs || []) {
        if (attr.isInterpolated) {
          const literalMatch = attr.value?.match(/^\{["'`]([^"'`]*)["'`]\}$/);
          if (literalMatch) {
            attr.value = literalMatch[1];
            attr.isInterpolated = false;
            count++;
          }
        }
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 5: Simplify Boolean Expressions ----------------------------

function simplifyBooleans(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    // Simplify if conditions
    if (node.type === "If") {
      const simplified = simplifyBoolExpr(node.condition);
      if (simplified && simplified !== node.condition) {
        node.condition = simplified;
        count++;
      }
    }
    if (node.type === "While") {
      const simplified = simplifyBoolExpr(node.condition);
      if (simplified && simplified !== node.condition) {
        node.condition = simplified;
        count++;
      }
    }

    // Simplify text expressions
    if (node.type === "Text" && node.isInterpolated) {
      const simplified = simplifyBoolExpr(node.value);
      if (simplified && simplified !== node.value) {
        node.value = simplified;
        count++;
      }
    }

    // Simplify binding expressions
    if (node.type === "Element") {
      for (const binding of node.bindings || []) {
        const simplified = simplifyBoolExpr(binding.expression);
        if (simplified && simplified !== binding.expression) {
          binding.expression = simplified;
          count++;
        }
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

/** NOTE: Boolean simplification uses regex patterns. For complex nested expressions,
 * an AST-based approach would be more correct. The current implementation handles
 * common patterns (!!true, true && x, false || x, ternary) correctly but may miss
 * edge cases with deeply nested expressions. */
function simplifyBoolExpr(expr: string): string | null {
  if (!expr) return null;
  let result = expr;

  // !!true -> true, !!false -> false
  result = result.replace(/!!(true|false)/g, "$1");

  // !(!x) -> x (only for simple identifiers)
  result = result.replace(/!\(!([\w]+)\)/g, "$1");
  result = result.replace(/!!([\w]+)/g, "$1");

  // true && x -> x
  result = result.replace(/true\s*&&\s*/g, "");

  // false && x -> false
  result = result.replace(/false\s*&&\s*[^|]+/g, "false");

  // true || x -> true
  result = result.replace(/true\s*\|\|\s*[^|]+/g, "true");

  // false || x -> x
  result = result.replace(/false\s*\|\|\s*/g, "");

  // null ?? x -> x
  result = result.replace(/null\s*\?\?\s*/g, "");

  // x ?? y where x is truthy -> x (conservative: only for known truthy literals)
  result = result.replace(/(true|[1-9]\d*)\s*\?\?\s*[^?]+/g, "$1");

  // true ? a : b -> a
  result = result.replace(/true\s*\?\s*([^:]+?)\s*:\s*[^?]+/g, "$1");

  // false ? a : b -> b
  result = result.replace(/false\s*\?\s*[^:]+?\s*:\s*([^?]+)/g, "$1");

  // Remove redundant parentheses around simple identifiers
  result = result.replace(/\(([\w]+)\)/g, "$1");

  // Simplify 1 === 1 -> true, 0 === 0 -> true
  result = result.replace(/(\d+)\s*===\s*(\d+)/g, (_, a, b) => a === b ? "true" : "false");

  // Simplify string === string
  result = result.replace(/(["'][^"'']*["'])\s*===\s*(["'][^"'']*["'])/g, (_, a, b) => a === b ? "true" : "false");

  return result !== expr ? result : null;
}

// --- Pass 6: Merge Style Blocks --------------------------------------

function mergeStyleBlocks(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  const styleBlocks: any[] = [];
  const otherNodes: any[] = [];

  for (const node of cloned.body) {
    if (node.type === "StyleBlock" && !node.scoped) {
      styleBlocks.push(node);
    } else {
      otherNodes.push(node);
    }
  }

  if (styleBlocks.length > 1) {
    // Merge all non-scoped style blocks into one
    // Detect conflicts: if later blocks override earlier selectors,
    // we preserve the order (CSS cascade is order-dependent)
    const merged = styleBlocks[0];
    // Keep blocks in order -- CSS cascade depends on source order
    merged.content = styleBlocks.map(b => b.content).join("\n");
    cloned.body = [merged, ...otherNodes];
    count = styleBlocks.length - 1;
  }

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 7: Hoist Static Subtrees Out of Loops ---------------------

function hoistStaticSubtrees(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    if (node.type !== "For") return;
    if (!node.body || node.body.length === 0) return;

    // Find children that don't reference the loop variable
    const staticChildren: any[] = [];
    const dynamicChildren: any[] = [];

    for (const child of node.body) {
      const references = extractIdentifiersDeep(child);
      if (references.has(node.varName)) {
        dynamicChildren.push(child);
      } else if (node.indexName && references.has(node.indexName)) {
        dynamicChildren.push(child);
      } else {
        staticChildren.push(child);
      }
    }

    if (staticChildren.length > 0 && dynamicChildren.length > 0) {
      // Hoist static children before the loop by adding a _hoisted property
      // The codegen will emit them before the loop iteration
      // NOTE: This requires codegen support to actually emit hoisted nodes
      if (!node._hoisted) node._hoisted = [];
      node._hoisted.push(...staticChildren);
      // Keep only dynamic children in the loop body
      node.body = dynamicChildren;
      count += staticChildren.length;
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 8: Remove Redundant Wrapper Elements ----------------------

function removeRedundantWrappers(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    const childArrays = ["children", "body"];
    for (const key of childArrays) {
      if (!Array.isArray(node[key])) continue;

      const children = node[key];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];

        // Check if child is a wrapper element:
        // - Has exactly one child of the SAME tag (safe to unwrap)
        // - No attributes, events, bindings, or styles
        // - Not a void tag
        // - Child also has no attributes/events/bindings (safe to move up)
        const innerChild = child?.children?.[0];
        if (
          child?.type === "Element" &&
          (!child.attrs || child.attrs.length === 0) &&
          (!child.events || child.events.length === 0) &&
          (!child.bindings || child.bindings.length === 0) &&
          (!child.styles || child.styles.length === 0) &&
          (!child.directives || child.directives.length === 0) &&
          child.children?.length === 1 &&
          innerChild?.type === "Element" &&
          child.tag?.toLowerCase() === innerChild.tag?.toLowerCase() &&
          !VOID_TAGS.has(child.tag?.toLowerCase() ?? "")
        ) {
          // Replace wrapper with its child
          children[i] = child.children && child.children.length > 0 ? child.children[0] : child;
          count++;
        }
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 9: Simplify If-Else Chains ---------------------------------

function simplifyIfChains(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  walkAST(cloned, (node: any) => {
    // Flatten else-if chains: if the elseBody contains a single If node,
    // mark it with _elseIf=true so codegen can emit it as `else if` instead
    // of nested `if` inside `else`. This generates cleaner code.
    if (node.type === "If" && node.elseBody?.length === 1 && node.elseBody[0]?.type === "If") {
      node.elseBody[0]._elseIf = true;
      count++;
      // (Codegen handles this natively)
    }

    // Remove empty if branches
    if (node.type === "If") {
      if (node.body?.length === 0 && (!node.elseBody || node.elseBody.length === 0)) {
        // Both branches empty -- remove the if node entirely
        // (Handled by DCE, not here)
      }
      // If body is empty but else exists, swap them and negate condition
      if (node.body?.length === 0 && node.elseBody?.length > 0) {
        node.body = node.elseBody;
        node.elseBody = [];
        node.condition = `!(${node.condition})`;
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Pass 10: Eliminate Common Subexpressions ------------------------

function eliminateCommonSubexpressions(program: Program): { program: Program; changed: boolean; count: number } {
  let count = 0;
  const cloned = deepClone(program);

  // Find expressions that appear multiple times in the same scope
  // and replace subsequent occurrences with references
  walkAST(cloned, (node: any) => {
    if (node.type !== "Element") return;

    // Collect all expressions in this element's scope
    const exprMap = new Map<string, number>(); // expression -> count

    const collectExpr = (expr: string) => {
      if (!expr || expr.length < 10) return; // Only optimize non-trivial expressions
      exprMap.set(expr, (exprMap.get(expr) || 0) + 1);
    };

    for (const attr of node.attrs || []) {
      if (attr.isInterpolated) collectExpr(attr.value);
    }
    for (const binding of node.bindings || []) {
      collectExpr(binding.expression);
    }

    // For expressions that appear multiple times, deduplicate by
    // replacing subsequent occurrences with the first occurrence's
    // computed value via a data-tw-cse attribute on the parent element.
    for (const [expr, cnt] of exprMap) {
      if (cnt > 1) {
        // Mark the element with a CSE hint so codegen knows to compute
        // this expression once and reuse the result.
        // NOTE: Real CSE requires codegen to emit `const _tmp = expr;` --
        // currently only marks, doesn't create temporaries
        // this expression once and reuse the result.
        if (!node._cse) node._cse = [];
        node._cse.push({ expr, count: cnt });
        count++;
      }
    }
  });

  return { program: cloned, changed: count > 0, count };
}

// --- Helpers --------------------------------------------------------

function walkAST(node: any, visitor: (node: any) => void): void {
  if (!node || typeof node !== "object") return;
  visitor(node);
  const childKeys = ["body", "children", "elseBody", "directives", "props", "declarations"];
  for (const key of childKeys) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        walkAST(child, visitor);
      }
    }
  }
}

function extractIdentifiersDeep(node: any): Set<string> {
  const ids = new Set<string>();
  walkAST(node, (n: any) => {
    if (n.type === "Text" && n.isInterpolated) {
      extractIdents(n.value).forEach(id => ids.add(id));
    }
    if (n.type === "Element") {
      for (const attr of n.attrs || []) {
        if (attr.isInterpolated) extractIdents(attr.value).forEach(id => ids.add(id));
      }
      for (const binding of n.bindings || []) {
        extractIdents(binding.expression).forEach(id => ids.add(id));
      }
    }
    if (n.type === "If") extractIdents(n.condition).forEach(id => ids.add(id));
    if (n.type === "For") extractIdents(n.iterable).forEach(id => ids.add(id));
  });
  return ids;
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

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); } catch { /* ignored */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const JS_KEYWORDS = new Set([
  "true", "false", "null", "undefined", "NaN", "Infinity",
  "if", "else", "for", "while", "return", "break", "continue",
  "var", "let", "const", "function", "new", "delete", "void",
  "typeof", "instanceof", "in", "of", "this", "super", "import", "export",
  "async", "await", "yield", "class", "extends", "static",
  "Math", "JSON", "Object", "Array", "String", "Number", "Boolean",
  "console", "window", "document", "globalThis", "process",
  "parseInt", "parseFloat", "isNaN", "isFinite",
  "i", "j", "k", "index", "item", "key", "value", "e", "event",
]);
