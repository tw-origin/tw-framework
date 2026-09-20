/**
 * DOM Utilities -- classList, style, attribute, and event helpers.
 *
 * High-performance DOM manipulation utilities that avoid forced reflows
 * by batching reads and writes.
 *
 * Features:
 * - Class manipulation (add, remove, toggle, contains, set)
 * - Style manipulation (set, remove, get computed)
 * - Attribute manipulation (set, get, remove, has)
 * - Event helpers (on, off, once, delegate)
 * - Element creation (createElement, createText)
 * - Element queries (find, findAll, closest)
 * - DOM insertion (append, prepend, insertBefore, replace)
 * - CSS class conditionals
 * - Style object to CSS string
 * - Read/write phase separation (avoid layout thrashing)
 */

// --- Class Manipulation -----------------------------------------------

export function addClass(el: HTMLElement, ...classes: string[]): void {
  el.classList.add(...classes);
}

export function removeClass(el: HTMLElement, ...classes: string[]): void {
  el.classList.remove(...classes);
}

export function toggleClass(el: HTMLElement, cls: string, force?: boolean): boolean {
  return el.classList.toggle(cls, force);
}

export function hasClass(el: HTMLElement, cls: string): boolean {
  return el.classList.contains(cls);
}

export function setClasses(el: HTMLElement, classes: string | string[] | Record<string, boolean>): void {
  if (typeof classes === "string") {
    el.className = classes;
  } else if (Array.isArray(classes)) {
    el.className = classes.join(" ");
  } else {
    for (const [cls, active] of Object.entries(classes)) {
      if (active) el.classList.add(cls);
      else el.classList.remove(cls);
    }
  }
}

// --- Style Manipulation ----------------------------------------------

export function setStyle(el: HTMLElement, property: string, value: string): void {
  el.style.setProperty(kebabCase(property), value);
}

export function setStyles(el: HTMLElement, styles: Record<string, string>): void {
  for (const [prop, value] of Object.entries(styles)) {
    el.style.setProperty(kebabCase(prop), value);
  }
}

export function removeStyle(el: HTMLElement, property: string): void {
  el.style.removeProperty(kebabCase(property));
}

export function getStyle(el: HTMLElement, property: string): string {
  return window.getComputedStyle(el).getPropertyValue(kebabCase(property));
}

export function styleToString(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([k, v]) => `${kebabCase(k)}: ${v}`)
    .join("; ");
}

// --- Attribute Manipulation ------------------------------------------

export function setAttr(el: HTMLElement, name: string, value: string | boolean): void {
  if (value === false || value === null || value === undefined) {
    el.removeAttribute(name);
  } else if (value === true) {
    el.setAttribute(name, "");
  } else {
    el.setAttribute(name, String(value));
  }
}

export function getAttr(el: HTMLElement, name: string): string | null {
  return el.getAttribute(name);
}

export function removeAttr(el: HTMLElement, name: string): void {
  el.removeAttribute(name);
}

export function hasAttr(el: HTMLElement, name: string): boolean {
  return el.hasAttribute(name);
}

export function setAttrs(el: HTMLElement, attrs: Record<string, string | boolean>): void {
  for (const [name, value] of Object.entries(attrs)) {
    setAttr(el, name, value);
  }
}

// --- Event Helpers ----------------------------------------------------

export function on(
  el: HTMLElement,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): () => void {
  el.addEventListener(event, handler, options);
  return () => el.removeEventListener(event, handler, options);
}

export function once(el: HTMLElement, event: string, handler: EventListener): () => void {
  const wrapper: EventListener = (e) => {
    handler(e);
    el.removeEventListener(event, wrapper);
  };
  el.addEventListener(event, wrapper);
  return () => el.removeEventListener(event, wrapper);
}

// --- Element Creation ------------------------------------------------

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | boolean>,
  children?: Node[],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) setAttrs(el, attrs);
  if (children) for (const child of children) el.appendChild(child);
  return el;
}

export function createText(text: string): Text {
  return document.createTextNode(text);
}

// --- Element Queries ------------------------------------------------

export function find<T extends HTMLElement = HTMLElement>(parent: HTMLElement | Document, selector: string): T | null {
  return parent.querySelector<T>(selector);
}

export function findAll<T extends HTMLElement = HTMLElement>(parent: HTMLElement | Document, selector: string): T[] {
  return Array.from(parent.querySelectorAll<T>(selector));
}

export function closest<T extends HTMLElement = HTMLElement>(el: HTMLElement, selector: string): T | null {
  return el.closest<T>(selector);
}

// --- DOM Insertion ---------------------------------------------------

export function append(parent: HTMLElement, ...children: Node[]): void {
  parent.append(...children);
}

export function prepend(parent: HTMLElement, ...children: Node[]): void {
  parent.prepend(...children);
}

export function insertBefore(parent: HTMLElement, newChild: Node, refChild: Node | null): void {
  parent.insertBefore(newChild, refChild);
}

export function replaceChild(parent: HTMLElement, newChild: Node, oldChild: Node): void {
  parent.replaceChild(newChild, oldChild);
}

export function remove(el: HTMLElement): void {
  el.remove();
}

// --- Read/Write Phase Separation ------------------------------------

const readQueue: Array<() => void> = [];
const writeQueue: Array<() => void> = [];
let isScheduled = false;

export function readDOM(fn: () => void): void {
  readQueue.push(fn);
  scheduleFlush();
}

export function writeDOM(fn: () => void): void {
  writeQueue.push(fn);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (isScheduled) return;
  isScheduled = true;
  requestAnimationFrame(flushReadWrite);
}

function flushReadWrite(): void {
  isScheduled = false;
  // Phase 1: All reads (avoid interleaving with writes)
  while (readQueue.length > 0) {
    const fn = readQueue.shift()!;
    try { fn(); } catch (e) { console.error("[TW DOM] Read error:", e); }
  }
  // Phase 2: All writes
  while (writeQueue.length > 0) {
    const fn = writeQueue.shift()!;
    try { fn(); } catch (e) { console.error("[TW DOM] Write error:", e); }
  }
}

// --- Utility --------------------------------------------------------

function kebabCase(str: string): string {
  return str.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

export function isElement(obj: unknown): obj is HTMLElement {
  return obj instanceof HTMLElement;
}

export function isInViewport(el: HTMLElement, threshold = 0): boolean {
  const rect = el.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  return (
    rect.top <= windowHeight - threshold &&
    rect.bottom >= threshold &&
    rect.left <= windowWidth - threshold &&
    rect.right >= threshold
  );
}

export function getOffset(el: HTMLElement): { top: number; left: number } {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
  };
}

export function scrollTo(el: HTMLElement | Window, options: ScrollToOptions): void {
  (el as Window).scrollTo?.(options);
}

export function getScrollParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflow = style.overflow + style.overflowY + style.overflowX;
    if (/auto|scroll/.test(overflow)) return parent;
    parent = parent.parentElement;
  }
  return document.documentElement as HTMLElement;
}
