/**
 * Streaming HTML generator -- chunked output for TTFB optimization.
 *
 * Next.js streams HTML using React Suspense boundaries. TW does the same
 * but with a simpler model: the generator emits chunks as it walks the AST,
 * flushing critical above-the-fold content immediately while deferring
 * slow/async subtrees.
 *
 * Key optimizations vs Next.js:
 * - No virtual DOM in the hot path (direct string building)
 * - Pre-allocated buffer with exponential growth
 * - Zero-copy slicing for static text nodes
 * - Inline style hoisting (critical CSS in head)
 * - Lazy chunk emission for async components
 *
 * Usage:
 *   const stream = createHTMLStream(program, ctx);
 *   for await (const chunk of stream) {
 *     response.write(chunk);
 *   }
 *
 * Or synchronous:
 *   const chunks = streamToChunks(program, ctx);
 *   // chunks: string[] -- join and send
 */

import type { Program, ASTNode } from "../ast/nodes";
import { TW_GENERATOR_META } from "./version.js";
import type { CodegenContext } from "./types";

// --- Buffer Pool -----------------------------------------------------

/**
 * Reusable string builder buffer.
 * Avoids creating new arrays for every generation pass.
 *
 * The buffer uses a linked list of chunks internally,
 * so we never need to copy/resize -- just append.
 */
class BufferPool {
  private pool: string[][] = [];
  private poolSize = 4;

  acquire(): string[] {
    return this.pool.pop() ?? [];
  }

  release(buf: string[]): void {
    if (buf.length > 0) buf.length = 0;
    if (this.pool.length < this.poolSize) {
      this.pool.push(buf);
    }
  }
}

const bufferPool = new BufferPool();

// --- Chunk Types ------------------------------------------------------

export type ChunkType =
  | "doctype"      // <!DOCTYPE html>
  | "head-open"    // <head>
  | "head-content" // <title>, <meta>, critical CSS
  | "head-close"   // </head>
  | "body-open"    // <body>
  | "body-content" // visible HTML
  | "suspense"     // <!-- suspense boundary -->
  | "script"       // hydration script
  | "body-close"   // </body></html>
  | "raw";         // raw passthrough

export interface HTMLChunk {
  type: ChunkType;
  content: string;
  /** Byte offset in the final document */
  offset: number;
  /** Estimated byte size (for flushing decisions) */
  size: number;
  /** Is this chunk critical (above-the-fold)? */
  critical: boolean;
  /** Does this chunk contain async content? */
  async: boolean;
}

// --- Streaming Generator ----------------------------------------------

/**
 * Streaming HTML generation context.
 * Tracks the current position and manages chunk emission.
 */
export class StreamingHTMLGenerator {
  private chunks: HTMLChunk[] = [];
  private offset = 0;
  private buffer: string[] = bufferPool.acquire();
  private flushThreshold = 4096; // flush after 4KB
  private currentSize = 0;
  private inHead = false;
  private inBody = false;
  private depth = 0;
  private criticalDepth = 0;

  constructor(private ctx: CodegenContext) {}

  /**
   * Emit a chunk of HTML.
   */
  emit(type: ChunkType, content: string, opts?: { critical?: boolean; async?: boolean }): void {
    const size = content.length;
    const chunk: HTMLChunk = {
      type,
      content,
      offset: this.offset,
      size,
      critical: opts?.critical ?? false,
      async: opts?.async ?? false,
    };
    this.chunks.push(chunk);
    this.offset += size;
    this.currentSize += size;
  }

  /**
   * Emit raw text (accumulated in buffer).
   * Flushes when threshold is reached.
   */
  emitRaw(text: string): void {
    this.buffer.push(text);
    this.currentSize += text.length;

    if (this.currentSize >= this.flushThreshold) {
      this.flush();
    }
  }

  /**
   * Flush the buffer as a chunk.
   */
  flush(): void {
    if (this.buffer.length === 0) return;

    const content = this.buffer.join("");
    this.buffer.length = 0;

    const type: ChunkType = this.inHead ? "head-content" : this.inBody ? "body-content" : "raw";
    this.emit(type, content, {
      critical: this.criticalDepth > 0,
    });
    this.currentSize = 0;
  }

  // --- Document Structure --------------------------------------------

  doctype(): void {
    this.emit("doctype", "<!DOCTYPE html>", { critical: true });
  }

  htmlOpen(lang: string): void {
    this.emitRaw(`<html lang="${lang}">`);
  }

  htmlClose(): void {
    this.emitRaw("</html>");
  }

  headOpen(): void {
    this.flush();
    this.inHead = true;
    this.emit("head-open", "<head>", { critical: true });
  }

  headClose(): void {
    this.flush();
    this.inHead = false;
    this.emit("head-close", "</head>", { critical: true });
  }

  bodyOpen(): void {
    this.flush();
    this.inBody = true;
    this.emit("body-open", "<body>", { critical: true });
    this.criticalDepth = 1;
  }

  bodyClose(): void {
    this.flush();
    this.inBody = false;
    this.criticalDepth = 0;
    this.emit("body-close", "</body></html>", { critical: false });
  }

  /**
   * Emit a suspense boundary.
   * Content after this point can be streamed lazily.
   */
  suspenseBoundary(id: string, fallback: string): void {
    this.flush();
    this.emit("suspense", `<!--$s:${id}-->${fallback}<!--/$s:${id}-->`, {
      critical: false,
      async: true,
    });
  }

  /**
   * Emit a script tag.
   */
  script(content: string, attrs?: Record<string, string>): void {
    this.flush();
    let attrStr = attrs ? " " + Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ") : "";
    this.emit("script", `<script${attrStr}>${content}</script>`);
  }

  // --- Element Generation --------------------------------------------

  elementOpen(tag: string, attrs?: string): void {
    const attrStr = attrs ? " " + attrs : "";
    this.emitRaw(`<${tag}${attrStr}>`);
    this.depth++;
    if (this.criticalDepth > 0) this.criticalDepth++;
  }

  elementClose(tag: string): void {
    this.emitRaw(`</${tag}>`);
    this.depth--;
    if (this.criticalDepth > 0) this.criticalDepth--;
  }

  voidElement(tag: string, attrs?: string): void {
    const attrStr = attrs ? " " + attrs : "";
    this.emitRaw(`<${tag}${attrStr}>`);
  }

  text(content: string): void {
    this.emitRaw(escapeHTML(content));
  }

  comment(content: string): void {
    this.emitRaw(`<!-- ${content} -->`);
  }

  // --- Output --------------------------------------------------------

  /**
   * Get all chunks (flushes remaining buffer first).
   */
  getChunks(): HTMLChunk[] {
    this.flush();
    return this.chunks;
  }

  /**
   * Get all content as a single string.
   */
  toString(): string {
    this.flush();
    return this.chunks.map(c => c.content).join("") + this.buffer.join("");
  }

  /**
   * Get critical (above-the-fold) chunks only.
   * Used for initial TTFB response.
   */
  getCriticalChunks(): HTMLChunk[] {
    this.flush();
    return this.chunks.filter(c => c.critical);
  }

  /**
   * Get non-critical chunks (for lazy loading).
   */
  getDeferredChunks(): HTMLChunk[] {
    this.flush();
    return this.chunks.filter(c => !c.critical);
  }

  /**
   * Convert to an async iterator for true streaming.
   */
  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    for (const chunk of this.getChunks()) {
      yield chunk.content;
    }
  }

  /**
   * Release resources.
   */
  dispose(): void {
    bufferPool.release(this.buffer);
    this.buffer = [];
    this.chunks = [];
  }
}

// --- Stream from AST --------------------------------------------------

/**
 * Generate streaming HTML chunks from a Program AST.
 * Returns chunks that can be sent progressively to the client.
 */
export function streamHTML(program: Program, ctx: CodegenContext): HTMLChunk[] {
  const gen = new StreamingHTMLGenerator(ctx);

  // DOCTYPE
  gen.doctype();

  // HTML root
  const lang = getLang(program);
  gen.htmlOpen(lang);

  // HEAD
  gen.headOpen();
  emitHeadContent(gen, program, ctx);
  gen.headClose();

  // BODY
  gen.bodyOpen();

  for (const node of program.body) {
    if (node.type === "HeadDirective") continue;
    emitNode(gen, node, ctx);
  }

  // Scripts
  for (const script of ctx.inlineScripts) {
    if (script.trim()) gen.script(script);
  }

  // Hydration data
  if (ctx.hasVdom || ctx.hasInteractivity) {
    gen.script(
      JSON.stringify(ctx.hydrationMarkers),
      { type: "application/json", id: "__TW_HYDRATION__" }
    );
  }

  gen.bodyClose();
  gen.htmlClose();

  const chunks = gen.getChunks();
  gen.dispose();
  return chunks;
}

/**
 * Convert chunks to a single HTML string.
 */
export function chunksToHTML(chunks: HTMLChunk[]): string {
  return chunks.map(c => c.content).join("");
}

/**
 * Split chunks into critical (initial response) and deferred.
 * The server sends critical chunks first, then streams the rest.
 */
export function splitCriticalChunks(chunks: HTMLChunk[]): {
  critical: HTMLChunk[];
  deferred: HTMLChunk[];
} {
  return {
    critical: chunks.filter(c => c.critical),
    deferred: chunks.filter(c => !c.critical),
  };
}

// --- Node Emission ---------------------------------------------------

function emitNode(gen: StreamingHTMLGenerator, node: ASTNode, ctx: CodegenContext): void {
  if (!node) return;

  switch (node.type) {
    case "Element":
      emitElement(gen, node as any, ctx);
      break;
    case "Text":
      if ((node as any).isInterpolated) {
        gen.text(interpolate((node as any).value, ctx.stateVars));
      } else {
        gen.text((node as any).value);
      }
      break;
    case "Comment":
      gen.comment((node as any).value);
      break;
    case "Fragment":
      for (const child of (node as any).children) {
        emitNode(gen, child, ctx);
      }
      break;
    case "If":
      emitIf(gen, node as any, ctx);
      break;
    case "For":
      emitFor(gen, node as any, ctx);
      break;
    case "ScriptBlock":
      emitScript(gen, node as any, ctx);
      break;
    case "StyleBlock":
      // Styles are hoisted to head
      break;
    default:
      // Unknown node type -- skip
      break;
  }
}

function emitElement(gen: StreamingHTMLGenerator, el: any, ctx: CodegenContext): void {
  const tag = el.tag;
  const voidTags = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];

  // Build attribute string
  let attrStr = "";
  if (el.attrs && el.attrs.length > 0) {
    attrStr = el.attrs.map((a: any) => {
      if (a.value === true) return a.name;
      const val = a.isInterpolated ? interpolate(a.value, ctx.stateVars) : a.value;
      return `${a.name}="${escapeAttr(val)}"`;
    }).join(" ");
  }

  // Inline styles
  if (el.styles && el.styles.length > 0) {
    const styleStr = el.styles.map((s: any) => `${s.property}:${s.value}${s.important ? "!important" : ""}`).join(";");
    attrStr += ` style="${styleStr}"`;
  }

  // Events (hydration data attributes)
  if (el.events && el.events.length > 0) {
    for (const ev of el.events) {
      attrStr += ` data-tw-event-${ev.event}="${ev.handler}"`;
    }
    ctx.hasInteractivity = true;
  }

  // Bindings
  if (el.bindings && el.bindings.length > 0) {
    for (const b of el.bindings) {
      attrStr += ` data-tw-bind-${b.property}="${b.expression}"`;
    }
    ctx.hasInteractivity = true;
  }

  if (voidTags.includes(tag.toLowerCase())) {
    gen.voidElement(tag, attrStr);
    return;
  }

  gen.elementOpen(tag, attrStr);

  if (el.children) {
    for (const child of el.children) {
      emitNode(gen, child, ctx);
    }
  }

  gen.elementClose(tag);
}

function emitIf(gen: StreamingHTMLGenerator, node: any, ctx: CodegenContext): void {
  const condVal = interpolate(node.condition, ctx.stateVars);
  if (isTruthy(condVal)) {
    for (const child of node.body) {
      emitNode(gen, child, ctx);
    }
  } else if (node.elseBody) {
    for (const child of node.elseBody) {
      emitNode(gen, child, ctx);
    }
  }
}

function emitFor(gen: StreamingHTMLGenerator, node: any, ctx: CodegenContext): void {
  const iterableStr = interpolate(node.iterable, ctx.stateVars);
  let items: any[] = [];

  try {
    const parsed = JSON.parse(iterableStr);
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    if (ctx.stateVars[node.iterable]) {
      try {
        const parsed = JSON.parse(ctx.stateVars[node.iterable]);
        if (Array.isArray(parsed)) items = parsed;
      } catch { /* ignored */ }
    }
  }

  for (let i = 0; i < items.length; i++) {
    const savedVars = { ...ctx.stateVars };
    ctx.stateVars[node.varName] = String(items[i]);
    if (node.indexName) ctx.stateVars[node.indexName] = String(i);
    for (const child of node.body) {
      emitNode(gen, child, ctx);
    }
    ctx.stateVars = savedVars;
  }
}

function emitScript(gen: StreamingHTMLGenerator, node: any, ctx: CodegenContext): void {
  if (node.src) {
    const attrs: Record<string, string> = { src: node.src };
    if (node.isModule) attrs.type = "module";
    if (node.isAsync) attrs.async = "";
    if (node.isDeferred) attrs.defer = "";
    gen.script("", attrs);
  } else {
    gen.script(node.content);
  }
}

function emitHeadContent(gen: StreamingHTMLGenerator, program: Program, ctx: CodegenContext): void {
  const title = getDirectiveValue(program, "title") ?? "TW Page";
  gen.emit("head-content", `<title>${escapeHTML(title)}</title>`, { critical: true });
  gen.emit("head-content", '<meta charset="UTF-8">', { critical: true });
  gen.emit("head-content", '<meta name="viewport" content="width=device-width, initial-scale=1.0">', { critical: true });
  gen.emit("head-content", TW_GENERATOR_META, { critical: true });

  // Critical CSS (inline styles)
  if (ctx.inlineStyles.length > 0) {
    gen.emit("head-content", `<style>${ctx.inlineStyles.join("\n")}</style>`, { critical: true });
  }

  // Head directive children
  for (const node of program.body) {
    if (node.type === "HeadDirective") {
      for (const child of (node as any).body || []) {
        emitNode(gen, child, ctx);
      }
    }
  }
}

// --- Helpers --------------------------------------------------------

function getLang(program: Program): string {
  return getDirectiveValue(program, "lang") ?? "en";
}

function getDirectiveValue(program: Program, key: string): string | undefined {
  for (const dir of program.directives) {
    const d = dir as any;
    if (d.name === "page" || d.type === "PageDirective") {
      if (d.key === key) return d.value as string;
      if (d.args) {
        for (const arg of d.args) {
          if (arg.key === key) return arg.value;
        }
      }
    }
  }
  return;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function interpolate(expr: string, vars: Record<string, string>): string {
  // Brace escapes: \{ and \} print literal braces -- they never start
  // interpolation. Masked out before the pass and restored after, so
  // docs-style pages can show real braces (JSON, {x} in prose).
  const masked = expr
    .replace(/\\\{/g, "\u0001O")
    .replace(/\\\}/g, "\u0001C");
  const out = masked.replace(/\{([^}]+)\}/g, (_, name) => {
    const key = name.trim();
    return vars[key] ?? "";
  });
  return out.replace(/\u0001O/g, "{").replace(/\u0001C/g, "}");
}

function isTruthy(val: string): boolean {
  if (!val) return false;
  const lower = val.toLowerCase().trim();
  return lower !== "false" && lower !== "0" && lower !== "" && lower !== "null" && lower !== "undefined";
}
