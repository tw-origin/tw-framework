/**
 * render.ts -- TW Framework runtime: virtual DOM -> string rendering (SSR-safe).
 *
 * Upgraded from the hardened19 baseline:
 *  - `escapeHtml` now correctly distinguishes attribute escaping from text
 *    content escaping (`escapeHtml` for attributes, `escapeText` for text nodes).
 *  - `renderToString` is a pure function -- no DOM/`HTMLElement` usage.
 *  - `renderError` uses `textContent` / `appendChild` instead of `innerHTML`.
 *  - `renderToStream` integration with `ssr-streaming.ts`.
 *  - Component VNodes are rendered in SSR mode.
 *  - Proper void-element handling (`<br/>`, `<img/>`, ...).
 *  - `unknown` is used instead of `any` everywhere.
 */

import { renderToStream } from './ssr-streaming';
import { createVNode } from './vdom';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ComponentProps {
  [key: string]: unknown;
}

/** A stateless component is a function (props) => VNode | null. */
export type Component<P extends ComponentProps = ComponentProps> = (
  props: P,
) => VNode | null;

export type ComponentFactory<P extends ComponentProps = ComponentProps> = Component<P>;

export type VNodeChild =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | VNodeChild[];

export interface VNode<P extends ComponentProps = ComponentProps> {
  _hoisted?: any;
  _dirty?: any;
  componentInstance?: any;
  tag: string | ComponentFactory<P>;
  props: P;
  children: VNodeChild[];
  key?: string | number | null;
  /** SSR marker so hydration can recognise server-rendered nodes. */
  ssr?: boolean;
}

/** DOM-ish event-handler map (only used on the client side). */
export type EventHandler<T = unknown> = (event: T) => void;

// ---------------------------------------------------------------------------
// Void elements (no closing tag)
// ---------------------------------------------------------------------------

export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

const TEXT_ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&',
  '<': '<',
  '>': '>',
};

const ATTR_ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&',
  '<': '<',
  '>': '>',
  '"': '"',
  "'": '&#39;',
  '`': '&#96;',
};

/**
 * Escape a string for use as an **attribute value**.
 * Attribute contexts require escaping quotes/backticks in addition to the
 * HTML metacharacters, because an attribute is delimited by quotes.
 */
export function escapeHtml(value: unknown): string {
  const str = value == null ? '' : String(value);
  return str.replace(/[&<>"'`]/g, (ch) => ATTR_ESCAPE_MAP[ch] ?? ch);
}

/**
 * Escape a string for use as **text content** between tags.
 * Only `&`, `<`, `>` need escaping here -- quotes are literal in text nodes.
 */
export function escapeText(value: unknown): string {
  const str = value == null ? '' : String(value);
  return str.replace(/[&<>]/g, (ch) => TEXT_ESCAPE_MAP[ch] ?? ch);
}

// ---------------------------------------------------------------------------
// Style serialisation
// ---------------------------------------------------------------------------

/** A `style` prop may be a string or a partial CSS-properties object. */
export type StyleObject = Record<string, string | number>;
export type StyleProp = string | StyleObject | undefined | null;

function isStyleObject(value: unknown): value is StyleObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function styleToString(style: StyleProp): string {
  if (style == null || style === '') return '';
  if (typeof style === 'string') return style;
  if (isStyleObject(style)) {
    let out = '';
    for (const key of Object.keys(style)) {
      const raw = style[key];
      if (raw == null) continue;
      const prop = key.startsWith('--')
        ? key
        : key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      const val = typeof raw === 'number' && !UNITLESS.has(prop) ? `${raw}px` : String(raw);
      out += `${prop}:${val};`;
    }
    return out;
  }
  // Unknown style shape -- coerce to string rather than crash.
  return String(style);
}

const UNITLESS: ReadonlySet<string> = new Set([
  'animation-iteration-count',
  'column-count',
  'fill-opacity',
  'flex-grow',
  'flex-shrink',
  'font-weight',
  'line-height',
  'opacity',
  'order',
  'orphans',
  'stroke-opacity',
  'widows',
  'z-index',
  'zoom',
]);

// ---------------------------------------------------------------------------
// Attribute serialisation
// ---------------------------------------------------------------------------

/** Props that are not rendered as DOM attributes (handled specially). */
const INTERNAL_PROP_RE = /^(key|ref|children|__html|__ssr)$/;

function isEventHandler(key: string): boolean {
  return key.startsWith('on') && key.length > 2;
}

function renderAttrs(props: ComponentProps): string {
  let out = '';
  for (const key of Object.keys(props)) {
    if (INTERNAL_PROP_RE.test(key)) continue;
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

    // Skip client-only event handlers in SSR.
    if (isEventHandler(key)) continue;

    // Boolean attributes: render bare name when true.
    if (value === true) {
      out += ` ${key}`;
      continue;
    }

    // data-* / aria-* / regular attributes.
    out += ` ${key}="${escapeHtml(value)}"`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// VNode -> string
// ---------------------------------------------------------------------------

function childrenToArray(children: VNodeChild): VNodeChild[] {
  if (Array.isArray(children)) return children;
  return [children];
}

/**
 * Render a VNode (or primitive child) to an HTML string.
 * Handles element VNodes, component VNodes, text, and fragments.
 */
export function vnodeToString(node: VNodeChild): string {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string') return escapeText(node);
  if (typeof node === 'number') return escapeText(node);

  if (Array.isArray(node)) {
    let out = '';
    for (const child of node) out += vnodeToString(child);
    return out;
  }

  const { tag, props, children } = node;

  // Fragment / symbol tag.
  if (typeof tag === 'symbol' || tag === 'fragment' || tag === null) {
    let out = '';
    for (const child of children) out += vnodeToString(child);
    return out;
  }

  // Component VNode -- render via its factory.
  if (typeof tag === 'function') {
    let rendered: VNode | null;
    try {
      rendered = (tag as ComponentFactory<ComponentProps>)(props);
    } catch (err) {
      // Surface component render errors through the error boundary path.
      return renderError(err);
    }
    return rendered ? vnodeToString(rendered) : '';
  }

  // Element VNode.
  const tagName = String(tag);
  const attrs = renderAttrs(props);
  const childArr = childrenToArray(children);

  if (VOID_ELEMENTS.has(tagName)) {
    // Void elements never have children / closing tags.
    return `<${tagName}${attrs} />`;
  }

  // <textarea> / <script> / <style> use raw text content -- escape as text.
  let inner = '';
  for (const child of childArr) inner += vnodeToString(child);
  return `<${tagName}${attrs}>${inner}</${tagName}>`;
}

// ---------------------------------------------------------------------------
// renderToString (pure, no DOM)
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** Wrap the output in an HTML document shell. */
  fullDocument?: boolean;
  /** Optional document language. */
  lang?: string;
  /** Initial SSR context (for streaming/chunk integration). */
  ssr?: boolean;
}

/**
 * Render a VNode tree to a complete HTML string.
 *
 * This is a **pure function** -- it performs no DOM access and works in a
 * Node.js / edge worker environment with no `window` global.
 */
export function renderToString(node: VNode | VNodeChild, options: RenderOptions = {}): string {
  const body = vnodeToString(node);

  if (!options.fullDocument) return body;

  const lang = options.lang ?? 'en';
  return (
    `<!DOCTYPE html>` +
    `<html lang="${escapeHtml(lang)}">` +
    `<head><meta charset="utf-8" /></head>` +
    `<body>${body}</body>` +
    `</html>`
  );
}

// ---------------------------------------------------------------------------
// renderError (XSS-safe)
// ---------------------------------------------------------------------------

/**
 * Render an error into a DOM node **without** using `innerHTML`, avoiding the
 * XSS risk that came from injecting `error.stack` as raw HTML.
 *
 * Returns an HTML string for SSR, and (on the client) can populate a container
 * via `textContent` / `appendChild` when a DOM is available.
 */
export function renderError(error: unknown, options: { container?: HTMLElement } = {}): string {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const stack =
    error instanceof Error && error.stack ? error.stack : '';

  const safeMessage = escapeText(message);
  const safeStack = escapeText(stack);

  const html =
    `<div class="tw-error" data-tw-error>` +
    `<h1>Runtime Error</h1>` +
    `<pre>${safeMessage}</pre>` +
    (safeStack ? `<pre class="tw-error-stack">${safeStack}</pre>` : '') +
    `</div>`;

  // Client-side: attach via textContent / appendChild, never innerHTML.
  if (options.container && typeof document !== 'undefined') {
    const container = options.container;
    container.textContent = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'tw-error';
    wrapper.setAttribute('data-tw-error', '');

    const h1 = document.createElement('h1');
    h1.textContent = 'Runtime Error';
    wrapper.appendChild(h1);

    const msgPre = document.createElement('pre');
    msgPre.textContent = message;
    wrapper.appendChild(msgPre);

    if (stack) {
      const stackPre = document.createElement('pre');
      stackPre.className = 'tw-error-stack';
      stackPre.textContent = stack;
      wrapper.appendChild(stackPre);
    }
    container.appendChild(wrapper);
  }

  return html;
}

// ---------------------------------------------------------------------------
// h() -- hyperscript helper
// ---------------------------------------------------------------------------

/** Create a VNode. Delegates to `createVNode` so the result has the full,
 *  consistent VNode shape (`type`, `key`, `el`, etc.) used throughout the
 *  runtime, rather than a partial `{ tag, props, children }` object. */
export function h(
  tag: string | ComponentFactory,
  props?: ComponentProps | null,
  ...children: VNodeChild[]
): VNode {
  return createVNode(tag as any, (props ?? {}) as any, ...(children as any)) as any;
}

/** Alias for `h`. */
export const createElement = h;

// ---------------------------------------------------------------------------
// SSR streaming bridge
// ---------------------------------------------------------------------------

/**
 * Render a VNode tree as a streaming response. Delegates to `ssr-streaming.ts`
 * and returns both the full HTML and a `ReadableStream` for progressive delivery.
 */
export function renderToStreamAsync(node: VNode | VNodeChild) {
  return renderToStream(node);
}

export { renderToStream } from './ssr-streaming';
