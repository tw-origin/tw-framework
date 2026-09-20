/**
 * Codegen orchestrator -- coordinates all codegen modules.
 *
 * This is the entry point for the codegen phase. It:
 * 1. Extracts CSS (css-extract.ts)
 * 2. Generates streaming HTML (streaming.ts)
 * 3. Generates VDOM code (vdom-gen.ts)
 * 4. Generates JS bundle (js-bundle.ts)
 * 5. Generates template functions (template-gen.ts)
 * 6. Minifies HTML (minify.ts)
 * 7. Generates source maps (sourcemap.ts)
 *
 * The orchestrator determines which modules to run based on:
 * - Render mode (ssr, csr, ssg, streaming, edge)
 * - Feature flags (interactive, vdom, streaming)
 * - Target environment (browser, worker, edge)
 *
 * Pipeline:
 *   AST -> CSS Extraction -> HTML Generation -> VDOM Generation
 *       -> JS Bundle -> Template Functions -> Minification -> Source Map
 */

import type { Program } from "../ast/nodes";
import { CodegenContext, CodegenMetadata } from "./types";
import { CSSExtractor, extractCSS, type CSSExtractionResult } from "./css-extract";
import { streamHTML, chunksToHTML, type HTMLChunk } from "./streaming";
import { VDOMCodeBuilder } from "./vdom-gen";
import { JSBundleBuilder, generateBundle, type JSBundle, type BundleOptions } from "./js-bundle";
import { TemplateBuilder } from "./template-gen";
import { minifyHTMLWithStats } from "./minify";
import { generateSourceMap, type SourceMap } from "./sourcemap";

// --- Orchestrator Options --------------------------------------------

export interface CodegenOptions {
  /** Render mode */
  mode: "ssr" | "csr" | "ssg" | "streaming" | "edge";
  /** Minify output */
  minify: boolean;
  /** Generate source map */
  sourceMap: boolean;
  /** Extract and optimize CSS */
  extractCSS: boolean;
  /** Generate JS bundle for hydration */
  generateJS: boolean;
  /** Generate VDOM code */
  generateVDOM: boolean;
  /** Generate template functions */
  generateTemplates: boolean;
  /** Split critical/non-critical CSS */
  splitCriticalCSS: boolean;
  /** Inline critical CSS in HTML */
  inlineCriticalCSS: boolean;
  /** Tree shake JS */
  treeShake: boolean;
  /** Bundle format */
  format: "esm" | "cjs" | "iife";
}

export const DEFAULT_CODEGEN_OPTIONS: CodegenOptions = {
  mode: "ssr",
  minify: true,
  sourceMap: true,
  extractCSS: true,
  generateJS: true,
  generateVDOM: true,
  generateTemplates: false,
  splitCriticalCSS: true,
  inlineCriticalCSS: true,
  treeShake: true,
  format: "esm",
};

// --- Codegen Result (extended) ---------------------------------------

export interface DeepCodegenResult {
  /** HTML output */
  html: string;
  /** CSS output (all) */
  css: string;
  /** Critical CSS (for inlining) */
  criticalCSS: string;
  /** Non-critical CSS (for async loading) */
  nonCriticalCSS: string;
  /** JS bundle */
  js: string;
  /** JS bundle metadata */
  jsMetadata: JSBundle["metadata"];
  /** VDOM code (for client hydration) */
  vdomCode: string;
  /** Static VDOM JSON (for SSR) */
  staticVDOM: string;
  /** Template function source */
  templateFn: string;
  /** Source map */
  sourceMap?: SourceMap;
  /** HTML chunks (for streaming) */
  chunks: HTMLChunk[];
  /** CSS extraction result */
  cssResult: CSSExtractionResult;
  /** Codegen metadata */
  metadata: CodegenMetadata;
  /** Warnings */
  warnings: string[];
  /** Options used */
  options: CodegenOptions;
  /** Total size of all output */
  totalSize: number;
}

// --- Orchestrator ----------------------------------------------------

export class CodegenOrchestrator {
  private options: CodegenOptions;
  private warnings: string[] = [];
  private startTime = 0;

  constructor(options?: Partial<CodegenOptions>) {
    this.options = { ...DEFAULT_CODEGEN_OPTIONS, ...options };
  }

  /**
   * Run the full codegen pipeline.
   */
  generate(program: Program, stateVars?: Record<string, string>): DeepCodegenResult {
    this.startTime = performance.now();
    this.warnings = [];

    // Create context
    const ctx = createContext(this.options.mode);
    if (stateVars) ctx.stateVars = stateVars;

    // Process directives to populate context
    this.processDirectives(program, ctx);

    // 1. CSS Extraction
    let cssResult: CSSExtractionResult | null = null;
    if (this.options.extractCSS) {
      const extractor = new CSSExtractor(ctx);
      cssResult = extractor.extractFromProgram(program);
      ctx.inlineStyles = cssResult.criticalCSS ? [cssResult.criticalCSS] : [];
    }

    // 2. HTML Generation (streaming or regular)
    let chunks: HTMLChunk[] = [];
    let html = "";
    if (this.options.mode === "streaming") {
      chunks = streamHTML(program, ctx);
      html = chunksToHTML(chunks);
    } else {
      // Use existing generateHTML from html.ts
      chunks = streamHTML(program, ctx);
      html = chunksToHTML(chunks);
    }

    // Minify HTML
    if (this.options.minify) {
      const result = minifyHTMLWithStats(html);
      html = result.html;
    }

    // 3. VDOM Generation
    let vdomCode = "";
    let staticVDOM = "[]";
    if (this.options.generateVDOM) {
      const vdomBuilder = new VDOMCodeBuilder(ctx);
      vdomCode = vdomBuilder.generateModule(program);
      staticVDOM = vdomBuilder.generateStatic(program);
    }

    // 4. JS Bundle
    let jsBundle: JSBundle | null = null;
    if (this.options.generateJS) {
      const bundleOptions: BundleOptions = {
        minify: this.options.minify,
        sourceMap: this.options.sourceMap,
        includeRuntime: true,
        treeShake: this.options.treeShake,
        inline: false,
        target: this.options.mode === "edge" ? "edge" : "browser",
        format: this.options.format,
      };
      const bundleBuilder = new JSBundleBuilder(bundleOptions);
      jsBundle = bundleBuilder.build(program, ctx);
    }

    // 5. Template Functions
    let templateFn = "";
    if (this.options.generateTemplates) {
      const templateBuilder = new TemplateBuilder("data", ctx);
      templateFn = templateBuilder.generate(program);
    }

    // 6. Source Map
    let sourceMap: SourceMap | undefined;
    if (this.options.sourceMap) {
            // Add mappings (simplified -- real impl tracks positions during generation)
      sourceMap = generateSourceMap(html, "source.tw", "");
    }

    // Calculate metadata
    const renderTime = performance.now() - this.startTime;
    const css = cssResult?.css ?? "";
    const criticalCSS = cssResult?.criticalCSS ?? "";
    const nonCriticalCSS = cssResult?.nonCriticalCSS ?? "";
    const js = jsBundle?.code ?? "";
    const totalSize = html.length + css.length + js.length + vdomCode.length;

    const metadata: CodegenMetadata = {
      mode: ctx.mode,
      renderTime,
      nodeCount: countNodes(program),
      elementCount: countElements(program),
      componentCount: countComponents(program),
      cssSize: css.length,
      jsSize: js.length,
      htmlSize: html.length,
    };

    return {
      html,
      css,
      criticalCSS,
      nonCriticalCSS,
      js,
      jsMetadata: jsBundle?.metadata ?? ({} as any),
      vdomCode,
      staticVDOM,
      templateFn,
      sourceMap,
      chunks,
      cssResult: cssResult ?? ({} as CSSExtractionResult),
      metadata,
      warnings: this.warnings,
      options: this.options,
      totalSize,
    };
  }

  // --- Directive Processing ------------------------------------------

  private processDirectives(program: Program, ctx: CodegenContext): void {
    for (const dir of program.directives) {
      const d = dir as any;

      // Render directive
      if (d.name === "render" || d.type === "RenderDirective") {
        const mode = d.body?.replace(/['"]/g, "") ?? d.mode;
        if (mode === "interactive") {
          ctx.hasVdom = true;
          ctx.hasInteractivity = true;
        }
      }

      // State directive
      if (d.type === "StateDirective" && d.declarations) {
        for (const decl of d.declarations) {
          ctx.stateVars[decl.name] = decl.value;
        }
      }

      // Layout directive
      if (d.name === "layout") {
        // Layout resolution happens in the parser
      }
    }
  }
}

// --- Convenience API --------------------------------------------------

/**
 * Run full codegen pipeline with default options.
 */
export function deepGenerate(program: Program, options?: Partial<CodegenOptions>): DeepCodegenResult {
  const orchestrator = new CodegenOrchestrator(options);
  return orchestrator.generate(program);
}

/**
 * Generate only HTML (fast path for static pages).
 */
export function generateHTMLOnly(program: Program, minify = true): string {
  const orchestrator = new CodegenOrchestrator({
    mode: "ssr",
    minify,
    sourceMap: false,
    extractCSS: false,
    generateJS: false,
    generateVDOM: false,
    generateTemplates: false,
    splitCriticalCSS: false,
    inlineCriticalCSS: false,
    treeShake: false,
    format: "esm",
  });
  return orchestrator.generate(program).html;
}

/**
 * Generate only CSS.
 */
export function generateCSSOnly(program: Program): CSSExtractionResult {
  return extractCSS(program);
}

/**
 * Generate only JS bundle.
 */
export function generateJSOnly(program: Program, minify = true): JSBundle {
  return generateBundle(program, {
    minify,
    sourceMap: false,
    includeRuntime: true,
    treeShake: true,
  });
}

/**
 * Generate streaming HTML chunks.
 */
export function generateStreaming(program: Program, ctx?: CodegenContext): HTMLChunk[] {
  const context = ctx ?? createContext("streaming");
  return streamHTML(program, context);
}

// --- Helpers --------------------------------------------------------

function createContext(mode: string): CodegenContext {
  return {
    mode: mode as any,
    indent: 0,
    inHead: false,
    inBody: false,
    componentStack: [],
    stateVars: {},
    hasVdom: false,
    hasInteractivity: false,
    inlineStyles: [],
    inlineScripts: [],
    hydrationMarkers: [],
    chunks: [],
    currentChunk: "",
  };
}

function countNodes(program: Program): number {
  let count = 0;
  const walk = (node: any) => {
    if (!node) return;
    count++;
    if (node.children) for (const c of node.children) walk(c);
    if (node.body) for (const c of node.body) walk(c);
    if (node.elseBody) for (const c of node.elseBody) walk(c);
  };
  for (const node of program.body) walk(node);
  return count;
}

function countElements(program: Program): number {
  let count = 0;
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === "Element") count++;
    if (node.children) for (const c of node.children) walk(c);
    if (node.body) for (const c of node.body) walk(c);
    if (node.elseBody) for (const c of node.elseBody) walk(c);
  };
  for (const node of program.body) walk(node);
  return count;
}

function countComponents(program: Program): number {
  let count = 0;
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === "Component") count++;
    if (node.children) for (const c of node.children) walk(c);
    if (node.body) for (const c of node.body) walk(c);
    if (node.elseBody) for (const c of node.elseBody) walk(c);
  };
  for (const node of program.body) walk(node);
  return count;
}
