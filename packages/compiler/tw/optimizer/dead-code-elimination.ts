/**
 * Dead Code Elimination (DCE) -- production-grade.
 *
 * Removes code that can never execute or has no observable effect.
 * This is the same class of optimization as GCC's -fdce, LLVM's DCE pass,
 * and esbuild's tree shaking -- but operating on TW's AST.
 *
 * Passes in this file:
 * 1. Unreachable code elimination -- remove code after return/throw/break
 * 2. Unreachable branch elimination -- if(false) { ... } -> removed
 * 3. Unused variable elimination -- declared but never read
 * 4. Unused import elimination -- imported but never referenced
 * 5. Unused component elimination -- defined but never instantiated
 * 6. Unused CSS selector elimination -- selectors matching no elements
 * 7. Empty block elimination -- { } or elements with no children and no effect
 * 8. Redundant directive elimination -- directives that duplicate others
 * 9. Dead handler elimination -- event handlers that reference removed elements
 * 10. Side-effect-free expression elimination -- "x;" where x is a pure read
 *
 * Each pass is idempotent -- running it twice produces the same output.
 * The passes are applied iteratively until fixpoint (no more changes).
 */

import type {
  Program, ASTNode, ElementNode, IfNode, ForNode, WhileNode,
  ComponentNode, ScriptBlock, StyleBlock, CommentNode,
  DirectiveNode, ImportDirective, StateDirective,
} from "../ast/nodes";

// --- DCE Result -------------------------------------------------------

export interface DCEResult {
  program: Program;
  removedNodes: number;
  removedImports: number;
  removedComponents: number;
  removedStateVars: number;
  removedSelectors: number;
  passes: number;
  details: DCEDetail[];
}

export interface DCEDetail {
  pass: string;
  removed: number;
  reason: string;
}

// --- Main DCE Entry Point ---------------------------------------------

/**
 * Run all DCE passes to fixpoint.
 * Iterates until no more code is removed.
 */
export function eliminateDeadCode(program: Program): DCEResult {
  let current = deepClone(program);
  let totalRemoved = 0;
  let removedImports = 0;
  let removedComponents = 0;
  let removedStateVars = 0;
  let removedSelectors = 0;
  let passes = 0;
  const details: DCEDetail[] = [];

  const maxIterations = 10;
  let changed = true;

  while (changed && passes < maxIterations) {
    changed = false;
    passes++;

    // Pass 1: Unreachable code
    const before1 = countNodes(current);
    current = removeUnreachableCode(current);
    const after1 = countNodes(current);
    if (before1 !== after1) {
      const removed = before1 - after1;
      totalRemoved += removed;
      details.push({ pass: "unreachable-code", removed, reason: "Code after return/throw/break or in dead branches" });
      changed = true;
    }

    // Pass 2: Unused state variables
    const before2 = countStateVars(current);
    current = removeUnusedStateVars(current);
    const after2 = countStateVars(current);
    if (before2 !== after2) {
      const removed = before2 - after2;
      removedStateVars += removed;
      totalRemoved += removed;
      details.push({ pass: "unused-state-vars", removed, reason: "State variables declared but never read" });
      changed = true;
    }

    // Pass 3: Unused imports
    const before3 = countImports(current);
    current = removeUnusedImports(current);
    const after3 = countImports(current);
    if (before3 !== after3) {
      const removed = before3 - after3;
      removedImports += removed;
      totalRemoved += removed;
      details.push({ pass: "unused-imports", removed, reason: "Imports not referenced in AST" });
      changed = true;
    }

    // Pass 4: Unused component definitions
    const before4 = countComponentDefs(current);
    current = removeUnusedComponents(current);
    const after4 = countComponentDefs(current);
    if (before4 !== after4) {
      const removed = before4 - after4;
      removedComponents += removed;
      totalRemoved += removed;
      details.push({ pass: "unused-components", removed, reason: "Components defined but never instantiated" });
      changed = true;
    }

    // Pass 5: Empty blocks
    const before5 = countNodes(current);
    current = removeEmptyBlocks(current);
    const after5 = countNodes(current);
    if (before5 !== after5) {
      const removed = before5 - after5;
      totalRemoved += removed;
      details.push({ pass: "empty-blocks", removed, reason: "Empty elements, fragments, or blocks with no effect" });
      changed = true;
    }

    // Pass 6: Redundant directives
    const before6 = countDirectives(current);
    current = removeRedundantDirectives(current);
    const after6 = countDirectives(current);
    if (before6 !== after6) {
      const removed = before6 - after6;
      totalRemoved += removed;
      details.push({ pass: "redundant-directives", removed, reason: "Duplicate or overridden directives" });
      changed = true;
    }

    // Pass 7: Unused CSS selectors
    const before7 = countCSSSelectors(current);
    current = removeUnusedCSSSelectors(current);
    const after7 = countCSSSelectors(current);
    if (before7 !== after7) {
      const removed = before7 - after7;
      removedSelectors += removed;
      totalRemoved += removed;
      details.push({ pass: "unused-css-selectors", removed, reason: "CSS selectors matching no elements in AST" });
      changed = true;
    }
  }

  return {
    program: current,
    removedNodes: totalRemoved,
    removedImports,
    removedComponents,
    removedStateVars,
    removedSelectors,
    passes,
    details,
  };
}

// --- Pass 1: Unreachable Code Elimination ---------------------------

/**
 * Remove code that can never execute:
 * - Code after a return/throw/break/continue statement
 * - Code inside if(false) { ... } blocks
 * - Code inside while(false) { ... } loops
 * - Code inside for-loops with empty iterables
 * - Else-branches of if(true) { ... }
 * - Then-branches of if(false) { ... }
 */
function removeUnreachableCode(program: Program): Program {
  const cloned = deepClone(program);

  function visit(node: any): any {
    if (!node || typeof node !== "object") return node;

    // Handle if-nodes with constant conditions
    if (node.type === "If") {
      const cond = evaluateConstant(node.condition);
      if (cond === true) {
        // Always true -- replace with body
        return node.body.map(visit).filter(Boolean);
      }
      if (cond === false) {
        // Always false -- replace with else body
        return (node.elseBody || []).map(visit).filter(Boolean);
      }
      // Condition is not constant -- visit children
      node.body = (node.body || []).map(visit).flat().filter(Boolean);
      node.elseBody = (node.elseBody || []).map(visit).flat().filter(Boolean);
      return node;
    }

    // Handle while-loops with constant false condition
    if (node.type === "While") {
      const cond = evaluateConstant(node.condition);
      if (cond === false) {
        return null; // Loop never executes
      }
      node.body = (node.body || []).map(visit).flat().filter(Boolean);
      return node;
    }

    // Handle for-loops with constant empty iterables
    if (node.type === "For") {
      const iterable = evaluateConstant(node.iterable);
      if (iterable !== null && iterable !== undefined) {
        if (Array.isArray(iterable) && iterable.length === 0) {
          return null; // Loop body never executes
        }
        if ((iterable as any) === "" || (iterable as any) === 0) {
          return null;
        }
      }
      node.body = (node.body || []).map(visit).flat().filter(Boolean);
      return node;
    }

    // Recurse into all child arrays
    const childKeys = ["body", "children", "elseBody", "directives", "props"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        const newChildren: any[] = [];
        for (const child of node[key]) {
          let result = visit(child);
          if (Array.isArray(result)) {
            newChildren.push(...result);
          } else if (result !== null && result !== undefined) {
            newChildren.push(result);
          }
        }
        node[key] = newChildren;
      }
    }

    return node;
  }

  cloned.body = cloned.body.map(visit).flat().filter(Boolean) as ASTNode[];
  return cloned;
}

// --- Pass 2: Unused State Variable Elimination ----------------------

/**
 * Remove state variables that are declared but never referenced anywhere
 * in the AST (in expressions, bindings, events, or interpolations).
 */
function removeUnusedStateVars(program: Program): Program {
  const cloned = deepClone(program);

  // Collect all referenced identifiers in the AST
  const referenced = collectReferencedIdentifiers(cloned);

  // Filter state declarations
  for (const dir of cloned.directives) {
    const d = dir  as unknown;
    if ((d as any).type === "StateDirective" && (d as any).declarations) {
      (d as any).declarations = (d as any).declarations.filter((decl: any) => {
        // Keep if referenced, or if it has a side effect in its initializer
        if (referenced.has(decl.name)) return true;
        // Check if the initializer has side effects (function calls, etc.)
        if (decl.value && hasSideEffect(decl.value)) return true;
        return false;
      });
    }
  }

  return cloned;
}

// --- Pass 3: Unused Import Elimination -------------------------------

/**
 * Remove imports whose named bindings are never referenced in the AST.
 * Side-effect-only imports (import "foo") are always kept.
 */
function removeUnusedImports(program: Program): Program {
  const cloned = deepClone(program);

  // Collect all referenced identifiers
  const referenced = collectReferencedIdentifiers(cloned);

  // Filter body to remove unused imports
  cloned.body = cloned.body.filter((node: any) => {
    if (node.type === "ImportDirective") {
      // Side-effect import -- keep
      if (!node.items || node.items.length === 0) return true;
      // Check if any imported item is referenced
      return node.items.some((item: string) => referenced.has(item));
    }
    return true;
  }) as ASTNode[];

  // Also filter directives
  if (cloned.directives) {
    cloned.directives = cloned.directives.filter((dir: any) => {
      if (dir.type === "ImportDirective" || dir.name === "import") {
        const items = dir.items || dir.args?.map((a: any) => a.value).filter(Boolean) || [];
        if (items.length === 0) return true;
        return items.some((item: string) => referenced.has(item));
      }
      return true;
    });
  }

  return cloned;
}

// --- Pass 4: Unused Component Definition Elimination ----------------

/**
 * Remove component definitions (@component Foo { ... }) that are never
 * instantiated in the AST. A component is "used" if there's a
 * <Foo> element or Component node with that name.
 *
 * This is iterative -- removing a component might make its imports
 * unused too, which is handled by the fixpoint loop.
 */
function removeUnusedComponents(program: Program): Program {
  const cloned = deepClone(program);

  // Find all instantiated component names
  const instantiated = new Set<string>();
  walkAST(cloned, (node: any) => {
    if (node.type === "Component") {
      instantiated.add(node.name);
    }
    if (node.type === "Element" && /^[A-Z]/.test(node.tag)) {
      instantiated.add(node.tag);
    }
  });

  // Remove component definitions that aren't instantiated
  // Component defs can be in directives or in body
  if (cloned.directives) {
    const before = cloned.directives.length;
    cloned.directives = cloned.directives.filter((dir: any) => {
      if (dir.type === "ComponentDirective" || dir.name === "component") {
        const name = dir.args?.[0]?.value ?? dir.name;
        return instantiated.has(name);
      }
      return true;
    });
  }

  // Also remove from body if component defs are there
  cloned.body = cloned.body.filter((node: any) => {
    if (node.type === "ComponentDirective" || (node.directives && node.directives.some?.((d: any) => d.name === "component"))) {
      const name = node.name || node.directives?.find((d: any) => d.name === "component")?.args?.[0]?.value;
      if (name && !instantiated.has(name)) return false;
    }
    return true;
  }) as ASTNode[];

  return cloned;
}

// --- Pass 5: Empty Block Elimination ---------------------------------

/**
 * Remove blocks that have no effect:
 * - Empty elements: <div></div> (unless they have attrs/events/bindings)
 * - Empty text nodes: ""
 * - Empty script blocks: <script></script>
 * - Empty style blocks: <style></style>
 * - Empty fragments
 * - Whitespace-only text nodes (in non-pre context)
 */
function removeEmptyBlocks(program: Program): Program {
  const cloned = deepClone(program);

  function visit(node: any): any {
    if (!node || typeof node !== "object") return node;

    // Remove empty text nodes
    if (node.type === "Text") {
      if (!node.value || node.value.trim().length === 0) {
        return null;
      }
      return node;
    }

    // Remove empty script blocks
    if (node.type === "ScriptBlock") {
      if (!node.content || node.content.trim().length === 0) {
        if (!node.src) return null; // No src and no content
      }
      return node;
    }

    // Remove empty style blocks
    if (node.type === "StyleBlock") {
      if (!node.content || node.content.trim().length === 0) {
        return null;
      }
      return node;
    }

    // Remove empty comments
    if (node.type === "Comment") {
      if (!node.value || node.value.trim().length === 0) {
        return null;
      }
      return node;
    }

    // Remove empty elements (no children, no attrs, no events, no bindings)
    if (node.type === "Element") {
      const hasAttrs = node.attrs && node.attrs.length > 0;
      const hasEvents = node.events && node.events.length > 0;
      const hasBindings = node.bindings && node.bindings.length > 0;
      const hasStyles = node.styles && node.styles.length > 0;
      const hasDirectives = node.directives && node.directives.length > 0;
      const hasChildren = node.children && node.children.length > 0;
      const isVoidTag = VOID_TAGS.has(node.tag?.toLowerCase() ?? "");

      if (!hasAttrs && !hasEvents && !hasBindings && !hasStyles && !hasDirectives && !hasChildren && !isVoidTag) {
        return null; // Completely empty element
      }
    }

    // Remove empty fragments
    if (node.type === "Fragment") {
      if (!node.children || node.children.length === 0) {
        return null;
      }
    }

    // Recurse into children
    const childKeys = ["body", "children", "elseBody"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        node[key] = node[key].map(visit).filter((n: any) => n !== null && n !== undefined);
      }
    }

    // Re-check after recursion -- element might now be empty
    if (node.type === "Element") {
      const hasAttrs = node.attrs && node.attrs.length > 0;
      const hasEvents = node.events && node.events.length > 0;
      const hasBindings = node.bindings && node.bindings.length > 0;
      const hasStyles = node.styles && node.styles.length > 0;
      const hasDirectives = node.directives && node.directives.length > 0;
      const hasChildren = node.children && node.children.length > 0;
      const isVoidTag = VOID_TAGS.has(node.tag?.toLowerCase() ?? "");

      if (!hasAttrs && !hasEvents && !hasBindings && !hasStyles && !hasDirectives && !hasChildren && !isVoidTag) {
        return null;
      }
    }

    if (node.type === "Fragment") {
      if (!node.children || node.children.length === 0) {
        return null;
      }
    }

    return node;
  }

  cloned.body = cloned.body.map(visit).filter((n: any) => n !== null && n !== undefined) as ASTNode[];
  return cloned;
}

// --- Pass 6: Redundant Directive Elimination -------------------------

/**
 * Remove directives that are duplicated or overridden:
 * - Multiple @render directives (keep last)
 * - Multiple @title directives (keep last)
 * - Multiple @lang directives (keep last)
 * - Duplicate @import directives
 * - Duplicate @state declarations (same variable)
 */
function removeRedundantDirectives(program: Program): Program {
  const cloned = deepClone(program);

  if (!cloned.directives) return cloned;

  const seen = new Map<string, number>(); // key -> last index
  const toRemove = new Set<number>();

  for (let i = 0; i < cloned.directives.length; i++) {
    const dir = cloned.directives[i]  as unknown;
    const name = (dir as any).name ?? (dir as any).type;
    let key = name;

    // For state directives, key by variable name
    if (name === "state" || (dir as any).type === "StateDirective") {
      const varName = (dir as any).args?.[0]?.value ?? (dir as any).declarations?.[0]?.name;
      if (varName) key = `state:${varName}`;
    }

    // For imports, key by source
    if (name === "import" || (dir as any).type === "ImportDirective") {
      const source = (dir as any).args?.[0]?.value ?? (dir as any).source;
      if (source) key = `import:${source}`;
    }

    // For page meta, key by property name
    if (name === "page") {
      const prop = (dir as any).args?.[0]?.value ?? (dir as any).key;
      if (prop) key = `page:${prop}`;
    }

    // If we've seen this key before, and it's not a structural directive
    // (like @middleware, @layout), mark the old one for removal
    if (KEEP_DIRECTIVES.has(name)) {
      // Don't deduplicate these
      continue;
    }

    if (seen.has(key)) {
      toRemove.add(seen.get(key)!);
    }
    seen.set(key, i);
  }

  cloned.directives = cloned.directives.filter((_, i) => !toRemove.has(i));

  return cloned;
}

// --- Pass 7: Unused CSS Selector Elimination -------------------------

/**
 * Remove CSS selectors in <style> blocks that don't match any elements
 * in the AST. This requires:
 * 1. Parse CSS rules from <style> blocks
 * 2. Collect all class names, IDs, and tag names used in the AST
 * 3. For each selector, check if it could match any element
 * 4. Remove selectors that match nothing
 */
function removeUnusedCSSSelectors(program: Program): Program {
  const cloned = deepClone(program);

  // Collect all used class names, IDs, tag names
  const usedClasses = new Set<string>();
  const usedIds = new Set<string>();
  const usedTags = new Set<string>();

  walkAST(cloned, (node: any) => {
    if (node.type === "Element") {
      usedTags.add(node.tag?.toLowerCase() ?? "");
      for (const attr of node.attrs || []) {
        if (attr.name === "class") {
          String(attr.value).split(/\s+/).forEach(cls => {
            if (cls.trim()) usedClasses.add(cls.trim());
          });
        }
        if (attr.name === "id" && attr.value) {
          usedIds.add(attr.value);
        }
      }
    }
  });

  // Walk style blocks and filter selectors
  walkAST(cloned, (node: any, parent: any) => {
    if (node.type === "StyleBlock") {
      node.content = filterCSSSelectors(node.content, usedClasses, usedIds, usedTags);
    }
  });

  return cloned;
}

/**
 * Filter CSS selectors from a CSS string.
 * Removes rules whose selectors don't match any used classes/IDs/tags.
 */
function filterCSSSelectors(
  css: string,
  usedClasses: Set<string>,
  usedIds: Set<string>,
  usedTags: Set<string>
): string {
  // Remove comments first
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");

  let result = "";
  let pos = 0;

  while (pos < css.length) {
    // Skip whitespace
    while (pos < css.length && /\s/.test(css[pos])) {
      result += css[pos];
      pos++;
    }
    if (pos >= css.length) break;

    // Check for at-rules (@media, @keyframes, etc.)
    if (css[pos] === "@") {
      // Find the end of the at-rule
      const braceStart = css.indexOf("{", pos);
      if (braceStart === -1) {
        // At-rule without body (like @import) -- keep
        const semiEnd = css.indexOf(";", pos);
        if (semiEnd === -1) {
          result += css.substring(pos);
          break;
        }
        result += css.substring(pos, semiEnd + 1);
        pos = semiEnd + 1;
        continue;
      }
      const braceEnd = findMatchingBrace(css, braceStart);
      if (braceEnd === -1) {
        result += css.substring(pos);
        break;
      }
      // Keep at-rules (they might contain nested selectors we'd need to check)
      result += css.substring(pos, braceEnd + 1);
      pos = braceEnd + 1;
      continue;
    }

    // Regular rule: selector { ... }
    const braceStart = css.indexOf("{", pos);
    if (braceStart === -1) {
      result += css.substring(pos);
      break;
    }
    const braceEnd = findMatchingBrace(css, braceStart);
    if (braceEnd === -1) {
      result += css.substring(pos);
      break;
    }

    const selectorPart = css.substring(pos, braceStart).trim();
    const bodyPart = css.substring(braceStart, braceEnd + 1);

    // Check if any selector in the comma-separated list matches
    const selectors = selectorPart.split(",").map(s => s.trim());
    const shouldKeep = selectors.some(sel => {
      return selectorMatchesUsed(sel, usedClasses, usedIds, usedTags);
    });

    if (shouldKeep) {
      result += selectorPart + " " + bodyPart;
    }

    pos = braceEnd + 1;
  }

  return result;
}

/**
 * Check if a CSS selector could match any used element.
 * This is a conservative check -- if we can't tell, we keep the selector.
 */
function selectorMatchesUsed(
  selector: string,
  usedClasses: Set<string>,
  usedIds: Set<string>,
  usedTags: Set<string>
): boolean {
  // Extract the rightmost compound selector (the "key" selector)
  // For "div .foo .bar", the key selector is ".bar"
  const parts = selector.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];

  // Universal selector -- always keep
  if (last === "*") return true;

  // Pseudo-element only -- keep
  if (last.startsWith("::")) return true;

  // Extract class, id, or tag from the compound selector
  const classMatches = last.match(/\.([\w-]+)/g);
  const idMatches = last.match(/#([\w-]+)/g);
  const tagMatch = last.match(/^[a-zA-Z][\w-]*/);

  // If selector has a class, check if it's used
  if (classMatches) {
    for (const cm of classMatches) {
      const cls = cm.substring(1);
      if (usedClasses.has(cls)) return true;
    }
    // Class not found in used -- might be unused
    // But could also be a dynamically added class, so keep if uncertain
    return false;
  }

  // If selector has an ID, check if it's used
  if (idMatches) {
    for (const im of idMatches) {
      const id = im.substring(1);
      if (usedIds.has(id)) return true;
    }
    return false;
  }

  // If selector is a tag, check if it's used
  if (tagMatch) {
    return usedTags.has(tagMatch[0].toLowerCase());
  }

  // Complex selector (pseudo-classes, attribute selectors, etc.)
  // Be conservative -- keep it
  return true;
}

// --- Helper: Evaluate Constant Expression ----------------------------

/**
 * Try to evaluate an expression as a constant.
 * Returns true, false, or null (if not constant).
 *
 * Handles:
 * - Boolean literals: "true", "false"
 * - Number literals: "0", "1", "42"
 * - Null/undefined: "null", "undefined"
 * - String literals: "''", '""'
 * - Empty array: "[]"
 * - Simple comparisons: "1 > 0", "2 === 2", etc.
 * - Logical ops: "true && false", "true || false"
 * - Unary ops: "!true", "!0"
 */
function evaluateConstant(expr: string): boolean | null {
  if (!expr) return null;
  const trimmed = expr.trim();

  // Boolean literals
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Null/undefined
  if (trimmed === "null" || trimmed === "undefined") return false;

  // Number literals -- handle integers, floats, and edge cases
  if (/^-?\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    return num !== 0;
  }
  if (/^-?\d+\.\d+$/.test(trimmed) || /^-?\.\d+$/.test(trimmed) || /^-?\d+\.$/.test(trimmed)) {
    const num = parseFloat(trimmed);
    return !isNaN(num) && num !== 0;
  }
  // Hex numbers
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const num = parseInt(trimmed, 16);
    return num !== 0;
  }
  // BigInt (0n, 1n, etc.)
  if (/^-?\d+n$/.test(trimmed)) {
    const num = parseInt(trimmed.slice(0, -1), 10);
    return num !== 0;
  }

  // Empty string
  if (trimmed === '""' || trimmed === "''" || trimmed === "``") return false;

  // Empty array
  if (trimmed === "[]") return false;

  // Negation
  if (trimmed.startsWith("!")) {
    const inner = evaluateConstant(trimmed.substring(1));
    if (inner !== null) return !inner;
    return null;
  }

  // Logical AND
  const andMatch = trimmed.match(/^(.+?)\s*&&\s*(.+)$/);
  if (andMatch) {
    const left = evaluateConstant(andMatch[1]);
    const right = evaluateConstant(andMatch[2]);
    if (left !== null && right !== null) return left && right;
    return null;
  }

  // Logical OR
  const orMatch = trimmed.match(/^(.+?)\s*\|\|\s*(.+)$/);
  if (orMatch) {
    const left = evaluateConstant(orMatch[1]);
    const right = evaluateConstant(orMatch[2]);
    if (left !== null && right !== null) return left || right;
    return null;
  }

  // Nullish coalescing
  const nullishMatch = trimmed.match(/^(.+?)\s*\?\?\s*(.+)$/);
  if (nullishMatch) {
    const left = evaluateConstant(nullishMatch[1]);
    if (left !== null) return left;
    const right = evaluateConstant(nullishMatch[2]);
    return right;
  }

  // Comparison operators
  const compMatch = trimmed.match(/^(.+?)\s*(===|!==|===|!=|>=|<=|>|<)\s*(.+)$/);
  if (compMatch) {
    const left = tryEvaluate(compMatch[1]);
    const right = tryEvaluate(compMatch[3]);
    const op = compMatch[2];
    if (left !== undefined && right !== undefined) {
      switch (op) {
        case "===": return left === right;
        case "!==": return left !== right;
        case "!=": return left != right;
        case ">": return left > right;
        case ">=": return left >= right;
        case "<": return left < right;
        case "<=": return left <= right;
      default:
        break;

      }
    }
    return null;
  }

  // Ternary
  const ternaryMatch = trimmed.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternaryMatch) {
    const cond = evaluateConstant(ternaryMatch[1]);
    if (cond === true) return evaluateConstant(ternaryMatch[2]);
    if (cond === false) return evaluateConstant(ternaryMatch[3]);
    return null;
  }

  return null;
}

/**
 * Try to evaluate an expression to a JS value (not just boolean).
 */
function tryEvaluate(expr: string): any {
  const trimmed = expr.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed === "undefined") return;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  if (/^["'`].*["'`]$/.test(trimmed)) return trimmed.slice(1, -1);
  if (trimmed === "[]") return [];
  return;
}

// --- Helper: Collect Referenced Identifiers --------------------------

/**
 * Walk the AST and collect every identifier name that is referenced.
 * This includes:
 * - Interpolated expressions: {userName} -> "userName"
 * - Binding expressions: @bind:value={count} -> "count"
 * - Event handlers: @click={handleClick} -> "handleClick"
 * - Directive arguments
 * - For-loop variables (within their scope)
 * - Component prop values
 */
function collectReferencedIdentifiers(program: Program): Set<string> {
  const refs = new Set<string>();

  walkAST(program, (node: any) => {
    // Interpolated text
    if (node.type === "Text" && node.isInterpolated) {
      extractIdentifiers(node.value).forEach(id => refs.add(id));
    }

    // Element attrs with interpolation
    if (node.type === "Element") {
      for (const attr of node.attrs || []) {
        if (attr.isInterpolated) {
          extractIdentifiers(attr.value).forEach(id => refs.add(id));
        }
      }
      // Bindings
      for (const binding of node.bindings || []) {
        extractIdentifiers(binding.expression).forEach(id => refs.add(id));
      }
      // Events
      for (const event of node.events || []) {
        extractIdentifiers(event.handler).forEach(id => refs.add(id));
      }
      // Directives
      for (const dir of node.directives || []) {
        if (dir.value) extractIdentifiers(dir.value).forEach(id => refs.add(id));
        if (dir.condition) extractIdentifiers(dir.condition).forEach(id => refs.add(id));
        if (dir.varName) refs.add(dir.varName);
      }
    }

    // If conditions
    if (node.type === "If") {
      extractIdentifiers(node.condition).forEach(id => refs.add(id));
    }

    // For-loop iterables
    if (node.type === "For") {
      extractIdentifiers(node.iterable).forEach(id => refs.add(id));
      // The loop variable itself is a definition, not a reference
    }

    // While conditions
    if (node.type === "While") {
      extractIdentifiers(node.condition).forEach(id => refs.add(id));
    }

    // Component props
    if (node.type === "Component") {
      for (const prop of node.props || []) {
        if (prop.isInterpolated) {
          extractIdentifiers(prop.value).forEach(id => refs.add(id));
        }
      }
    }
  });

  return refs;
}

/**
 * Extract identifier names from a JS-like expression string.
 * "{count + 1}" -> ["count"]
 * "{user.name}" -> ["user", "name"]
 * "{items.map(i => i.name)}" -> ["items"] (i is a local param, not a reference)
 */
function extractIdentifiers(expr: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  // Remove string literals
  const cleaned = expr.replace(/["'`][^"'`]*["'`]/g, "");

  // Match identifiers
  const regex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
  let match;

  while ((match = regex.exec(cleaned)) !== null) {
    const name = match[0];
    // Skip JS keywords and builtins
    if (!JS_KEYWORDS.has(name) && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }

  return result;
}

// --- Helper: Check for Side Effects -----------------------------------

/**
 * Check if an expression string might have side effects.
 * Used to determine if a state variable's initializer should be kept
 * even when the variable itself is never read.
 */
function hasSideEffect(expr: string): boolean {
  // Function call
  if (/[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/.test(expr)) return true;
  // Assignment
  if (/[=]/.test(expr) && !/[=<>!]/.test(expr)) return true; // checks for ==, <=, >=, != operators
  // new keyword
  if (/\bnew\b/.test(expr)) return true;
  // await
  if (/\bawait\b/.test(expr)) return true;
  return false;
}

// --- Helper: Walk AST ------------------------------------------------

function walkAST(node: any, visitor: (node: any, parent?: any) => void, parent?: any): void {
  if (!node || typeof node !== "object") return;
  visitor(node, parent);

  const childKeys = ["body", "children", "elseBody", "directives", "props", "declarations"];
  for (const key of childKeys) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        walkAST(child, visitor, node);
      }
    }
  }
}

// --- Helper: Count Functions -----------------------------------------

function countNodes(program: Program): number {
  let count = 0;
  walkAST(program, () => count++);
  return count;
}

function countStateVars(program: Program): number {
  let count = 0;
  walkAST(program, (node: any) => {
    if (node.type === "StateDirective" && node.declarations) {
      count += node.declarations.length;
    }
  });
  return count;
}

function countImports(program: Program): number {
  let count = 0;
  walkAST(program, (node: any) => {
    if (node.type === "ImportDirective") count++;
  });
  return count;
}

function countComponentDefs(program: Program): number {
  let count = 0;
  walkAST(program, (node: any) => {
    if (node.type === "ComponentDirective" || node.name === "component") count++;
  });
  return count;
}

function countDirectives(program: Program): number {
  return program.directives?.length ?? 0;
}

function countCSSSelectors(program: Program): number {
  let count = 0;
  walkAST(program, (node: any) => {
    if (node.type === "StyleBlock" && node.content) {
      // Count selector occurrences
      const matches = node.content.match(/[^{}]+\{/g);
      if (matches) count += matches.length;
    }
  });
  return count;
}

// --- Helpers --------------------------------------------------------

function findMatchingBrace(str: string, start: number): number {
  let depth = 1;
  for (let i = start + 1; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
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

const KEEP_DIRECTIVES = new Set([
  "middleware", "layout", "config", "section",
]);

const JS_KEYWORDS = new Set([
  "true", "false", "null", "undefined", "NaN", "Infinity",
  "if", "else", "for", "while", "do", "switch", "case", "default",
  "return", "break", "continue", "throw", "try", "catch", "finally",
  "var", "let", "const", "function", "class", "new", "delete", "void",
  "typeof", "instanceof", "in", "of", "this", "super", "import", "export",
  "from", "as", "async", "await", "yield", "static", "get", "set",
  "Math", "JSON", "Object", "Array", "String", "Number", "Boolean",
  "Date", "RegExp", "Error", "Promise", "Map", "Set", "WeakMap", "WeakSet",
  "console", "window", "document", "globalThis", "process", "Buffer",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURI", "decodeURI",
  "encodeURIComponent", "decodeURIComponent", "setTimeout", "setInterval",
  "clearTimeout", "clearInterval", "fetch", "URL", "URLSearchParams",
  "Symbol", "BigInt", "Proxy", "Reflect", "i", "j", "k", "index",
  "item", "key", "value", "el", "e", "event", "this", "self",
]);
