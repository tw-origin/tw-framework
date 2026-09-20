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
  renderMode?: string;
  chunks: string[];
  currentChunk: string;
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



