/** Codegen barrel - re-exports from split sub-modules. */

// Streaming HTML generator

// VDOM code generator

// CSS extraction & minification

// JS bundler

// Template literal generator

// HTML minifier

// Source map generator

// Codegen orchestrator

export { resetSuspenseCounter } from "./html";
export { CSSExtractor, extractCSS, mergeCSS, minifyCSS } from "./css-extract";
export type { CSSExtractionResult, CSSRule } from "./css-extract";
export { generateHTML, registerComponentTemplate, clearComponentRegistry, beginCssRouteCapture, endCssRouteCapture, isCssCaptureActive, recordCssChunk, getCapturedCssRoutes, getCssChunks, clearCssCapture, hashCss } from "./html";
export { JSBundleBuilder, generateBootstrapCode, generateBundle, generateRuntimeCode } from "./js-bundle";
export type { BundleOptions, JSBundle, JSBundleMetadata } from "./js-bundle";
export { minifyHTML, minifyHTMLWithStats } from "./minify";
export type { MinifyHTMLOptions, MinifyStats } from "./minify";
export { CodegenOrchestrator, DEFAULT_CODEGEN_OPTIONS, deepGenerate, generateCSSOnly, generateHTMLOnly, generateJSOnly, generateStreaming } from "./orchestrator";
export type { CodegenOptions, DeepCodegenResult } from "./orchestrator";
export { ASTPrinter, Pipeline, SourceMapBuilder, SourceMapMerger, SymbolTable, TransformerPass, TypeChecker, createASTPrinter, createPipeline, createSourceMapBuilder, createSourceMapMerger, createSymbolTable, createTransformerPass, createTypeChecker } from "./source-map-builder";
export type { SourceMapEntry, SourceMapOptions } from "./source-map-builder";
export { generateSourceMap } from "./sourcemap";
export type { SourceMap, SourceMapMapping } from "./sourcemap";
export { StreamingHTMLGenerator, chunksToHTML, splitCriticalChunks, streamHTML } from "./streaming";
export type { ChunkType, HTMLChunk } from "./streaming";
export { BUILTIN_COMPONENT_SPECIFIERS, collectBuiltinImports, generateImageTag, generateRouterLinkTag, generateBuiltinTag, resolveBuiltin, setBuiltinImageConfig, getBuiltinImageConfig } from "./builtin-components";
export { TemplateBuilder, generateArrowTemplate, generatePartials, generateStaticHTML, generateTemplateFunction } from "./template-gen";
export type { CodegenContext, CodegenMetadata, CodegenMode, CodegenResult, HydrationMarker } from "./types";
export { VDOMCodeBuilder, generateNodeVDOM, generateStaticVDOM, generateVDOMCode } from "./vdom-gen";
export { generate, generateVDOM, generateWithLayout, generateWithLayoutChain } from "./vdom";
export { compileTSS, TSS_SHORTHANDS } from "./tss";

export { computeCssAssets, routeToCssName } from "./css-assets";

export { compileSCSS } from "./scss";
