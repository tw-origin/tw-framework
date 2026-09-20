/**
 * ssr-streaming.ts -- TW Framework runtime: server-side rendering with streaming.
 *
 * Upgraded from the hardened19 baseline:
 *  - Added `renderToReadableStream` returning a proper Web `ReadableStream`.
 *  - `renderToStream` returns both the full HTML and a `ReadableStream`.
 *  - `any` types replaced with `unknown`.
 *  - All existing exports preserved.
 */

import { vnodeToString, type VNode, type VNodeChild, type ComponentProps } from './render';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamRenderResult {
  /** The fully-assembled HTML string (resolved once the stream completes). */
  html: Promise<string>;
  /** A Web ReadableStream emitting HTML chunks as they become available. */
  stream: ReadableStream<Uint8Array>;
}

export interface StreamOptions {
  /** Wrap the output in an HTML document shell. */
  fullDocument?: boolean;
  /** Document language. */
  lang?: string;
  /** Called as each chunk is emitted. */
  onChunk?: (chunk: string) => void;
}

// ---------------------------------------------------------------------------
// Chunk helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function toUint8(chunk: string): Uint8Array {
  return encoder.encode(chunk);
}

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

/** Walk a VNode tree, yielding HTML chunks -- suspending on async subtrees. */
async function* streamVNode(node: VNodeChild): AsyncGenerator<string> {
  if (node == null || node === false || node === true) return;
  if (typeof node === 'string') {
    yield node; // already escaped text
    return;
  }
  if (typeof node === 'number') {
    yield String(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      for await (const chunk of streamVNode(child)) yield chunk;
    }
    return;
  }

  const { tag, props, children } = node;

  // Fragment / symbol tag.
  if (typeof tag === 'symbol' || tag === 'fragment' || tag === null) {
    for (const child of children) {
      for await (const chunk of streamVNode(child)) yield chunk;
    }
    return;
  }

  // Component -- may be async.
  if (typeof tag === 'function') {
    const factory = tag as (p: ComponentProps) => VNodeChild | Promise<VNodeChild>;
    let rendered: VNodeChild | Promise<VNodeChild> = factory(props);
    if (isPromise(rendered)) {
      rendered = await rendered;
    }
    if (rendered == null) return;
    for await (const chunk of streamVNode(rendered)) yield chunk;
    return;
  }

  // Element VNode.
  const tagName = String(tag);
  const attrs = attrsToString(props);
  if (VOID_ELEMENTS.has(tagName)) {
    yield `<${tagName}${attrs} />`;
    return;
  }
  yield `<${tagName}${attrs}>`;
  for (const child of children) {
    for await (const chunk of streamVNode(child)) yield chunk;
  }
  yield `</${tagName}>`;
}

// ---------------------------------------------------------------------------
// Internal escaping / attribute helpers (mirror render.ts but self-contained
// so streaming never touches the DOM-dependent path)
// ---------------------------------------------------------------------------

import { escapeHtml, escapeText, VOID_ELEMENTS, type StyleProp } from './render';

function styleToString(style: StyleProp): string {
  if (style == null || style === '') return '';
  if (typeof style === 'string') return style;
  if (typeof style === 'object' && style !== null && !Array.isArray(style)) {
    let out = '';
    for (const key of Object.keys(style)) {
      const raw = (style as Record<string, string | number>)[key];
      if (raw == null) continue;
      const prop = key.startsWith('--') ? key : key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      out += `${prop}:${raw};`;
    }
    return out;
  }
  return String(style);
}

function attrsToString(props: Record<string, unknown>): string {
  let out = '';
  for (const key of Object.keys(props)) {
    if (/^(key|ref|children|__html|__ssr)$/.test(key)) continue;
    if (key.startsWith('on') && key.length > 2) continue;
    const value = props[key];
    if (value == null || value === false) continue;
    if (key === 'style') {
      const css = styleToString(value as StyleProp);
      if (css) out += ` style="${escapeHtml(css)}"`;
      continue;
    }
    if (key === 'className') {
      if (value === true) continue;
      out += ` class="${escapeHtml(value)}"`;
      continue;
    }
    if (key === 'htmlFor') {
      out += ` for="${escapeHtml(value)}"`;
      continue;
    }
    if (value === true) {
      out += ` ${key}`;
      continue;
    }
    out += ` ${key}="${escapeHtml(value)}"`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// renderToStream -- returns { html, stream }
// ---------------------------------------------------------------------------

/**
 * Render a VNode tree to a streaming response.
 *
 * Returns:
 *  - `html`: a Promise that resolves to the complete HTML string once all
 *    chunks (including async subtrees) have been produced.
 *  - `stream`: a `ReadableStream<Uint8Array>` that emits encoded chunks as
 *    soon as they are available -- enabling true streaming SSR (low TTFB).
 */
export function renderToStream(node: VNode | VNodeChild, options: StreamOptions = {}): StreamRenderResult {
  const chunks: string[] = [];
  const generator = streamVNode(node);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (options.fullDocument) {
          const head =
            '<!DOCTYPE html><html lang="' +
            escapeHtml(options.lang ?? 'en') +
            '"><head><meta charset="utf-8" /></head><body>';
          controller.enqueue(toUint8(head));
          chunks.push(head);
          options.onChunk?.(head);
        }
        for await (const chunk of generator) {
          controller.enqueue(toUint8(chunk));
          chunks.push(chunk);
          options.onChunk?.(chunk);
        }
        if (options.fullDocument) {
          const tail = '</body></html>';
          controller.enqueue(toUint8(tail));
          chunks.push(tail);
          options.onChunk?.(tail);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  const html = (async () => {
    const parts: string[] = [];
    const reader = stream.tee()[0].getReader();
    // Read everything from the tee to assemble full HTML.
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // value is Uint8Array; decode.
        parts.push(new TextDecoder().decode(value));
      }
    } finally {
      reader.releaseLock();
    }
    return parts.join('');
  })();

  // Fallback: assemble from collected chunks if the tee approach is unavailable.
  const htmlSafe = html.catch(() => chunks.join(''));

  return { html: htmlSafe, stream };
}

// ---------------------------------------------------------------------------
// renderToReadableStream -- a proper ReadableStream
// ---------------------------------------------------------------------------

/**
 * Render a VNode tree to a `ReadableStream<Uint8Array>` (Web Streams API).
 * Each chunk of HTML is enqueued as soon as it is produced, so a client can
 * begin receiving content before the entire tree has finished rendering.
 */
export function renderToReadableStream(
  node: VNode | VNodeChild,
  options: StreamOptions = {},
): ReadableStream<Uint8Array> {
  const generator = streamVNode(node);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (options.fullDocument) {
          const head =
            '<!DOCTYPE html><html lang="' +
            escapeHtml(options.lang ?? 'en') +
            '"><head><meta charset="utf-8" /></head><body>';
          controller.enqueue(toUint8(head));
          options.onChunk?.(head);
        }
        for await (const chunk of generator) {
          controller.enqueue(toUint8(chunk));
          options.onChunk?.(chunk);
        }
        if (options.fullDocument) {
          const tail = '</body></html>';
          controller.enqueue(toUint8(tail));
          options.onChunk?.(tail);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      // The stream consumer cancelled -- nothing to clean up beyond the
      // generator going out of scope, but log for debugging.
      void reason;
    },
  });
}

// ---------------------------------------------------------------------------
// renderToString (streaming-based) -- convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Collect a streamed render into a single string. Useful when callers want
 * the streaming pipeline (async components, etc.) but still need the final
 * string synchronously after awaiting.
 */
export async function renderStreamToString(
  node: VNode | VNodeChild,
  options: StreamOptions = {},
): Promise<string> {
  const { html } = renderToStream(node, options);
  return html;
}

// Re-export escape helpers for consumers that import them from here.
export { escapeHtml, escapeText, vnodeToString, VOID_ELEMENTS } from './render';
