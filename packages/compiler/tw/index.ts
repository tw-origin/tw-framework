import { parseWithDetails } from "./parser";
import { transformHoistDirectives, transformMarkVDOM, transformSSRAttributes } from "./transform";
import { optimize, DEFAULT_OPTS } from "./optimizer";
import { generate, resetSuspenseCounter } from "./codegen";
import { diagnose } from "./diagnostics";
import type { Diagnostic } from "./diagnostics/types";
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
  const parseResult = parseWithDetails(source, { filePath });
  let ast = parseResult.program;
  const parseTime = performance.now() - startTime;

  // Transforms
  if (opts?.transforms !== false) {
    const { transformHoistDirectives, transformMarkVDOM, transformSSRAttributes } = await import("./transform");
    ast = transformHoistDirectives(ast);
    const { program: marked, needsVdom } = transformMarkVDOM(ast);
    ast = transformSSRAttributes(marked);
    if (needsVdom) {
      (ast as any).hasVdom = true;
    }
  }

  // Optimize
  if (opts?.optimize !== false) {
    const { optimize, DEFAULT_OPTS } = await import("./optimizer");
    ast = optimize(ast, DEFAULT_OPTS);
  }

  // Generate
  const codegenStart = performance.now();
  const { generate } = await import("./codegen");
  const result = generate(ast, opts?.stateVars);
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
  const parseResult = parseWithDetails(source, { filePath });
  let ast = parseResult.program;
  const parseTime = performance.now() - startTime;

  if (opts?.transforms !== false) {
    ast = transformHoistDirectives(ast);
    const { program: marked, needsVdom } = transformMarkVDOM(ast);
    ast = transformSSRAttributes(marked);
    if (needsVdom) (ast as any).hasVdom = true;
  }

  if (opts?.optimize !== false) {
    ast = optimize(ast, DEFAULT_OPTS);
  }

  const codegenStart = performance.now();
  const result = generate(ast, opts?.stateVars);
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
export { CompilerError, CompilerState, ErrorCollector, ExpressionParser, LayoutRegistry, MEMBER_OPS, PARSER_SYNC_POINTS, PRECEDENCE, ParserRecovery, PropParser, SpeculativeParser, TokenCursor, attemptRecovery, clearParseCache, continueAfterError, createErrorNode, createMissingNode, detectCommonError, extractSlots, fillSlots, findSyncPoint, generateJSDoc, getNodeType, hasHigherPrec, invalidateCache, isArithmeticOp, isAssignmentOp, isBitwiseOp, isComparisonOp, isDirectiveKeyword, isLogicalOp, isMemberOp, isOptionalChainStart, isSpreadOrRest, isUnaryPrefixOp, isUpdateOp, maskError, parse, parseBatch, parseDirective, parseFile, parseLayout, parseStatements, parseTokens, parseWithDetails, renderLayoutWithSlots, reportInvalidValue, reportMissingToken, reportUnexpectedToken, resolveLayoutChain, shouldContinue, skipToSync, validateAst, validateConstraints, validateDirectives, validateEventHandlers, validateProp, validateRequiredAttrs, validateSlotRefs, validateStateRefs, validateTagNesting } from "./parser";
export type { Associativity, CompilerStateSnapshot, LayoutChain, LayoutDef, ParseOptions, ParseResult, ParserCheckpoint, PropConstraints, PropDef, PropType, PropsBlock, RecoveryAction, SlotContent, SlotDef, StatementParserOptions, ValidationError, ValidationOptions } from "./parser";
export { ANY, BIGINT, BOOLEAN, BUILTIN_TYPES, NEVER, NULL, NUMBER, OBJECT, STRING, SYMBOL, UNDEFINED, UNKNOWN, VOID, addBinding, analyzeDefiniteAssignment, arrayType, booleanLiteral, buildScopeTree, buildSymbolTable, check, conditionalType, createGlobalScope, createInferenceContext, createModuleScope, createScope, createTypeMismatchError, findCapturedBindings, findShadowedBindings, findTDZViolations, findUnusedBindings, functionType, genericType, getAllBindings, getBindingsInScope, getCommonSupertype, getEnclosingFunctionScope, getEnclosingLoopScope, getExportedBindings, getImportedBindings, getPropertyType, getScopeChain, getTruthiness, hasProperty, inferArrayType, inferFromValue, inferLiteralType, inferNode, inferNodeType, inferProgram, inferValueType, intersectionType, isAny, isArray, isAssignable, isAssignableTo, isBoolean, isConditional, isFunction, isIntersection, isMapped, isNever, isNull, isNumber, isNumericLiteral, isObject, isPrimitive, isReference, isString, isStringLiteralValue, isTemplate, isTuple, isUndefined, isUnion, isUnknown, isVoid, literalType, lookup, lookupInScope, lookupIncludingGlobals, mappedType, narrowType, numberLiteral, objectType, parseType, referenceType, resolveConditional, resolveReferences, scopeToString, stringLiteral, substituteTypeParams, templateType, tupleType, typeEquals, typeToString, unify, unifyTypes, unionType, validate, widenType } from "./semantic";
export type { Binding, BindingKind, CheckResult, FunctionSig, InferenceContext, InferenceDiagnostic, NarrowCondition, ParamSig, PropertySig, Reference, ResolutionResult, ResolvedReference, Scope, ScopeKind, SemanticError, SymbolEntry, SymbolKind, TWType, TWTypeNode, TemplatePart, TypeConstraint, TypeKind, TypeParam } from "./semantic";
export { transformApplyLayout, transformHoistDirectives, transformInlineComponents, transformMarkVDOM, transformResolveImports, transformResolveSlots, transformResponsiveStyles, transformSSRAttributes, transformScopedStyles } from "./transform";

export { validateSemantics } from "./semantic";

// Public API: tokenize returns Token[] directly (for test compatibility)
export { tokenizeArray as tokenize } from "./lexer";

export { escapeHTML } from "./utils/string/escape";
export { camelCase, kebabCase } from "./utils/string/case";
