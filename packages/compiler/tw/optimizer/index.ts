import { ASTNode, Program, ComponentNode } from "../ast/nodes";
import { hasInteractiveFeatures, findNodes } from "../ast/walkers";

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); }
    catch { /* fall through */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); }
  catch { return obj; }
}

export interface OptimizeOptions {
  constantFolding: boolean;
  deadCode: boolean;
  treeShaking: boolean;
  minifyHTML: boolean;
  minifyCSS: boolean;
  minifyJS: boolean;
}

export const DEFAULT_OPTS: OptimizeOptions = {
  constantFolding: true,
  deadCode: true,
  treeShaking: true,
  minifyHTML: true,
  minifyCSS: true,
  minifyJS: false,
};

export function optimize(program: Program, opts: OptimizeOptions = DEFAULT_OPTS): Program {
  let result = program;

  if (opts.constantFolding) {
    result = foldConstants(result);
  }

  if (opts.deadCode) {
    result = removeDeadCode(result);
  }

  if (opts.treeShaking) {
    result = shakeTree(result);
  }

  return result;
}

// --- Constant Folding ---------------------------------------------------------

function foldConstants(program: Program): Program {
  const folded = deepClone(program) as Program;

  function visit(node: any): any {
    if (!node || typeof node !== "object") return node;

    // Fold if-nodes with constant conditions
    if (node.type === "If") {
      const cond = node.condition?.trim();

      if (cond === "true" || cond === "1") {
        // Always true -- replace with body
        return node.body.map(visit).filter(Boolean);
      }

      if (cond === "false" || cond === "0" || cond === "null" || cond === "undefined") {
        // Always false -- replace with else body
        return node.elseBody.map(visit).filter(Boolean);
      }

      node.body = (node.body || []).map(visit).flat().filter(Boolean);
      node.elseBody = (node.elseBody || []).map(visit).flat().filter(Boolean);
      return node;
    }

    // Fold while-loops with constant false condition
    if (node.type === "While") {
      const cond = node.condition?.trim();
      if (cond === "false" || cond === "0" || cond === "null") {
        return null;
      }
      node.body = (node.body || []).map(visit).flat().filter(Boolean);
      return node;
    }

    // Fold empty for-loops
    if (node.type === "For") {
      if (!node.iterable || node.iterable === "[]" || node.iterable === "null") {
        return null;
      }
      node.body = (node.body || []).map(visit).flat().filter(Boolean);
      return node;
    }

    // Recurse into children
    const childKeys = ["body", "children", "elseBody", "directives", "props"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        const newChildren: any[] = [];
        for (const child of node[key]) {
          const result = visit(child);
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

  folded.body = folded.body.map(visit).flat().filter(Boolean) as ASTNode[];
  return folded;
}

// --- Dead Code Removal ---------------------------------------------------------

function removeDeadCode(program: Program): Program {
  const cleaned = deepClone(program) as Program;

  function visit(node: any): any {
    if (!node || typeof node !== "object") return node;

    // Remove elements with tw-if="false"
    if (node.type === "Element") {
      const directives = node.directives || [];
      const hasFalseIf = directives.some((d: any) => d.kind === "if" && (d.value === "false" || d.condition === "false"));
      if (hasFalseIf) return null;

      // Remove elements with show: false
      const hasFalseShow = directives.some((d: any) => d.kind === "show" && d.value === "false");
      if (hasFalseShow) return null;
    }

    // Remove empty components
    if (node.type === "Component") {
      if (!node.name) return null;
      if (node.children.length === 0 && node.props.length === 0) {
        // Keep -- could be a self-closing component
      }
    }

    // Remove empty script/style blocks
    if (node.type === "ScriptBlock") {
      if (!node.content || node.content.trim().length === 0) return null;
    }

    if (node.type === "StyleBlock") {
      if (!node.content || node.content.trim().length === 0) return null;
    }

    // Remove empty text nodes
    if (node.type === "Text") {
      if (!node.value || node.value.trim().length === 0) return null;
    }

    // Recurse
    const childKeys = ["body", "children", "elseBody"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        node[key] = node[key].map(visit).filter((n: any) => n !== null && n !== undefined);
      }
    }

    return node;
  }

  cleaned.body = cleaned.body.map(visit).filter((n: any) => n !== null && n !== undefined) as ASTNode[];
  return cleaned;
}

// --- Tree Shaking ----------------------------------------------------------------

function shakeTree(program: Program): Program {
  const shaken = deepClone(program) as Program;

  // Collect all used components
  const usedComponents = new Set<string>();
  const usedImports = new Set<string>();

  function collectUsage(node: any): void {
    if (!node || typeof node !== "object") return;

    if (node.type === "Component") {
      usedComponents.add(node.name);
    }

    if (node.type === "ImportDirective") {
      // Mark all imported items as used if they appear in the AST
      for (const item of node.items || []) {
        usedImports.add(item);
      }
    }

    const childKeys = ["body", "children", "elseBody", "directives", "props"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        for (const child of node[key]) {
          collectUsage(child);
        }
      }
    }
  }

  for (const node of shaken.body) {
    collectUsage(node);
  }

  // Remove unused imports
  shaken.body = shaken.body.filter((node: any) => {
    if (node.type === "ImportDirective") {
      // Keep imports for components that are used
      if (node.items && node.items.some((item: string) => usedComponents.has(item))) {
        return true;
      }
      // Keep side-effect imports (no items)
      if (!node.items || node.items.length === 0) {
        return true;
      }
      // Remove if none of the imported items are used
      return node.items.some((item: string) => usedImports.has(item));
    }
    return true;
  });

  return shaken;
}

// --- Minification ----------------------------------------------------------------

export function minifyHTML(html: string): string {
  return html
    .replace(/<!--(?!\[if).*?-->/g, "") // Remove comments (keep IE conditionals)
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/>\s+</g, "><") // Remove whitespace between tags
    .replace(/\s+>/g, ">") // Remove trailing whitespace before >
    .replace(/<\s+/g, "<") // Remove leading whitespace after <
    .replace(/\s+\/>/g, "/>") // Remove space before self-closing
    .trim();
}

export function minifyCSS(css: string): string {
  return css
    .replace(/\/\*.*?\*\//g, "") // Remove comments
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/\s*([{}:;,])\s*/g, "$1") // Remove spaces around delimiters
    .replace(/;}/g, "}") // Remove trailing semicolons
    .trim();
}

export function minifyJS(js: string): string {
  // Basic JS minification -- removes comments and excess whitespace
  // Full minification should use esbuild or terser in production
  return js
    .replace(/\/\/.*$/gm, "") // Single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // Multi-line comments
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/\s*([{}();,:=<>+\-*\/])\s*/g, "$1") // Remove spaces around operators
    .trim();
}

// --- Optimization Stats ---------------------------------------------------------

export interface OptimizeStats {
  nodesBefore: number;
  nodesAfter: number;
  removed: number;
  hasInteractive: boolean;
  componentsUsed: string[];
}

export function getStats(program: Program): OptimizeStats {
  function countNodes(node: any): number {
    if (!node || typeof node !== "object") return 0;
    let count = 1;
    const childKeys = ["body", "children", "elseBody", "directives", "props"];
    for (const key of childKeys) {
      if (Array.isArray(node[key])) {
        for (const child of node[key]) {
          count += countNodes(child);
        }
      }
    }
    return count;
  }

  const before = countNodes(program);
  const components = findNodes<ComponentNode>(program, "Component" as any);
  const interactive = hasInteractiveFeatures(program);

  return {
    nodesBefore: before,
    nodesAfter: before,
    removed: 0,
    hasInteractive: interactive,
    componentsUsed: components.map(c => c.name),
  };
}

export { optimizeAdvanced } from "./advanced-passes";
export type { AdvancedOptDetail, AdvancedOptResult } from "./advanced-passes";
export { optimizeAST } from "./ast-transforms";
export type { TransformDetail, TransformResult } from "./ast-transforms";
export { ConstantFolder, DEFAULT_PIPELINE_OPTIONS, DependencyGraph, FunctionInliner, OptimizerPipeline, buildDependencyGraph, eliminateDeadCode, foldConstants, foldExpression, foldWithConstants, generateOptReport, getDependencyGraph, inlineFunctions, optimizeDCE, optimizeDeep, optimizeFold, optimizeInline, optimizeShake, optimizeTransform, shakeToFixpoint, shakeTree } from "./barrel";
export type { ConstValue, DCEDetail, DCEResult, FoldResult, GraphNode, InlineDetail, InlineResult, NodeType, OptimizerPipelineOptions, PassResult, PipelineResult, TreeShakeResult } from "./barrel";
export { FunctionHoister, HoistPass, countByType, countHoistable, createFunctionHoister, createHoistPass, getHoistPriority, getHoistStats, getHoistableNodes, getNonHoistableNodes, hoistAndMerge, hoistFunctions, isExportDeclaration, isFunctionDeclaration, isHoistable, isImportDeclaration, isVariableDeclaration, mergeHoisted, separateByType, shouldHoist, sortByHoistPriority } from "./function-hoister";
export type { HoistOptions, HoistResult } from "./function-hoister";
export { LoopUnroller, UnrollPass, canUnroll, createLoopUnroller, createUnrollPass, estimateUnrollBenefit, isFullyUnrolled, isPartiallyUnrolled, shouldUnroll, unrollFactor, unrollLoop, unrollWithRemainder } from "./loop-unroller";
export type { UnrollOptions, UnrollResult } from "./loop-unroller";
