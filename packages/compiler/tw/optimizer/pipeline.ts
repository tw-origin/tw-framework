/**
 * Pipeline orchestrator -- runs all optimizer passes in the right order.
 *
 * The optimizer is a pipeline of passes, each transforming the AST.
 * The order matters -- earlier passes create opportunities for later ones:
 *
 * 1. Constant folding -> evaluates constant expressions
 *    (creates opportunities for DCE: if(false) becomes removable)
 * 2. Function inlining -> replaces function calls with bodies
 *    (creates opportunities for constant folding on inlined code)
 * 3. Tree shaking -> removes unused code
 *    (creates opportunities for DCE: removed functions reveal unused state)
 * 4. Dead code elimination -> removes unreachable code
 *    (creates opportunities for AST transforms: empty blocks can be merged)
 * 5. AST transforms -> restructure the tree
 *    (creates opportunities for minification)
 *
 * This sequence runs to fixpoint -- if any pass makes changes, we re-run
 * the entire pipeline. This is how LLVM and GCC work too.
 */

import type { Program } from "../ast/nodes";
import { eliminateDeadCode } from "./dead-code-elimination";
import { ConstantFolder, foldConstants } from "./constant-folding";
import { shakeToFixpoint, buildDependencyGraph } from "./tree-shaker";
import { inlineFunctions } from "./function-inliner";
import { optimizeAST } from "./ast-transforms";

// --- Pipeline Options ------------------------------------------------

export interface OptimizerPipelineOptions {
  /** Run constant folding */
  constantFolding: boolean;
  /** Run function inlining */
  functionInlining: boolean;
  /** Run tree shaking */
  treeShaking: boolean;
  /** Run dead code elimination */
  deadCodeElimination: boolean;
  /** Run AST transforms */
  astTransforms: boolean;
  /** Maximum fixpoint iterations */
  maxIterations: number;
  /** Verbose: log each pass */
  verbose: boolean;
}

export const DEFAULT_PIPELINE_OPTIONS: OptimizerPipelineOptions = {
  constantFolding: true,
  functionInlining: true,
  treeShaking: true,
  deadCodeElimination: true,
  astTransforms: true,
  maxIterations: 10,
  verbose: false,
};

// --- Pipeline Result ------------------------------------------------

export interface PipelineResult {
  program: Program;
  iterations: number;
  totalTransforms: number;
  passResults: PassResult[];
  // Unified metrics -- each pass reports in the same unit (nodes changed)
  metrics: {
    nodesRemoved: number;
    functionsRemoved: number;
    componentsRemoved: number;
    expressionsFolded: number;
    constantsPropagated: number;
    bytesSaved: number;
    timePerPass: Record<string, number>;
  };
  beforeSize: number;
  afterSize: number;
  savedBytes: number;
  compressionRatio: number;
  nodesBefore: number;
  nodesAfter: number;
}

export interface PassResult {
  pass: string;
  iteration: number;
  changed: boolean;
  details: any;
}

// --- Pipeline --------------------------------------------------------

export class OptimizerPipeline {
  private options: OptimizerPipelineOptions;
  private passResults: PassResult[] = [];

  constructor(options?: Partial<OptimizerPipelineOptions>) {
    this.options = { ...DEFAULT_PIPELINE_OPTIONS, ...options };
  }

  run(program: Program): PipelineResult {
    const _runStart = performance.now();
    // Reset pass results -- allows pipeline reuse across multiple runs
    this.passResults = [];
    const passTimings: Record<string, number> = {};
    let nodesRemoved = 0, functionsRemoved = 0, componentsRemoved = 0, expressionsFolded = 0, constantsPropagated = 0;
    // Mutate safely: we clone once at the start, then mutate in place.
    // This avoids cloning the AST on every iteration (expensive for large ASTs).
    let current = deepClone(program);
    const beforeSize = serializeSize(current);
    let totalNodesBefore = countNodes(current);
    let totalTransforms = 0;
    let iterations = 0;

    for (let iter = 0; iter < this.options.maxIterations; iter++) {
      let changed = false;
      iterations++;

      // 1. Constant folding
      if (this.options.constantFolding) {
        const _foldStart = performance.now();
        const folder = new ConstantFolder();
        // Use AST node count for change detection instead of serialized size
        const beforeNodeCount = countNodes(current);
        current = folder.foldProgram(current);
        const afterNodeCount = countNodes(current);
        const didChange = beforeNodeCount !== afterNodeCount;
        this.passResults.push({ pass: "constant-folding", iteration: iter, changed: didChange, details: {} });
        const _foldTime = performance.now() - _foldStart;
        passTimings["constant-folding"] = (passTimings["constant-folding"] || 0) + _foldTime;
        if (didChange) { changed = true; totalTransforms++; expressionsFolded++; }
      }

      // 2. Function inlining
      if (this.options.functionInlining) {
        const result = inlineFunctions(current);
        current = result.program;
        const didChange = result.inlinedFunctions > 0 || result.inlinedExpressions > 0;
        this.passResults.push({
          pass: "function-inlining", iteration: iter, changed: didChange,
          details: {
            inlinedFunctions: result.inlinedFunctions,
            inlinedExpressions: result.inlinedExpressions,
            inlinedComponents: result.inlinedComponents,
          },
        });
        if (didChange) { changed = true; totalTransforms += result.inlinedFunctions + result.inlinedExpressions; }
      }

      // 2.5. Second constant folding pass -- inlining creates new fold opportunities
      if (this.options.constantFolding) {
        const folder2 = new ConstantFolder();
        const before2 = countNodes(current);
        current = folder2.foldProgram(current);
        const after2 = countNodes(current);
        const didChange2 = before2 !== after2;
        this.passResults.push({ pass: "constant-folding-2", iteration: iter, changed: didChange2, details: {} });
        if (didChange2) { changed = true; totalTransforms++; }
      }

      // 3. Tree shaking
      if (this.options.treeShaking) {
        const result = shakeToFixpoint(current);
        current = result.program;
        const didChange = result.removed.length > 0;
        this.passResults.push({
          pass: "tree-shaking", iteration: iter, changed: didChange,
          details: { removed: result.removed.length, kept: result.kept.length, passes: result.passCount },
        });
        if (didChange) { changed = true; totalTransforms += result.removed.length; }
      }

      // 4. Dead code elimination
      if (this.options.deadCodeElimination) {
        const result = eliminateDeadCode(current);
        current = result.program;
        const didChange = result.removedNodes > 0;
        this.passResults.push({
          pass: "dead-code-elimination", iteration: iter, changed: didChange,
          details: {
            removedNodes: result.removedNodes,
            removedImports: result.removedImports,
            removedComponents: result.removedComponents,
            removedStateVars: result.removedStateVars,
            removedSelectors: result.removedSelectors,
            passes: result.passes,
          },
        });
        if (didChange) { changed = true; totalTransforms += result.removedNodes; }
      }

      // 5. AST transforms
      if (this.options.astTransforms) {
        const result = optimizeAST(current);
        current = result.program;
        const didChange = result.transformsApplied > 0;
        this.passResults.push({
          pass: "ast-transforms", iteration: iter, changed: didChange,
          details: { transforms: result.transformsApplied, details: result.details },
        });
        if (didChange) { changed = true; totalTransforms += result.transformsApplied; }
      }

      if (!changed) break;
    }

    const afterSize = serializeSize(current);
    let totalNodesAfter = countNodes(current);
    const savedBytes = beforeSize - afterSize;

    const _runEnd = performance.now();

    if (this.options.verbose) {
      console.debug("[optimizer] Pipeline completed:");
      console.debug(`  Iterations: ${iterations}`);
      console.debug(`  Total transforms: ${totalTransforms}`);
      console.debug(`  Nodes: ${totalNodesBefore} -> ${totalNodesAfter} (removed ${totalNodesBefore - totalNodesAfter})`);
      console.debug(`  Size: ${formatBytes(beforeSize)} -> ${formatBytes(afterSize)} (saved ${formatBytes(savedBytes)})`);
      console.debug(`  Time: ${(_runEnd - _runStart).toFixed(2)}ms`);
    }

    return {
      program: current,
      iterations,
      totalTransforms,
      passResults: this.passResults,
      beforeSize,
      afterSize,
      savedBytes,
      compressionRatio: beforeSize > 0 ? afterSize / beforeSize : 1,
      nodesBefore: totalNodesBefore,
      nodesAfter: totalNodesAfter,
      metrics: {
        nodesRemoved: totalNodesBefore - totalNodesAfter,
        functionsRemoved,
        componentsRemoved,
        expressionsFolded,
        constantsPropagated,
        bytesSaved: savedBytes,
        timePerPass: passTimings,
      },
    };
  }
}

// --- Public API ------------------------------------------------------

/**
 * Run the full optimizer pipeline on a program.
 */
export function optimizeDeep(program: Program, options?: Partial<OptimizerPipelineOptions>): PipelineResult {
  const pipeline = new OptimizerPipeline(options);
  return pipeline.run(program);
}

/**
 * Run only constant folding.
 */
export function optimizeFold(program: Program): Program {
  return foldConstants(program);
}

/**
 * Run only DCE.
 */
export function optimizeDCE(program: Program): Program {
  return eliminateDeadCode(program).program;
}

/**
 * Run only tree shaking.
 */
export function optimizeShake(program: Program): Program {
  return shakeToFixpoint(program).program;
}

/**
 * Run only AST transforms.
 */
export function optimizeTransform(program: Program): Program {
  return optimizeAST(program).program;
}

/**
 * Run only function inlining.
 */
export function optimizeInline(program: Program): Program {
  return inlineFunctions(program).program;
}

/**
 * Get a dependency graph for a program (for debugging/visualization).
 */
export function getDependencyGraph(program: Program) {
  return buildDependencyGraph(program);
}

// --- Helpers --------------------------------------------------------

function countNodes(node: any): number {
  if (!node || typeof node !== "object") return 0;
  let count = 1;
  for (const key of Object.keys(node)) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        count += countNodes(child);
      }
    } else if (typeof node[key] === "object" && node[key] !== null) {
      count += countNodes(node[key]);
    }
  }
  return count;
}

function serializeSize(obj: any): number {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}

function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== "undefined") {
    try { return structuredClone(obj); } catch { /* ignored */ }
  }
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

// --- Optimization Report --------------------------------------------

/**
 * Generate a human-readable optimization report.
 */
export function generateOptReport(result: PipelineResult): string {
  const lines: string[] = [];
  lines.push("??? TW Optimization Report ???");
  lines.push("");
  lines.push(`Iterations:     ${result.iterations}`);
  lines.push(`Transforms:     ${result.totalTransforms}`);
  lines.push(`Before:         ${formatBytes(result.beforeSize)}`);
  lines.push(`After:          ${formatBytes(result.afterSize)}`);
  lines.push(`Saved:          ${formatBytes(result.savedBytes)}`);
  lines.push(`Compression:    ${(result.compressionRatio * 100).toFixed(1)}% of original`);
  lines.push("");

  // Group by pass
  const byPass = new Map<string, PassResult[]>();
  for (const pr of result.passResults) {
    const arr = byPass.get(pr.pass) || [];
    arr.push(pr);
    byPass.set(pr.pass, arr);
  }

  lines.push("--- Pass Details ---");
  for (const [pass, results] of byPass) {
    const changes = results.filter(r => r.changed).length;
    lines.push(`  ${pass}: ${changes} iterations with changes (out of ${results.length})`);

    // Show details from last changed iteration
    const lastChanged = [...results].reverse().find(r => r.changed);
    if (lastChanged?.details) {
      for (const [key, value] of Object.entries(lastChanged.details)) {
        lines.push(`    ${key}: ${value}`);
      }
    }
  }

  lines.push("");
  lines.push("??? End Report ???");
  return lines.join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
