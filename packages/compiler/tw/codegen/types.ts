/** Codegen type definitions. */

export type CodegenMode = "ssr" | "csr" | "streaming" | "static" | "edge";



export interface CodegenContext {
  slotContent?: any;
  mode: CodegenMode;
  indent: number;
  inHead: boolean;
  inBody: boolean;
  componentStack: string[];
  stateVars: Record<string, string>;
  hasVdom: boolean;
  hasInteractivity: boolean;
  /** Live hydration: wrap {expr} interpolations in data-tw-i spans */
  interactive?: boolean;
  inlineStyles: string[];
  inlineScripts: string[];
  hydrationMarkers: HydrationMarker[];
  scopeId?: string;
  /** compiler.scopedStyles -- when false, `.module.tss` classes stay global. */
  scopedStyles?: boolean;
  /** css.prefix -- prefix for generated module class names. Default "tw-". */
  cssPrefix?: string;
  /** css.importPaths -- extra dirs to resolve stylesheet imports from. */
  cssImportPaths?: string[];
  renderMode?: string;
  chunks: string[];
  currentChunk: string;
  /**
   * Local import name -> the specifier it came from, for foreign (.tsx/.jsx)
   * components. Two components can share a default-export name, so the specifier
   * is what tells them apart when looking one up.
   */
  foreignSpecifiers?: Record<string, string>;
}



export interface HydrationMarker {
  id: string;
  path: string;
  type: "element" | "component" | "text";
}



export interface CodegenResult {
  html: string;
  css: string;
  js: string;
  hasVdom: boolean;
  hasInteractivity: boolean;
  /** Parsed `state { }` values for client hydration seeding. */
  stateSeed?: Record<string, any>;
  /** Signal Streaming: name -> public|private of every streamed signal */
  streamedSignals?: Record<string, string>;
  /** derivedSignal(name -> expression) computed specs */
  derivedSpecs?: Record<string, string>;
  warnings: string[];
  chunks: string[];
  hydrationData: string;
  metadata: CodegenMetadata;
}



export interface CodegenMetadata {
  mode: CodegenMode;
  renderTime: number;
  nodeCount: number;
  elementCount: number;
  componentCount: number;
  cssSize: number;
  jsSize: number;
  htmlSize: number;
}

export function createContext(mode: CodegenMode = "ssr"): CodegenContext {
  return {
    mode,
    indent: 0,
    inHead: false,
    inBody: false,
    componentStack: [],
    stateVars: {},
    hasVdom: false,
    hasInteractivity: false,
    interactive: false,
    inlineStyles: [],
    inlineScripts: [],
    hydrationMarkers: [],
    chunks: [],
    currentChunk: "",
  };
}

// --- Main Generate Function --------------------------------------------------



