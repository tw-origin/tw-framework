import { parseWithDetails, setParseCacheSize, getParseCacheSize } from "./parser";
import { transformHoistDirectives, transformMarkVDOM, transformSSRAttributes, transformScopedStyles, programHasScopedStyleBlock, transformInlineComponents } from "./transform";
import { optimize, DEFAULT_OPTS, minifyJS as minifyJSOut } from "./optimizer";
import { generate, resetSuspenseCounter, minifyHTML as minifyHTMLOut, minifyCSS as minifyCSSOut, getComponentRegistry, generateSourceMap } from "./codegen";
import { diagnose } from "./diagnostics";
import type { Diagnostic } from "./diagnostics/types";
/**
 * compiler.incremental / cacheSize: the parser keeps its own cache (keyed on
 * file + source hash, storing the AST and its diagnostics). This sizes that
 * cache and lets `incremental: false` -- or `cacheSize: 0` -- bypass it.
 */
function parseForCompile(source: string, filePath: string, opts?: CompileOptions): any {
  const size = opts?.compiler?.cacheSize ?? 256;
  if (size !== getParseCacheSize()) setParseCacheSize(size);
  return parseWithDetails(source, {
    filePath,
    cache: opts?.incremental !== false && size !== 0,
  });
}

/** compiler.sourceMaps: a line-by-line map for the generated output. */
function sourceMapFor(result: any, filePath: string, source: string, opts?: CompileOptions): any {
  // compiler.sourceMaps is opt-in: the build does not consume the map, so
  // generating one by default would be pure per-compile overhead.
  if (opts?.compiler?.sourceMaps !== true) return undefined;
  try { return generateSourceMap(result.js || result.html || "", filePath, source); }
  catch { return undefined; }
}

/** Options the generator needs from compiler.* / css.* (scoping, prefix). */
function genOpts(opts?: CompileOptions, scopeId?: string): { scopedStyles?: boolean; scopeId?: string; cssPrefix?: string; cssImportPaths?: string[] } {
  return {
    scopedStyles: opts?.compiler?.scopedStyles,
    scopeId,
    cssPrefix: opts?.cssPrefix,
    cssImportPaths: opts?.cssImportPaths,
  };
}

/** A stable scope id for a file -- same input, same id, every build. */
function scopeIdFor(filePath: string): string {
  let h = 5381;
  for (let i = 0; i < filePath.length; i++) h = ((h << 5) + h + filePath.charCodeAt(i)) >>> 0;
  return "s" + h.toString(36);
}

/**
 * compiler.scopedStyles: a page that contains a `scoped` style block gets a
 * scope id and its elements tagged, so the block actually applies. A page with
 * no scoped block is returned untouched (byte-identical output).
 */
function applyScopedStyles(ast: any, opts: CompileOptions | undefined, filePath: string): { ast: any; scopeId?: string } {
  if (opts?.compiler?.scopedStyles === false) return { ast };
  if (!programHasScopedStyleBlock(ast)) return { ast };
  const scopeId = scopeIdFor(filePath);
  return { ast: transformScopedStyles(ast, scopeId), scopeId };
}

/**
 * compiler.* -- apply the fine-grained pass flags to the AST. Shared by the
 * sync and async compile paths so both honour the same config. An unset flag
 * keeps the pass at its current behaviour.
 */
function applyCompilerPasses(ast: any, opts?: CompileOptions): any {
  const p: CompilePassOptions = opts?.compiler ?? {};
  if (opts?.transforms !== false) {
    if (p.hoistDirectives !== false) ast = transformHoistDirectives(ast);
    const { program: marked, needsVdom } = transformMarkVDOM(ast);
    ast = p.ssrAttributes === false ? marked : transformSSRAttributes(marked);
    if (needsVdom) (ast as any).hasVdom = true;
  }
  // compiler.inlineComponents: inline component bodies from the registry so
  // the optimizer and codegen see one flat tree. Off by default (today).
  if (p.inlineComponents === true) {
    try { ast = transformInlineComponents(ast, getComponentRegistry()); } catch { /* leave as-is */ }
  }
  if (opts?.optimize !== false) {
    ast = optimize(ast, {
      constantFolding: p.foldConstants ?? DEFAULT_OPTS.constantFolding,
      deadCode: p.deadCode ?? DEFAULT_OPTS.deadCode,
      treeShaking: p.treeShaking ?? DEFAULT_OPTS.treeShaking,
      removeEmptyBlocks: p.removeEmptyBlocks ?? DEFAULT_OPTS.removeEmptyBlocks,
      minifyHTML: DEFAULT_OPTS.minifyHTML,
      minifyCSS: DEFAULT_OPTS.minifyCSS,
      minifyJS: DEFAULT_OPTS.minifyJS,
    });
  }
  return ast;
}

/**
 * compiler.minifyHTML / minifyCSS / minifyJS -- applied to the emitted output.
 * HTML and CSS default to on, JS to off. compiler.preserveComments keeps the
 * comments that HTML minification would otherwise strip.
 */
function applyOutputMinify(result: any, opts?: CompileOptions): any {
  const p: CompilePassOptions = opts?.compiler ?? {};
  const keep = p.preserveComments === true;
  if (p.minifyHTML !== false && typeof result.html === "string" && result.html) {
    // TW's HTML comments are semantic markers (slot boundaries, unresolved
    // components) -- only whitespace is collapsed, never the comments.
    try { result.html = minifyHTMLOut(result.html, { removeComments: false }); } catch { /* keep as-is */ }
  }
  if (!keep && p.minifyCSS !== false && typeof result.css === "string" && result.css) {
    try { result.css = minifyCSSOut(result.css); } catch { /* keep as-is */ }
  }
  if (!keep && p.minifyJS === true && typeof result.js === "string" && result.js) {
    try { result.js = minifyJSOut(result.js); } catch { /* keep as-is */ }
  }
  return result;
}
/**
 * TW Compiler -- Public API
 *
 * Full compile pipeline: tokenize -> parse -> transform -> optimize -> generate -> diagnose
 */

// Lexer

/** Wrap a function with error handling, logging to console.error. */
function withErrorHandling<T extends (...args: any[]) => any>(fn: T, name: string): T {
  return ((...args: Parameters<T>) => {
    try {
      return fn(...args);
    } catch (e) {
      console.error("[TW] " + name + " error:", e);
      throw e instanceof Error ? e : new Error(String(e));
    }
  }) as T;
}

// AST

// Parser

// Parser: Precedence table

// Parser: Slots & Layout

// Parser: Prop Parser

// Parser: Recovery

// Parser: Validator

// Diagnostics

// Evaluator

// Codegen

// Codegen: Deep modules

// Optimizer (existing)

// Optimizer: Deep modules

// Transforms

// Incremental cache

// Utils

// Semantic analysis

// Cache

// Grammar

// Server Components (Next.js RSC parity)

// Suspense + ErrorBoundary (Next.js parity)

// Build Profiler

// Parallel Compilation + Incremental HMR

// --- Compile Pipeline ---------------------------------------------------------

export interface CompileOptions {
  filePath?: string;
  optimize?: boolean;
  diagnostics?: boolean;
  transforms?: boolean;
  incremental?: boolean;
  stateVars?: Record<string, string>;
  /**
   * Fine-grained compiler.* passes from tw.config.ts. Every field is optional;
   * an unset field keeps the pass at its current behaviour, so a config that
   * sets nothing compiles exactly as before.
   */
  compiler?: CompilePassOptions;
  /** css.prefix -- prefix for generated module class names. */
  cssPrefix?: string;
  /** css.importPaths -- extra dirs to resolve stylesheet imports from. */
  cssImportPaths?: string[];
}

export interface CompilePassOptions {
  /** Gate the directive-hoisting transform. Default: on. */
  hoistDirectives?: boolean;
  /** Gate the SSR-attribute transform. Default: on. */
  ssrAttributes?: boolean;
  /** Optimizer: fold constant conditions. Default: on. */
  foldConstants?: boolean;
  /** Optimizer: drop unreachable branches. Default: on. */
  deadCode?: boolean;
  /** Optimizer: drop unused declarations. Default: on. */
  treeShaking?: boolean;
  /** Optimizer: drop empty text/block nodes. Default: on. */
  removeEmptyBlocks?: boolean;
  /** Scope `.module.tss` / `.module.css` classes. Default: on (today). */
  scopedStyles?: boolean;
  /** Inline component bodies into the page AST. Default: off (today). */
  inlineComponents?: boolean;
  /** Emit a source map for the generated output. Default: on. */
  sourceMaps?: boolean;
  /** Max entries in the parse cache. Default: 256; 0 disables it. */
  cacheSize?: number;
  /** Minify the emitted HTML. Default: on. */
  minifyHTML?: boolean;
  /** Minify the emitted CSS. Default: on. */
  minifyCSS?: boolean;
  /** Minify the emitted JS. Default: off. */
  minifyJS?: boolean;
  /** Keep HTML/JS comments through minification. Default: off. */
  preserveComments?: boolean;
  /** Treat compiler diagnostics as warnings instead of errors. Default: off. */
  looseDiagnostics?: boolean;
}

export interface CompileResult {
  stateSeed?: Record<string, unknown>;
  /** Signal Streaming: name -> public|private of every streamed signal */
  streamedSignals?: Record<string, string>;
  /** derivedSignal(name -> expression) computed specs */
  derivedSpecs?: Record<string, string>;
  ast: import("./ast/nodes").Program;
  html: string;
  css: string;
  js: string;
  hasVdom: boolean;
  hasInteractivity: boolean;
  /** compiler.sourceMaps -- the generated-output source map, when enabled. */
  sourceMap?: any;
  diagnostics: Diagnostic[];
  metadata: {
    parseTime: number;
    codegenTime: number;
    totalTime: number;
    fromCache: boolean;
    nodeCount: number;
  };
}

export async function compile(source: string, opts?: CompileOptions): Promise<CompileResult> {
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1); // UTF-8 BOM
  const startTime = performance.now();
  const filePath = opts?.filePath ?? "<anonymous>";

  // Parse
  const { parseWithDetails } = await import("./parser");
  const parseResult = parseForCompile(source, filePath, opts);
  let ast = parseResult.program;
  const parseTime = performance.now() - startTime;

  // Transforms + optimize: compiler.* passes (shared with compileSync)
  ast = applyCompilerPasses(ast, opts);
  const scoped = applyScopedStyles(ast, opts, filePath);
  ast = scoped.ast;

  // Generate
  const codegenStart = performance.now();
  const { generate } = await import("./codegen");
  const result = applyOutputMinify(generate(ast, opts?.stateVars, genOpts(opts, scoped.scopeId)), opts);
  const codegenTime = performance.now() - codegenStart;

  // Diagnose
  let diagnostics: Diagnostic[] = [];
  if (opts?.diagnostics !== false) {
    const { diagnose } = await import("./diagnostics");
    diagnostics = diagnose(ast, filePath);
    // Merge parser errors (syntax + validation, e.g. invalid render mode).
    const parseErrors = (parseResult as any).errors ?? [];
    for (const err of parseErrors) {
      diagnostics.push({
        severity: (err as any).severity ?? "error",
        message: (err as any).message ?? String(err),
        line: (err as any).line ?? 0,
        col: (err as any).col ?? 0,
        filePath,
        code: (err as any).code ?? "TW000",
        suggestions: [],
        category: "syntax",
      } as any as Diagnostic);
    }
  }

  // compiler.strict === false -> report errors as warnings.
  if (opts?.compiler?.looseDiagnostics) {
    diagnostics = diagnostics.map((d) => (d.severity === "error" ? { ...d, severity: "warning" as any } : d));
  }

  const totalTime = performance.now() - startTime;

  return {
    ast,
    html: result.html,
    css: result.css,
    js: result.js,
    hasVdom: result.hasVdom,
    hasInteractivity: result.hasInteractivity,
    stateSeed: (result as any).stateSeed ?? {},
    streamedSignals: (result as any).streamedSignals ?? {},
    derivedSpecs: (result as any).derivedSpecs ?? {},
    ...(() => { const sm = sourceMapFor(result, filePath, source, opts); return sm ? { sourceMap: sm } : {}; })(),
    diagnostics,
    metadata: {
      parseTime,
      codegenTime,
      totalTime,
      fromCache: parseResult.fromCache,
      nodeCount: 0,
    },
  };
}

export function compileSync(source: string, opts?: CompileOptions): CompileResult {
  const startTime = performance.now();
  const filePath = opts?.filePath ?? "<anonymous>";

  // Deterministic Suspense ids: counter is per-compilation, so the build-time
  // shell and a serve-time re-render of the same file produce identical ids
  // (render ppr hole fills depend on this).
  resetSuspenseCounter();

  // Strip a UTF-8 BOM: Windows editors commonly write one, and the lexer
  // would otherwise reject the very first character.
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  const parseResult = parseForCompile(source, filePath, opts);
  let ast = parseResult.program;
  const parseTime = performance.now() - startTime;

  // Transforms + optimize: compiler.* passes (shared with compile)
  ast = applyCompilerPasses(ast, opts);
  const scoped = applyScopedStyles(ast, opts, filePath);
  ast = scoped.ast;

  const codegenStart = performance.now();
  const result = applyOutputMinify(generate(ast, opts?.stateVars, genOpts(opts, scoped.scopeId)), opts);
  const codegenTime = performance.now() - codegenStart;

  let diagnostics: Diagnostic[] = [];
  if (opts?.diagnostics !== false) {
    diagnostics = diagnose(ast, filePath);
    // Merge parser errors (syntax + validation, e.g. invalid render mode)
    // -- previously these never surfaced in compileSync diagnostics.
    const parseErrors = (parseResult as any).errors ?? [];
    for (const err of parseErrors) {
      diagnostics.push({
        severity: (err as any).severity ?? "error",
        message: (err as any).message ?? String(err),
        line: (err as any).line ?? 0,
        col: (err as any).col ?? 0,
        filePath,
        code: (err as any).code ?? "TW000",
        suggestions: [],
        category: "syntax",
      } as any as Diagnostic);
    }
  }

  // compiler.strict === false -> report errors as warnings.
  if (opts?.compiler?.looseDiagnostics) {
    diagnostics = diagnostics.map((d) => (d.severity === "error" ? { ...d, severity: "warning" as any } : d));
  }

  const totalTime = performance.now() - startTime;

  return {
    ast,
    html: result.html,
    css: result.css,
    js: result.js,
    hasVdom: result.hasVdom,
    hasInteractivity: result.hasInteractivity,
    stateSeed: (result as any).stateSeed ?? {},
    streamedSignals: (result as any).streamedSignals ?? {},
    derivedSpecs: (result as any).derivedSpecs ?? {},
    ...(() => { const sm = sourceMapFor(result, filePath, source, opts); return sm ? { sourceMap: sm } : {}; })(),
    diagnostics,
    metadata: {
      parseTime,
      codegenTime,
      totalTime,
      fromCache: parseResult.fromCache,
      nodeCount: 0,
    },
  };
}

export { ConstantFolder, DEFAULT_OPTS, DEFAULT_PIPELINE_OPTIONS, DependencyGraph, FunctionHoister, FunctionInliner, HoistPass, LoopUnroller, OptimizerPipeline, UnrollPass, buildDependencyGraph, canUnroll, countByType, countHoistable, createFunctionHoister, createHoistPass, createLoopUnroller, createUnrollPass, eliminateDeadCode, estimateUnrollBenefit, foldConstants, foldExpression, foldWithConstants, generateOptReport, getDependencyGraph, getHoistPriority, getHoistStats, getHoistableNodes, getNonHoistableNodes, getStats, hoistAndMerge, hoistFunctions, inlineFunctions, isExportDeclaration, isFullyUnrolled, isFunctionDeclaration, isHoistable, isImportDeclaration, isPartiallyUnrolled, isVariableDeclaration, mergeHoisted, minifyJS, optimize, optimizeAST, optimizeDCE, optimizeDeep, optimizeFold, optimizeInline, optimizeShake, optimizeTransform, separateByType, shakeToFixpoint, shakeTree, shouldHoist, shouldUnroll, sortByHoistPriority, unrollFactor, unrollLoop, unrollWithRemainder } from "./optimizer";
export type { AdvancedOptDetail, AdvancedOptResult, ConstValue, DCEDetail, DCEResult, FoldResult, GraphNode, HoistOptions, HoistResult, InlineDetail, InlineResult, NodeType, OptimizeOptions, OptimizeStats, OptimizerPipelineOptions, PassResult, PipelineResult, TransformDetail, TransformResult, TreeShakeResult, UnrollOptions, UnrollResult } from "./optimizer";
export { compileParallel, createHMRMessage, diffForHMR } from "./parallel";
export type { HMRPatch, ParallelCompileOptions, ParallelCompileResult } from "./parallel";
export { endStage, formatReport, generateComparison, generateReport, recordFile, startStage } from "./profiler";
export type { BuildProfile, BundleProfile, CacheProfile, FileProfile, NextJsComparison, RouteProfile, StageProfile } from "./profiler";
export { clearRegistry, determineHydrationStrategy, getComponent, parseClientDirective, registerComponent, renderServerComponent } from "./server-components";
export type { ComponentKind, IslandManifest, PropSchema, ServerComponent, ServerContext, ServerRenderResult } from "./server-components";
export { SUSPENSE_CLIENT_RUNTIME, createLoadingState, createSuspense, renderErrorBoundary, renderSuspense, streamSuspense } from "./suspense";
export type { ErrorBoundaryConfig, SuspenseBoundary } from "./suspense";
export { ASTBuilder, ComponentBuilder, ElementBuilder, ForBuilder, FragmentBuilder, IfBuilder, NodeVisitor, TransformVisitor, analyzeTree, builder, collectAllBindings, collectAllDirectives, collectAllEvents, collectAllStyles, collectBody, collectByDirectiveType, collectDependencies, collectDirectives, collectHead, collectImports, collectLayout, collectRenderMode, collectStateDecls, collectStateVars, countNodes, createAttribute, createComponent, createElement, createEventBinding, createFor, createFragment, createIf, createProgram, createPropertyBinding, createScriptBlock, createSlot, createStyleBlock, createStyleDecl, createText, dumpTree, everyNode, extractAllText, extractText, findCircularComponentRefs, findComments, findComponentByName, findComponentUsage, findComponents, findElementById, findElements, findElementsByAttr, findElementsByClass, findElementsByTag, findForNodes, findIfNodes, findNode, findNodes, findScriptBlocks, findStyleBlocks, findTextNodes, findTwmBlocks, forEachNode, fromJSON, getAllComponentNames, getDepth, getPath, hasForms, hasInteractiveFeatures, hasMedia, hasSSRFeatures, hasScripts, hasState, hasStreamingFeatures, hasStyles, isBodyDirective, isComment, isComponent, isDirective, isElement, isElementDirective, isExportDirective, isExpression, isForNode, isFragment, isHeadDirective, isIfNode, isImportDirective, isLayoutDirective, isLoadDirective, isPageDirective, isRenderDirective, isScriptBlock, isSlot, isStateDirective, isStyleBlock, isSwitchNode, isText, isTryNode, isTwmBlock, isWhileNode, mergeElements, printAST, printMinified, query, someNode, summary, toDot, toJSON, walk, walkAsync } from "./ast";
export type { ASTNode, ASTNodeType, ArrayExpr, ArrowFnExpr, AssignmentExpr, AsyncVisitor, AsyncVisitorOptions, AttributeNode, AwaitExpr, BaseNode, BinaryExpr, BodyDirective, CSSRule, CallExpr, Comment, CommentNode, ComponentNode, ConditionalExpr, ConfigDirective, DefineDirective, DestructurePattern, DestructureProperty, DirectiveNode, DoctypeNode, ElementDirective, ElementNode, ElseIfNode, EventBinding, EventModifier, ExportDirective, ExpressionNode, ForNode, FragmentNode, HeadDirective, IdentifierExpr, IfNode, ImportDirective, InterpolationExpr, LayoutDirective, LinkTag, LiteralExpr, LoadDirective, LogicalExpr, MemberExpr, MetaDirective, MetaTag, MiddlewareDirective, NewExpr, ObjectExpr, ObjectProperty, PageDirective, Param, ParseError, Program, PropertyBinding, QueryOptions, RedirectDirective, RenderDirective, RevalidateDirective, RewriteDirective, ScriptBlock, SectionDirective, SequenceExpr, SlotNode, SpreadExpr, StateDeclaration, StateDirective, StyleBlock, StyleDecl, SwitchCase, SwitchNode, SyncVisitor, TemplateExpr, TextNode, TreeAnalysis, TryNode, TwmBlock, UnaryExpr, VisitorAction, VisitorContext, VisitorOptions, VisitorResult, WhileNode, YieldExpr } from "./ast";
export { DiskCache, MemoryCache, UnifiedCache, makeConfigKey, makeFileKey, makeKey, makeSourceKey } from "./cache";
export type { CacheOptions, DiskCacheEntry, MemoryCacheEntry } from "./cache";
export { BUILTIN_COMPONENT_SPECIFIERS, collectBuiltinImports, generateImageTag, generateRouterLinkTag, generateBuiltinTag, resolveBuiltin, setBuiltinImageConfig, getBuiltinImageConfig } from "./codegen";
export { detectTailwind, runTailwind } from "./codegen";
export { registerForeignComponent, resolveForeignComponent, hasForeignComponents, clearForeignComponents, foreignComponentNames, islandWrapper } from "./codegen";
export { ASTPrinter, CSSExtractor, CodegenOrchestrator, DEFAULT_CODEGEN_OPTIONS, JSBundleBuilder, Pipeline, SourceMapBuilder, SourceMapMerger, StreamingHTMLGenerator, SymbolTable, TemplateBuilder, TransformerPass, TypeChecker, VDOMCodeBuilder, chunksToHTML, createASTPrinter, createPipeline, createSourceMapBuilder, createSourceMapMerger, createSymbolTable, createTransformerPass, createTypeChecker, deepGenerate, extractCSS, generate, generateArrowTemplate, generateBootstrapCode, generateBundle, generateCSSOnly, generateHTML, generateHTMLOnly, beginCssRouteCapture, endCssRouteCapture, isCssCaptureActive, recordCssChunk, getCapturedCssRoutes, getCssChunks, clearCssCapture, hashCss, computeCssAssets, routeToCssName, generateJSOnly, generateNodeVDOM, generatePartials, generateRuntimeCode, generateSourceMap, generateStaticHTML, generateStaticVDOM, generateStreaming, generateTemplateFunction, generateVDOM, generateVDOMCode, generateWithLayout, generateWithLayoutChain, compileTSS, compileSCSS, mergeCSS, minifyCSS, minifyHTML, minifyHTMLWithStats, registerComponentTemplate, clearComponentRegistry, splitCriticalChunks, streamHTML } from "./codegen";
export type { BundleOptions, CSSExtractionResult, ChunkType, CodegenContext, CodegenMetadata, CodegenMode, CodegenOptions, CodegenResult, DeepCodegenResult, HTMLChunk, HydrationMarker, JSBundle, JSBundleMetadata, MinifyHTMLOptions, MinifyStats, SourceMap, SourceMapEntry, SourceMapMapping, SourceMapOptions } from "./codegen";
export { BUILTIN_RULES, ERROR_CODES, RuleEngine, RulesEngine, countBySeverity, createDefaultRulesEngine, createDiagnostic, createRulesEngine, diagnose, formatDiagnostic, formatDiagnosticReport, formatDiagnostics, getBuiltinRuleCount, getBuiltinRulesByCategory, getBuiltinRulesBySeverity, getDiagnosticStats } from "./diagnostics";
export type { AutofixSuggestion, Diagnostic, DiagnosticCategory, DiagnosticContext, DiagnosticMessage, DiagnosticReport, DiagnosticRule, DiagnosticSeverity, DiagnosticSuggestion, ErrorCode } from "./diagnostics";
export { Sandbox, applyFilter, callBuiltin, coerce, evaluate, inferType, interpolate, isTruthy } from "./eval";
export type { SandboxOptions } from "./eval";
export { PRECEDENCE_TABLE, SYNTAX_RULES, TW_GRAMMAR, getAllRules, getAssociativity, getGrammarRule, getPrecedence, getRule, hasEqualPrecedence, hasHigherPrecedence, isRightAssociative, validateSyntax } from "./grammar";
export type { GrammarRule, GrammarSymbol, GrammarToken, PrecedenceEntry, Production, SyntaxRule } from "./grammar";
export { addDependency, createCache, createDependencyGraph, deserializeCache, getCacheStats, getCached, getDependencies, getDependents, getTransitiveDependents, invalidate, invalidateAll, removeFile, serializeCache, setCached } from "./incremental";
export type { CacheEntry, IncrementalCache } from "./incremental";
export { CONTEXTUAL_KEYWORDS, ErrorRecovery, KEYWORDS, KeywordType, LexerModeStack, MULTI_CHAR_PUNCTUATORS, ModeRules, ModeStack, PUNCTUATORS, PositionTracker, RESERVED_WORDS, SINGLE_CHAR_PUNCTUATORS, STRICT_MODE_RESERVED, SYNC_POINTS, TABLE_DIGIT, TABLE_IDENT_PART, TABLE_IDENT_START, TABLE_LINE_TERM, TABLE_OP_CHAR, TABLE_PUNCT, TABLE_STRING_DELIM, TABLE_VOID_TAG, TABLE_WHITESPACE, TSS_SHORTHANDS, TokenClusterer, TokenStream, TokenType, adjacentTokens, charCode, cloneToken, cloneTokens, clusterTokens, comparePrecedence, compareTokens, countComments, countIdentifiers, countKeywords, countLiterals, countNewlines, countOperators, countPunctuators, countTokens, countTokensByValue, countWhitespace, createEOFToken, createToken, createUnknownToken, decodeMappings, decodeVLQ, deduplicateTokens, describeToken, detectBlockType, encodeVLQ, escapeString, expandTSS, filterComments, filterNewlines, filterOutTokens, filterOutTokensByType, filterTokens, filterTokensByType, filterWhitespace, filterWhitespaceAndComments, findLastToken, findLastTokenIndex, findToken, findTokenByValue, findTokenIndex, findTokenIndexByValue, fromCode, getAverageTokenLength, getMaxTokenLength, getMinTokenLength, getMostFrequentTokenTypes, getMostFrequentTokens, getOperatorPrecedence, getStringDelimiter, getTokenAtLineColumn, getTokenAtPosition, getTokenBoundingBox, getTokenColumnCount, getTokenColumnDistance, getTokenDensity, getTokenDescription, getTokenDistance, getTokenFrequency, getTokenLengths, getTokenLineCount, getTokenLineDistance, getTokenName, getTokenRanges, getTokenStats, getTokenSummary, getTokenTypeFrequency, getTokenValue, getTokenValueFrequency, getTokensInLineRange, getTokensInRange, getTotalTokenLength, groupTokens, hasLowerPrecedence, isAlpha, isAlphaLower, isAlphaUpper, isArithmetic, isAssignment, isAssignmentToken, isAssociative, isAttrNameChar, isAttrNameStart, isBinaryDigit, isBinaryOperatorToken, isBitwiseOperatorToken, isCloseToken, isCommentToken, isCommutative, isComparison, isComparisonToken, isContextualKeyword, isControlChar, isDigit, isDistributive, isEOFToken, isHexDigit, isIdentPart, isIdentStart, isIdentifier, isIdentifierPart, isIdentifierStart, isIdentifierToken, isKeyword, isKeywordToken, isLeftAssociative, isLineBreak, isLineTerm, isLineTerminator, isLiteral, isLiteralToken, isLogical, isLogicalOperatorToken, isNewlineToken, isOctalDigit, isOpChar, isOpenToken, isOperator, isOperatorToken, isPrintable, isPunct, isPunctuation, isPunctuator, isPunctuatorToken, isRawTextTag, isReservedWord, isStrictModeReserved, isStringDelim, isStringDelimiter, isTagChar, isTokenAdjacent, isTokenAfter, isTokenBefore, isUnaryOperatorToken, isUnknownToken, isVoidTag, isWhitespace, isWhitespaceToken, makeToken, matchBraces, matchBrackets, matchOperator, matchParens, matchingPair, mergeSourceMaps, mergeTokens, pairwiseTokens, panicRecovery, readBlock, readCDATA, readComment, readDoctype, readNestedBlocks, readNumber, readRawText, readRegex, readScriptBlock, readString, readStyleBlock, readTwmBlock, recoverMissingBrace, recoverUnclosedTag, recoverUnterminatedString, sortTokens, splitTokens, splitTokensByValue, stringToTokenType, toHexDigit, tokenToJSON, tokenToString, tokenTypeName, tokenTypeToString, tokensToArray, tokensToCSV, tokensToJSON, tokensToString, tokensToTable, unescapeString, uniqueTokens, validateString } from "./lexer";
export type { BlockReadResult, ClusterType, ErrorStrategy, LexerMode, ModeFrame, NumberReadResult, RecoveryPoint, RecoveryResult, RecoveryStrategy, RegexReadResult, SourceLocation, SourceSpan, StringReadResult, TemplateExpression, Token, TokenCluster, TokenComment, TokenFlags, TokenPosition, TokenizerError, TokenizerOptions, TokenizerResult } from "./lexer";
export { compileAuto, compileChildProcess, compileChildProcessAsync, compileHtml, compileHtmlNative, compileNative, compilePooled, compileWith, destroyPool, detectBackends, findRustBinary, getBackendInfo, getBestBackend, getPool, hasChildProcess, hasNative, loadNative, setBackend, shutdown } from "./native";
export type { Backend, BridgeResult, HybridCompileResult, NativeCompileResult, NativeModule } from "./native";
export { optimizeAdvanced } from "./optimizer";
export { CompilerError, CompilerState, ErrorCollector, ExpressionParser, LayoutRegistry, MEMBER_OPS, PARSER_SYNC_POINTS, PRECEDENCE, ParserRecovery, PropParser, SpeculativeParser, TokenCursor, attemptRecovery, clearParseCache, continueAfterError, createErrorNode, createMissingNode, detectCommonError, extractSlots, fillSlots, findSyncPoint, generateJSDoc, getNodeType, getParseCacheSize, hasHigherPrec, invalidateCache, isArithmeticOp, isAssignmentOp, isBitwiseOp, isComparisonOp, isDirectiveKeyword, isLogicalOp, isMemberOp, isOptionalChainStart, isSpreadOrRest, isUnaryPrefixOp, isUpdateOp, maskError, parse, parseBatch, parseDirective, parseFile, parseLayout, parseStatements, parseTokens, parseWithDetails, renderLayoutWithSlots, reportInvalidValue, reportMissingToken, reportUnexpectedToken, resolveLayoutChain, shouldContinue, setParseCacheSize, skipToSync, validateAst, validateConstraints, validateDirectives, validateEventHandlers, validateProp, validateRequiredAttrs, validateSlotRefs, validateStateRefs, validateTagNesting } from "./parser";
export type { Associativity, CompilerStateSnapshot, LayoutChain, LayoutDef, ParseOptions, ParseResult, ParserCheckpoint, PropConstraints, PropDef, PropType, PropsBlock, RecoveryAction, SlotContent, SlotDef, StatementParserOptions, ValidationError, ValidationOptions } from "./parser";
export { ANY, BIGINT, BOOLEAN, BUILTIN_TYPES, NEVER, NULL, NUMBER, OBJECT, STRING, SYMBOL, UNDEFINED, UNKNOWN, VOID, addBinding, analyzeDefiniteAssignment, arrayType, booleanLiteral, buildScopeTree, buildSymbolTable, check, conditionalType, createGlobalScope, createInferenceContext, createModuleScope, createScope, createTypeMismatchError, findCapturedBindings, findShadowedBindings, findTDZViolations, findUnusedBindings, functionType, genericType, getAllBindings, getBindingsInScope, getCommonSupertype, getEnclosingFunctionScope, getEnclosingLoopScope, getExportedBindings, getImportedBindings, getPropertyType, getScopeChain, getTruthiness, hasProperty, inferArrayType, inferFromValue, inferLiteralType, inferNode, inferNodeType, inferProgram, inferValueType, intersectionType, isAny, isArray, isAssignable, isAssignableTo, isBoolean, isConditional, isFunction, isIntersection, isMapped, isNever, isNull, isNumber, isNumericLiteral, isObject, isPrimitive, isReference, isString, isStringLiteralValue, isTemplate, isTuple, isUndefined, isUnion, isUnknown, isVoid, literalType, lookup, lookupInScope, lookupIncludingGlobals, mappedType, narrowType, numberLiteral, objectType, parseType, referenceType, resolveConditional, resolveReferences, scopeToString, stringLiteral, substituteTypeParams, templateType, tupleType, typeEquals, typeToString, unify, unifyTypes, unionType, validate, widenType } from "./semantic";
export type { Binding, BindingKind, CheckResult, FunctionSig, InferenceContext, InferenceDiagnostic, NarrowCondition, ParamSig, PropertySig, Reference, ResolutionResult, ResolvedReference, Scope, ScopeKind, SemanticError, SymbolEntry, SymbolKind, TWType, TWTypeNode, TemplatePart, TypeConstraint, TypeKind, TypeParam } from "./semantic";
export { transformApplyLayout, transformHoistDirectives, transformInlineComponents, transformMarkVDOM, transformResolveImports, transformResolveSlots, transformResponsiveStyles, transformSSRAttributes, transformScopedStyles } from "./transform";

export { validateSemantics } from "./semantic";

// Public API: tokenize returns Token[] directly (for test compatibility)
export { tokenizeArray as tokenize } from "./lexer";

export { escapeHTML } from "./utils/string/escape";
export { camelCase, kebabCase } from "./utils/string/case";
export { RENDER_MODE_NAMES, RENDER_MODE_ALIASES, VALID_RENDER_MODES, resolveRenderMode } from "@tw/shared";
