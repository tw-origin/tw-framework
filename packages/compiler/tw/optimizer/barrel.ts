/** Optimizer barrel -- deep optimizer with real algorithms. */

export { optimize, minifyHTML, minifyCSS, minifyJS, getStats, type OptimizeOptions, type OptimizeStats, DEFAULT_OPTS } from "./index";

// DCE
export { eliminateDeadCode, type DCEResult, type DCEDetail } from "./dead-code-elimination";

// Constant folding
export {
  ConstantFolder, foldConstants, foldExpression, foldWithConstants,
  type ConstValue, type FoldResult,
} from "./constant-folding";

// Tree shaker
export {
  DependencyGraph, buildDependencyGraph, shakeTree, shakeToFixpoint,
  type GraphNode, type NodeType, type TreeShakeResult,
} from "./tree-shaker";

// Function inliner
export { FunctionInliner, inlineFunctions, type InlineResult, type InlineDetail } from "./function-inliner";

// AST transforms
export { optimizeAST, type TransformResult, type TransformDetail } from "./ast-transforms";

// Pipeline
export {
  OptimizerPipeline, optimizeDeep, optimizeFold, optimizeDCE,
  optimizeShake, optimizeTransform, optimizeInline,
  getDependencyGraph, generateOptReport,
  DEFAULT_PIPELINE_OPTIONS,
  type OptimizerPipelineOptions, type PipelineResult, type PassResult,
} from "./pipeline";

// Advanced passes -- 12 additional optimization passes
export {
  optimizeAdvanced,
  type AdvancedOptResult, type AdvancedOptDetail,
} from "./advanced-passes";
