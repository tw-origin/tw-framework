/**
 * DOM manipulation utilities -- query, create, modify, observe elements.
 * @module runtime/dom
 */

export type Selector = string | Element | Document | Window;
export type EventHandler = (event: Event) => void | boolean | Promise<void | boolean>;

export function $(selector: string, parent: ParentNode = document): Element | null {
  return parent.querySelector(selector);
}

export function $$(selector: string, parent: ParentNode = document): Element[] {
  return [...parent.querySelectorAll(selector)];
}

export function $id(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function $class(className: string, parent: ParentNode = document): HTMLElement[] {
  return [...(parent as any).getElementsByClassName(className)] as HTMLElement[];
}

export function $tag(tagName: string, parent: ParentNode = document): HTMLElement[] {
  return [...(parent as any).getElementsByTagName(tagName)] as HTMLElement[];
}

export function $name(name: string, parent: ParentNode = document): HTMLElement[] {
  return [...(parent as any).getElementsByName(name)] as HTMLElement[];
}

export function $data(key: string, value?: string): HTMLElement[] {
  return $$(`[data-${key}]`).filter((el) => value === undefined || el.getAttribute(`data-${key}`) === value) as HTMLElement[];
}

export function create<K extends keyof HTMLElementTagNameMap>(tag: K, attributes?: Record<string, string>, children?: (Node | string)[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "class" || key === "className") {
        element.className = value;
      } else if (key === "style") {
        element.setAttribute("style", value);
      } else if (key.startsWith("data-")) {
        element.setAttribute(key, value);
      } else if (key === "textContent") {
        element.textContent = value;
      } else if (key === "innerHTML") {
        element.innerHTML = value;
      } else {
        element.setAttribute(key, value);
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === "string") {
        element.appendChild(document.createTextNode(child));
      } else {
        element.appendChild(child);
      }
    }
  }
  return element;
}

export function createFragment(children: (Node | string)[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const child of children) {
    if (typeof child === "string") {
      fragment.appendChild(document.createTextNode(child));
    } else {
      fragment.appendChild(child);
    }
  }
  return fragment;
}

export function createText(text: string): Text {
  return document.createTextNode(text);
}

export function createComment(text: string): Comment {
  return document.createComment(text);
}

export function append(parent: Node, ...children: (Node | string)[]): void {
  for (const child of children) {
    parent.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

export function prepend(parent: Node, ...children: (Node | string)[]): void {
  const firstChild = parent.firstChild;
  for (const child of children) {
    const node = typeof child === "string" ? document.createTextNode(child) : child;
    if (firstChild) {
      parent.insertBefore(node, firstChild);
    } else {
      parent.appendChild(node);
    }
  }
}

export function insertBefore(parent: Node, newChild: Node, referenceChild: Node | null): void {
  parent.insertBefore(newChild, referenceChild);
}

export function insertAfter(parent: Node, newChild: Node, referenceChild: Node | null): void {
  if (referenceChild && referenceChild.nextSibling) {
    parent.insertBefore(newChild, referenceChild.nextSibling);
  } else {
    parent.appendChild(newChild);
  }
}

export function remove(element: Node): void {
  if (element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

export function removeAll(elements: Node[]): void {
  elements.forEach(remove);
}

export function replace(oldElement: Node, newElement: Node): void {
  if (oldElement.parentNode) {
    oldElement.parentNode.replaceChild(newElement, oldElement);
  }
}

export function clone<T extends Node>(element: T, deep: boolean = true): T {
  return element.cloneNode(deep) as T;
}

export function wrap(element: Node, wrapper: Node): void {
  if (element.parentNode) {
    element.parentNode.insertBefore(wrapper, element);
    wrapper.appendChild(element);
  }
}

export function unwrap(element: Node): void {
  const parent = element.parentNode;
  if (parent && parent.parentNode) {
    parent.parentNode.insertBefore(element, parent);
    parent.parentNode.removeChild(parent);
  }
}

export function empty(element: Node): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export function hasClass(element: Element, className: string): boolean {
  return element.classList.contains(className);
}

export function addClass(element: Element, ...classNames: string[]): void {
  element.classList.add(...classNames);
}

export function removeClass(element: Element, ...classNames: string[]): void {
  element.classList.remove(...classNames);
}

export function toggleClass(element: Element, className: string, force?: boolean): boolean {
  return element.classList.toggle(className, force);
}

export function replaceClass(element: Element, oldClass: string, newClass: string): void {
  element.classList.replace(oldClass, newClass);
}

export function getClasses(element: Element): string[] {
  return [...element.classList];
}

export function setClasses(element: Element, classes: string[]): void {
  element.className = classes.join(" ");
}

export function getAttribute(element: Element, name: string): string | null {
  return element.getAttribute(name);
}

export function setAttribute(element: Element, name: string, value: string): void {
  element.setAttribute(name, value);
}

export function removeAttribute(element: Element, name: string): void {
  element.removeAttribute(name);
}

export function hasAttribute(element: Element, name: string): boolean {
  return element.hasAttribute(name);
}

export function getAttributes(element: Element): Record<string, string> {
  const result: Record<string, string> = {};
  for (const attr of element.attributes) {
    result[attr.name] = attr.value;
  }
  return result;
}

export function setAttributes(element: Element, attributes: Record<string, string>): void {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}

export function getData(element: Element, key: string): string | null {
  return element.getAttribute(`data-${key}`);
}

export function setData(element: Element, key: string, value: string): void {
  element.setAttribute(`data-${key}`, value);
}

export function removeData(element: Element, key: string): void {
  element.removeAttribute(`data-${key}`);
}

export function getAllData(element: Element): Record<string, string> {
  const result: Record<string, string> = {};
  for (const attr of element.attributes) {
    if (attr.name.startsWith("data-")) {
      result[attr.name.slice(5)] = attr.value;
    }
  }
  return result;
}

export function getStyle(element: HTMLElement, property: string): string {
  return getComputedStyle(element).getPropertyValue(property);
}

export function setStyle(element: HTMLElement, property: string, value: string): void {
  element.style.setProperty(property, value);
}

export function setStyles(element: HTMLElement, styles: Record<string, string>): void {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(property, value);
  }
}

export function getStyles(element: HTMLElement, properties: string[]): Record<string, string> {
  const computed = getComputedStyle(element);
  const result: Record<string, string> = {};
  for (const prop of properties) {
    result[prop] = computed.getPropertyValue(prop);
  }
  return result;
}

export function removeStyle(element: HTMLElement, property: string): void {
  element.style.removeProperty(property);
}

export function getComputedStyleValue(element: Element, property: string): string {
  return window.getComputedStyle(element).getPropertyValue(property);
}

export function getWidth(element: HTMLElement): number {
  return element.offsetWidth;
}

export function getHeight(element: HTMLElement): number {
  return element.offsetHeight;
}

export function getInnerWidth(element: HTMLElement): number {
  return element.clientWidth;
}

export function getInnerHeight(element: HTMLElement): number {
  return element.clientHeight;
}

export function getOuterWidth(element: HTMLElement): number {
  return element.offsetWidth;
}

export function getOuterHeight(element: HTMLElement): number {
  return element.offsetHeight;
}

export function getScrollWidth(element: HTMLElement): number {
  return element.scrollWidth;
}

export function getScrollHeight(element: HTMLElement): number {
  return element.scrollHeight;
}

export function getScrollTop(element: HTMLElement): number {
  return element.scrollTop;
}

export function getScrollLeft(element: HTMLElement): number {
  return element.scrollLeft;
}

export function setScrollTop(element: HTMLElement, value: number): void {
  element.scrollTop = value;
}

export function setScrollLeft(element: HTMLElement, value: number): void {
  element.scrollLeft = value;
}

export function scrollToTop(element: HTMLElement, smooth: boolean = false): void {
  element.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
}

export function scrollToBottom(element: HTMLElement, smooth: boolean = false): void {
  element.scrollTo({ top: element.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

export function scrollTo(element: HTMLElement, x: number, y: number, smooth: boolean = false): void {
  element.scrollTo({ left: x, top: y, behavior: smooth ? "smooth" : "auto" });
}

export function scrollIntoView(element: HTMLElement, options?: ScrollIntoViewOptions): void {
  element.scrollIntoView(options ?? { behavior: "smooth", block: "start" });
}

export function getOffset(element: HTMLElement): { top: number; left: number } {
  let top = 0;
  let left = 0;
  let current: HTMLElement | null = element;
  while (current) {
    top += current.offsetTop;
    left += current.offsetLeft;
    current = current.offsetParent as HTMLElement | null;
  }
  return { top, left };
}

export function getPosition(element: HTMLElement): { top: number; left: number } {
  return { top: element.offsetTop, left: element.offsetLeft };
}

export function getBounds(element: HTMLElement): DOMRect {
  return element.getBoundingClientRect();
}

export function getOffsetRect(element: HTMLElement): { top: number; left: number; width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.pageYOffset,
    left: rect.left + window.pageXOffset,
    width: rect.width,
    height: rect.height,
  };
}

export function isVisible(element: HTMLElement): boolean {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

export function isHidden(element: HTMLElement): boolean {
  return !isVisible(element);
}

export function isInViewport(element: HTMLElement, threshold: number = 0): boolean {
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  return (
    rect.top >= -threshold &&
    rect.left >= -threshold &&
    rect.bottom <= windowHeight + threshold &&
    rect.right <= windowWidth + threshold
  );
}

export function isFullyInViewport(element: HTMLElement): boolean {
  return isInViewport(element, 0);
}

export function isPartiallyInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  return rect.top < windowHeight && rect.bottom > 0 && rect.left < windowWidth && rect.right > 0;
}

export function hide(element: HTMLElement): void {
  setStyle(element, "display", "none");
}

export function show(element: HTMLElement, display: string = "block"): void {
  setStyle(element, "display", display);
}

export function toggle(element: HTMLElement): void {
  if (isVisible(element)) {
    hide(element);
  } else {
    show(element);
  }
}

export function fadeOut(element: HTMLElement, duration: number = 300): Promise<void> {
  return new Promise((resolve) => {
    element.style.transition = `opacity ${duration}ms`;
    element.style.opacity = "0";
    setTimeout(() => {
      hide(element);
      element.style.opacity = "";
      element.style.transition = "";
      resolve();
    }, duration);
  });
}

export function fadeIn(element: HTMLElement, duration: number = 300, display: string = "block"): Promise<void> {
  return new Promise((resolve) => {
    show(element, display);
    element.style.transition = `opacity ${duration}ms`;
    element.style.opacity = "0";
    requestAnimationFrame(() => {
      element.style.opacity = "1";
      setTimeout(() => {
        element.style.opacity = "";
        element.style.transition = "";
        resolve();
      }, duration);
    });
  });
}

export function slideUp(element: HTMLElement, duration: number = 300): Promise<void> {
  return new Promise((resolve) => {
    element.style.height = element.offsetHeight + "px";
    element.style.overflow = "hidden";
    element.style.transition = `height ${duration}ms`;
    requestAnimationFrame(() => {
      element.style.height = "0";
      setTimeout(() => {
        hide(element);
        element.style.height = "";
        element.style.overflow = "";
        element.style.transition = "";
        resolve();
      }, duration);
    });
  });
}

export function slideDown(element: HTMLElement, duration: number = 300): Promise<void> {
  return new Promise((resolve) => {
    show(element);
    const targetHeight = element.offsetHeight;
    element.style.height = "0";
    element.style.overflow = "hidden";
    element.style.transition = `height ${duration}ms`;
    requestAnimationFrame(() => {
      element.style.height = targetHeight + "px";
      setTimeout(() => {
        element.style.height = "";
        element.style.overflow = "";
        element.style.transition = "";
        resolve();
      }, duration);
    });
  });
}

export function on(element: Element | Window | Document, event: string, handler: EventHandler, options?: AddEventListenerOptions): () => void {
  const wrappedHandler = (e: Event) => handler(e);
  element.addEventListener(event, wrappedHandler, options);
  return () => element.removeEventListener(event, wrappedHandler, options);
}

export function off(element: Element | Window | Document, event: string, handler: EventHandler, options?: EventListenerOptions): void {
  element.removeEventListener(event, handler as EventListener, options);
}

export function once(element: Element | Window | Document, event: string, handler: EventHandler, options?: AddEventListenerOptions): void {
  const wrappedHandler = (e: Event) => {
    handler(e);
    element.removeEventListener(event, wrappedHandler, options);
  };
  element.addEventListener(event, wrappedHandler, options);
}

export function trigger(element: Element, event: string, detail?: unknown): boolean {
  const customEvent = new CustomEvent(event, { detail, bubbles: true, cancelable: true });
  return element.dispatchEvent(customEvent);
}

export function delegate(parent: Element, selector: string, event: string, handler: (event: Event, target: Element) => void): () => void {
  const wrappedHandler = (event: Event) => {
    const target = (event.target as Element).closest(selector);
    if (target && parent.contains(target)) {
      handler(event, target);
    }
  };
  parent.addEventListener(event, wrappedHandler);
  return () => parent.removeEventListener(event, wrappedHandler);
}

export function ready(callback: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}

export function waitForElement(selector: string, timeout: number = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    const observer = new MutationObserver((_mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element "${selector}" not found within ${timeout}ms`));
    }, timeout);
  });
}

export function waitForSelector(selector: string, parent: Element = document.body, timeout: number = 5000): Promise<Element> {
  return waitForElement(selector, timeout);
}

export function waitFor(selector: string, timeout: number = 5000): Promise<Element> {
  return waitForElement(selector, timeout);
}

export function whenReady(selector: string, callback: (element: Element) => void, timeout?: number): void {
  waitForElement(selector, timeout).then(callback).catch(() => {});
}

export function onReady(callback: () => void): void {
  ready(callback);
}

export function observeMutations(target: Node, options: MutationObserverInit, callback: (mutations: MutationRecord[]) => void): MutationObserver {
  const observer = new MutationObserver((mutations) => callback(mutations));
  observer.observe(target, options);
  return observer;
}

export function observeAttributes(target: Element, callback: (mutations: MutationRecord[]) => void): MutationObserver {
  return observeMutations(target, { attributes: true }, callback);
}

export function observeChildren(target: Node, callback: (mutations: MutationRecord[]) => void): MutationObserver {
  return observeMutations(target, { childList: true }, callback);
}

export function observeSubtree(target: Node, callback: (mutations: MutationRecord[]) => void): MutationObserver {
  return observeMutations(target, { childList: true, subtree: true }, callback);
}

export function observeText(target: Node, callback: (mutations: MutationRecord[]) => void): MutationObserver {
  return observeMutations(target, { characterData: true, subtree: true }, callback);
}

export function observeAll(target: Node, callback: (mutations: MutationRecord[]) => void): MutationObserver {
  return observeMutations(target, { attributes: true, childList: true, subtree: true, characterData: true }, callback);
}

export function observeResize(target: Element, callback: (entries: ResizeObserverEntry[]) => void): ResizeObserver {
  const observer = new ResizeObserver((entries) => callback(entries));
  observer.observe(target);
  return observer;
}

export function observeIntersection(target: Element, callback: (entries: IntersectionObserverEntry[]) => void, options?: IntersectionObserverInit): IntersectionObserver {
  const observer = new IntersectionObserver((entries) => callback(entries), options);
  observer.observe(target);
  return observer;
}

export function observeVisibility(target: Element, callback: (isVisible: boolean) => void): IntersectionObserver {
  return observeIntersection(target, (entries) => {
    callback(entries[0]?.isIntersecting ?? false);
  });
}

export function whenVisible(target: Element, callback: () => void, threshold: number = 0.1): IntersectionObserver {
  return observeIntersection(
    target,
    (entries) => {
      if (entries[0]?.isIntersecting) {
        callback();
      }
    },
    { threshold },
  );
}

export function whenHidden(target: Element, callback: () => void, threshold: number = 0): IntersectionObserver {
  return observeIntersection(
    target,
    (entries) => {
      if (!entries[0]?.isIntersecting) {
        callback();
      }
    },
    { threshold },
  );
}

export function animate(element: HTMLElement, keyframes: Keyframe[] | PropertyIndexedKeyframes, options?: KeyframeAnimationOptions): Animation {
  return element.animate(keyframes, options);
}

export function animateFadeIn(element: HTMLElement, duration: number = 300): Animation {
  return animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration, fill: "forwards" });
}

export function animateFadeOut(element: HTMLElement, duration: number = 300): Animation {
  return animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration, fill: "forwards" });
}

export function animateSlideIn(element: HTMLElement, direction: "left" | "right" | "up" | "down" = "up", duration: number = 300): Animation {
  const transforms: Record<string, string> = {
    left: "translateX(-100%)",
    right: "translateX(100%)",
    up: "translateY(100%)",
    down: "translateY(-100%)",
  };
  return animate(element, [{ transform: transforms[direction] }, { transform: "translate(0, 0)" }], { duration, fill: "forwards" });
}

export function animateSlideOut(element: HTMLElement, direction: "left" | "right" | "up" | "down" = "up", duration: number = 300): Animation {
  const transforms: Record<string, string> = {
    left: "translateX(-100%)",
    right: "translateX(100%)",
    up: "translateY(-100%)",
    down: "translateY(100%)",
  };
  return animate(element, [{ transform: "translate(0, 0)" }, { transform: transforms[direction] }], { duration, fill: "forwards" });
}

export function animateScaleIn(element: HTMLElement, duration: number = 300): Animation {
  return animate(element, [{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration, fill: "forwards" });
}

export function animateScaleOut(element: HTMLElement, duration: number = 300): Animation {
  return animate(element, [{ transform: "scale(1)" }, { transform: "scale(0)" }], { duration, fill: "forwards" });
}

export function animateRotate(element: HTMLElement, degrees: number = 360, duration: number = 1000): Animation {
  return animate(element, [{ transform: "rotate(0deg)" }, { transform: `rotate(${degrees}deg)` }], { duration, fill: "forwards" });
}

export function animateBounce(element: HTMLElement, duration: number = 500): Animation {
  return animate(element, [
    { transform: "translateY(0)" },
    { transform: "translateY(-20px)" },
    { transform: "translateY(0)" },
  ], { duration, iterations: Infinity });
}

export function animatePulse(element: HTMLElement, duration: number = 1000): Animation {
  return animate(element, [
    { opacity: 1 },
    { opacity: 0.5 },
    { opacity: 1 },
  ], { duration, iterations: Infinity });
}

export function animateShake(element: HTMLElement, duration: number = 500): Animation {
  return animate(element, [
    { transform: "translateX(0)" },
    { transform: "translateX(-10px)" },
    { transform: "translateX(10px)" },
    { transform: "translateX(-10px)" },
    { transform: "translateX(10px)" },
    { transform: "translateX(0)" },
  ], { duration });
}

export function animateSwing(element: HTMLElement, duration: number = 500): Animation {
  return animate(element, [
    { transform: "rotate(0deg)" },
    { transform: "rotate(15deg)" },
    { transform: "rotate(-10deg)" },
    { transform: "rotate(5deg)" },
    { transform: "rotate(-5deg)" },
    { transform: "rotate(0deg)" },
  ], { duration });
}

export function animateTada(element: HTMLElement, duration: number = 1000): Animation {
  return animate(element, [
    { transform: "scale(1)" },
    { transform: "scale(1.1) rotate(-3deg)" },
    { transform: "scale(1.1) rotate(3deg)" },
    { transform: "scale(1.1) rotate(-3deg)" },
    { transform: "scale(1.1) rotate(3deg)" },
    { transform: "scale(1.1) rotate(-3deg)" },
    { transform: "scale(1.1) rotate(3deg)" },
    { transform: "scale(1) rotate(0)" },
  ], { duration });
}

export function animateFlip(element: HTMLElement, duration: number = 500): Animation {
  return animate(element, [
    { transform: "perspective(400px) rotateY(0)" },
    { transform: "perspective(400px) rotateY(180deg)" },
  ], { duration, fill: "forwards" });
}

export function getInnerHTML(element: HTMLElement): string {
  return element.innerHTML;
}

export function setInnerHTML(element: HTMLElement, html: string): void {
  element.innerHTML = html;
}

export function getOuterHTML(element: HTMLElement): string {
  return element.outerHTML;
}

export function getTextContent(element: HTMLElement): string {
  return element.textContent ?? "";
}

export function setTextContent(element: HTMLElement, text: string): void {
  element.textContent = text;
}

export function getInnerText(element: HTMLElement): string {
  return element.innerText;
}

export function setInnerText(element: HTMLElement, text: string): void {
  element.innerText = text;
}

export function getValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  return element.value;
}

export function setValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  element.value = value;
}

export function getChecked(element: HTMLInputElement): boolean {
  return element.checked;
}

export function setChecked(element: HTMLInputElement, checked: boolean): void {
  element.checked = checked;
}

export function getDisabled(element: HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
  return element.disabled;
}

export function setDisabled(element: HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement, disabled: boolean): void {
  element.disabled = disabled;
}

export function getReadOnly(element: HTMLInputElement | HTMLTextAreaElement): boolean {
  return element.readOnly;
}

export function setReadOnly(element: HTMLInputElement | HTMLTextAreaElement, readOnly: boolean): void {
  element.readOnly = readOnly;
}

export function getPlaceholder(element: HTMLInputElement | HTMLTextAreaElement): string {
  return element.placeholder;
}

export function setPlaceholder(element: HTMLInputElement | HTMLTextAreaElement, placeholder: string): void {
  element.placeholder = placeholder;
}

export function focus(element: HTMLElement): void {
  element.focus();
}

export function blur(element: HTMLElement): void {
  element.blur();
}

export function select(element: HTMLInputElement | HTMLTextAreaElement): void {
  element.select();
}

export function click(element: HTMLElement): void {
  element.click();
}

export function submit(form: HTMLFormElement): void {
  form.submit();
}

export function reset(form: HTMLFormElement): void {
  form.reset();
}

export function preventDefault(event: Event): void {
  event.preventDefault();
}

export function stopPropagation(event: Event): void {
  event.stopPropagation();
}

export function stopImmediatePropagation(event: Event): void {
  event.stopImmediatePropagation();
}

export function getParent(element: Node): Node | null {
  return element.parentNode;
}

export function getChildren(element: Node): Node[] {
  return [...element.childNodes];
}

export function getChildElements(element: Element): Element[] {
  return [...element.children];
}

export function getSiblings(element: Node): Node[] {
  const parent = element.parentNode;
  if (!parent) return [];
  return [...parent.childNodes].filter((child) => child !== element);
}

export function getSiblingElements(element: Element): Element[] {
  const parent = element.parentElement;
  if (!parent) return [];
  return [...parent.children].filter((child) => child !== element);
}

export function getNextSibling(element: Node): Node | null {
  return element.nextSibling;
}

export function getPreviousSibling(element: Node): Node | null {
  return element.previousSibling;
}

export function getNextElementSibling(element: Element): Element | null {
  return element.nextElementSibling;
}

export function getPreviousElementSibling(element: Element): Element | null {
  return element.previousElementSibling;
}

export function getFirstChild(element: Node): Node | null {
  return element.firstChild;
}

export function getLastChild(element: Node): Node | null {
  return element.lastChild;
}

export function getFirstElementChild(element: Element): Element | null {
  return element.firstElementChild;
}

export function getLastElementChild(element: Element): Element | null {
  return element.lastElementChild;
}

export function getParentElement(element: Element): Element | null {
  return element.parentElement;
}

export function getClosest(element: Element, selector: string): Element | null {
  return element.closest(selector);
}

export function matches(element: Element, selector: string): boolean {
  return element.matches(selector);
}

export function contains(parent: Node, child: Node): boolean {
  return parent.contains(child);
}

export function isDescendant(parent: Node, child: Node): boolean {
  return parent !== child && parent.contains(child);
}

export function isAncestor(parent: Node, child: Node): boolean {
  return contains(parent, child);
}

export function isSibling(a: Node, b: Node): boolean {
  return a.parentNode === b.parentNode && a !== b;
}

export function getDepth(element: Node): number {
  let depth = 0;
  let current = element.parentNode;
  while (current) {
    depth++;
    current = current.parentNode;
  }
  return depth;
}

export function getCommonAncestor(a: Node, b: Node): Node | null {
  const ancestorsA: Node[] = [];
  let current: Node | null = a;
  while (current) {
    ancestorsA.push(current);
    current = current.parentNode;
  }
  const setA = new Set(ancestorsA);
  current = b;
  while (current) {
    if (setA.has(current)) return current;
    current = current.parentNode;
  }
  return null;
}

export function getPath(element: Element): Element[] {
  const path: Element[] = [element];
  let current = element.parentElement;
  while (current) {
    path.unshift(current);
    current = current.parentElement;
  }
  return path;
}

export function getSelectorPath(element: Element): string {
  const path = getPath(element);
  return path.map((el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = el.className ? `.${el.className.split(/\s+/).join(".")}` : "";
    return tag + id + classes;
  }).join(" > ");
}

export function getIndex(element: Element): number {
  const parent = element.parentElement;
  if (!parent) return -1;
  return [...parent.children].indexOf(element);
}

export function getChildIndex(element: Node): number {
  const parent = element.parentNode;
  if (!parent) return -1;
  return [...parent.childNodes].indexOf(element as ChildNode);
}

export function getTypeIndex(element: Element, selector: string): number {
  const parent = element.parentElement;
  if (!parent) return -1;
  return [...parent.querySelectorAll(selector)].indexOf(element);
}

export function getNthChild(parent: Element, n: number): Element | null {
  return parent.children[n] ?? null;
}

export function getNthOfType(parent: Element, n: number, selector: string): Element | null {
  return parent.querySelector(`:nth-of-type(${n})`) ?? null;
}

export function getFirstChildElement(parent: Element): Element | null {
  return parent.firstElementChild;
}

export function getLastChildElement(parent: Element): Element | null {
  return parent.lastElementChild;
}

export function hasChildren(element: Element): boolean {
  return element.children.length > 0;
}

export function hasChildNodes(element: Node): boolean {
  return element.hasChildNodes();
}

export function childElementCount(element: Element): number {
  return element.childElementCount;
}

export function childNodeCount(element: Node): number {
  return element.childNodes.length;
}

export function getElementsByTagName(parent: Element, tagName: string): Element[] {
  return [...parent.getElementsByTagName(tagName)];
}

export function getElementsByClassName(parent: Element, className: string): Element[] {
  return [...parent.getElementsByClassName(className)];
}

export function querySelector(parent: Element, selector: string): Element | null {
  return parent.querySelector(selector);
}

export function querySelectorAll(parent: Element, selector: string): Element[] {
  return [...parent.querySelectorAll(selector)];
}

export function getElementById(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function getElementByText(text: string, selector: string = "*"): Element | null {
  const elements = document.querySelectorAll(selector);
  for (const element of elements) {
    if (element.textContent?.includes(text)) {
      return element;
    }
  }
  return null;
}

export function getElementsByText(text: string, selector: string = "*"): Element[] {
  const elements = document.querySelectorAll(selector);
  return [...elements].filter((element) => element.textContent?.includes(text));
}

export function getElementByAttribute(name: string, value?: string): Element | null {
  if (value !== undefined) {
    return document.querySelector(`[${name}="${value}"]`);
  }
  return document.querySelector(`[${name}]`);
}

export function getElementsByAttribute(name: string, value?: string): Element[] {
  if (value !== undefined) {
    return [...document.querySelectorAll(`[${name}="${value}"]`)];
  }
  return [...document.querySelectorAll(`[${name}]`)];
}

export function createElementFromHTML(html: string): Element {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild!;
}

export function createElementsFromHTML(html: string): Element[] {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return [...template.content.children];
}

export function insertHTML(element: Element, position: InsertPosition, html: string): void {
  element.insertAdjacentHTML(position, html);
}

export function insertBeforeHTML(element: Element, html: string): void {
  insertHTML(element, "beforebegin", html);
}

export function insertAfterHTML(element: Element, html: string): void {
  insertHTML(element, "afterend", html);
}

export function insertHTMLBegin(element: Element, html: string): void {
  insertHTML(element, "afterbegin", html);
}

export function insertHTMLEnd(element: Element, html: string): void {
  insertHTML(element, "beforeend", html);
}

export function replaceHTML(element: Element, html: string): void {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const newElement = template.content.firstElementChild!;
  replace(element, newElement);
}

export function wrapHTML(element: Element, wrapperHTML: string): void {
  const wrapper = createElementFromHTML(wrapperHTML);
  wrap(element, wrapper);
}

export function unwrapHTML(element: Element): void {
  unwrap(element);
}

export function getFormValues(form: HTMLFormElement): Record<string, string | string[] | boolean> {
  const formData = new FormData(form);
  const result: Record<string, string | string[] | boolean> = {};
  formData.forEach((value, key) => {
    if (key in result) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(String(value));
      } else {
        result[key] = [String(existing), String(value)];
      }
    } else {
      result[key] = String(value);
    }
  });
  return result;
}

export function setFormValues(form: HTMLFormElement, values: Record<string, string | string[] | boolean>): void {
  for (const [name, value] of Object.entries(values)) {
    const input = form.elements.namedItem(name);
    if (input) {
      if (input instanceof HTMLInputElement) {
        if (input.type === "checkbox") {
          input.checked = Boolean(value);
        } else if (input.type === "radio") {
          if (input.value === String(value)) {
            input.checked = true;
          }
        } else {
          input.value = String(value);
        }
      } else if (input instanceof HTMLTextAreaElement) {
        input.value = String(value);
      } else if (input instanceof HTMLSelectElement) {
        input.value = String(value);
      }
    }
  }
}

export function clearForm(form: HTMLFormElement): void {
  form.reset();
}

export function serializeForm(form: HTMLFormElement): string {
  return new URLSearchParams(new FormData(form) as unknown as Record<string, string>).toString();
}

export function deserializeForm(form: HTMLFormElement, query: string): void {
  const params = new URLSearchParams(query);
  const values: Record<string, string> = {};
  params.forEach((value, key) => {
    values[key] = value;
  });
  setFormValues(form, values);
}

export function getFormData(form: HTMLFormElement): FormData {
  return new FormData(form);
}

export function getFormJSON(form: HTMLFormElement): Record<string, unknown> {
  const formData = getFormData(form);
  const result: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export function setFormJSON(form: HTMLFormElement, data: Record<string, unknown>): void {
  const values: Record<string, string | string[] | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      values[key] = value;
    } else if (typeof value === "boolean") {
      values[key] = value;
    } else if (typeof value === "number") {
      values[key] = String(value);
    } else if (Array.isArray(value)) {
      values[key] = value.map(String);
    }
  }
  setFormValues(form, values);
}

export function validateForm(form: HTMLFormElement): { valid: boolean; errors: Array<{ field: string; message: string }> } {
  const errors: Array<{ field: string; message: string }> = [];
  for (const element of form.elements) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      const validity = element.validity;
      if (!validity.valid) {
        let message = element.validationMessage;
        if (!message) {
          if (validity.valueMissing) message = "This field is required";
          else if (validity.typeMismatch) message = "Invalid format";
          else if (validity.tooShort) message = "Too short";
          else if (validity.tooLong) message = "Too long";
          else if (validity.rangeUnderflow) message = "Value too low";
          else if (validity.rangeOverflow) message = "Value too high";
          else if (validity.stepMismatch) message = "Invalid step";
          else if (validity.patternMismatch) message = "Invalid format";
          else message = "Invalid value";
        }
        errors.push({ field: element.name, message });
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function isFormValid(form: HTMLFormElement): boolean {
  return form.checkValidity();
}

export function reportFormValidity(form: HTMLFormElement): boolean {
  return form.reportValidity();
}

export function setCustomValidity(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, message: string): void {
  element.setCustomValidity(message);
}

export function checkValidity(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  return element.checkValidity();
}

export function reportValidity(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  return element.reportValidity();
}

export function getSelectedOptions(select: HTMLSelectElement): HTMLOptionElement[] {
  return [...select.selectedOptions];
}

export function getSelectedValues(select: HTMLSelectElement): string[] {
  return getSelectedOptions(select).map((option) => option.value);
}

export function setSelectedValues(select: HTMLSelectElement, values: string[]): void {
  for (const option of select.options) {
    option.selected = values.includes(option.value);
  }
}

export function addOption(select: HTMLSelectElement, value: string, text: string, selected: boolean = false): HTMLOptionElement {
  const option = new Option(text, value, false, selected);
  select.add(option);
  return option;
}

export function removeOption(select: HTMLSelectElement, index: number): void {
  select.remove(index);
}

export function clearOptions(select: HTMLSelectElement): void {
  select.innerHTML = "";
}

export function getOptionCount(select: HTMLSelectElement): number {
  return select.options.length;
}

export function getOptionByValue(select: HTMLSelectElement, value: string): HTMLOptionElement | null {
  for (const option of select.options) {
    if (option.value === value) return option;
  }
  return null;
}

export function getOptionByText(select: HTMLSelectElement, text: string): HTMLOptionElement | null {
  for (const option of select.options) {
    if (option.text === text) return option;
  }
  return null;
}

export function hasOption(select: HTMLSelectElement, value: string): boolean {
  return getOptionByValue(select, value) !== null;
}

export function getScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const { overflow, overflowY, overflowX } = getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(overflow + overflowY + overflowX)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.documentElement;
}

export function scrollToElement(element: HTMLElement, offset: number = 0, smooth: boolean = true): void {
  const rect = element.getBoundingClientRect();
  const scrollTop = rect.top + window.pageYOffset - offset;
  window.scrollTo({ top: scrollTop, behavior: smooth ? "smooth" : "auto" });
}

export function getScrollPosition(): { x: number; y: number } {
  return { x: window.pageXOffset, y: window.pageYOffset };
}

export function setScrollPosition(x: number, y: number): void {
  window.scrollTo(x, y);
}

export function getViewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight,
  };
}

export function getDocumentSize(): { width: number; height: number } {
  return {
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  };
}

export function isScrollable(element: HTMLElement): boolean {
  return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth;
}

export function isScrolledToTop(element: HTMLElement): boolean {
  return element.scrollTop === 0;
}

export function isScrolledToBottom(element: HTMLElement): boolean {
  return element.scrollTop + element.clientHeight >= element.scrollHeight;
}

export function isScrolledToLeft(element: HTMLElement): boolean {
  return element.scrollLeft === 0;
}

export function isScrolledToRight(element: HTMLElement): boolean {
  return element.scrollLeft + element.clientWidth >= element.scrollWidth;
}

export function getScrollPercentage(element: HTMLElement): number {
  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll === 0) return 0;
  return (element.scrollTop / maxScroll) * 100;
}

export function setScrollPercentage(element: HTMLElement, percentage: number): void {
  const maxScroll = element.scrollHeight - element.clientHeight;
  element.scrollTop = (percentage / 100) * maxScroll;
}

export function smoothScrollTo(element: HTMLElement, target: number, duration: number = 300): Promise<void> {
  return new Promise((resolve) => {
    const start = element.scrollTop;
    const change = target - start;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress * (2 - progress);
      element.scrollTop = start + change * eased;
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(animate);
  });
}

export function lockScroll(element: HTMLElement = document.body): () => void {
  const originalOverflow = element.style.overflow;
  element.style.overflow = "hidden";
  return () => {
    element.style.overflow = originalOverflow;
  };
}

export function unlockScroll(element: HTMLElement = document.body): void {
  element.style.overflow = "";
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      resolve();
    } catch (error) {
      reject(error);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}

export async function readFromClipboard(): Promise<string> {
  if (navigator.clipboard) {
    return navigator.clipboard.readText();
  }
  return "";
}

export function downloadFile(content: string | Blob, filename: string, mimeType: string = "text/plain"): void {
  const blob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, filename: string): void {
  downloadFile(text, filename, "text/plain");
}

export function downloadJSON(data: unknown, filename: string): void {
  downloadFile(JSON.stringify(data, null, 2), filename, "application/json");
}

export function downloadCSV(csv: string, filename: string): void {
  downloadFile(csv, filename, "text/csv");
}

export function downloadHTML(html: string, filename: string): void {
  downloadFile(html, filename, "text/html");
}

export function downloadXML(xml: string, filename: string): void {
  downloadFile(xml, filename, "application/xml");
}

export function downloadBlob(blob: Blob, filename: string): void {
  downloadFile(blob, filename);
}

export function downloadDataURL(dataURL: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataURL;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function getURL(): string {
  return window.location.href;
}

export function setURL(url: string, replace: boolean = false): void {
  if (replace) {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
  }
}

export function getURLParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function getURLParam(name: string): string | null {
  return getURLParams().get(name);
}

export function setURLParam(name: string, value: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);
  setURL(url.toString(), true);
}

export function removeURLParam(name: string): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  setURL(url.toString(), true);
}

export function getHash(): string {
  return window.location.hash.slice(1);
}

export function setHash(hash: string): void {
  window.location.hash = hash;
}

export function removeHash(): void {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

export function getOrigin(): string {
  return window.location.origin;
}

export function getHostname(): string {
  return window.location.hostname;
}

export function getPathname(): string {
  return window.location.pathname;
}

export function getPort(): string {
  return window.location.port;
}

export function getProtocol(): string {
  return window.location.protocol;
}

export function getSearch(): string {
  return window.location.search;
}

export function isSecureContext(): boolean {
  return window.isSecureContext;
}

export function isHTTPS(): boolean {
  return getProtocol() === "https:";
}

export function isHTTP(): boolean {
  return getProtocol() === "http:";
}

export function isLocalhost(): boolean {
  return getHostname() === "localhost" || getHostname() === "127.0.0.1" || getHostname() === "::1";
}

export function redirect(url: string): void {
  window.location.href = url;
}

export function redirectTo(path: string): void {
  redirect(path);
}

export function reload(force: boolean = false): void {
  window.location.reload();
}

export function openInNewTab(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openInPopup(url: string, width: number = 600, height: number = 400): Window | null {
  let left = (window.innerWidth - width) / 2;
  let top = (window.innerHeight - height) / 2;
  return window.open(url, "_blank", `width=${width},height=${height},left=${left},top=${top},noopener,noreferrer`);
}

export function print(): void {
  window.print();
}

export function alert(message: string): void {
  window.alert(message);
}

export function confirm(message: string): boolean {
  return window.confirm(message);
}

export function prompt(message: string, defaultValue: string = ""): string | null {
  return window.prompt(message, defaultValue);
}

export function getMeta(name: string): string | null {
  const meta = document.querySelector(`meta[name="${name}"]`);
  return meta?.getAttribute("content") ?? null;
}

export function setMeta(name: string, content: string): void {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

export function getMetaProperty(property: string): string | null {
  const meta = document.querySelector(`meta[property="${property}"]`);
  return meta?.getAttribute("content") ?? null;
}

export function setMetaProperty(property: string, content: string): void {
  let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

export function getTitle(): string {
  return document.title;
}

export function setTitle(title: string): void {
  document.title = title;
}

export function getFavicon(): string | null {
  const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  return link?.href ?? null;
}

export function setFavicon(href: string): void {
  let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function addStyleSheet(href: string, media?: string): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  if (media) link.media = media;
  document.head.appendChild(link);
  return link;
}

export function removeStyleSheet(href: string): void {
  const link = document.querySelector(`link[href="${href}"]`);
  if (link) link.remove();
}

export function addStyle(css: string, id?: string): HTMLStyleElement {
  const style = document.createElement("style");
  if (id) style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}


export function addScript(src: string, options?: { async?: boolean; defer?: boolean; type?: string }): HTMLScriptElement {
  const script = document.createElement("script");
  script.src = src;
  if (options?.async) script.async = true;
  if (options?.defer) script.defer = true;
  if (options?.type) script.type = options.type;
  document.head.appendChild(script);
  return script;
}

export function removeScript(src: string): void {
  const script = document.querySelector(`script[src="${src}"]`);
  if (script) script.remove();
}

export function addInlineScript(code: string, id?: string): HTMLScriptElement {
  const script = document.createElement("script");
  if (id) script.id = id;
  script.textContent = code;
  document.head.appendChild(script);
  return script;
}

export function removeInlineScript(id: string): void {
  const script = document.getElementById(id);
  if (script) script.remove();
}

export function injectScript(code: string): void {
  addInlineScript(code);
}

export function injectStyle(css: string): void {
  addStyle(css);
}

export function getHead(): HTMLHeadElement {
  return document.head;
}

export function getBody(): HTMLBodyElement {
  return document.body as HTMLBodyElement;
}

export function getDocumentElement(): HTMLElement {
  return document.documentElement;
}

export function getHeadChildren(): Element[] {
  return [...document.head.children];
}

export function getBodyChildren(): Element[] {
  return [...document.body.children];
}

export function getScripts(): HTMLScriptElement[] {
  return [...document.scripts];
}

export function getStylesheets(): HTMLLinkElement[] {
  return [...document.querySelectorAll('link[rel="stylesheet"]')] as HTMLLinkElement[];
}

export function getImages(): HTMLImageElement[] {
  return [...document.images];
}

export function getLinks(): HTMLAnchorElement[] {
  return [...document.links] as HTMLAnchorElement[];
}

export function getForms(): HTMLFormElement[] {
  return [...document.forms];
}

export function getAnchors(): HTMLAnchorElement[] {
  return [...document.anchors] as HTMLAnchorElement[];
}

export function getEmbeds(): HTMLEmbedElement[] {
  return [...document.embeds] as HTMLEmbedElement[];
}

export function getPlugins(): HTMLEmbedElement[] {
  return getEmbeds();
}

export function getIFrames(): HTMLIFrameElement[] {
  return [...document.querySelectorAll("iframe")] as HTMLIFrameElement[];
}

export function getVideos(): HTMLVideoElement[] {
  return [...document.querySelectorAll("video")] as HTMLVideoElement[];
}

export function getAudios(): HTMLAudioElement[] {
  return [...document.querySelectorAll("audio")] as HTMLAudioElement[];
}

export function getCanvases(): HTMLCanvasElement[] {
  return [...document.querySelectorAll("canvas")] as HTMLCanvasElement[];
}

export function getSVGs(): SVGSVGElement[] {
  return [...document.querySelectorAll("svg")] as SVGSVGElement[];
}

export function getInputs(): HTMLInputElement[] {
  return [...document.querySelectorAll("input")] as HTMLInputElement[];
}

export function getTextareas(): HTMLTextAreaElement[] {
  return [...document.querySelectorAll("textarea")] as HTMLTextAreaElement[];
}

export function getSelects(): HTMLSelectElement[] {
  return [...document.querySelectorAll("select")] as HTMLSelectElement[];
}

export function getButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")] as HTMLButtonElement[];
}

export function getLabels(): HTMLLabelElement[] {
  return [...document.querySelectorAll("label")] as HTMLLabelElement[];
}

export function getTables(): HTMLTableElement[] {
  return [...document.querySelectorAll("table")] as HTMLTableElement[];
}

export function getLists(): HTMLElement[] {
  return [...document.querySelectorAll("ul, ol")] as HTMLElement[];
}

export function getHeadings(): HTMLElement[] {
  return [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")] as HTMLElement[];
}

export function getParagraphs(): HTMLParagraphElement[] {
  return [...document.querySelectorAll("p")] as HTMLParagraphElement[];
}

export function getDivs(): HTMLDivElement[] {
  return [...document.querySelectorAll("div")] as HTMLDivElement[];
}

export function getSpans(): HTMLSpanElement[] {
  return [...document.querySelectorAll("span")] as HTMLSpanElement[];
}

export function getAnchorsByHref(href: string): HTMLAnchorElement[] {
  return [...document.querySelectorAll(`a[href="${href}"]`)] as HTMLAnchorElement[];
}

export function getImagesBySrc(src: string): HTMLImageElement[] {
  return [...document.querySelectorAll(`img[src="${src}"]`)] as HTMLImageElement[];
}

export function getScriptsBySrc(src: string): HTMLScriptElement[] {
  return [...document.querySelectorAll(`script[src="${src}"]`)] as HTMLScriptElement[];
}

export function getLinksByHref(href: string): HTMLLinkElement[] {
  return [...document.querySelectorAll(`link[href="${href}"]`)] as HTMLLinkElement[];
}

export function getElementsByTag(tagName: string): HTMLElement[] {
  return [...document.getElementsByTagName(tagName)] as HTMLElement[];
}

export function getElementsByClass(className: string): HTMLElement[] {
  return [...document.getElementsByClassName(className)] as HTMLElement[];
}

export function getElementsByName(name: string): HTMLElement[] {
  return [...document.getElementsByName(name)] as HTMLElement[];
}

export function getElementsWithAttribute(name: string): HTMLElement[] {
  return [...document.querySelectorAll(`[${name}]`)] as HTMLElement[];
}

export function getElementsWithAttributeValue(name: string, value: string): HTMLElement[] {
  return [...document.querySelectorAll(`[${name}="${value}"]`)] as HTMLElement[];
}

export function getElementsWithDataKey(key: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-${key}]`)] as HTMLElement[];
}

export function getElementsWithDataValue(key: string, value: string): HTMLElement[] {
  return [...document.querySelectorAll(`[data-${key}="${value}"]`)] as HTMLElement[];
}

export function countElements(selector: string): number {
  return document.querySelectorAll(selector).length;
}

export function countByTag(tagName: string): number {
  return document.getElementsByTagName(tagName).length;
}

export function countByClass(className: string): number {
  return document.getElementsByClassName(className).length;
}

export function countByName(name: string): number {
  return document.getElementsByName(name).length;
}

export function countByAttribute(name: string): number {
  return document.querySelectorAll(`[${name}]`).length;
}

export function countByDataKey(key: string): number {
  return document.querySelectorAll(`[data-${key}]`).length;
}

export function exists(selector: string): boolean {
  return document.querySelector(selector) !== null;
}

export function existsById(id: string): boolean {
  return document.getElementById(id) !== null;
}

export function existsByClass(className: string): boolean {
  return document.getElementsByClassName(className).length > 0;
}

export function existsByTag(tagName: string): boolean {
  return document.getElementsByTagName(tagName).length > 0;
}

export function existsByName(name: string): boolean {
  return document.getElementsByName(name).length > 0;
}

export function existsByAttribute(name: string, value?: string): boolean {
  if (value !== undefined) {
    return document.querySelector(`[${name}="${value}"]`) !== null;
  }
  return document.querySelector(`[${name}]`) !== null;
}

export function existsByDataKey(key: string, value?: string): boolean {
  if (value !== undefined) {
    return document.querySelector(`[data-${key}="${value}"]`) !== null;
  }
  return document.querySelector(`[data-${key}]`) !== null;
}

export function getElementAtPoint(x: number, y: number): Element | null {
  return document.elementFromPoint(x, y);
}

export function getElementsAtPoint(x: number, y: number): Element[] {
  return [...document.elementsFromPoint(x, y)];
}

export function elementFromPoint(x: number, y: number): Element | null {
  return getElementAtPoint(x, y);
}

export function elementsFromPoint(x: number, y: number): Element[] {
  return getElementsAtPoint(x, y);
}

export function getCaretPosition(element: HTMLInputElement | HTMLTextAreaElement): number {
  return element.selectionStart ?? 0;
}

export function setCaretPosition(element: HTMLInputElement | HTMLTextAreaElement, position: number): void {
  element.setSelectionRange(position, position);
}

export function getSelection(element: HTMLInputElement | HTMLTextAreaElement): { start: number; end: number } {
  return {
    start: element.selectionStart ?? 0,
    end: element.selectionEnd ?? 0,
  };
}

export function setSelection(element: HTMLInputElement | HTMLTextAreaElement, start: number, end: number): void {
  element.setSelectionRange(start, end);
}

export function selectAll(element: HTMLInputElement | HTMLTextAreaElement): void {
  element.select();
}

export function getSelectedText(): string {
  return window.getSelection()?.toString() ?? "";
}

export function clearSelection(): void {
  window.getSelection()?.removeAllRanges();
}

export function selectElement(element: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function deselectElement(): void {
  clearSelection();
}

export function copySelectedText(): Promise<void> {
  return copyToClipboard(getSelectedText());
}

export function getSelectionRange(): Range | null {
  return window.getSelection()?.getRangeAt(0) ?? null;
}

export function setSelectionRange(range: Range): void {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function createRange(): Range {
  return document.createRange();
}

export function createTreeWalker(root: Node, filter?: NodeFilter): TreeWalker {
  return document.createTreeWalker(root, NodeFilter.SHOW_ALL, filter);
}

export function createNodeIterator(root: Node, filter?: NodeFilter): NodeIterator {
  return document.createNodeIterator(root, NodeFilter.SHOW_ALL, filter);
}

export function evaluateXPath(xpath: string, context: Node = document, resultType?: number): XPathResult {
  return document.evaluate(xpath, context, null, resultType ?? XPathResult.ANY_TYPE, null);
}

export function getElementByXPath(xpath: string): Node | null {
  const result = evaluateXPath(xpath, document, XPathResult.FIRST_ORDERED_NODE_TYPE);
  return result.singleNodeValue;
}

export function getElementsByXPath(xpath: string): Node[] {
  const result = evaluateXPath(xpath, document, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
  const nodes: Node[] = [];
  for (let i = 0; i < result.snapshotLength; i++) {
    const node = result.snapshotItem(i);
    if (node) nodes.push(node);
  }
  return nodes;
}

export function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

export function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

export function isCommentNode(node: Node): node is Comment {
  return node.nodeType === Node.COMMENT_NODE;
}

export function isDocumentNode(node: Node): node is Document {
  return node.nodeType === Node.DOCUMENT_NODE;
}

export function isFragmentNode(node: Node): node is DocumentFragment {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
}

export function isInputElement(element: Element): element is HTMLInputElement {
  return element.tagName === "INPUT";
}

export function isTextAreaElement(element: Element): element is HTMLTextAreaElement {
  return element.tagName === "TEXTAREA";
}

export function isSelectElement(element: Element): element is HTMLSelectElement {
  return element.tagName === "SELECT";
}

export function isButtonElement(element: Element): element is HTMLButtonElement {
  return element.tagName === "BUTTON";
}

export function isFormElement(element: Element): element is HTMLFormElement {
  return element.tagName === "FORM";
}

export function isAnchorElement(element: Element): element is HTMLAnchorElement {
  return element.tagName === "A";
}

export function isImageElement(element: Element): element is HTMLImageElement {
  return element.tagName === "IMG";
}

export function isVideoElement(element: Element): element is HTMLVideoElement {
  return element.tagName === "VIDEO";
}

export function isAudioElement(element: Element): element is HTMLAudioElement {
  return element.tagName === "AUDIO";
}

export function isCanvasElement(element: Element): element is HTMLCanvasElement {
  return element.tagName === "CANVAS";
}

export function isSVGElement(element: Element): element is SVGSVGElement {
  return element.tagName === "svg";
}

export function isScriptElement(element: Element): element is HTMLScriptElement {
  return element.tagName === "SCRIPT";
}

export function isStyleElement(element: Element): element is HTMLStyleElement {
  return element.tagName === "STYLE";
}

export function isLinkElement(element: Element): element is HTMLLinkElement {
  return element.tagName === "LINK";
}

export function isMetaElement(element: Element): element is HTMLMetaElement {
  return element.tagName === "META";
}

export function isTableElement(element: Element): element is HTMLTableElement {
  return element.tagName === "TABLE";
}

export function isLabelElement(element: Element): element is HTMLLabelElement {
  return element.tagName === "LABEL";
}

export function isDivElement(element: Element): element is HTMLDivElement {
  return element.tagName === "DIV";
}

export function isSpanElement(element: Element): element is HTMLSpanElement {
  return element.tagName === "SPAN";
}

export function isParagraphElement(element: Element): element is HTMLParagraphElement {
  return element.tagName === "P";
}

export function isHeadingElement(element: Element): element is HTMLHeadingElement {
  return /^H[1-6]$/.test(element.tagName);
}

export function isListElement(element: Element): element is HTMLUListElement | HTMLOListElement {
  return element.tagName === "UL" || element.tagName === "OL";
}

export function isListItemElement(element: Element): element is HTMLLIElement {
  return element.tagName === "LI";
}

export function isIFrameElement(element: Element): element is HTMLIFrameElement {
  return element.tagName === "IFRAME";
}

export function isEmbedElement(element: Element): element is HTMLEmbedElement {
  return element.tagName === "EMBED";
}

export function isObjectElement(element: Element): element is HTMLObjectElement {
  return element.tagName === "OBJECT";
}

export function isHTMLElement(element: Element): element is HTMLElement {
  return element instanceof HTMLElement;
}

export function isFocusable(element: Element): boolean {
  if (element.hasAttribute("tabindex")) return true;
  const focusableTags = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "AREA"];
  if (!focusableTags.includes(element.tagName)) return false;
  if (element.hasAttribute("disabled")) return false;
  if (element.tagName === "A" && !element.hasAttribute("href")) return false;
  if (element.hasAttribute("tabindex") && element.getAttribute("tabindex") === "-1") return false;
  return isVisible(element as HTMLElement);
}

export function isTabbable(element: Element): boolean {
  if (!isFocusable(element)) return false;
  const tabindex = element.getAttribute("tabindex");
  if (tabindex === "-1") return false;
  return true;
}

export function getFocusableElements(root: Element = document.body): HTMLElement[] {
  const selector = 'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
  return [...root.querySelectorAll(selector)].filter((el) => isFocusable(el)) as HTMLElement[];
}

export function getTabbableElements(root: Element = document.body): HTMLElement[] {
  return getFocusableElements(root).filter((el) => isTabbable(el));
}

export function getFocusableElement(root: Element = document.body, direction: "next" | "prev" = "next", current?: Element): HTMLElement | null {
  const elements = getFocusableElements(root);
  if (current) {
    const index = elements.indexOf(current as HTMLElement);
    if (direction === "next") {
      return elements[(index + 1) % elements.length] ?? null;
    } else {
      return elements[(index - 1 + elements.length) % elements.length] ?? null;
    }
  }
  return direction === "next" ? elements[0] ?? null : elements[elements.length - 1] ?? null;
}

export function getNextFocusable(root: Element = document.body, current?: Element): HTMLElement | null {
  return getFocusableElement(root, "next", current);
}

export function getPreviousFocusable(root: Element = document.body, current?: Element): HTMLElement | null {
  return getFocusableElement(root, "prev", current);
}

export function getFirstFocusable(root: Element = document.body): HTMLElement | null {
  return getFocusableElements(root)[0] ?? null;
}

export function getLastFocusable(root: Element = document.body): HTMLElement | null {
  const elements = getFocusableElements(root);
  return elements[elements.length - 1] ?? null;
}

export function focusFirst(root: Element = document.body): void {
  const first = getFirstFocusable(root);
  if (first) first.focus();
}

export function focusLast(root: Element = document.body): void {
  const last = getLastFocusable(root);
  if (last) last.focus();
}

export function focusNext(root: Element = document.body, current?: Element): void {
  const next = getNextFocusable(root, current);
  if (next) next.focus();
}

export function focusPrevious(root: Element = document.body, current?: Element): void {
  const prev = getPreviousFocusable(root, current);
  if (prev) prev.focus();
}

export function getActiveElement(): Element | null {
  return document.activeElement;
}

export function isActiveElement(element: Element): boolean {
  return document.activeElement === element;
}

export function hasFocus(element: Element): boolean {
  return isActiveElement(element);
}

export function requestFocus(element: HTMLElement): void {
  element.focus();
}

export function blurActiveElement(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

export function getTabIndex(element: Element): number {
  return (element as any).tabIndex;
}

export function setTabIndex(element: HTMLElement, index: number): void {
  element.tabIndex = index;
}

export function makeFocusable(element: HTMLElement): void {
  if (!isFocusable(element)) {
    element.setAttribute("tabindex", "0");
  }
}

export function makeUnfocusable(element: HTMLElement): void {
  element.setAttribute("tabindex", "-1");
}

export function makeTabbable(element: HTMLElement): void {
  element.setAttribute("tabindex", "0");
}

export function makeUntabbable(element: HTMLElement): void {
  element.setAttribute("tabindex", "-1");
}

export function isContentEditable(element: HTMLElement): boolean {
  return element.isContentEditable;
}

export function makeEditable(element: HTMLElement): void {
  element.contentEditable = "true";
}

export function makeNonEditable(element: HTMLElement): void {
  element.contentEditable = "false";
}

export function getShadowRoot(element: Element): ShadowRoot | null {
  return element.shadowRoot;
}

export function attachShadow(element: HTMLElement, mode: "open" | "closed" = "open"): ShadowRoot {
  return element.attachShadow({ mode });
}

export function hasShadowRoot(element: Element): boolean {
  return element.shadowRoot !== null;
}

export function getShadowHost(shadowRoot: ShadowRoot): Element | null {
  return shadowRoot.host;
}

export function queryShadow(shadowRoot: ShadowRoot, selector: string): Element | null {
  return shadowRoot.querySelector(selector);
}

export function queryShadowAll(shadowRoot: ShadowRoot, selector: string): Element[] {
  return [...shadowRoot.querySelectorAll(selector)];
}

export function deepQuery(selector: string, root: Node = document): Element | null {
  const element = (root as any).querySelector(selector);
  if (element) return element;
  const shadowHosts = (root as Element).querySelectorAll("*");
  for (const host of shadowHosts) {
    if (host.shadowRoot) {
      const found = deepQuery(selector, host.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}

export function deepQueryAll(selector: string, root: Node = document): Element[] {
  const elements = [...(root as any).querySelectorAll(selector)];
  const shadowHosts = (root as Element).querySelectorAll("*");
  for (const host of shadowHosts) {
    if (host.shadowRoot) {
      elements.push(...deepQueryAll(selector, host.shadowRoot));
    }
  }
  return elements;
}

export function getSlotElements(slot: HTMLSlotElement): Element[] {
  return slot.assignedElements();
}

export function getSlotNodes(slot: HTMLSlotElement): Node[] {
  return slot.assignedNodes();
}

export function getAssignedSlot(element: Element): HTMLSlotElement | null {
  return (element as unknown as { assignedSlot?: HTMLSlotElement }).assignedSlot ?? null;
}

export function isSlotElement(element: Element): element is HTMLSlotElement {
  return element.tagName === "SLOT";
}

export function getCustomElements(): CustomElementRegistry {
  return customElements;
}

export function defineCustomElement(name: string, constructor: CustomElementConstructor): void {
  customElements.define(name, constructor);
}

export function getCustomElement(name: string): CustomElementConstructor | undefined {
  return customElements.get(name);
}

export function isCustomElementDefined(name: string): boolean {
  return customElements.get(name) !== undefined;
}

export function whenCustomElementDefined(name: string): Promise<CustomElementConstructor> {
  return customElements.whenDefined(name);
}

export function upgradeCustomElement(element: Element): void {
  customElements.upgrade(element);
}

export function getCustomElementNames(): string[] {
  return Object.getOwnPropertyNames(customElements);
}
