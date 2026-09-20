import type { VisibilityState } from "../intersection-observer";
/**
 * DOM manipulation utilities -- element creation, query, attribute, class, style management.
 * @module runtime/dom
 */

export type ElementSelector = string | Element | Document | ShadowRoot | null | undefined;

export class DOMManipulator {
  static query<T extends Element = HTMLElement>(selector: string, parent: ElementSelector = document): T | null {
    const root = this.resolveRoot(parent);
    return root?.querySelector<T>(selector) ?? null;
  }

  static queryAll<T extends Element = HTMLElement>(selector: string, parent: ElementSelector = document): T[] {
    const root = this.resolveRoot(parent);
    if (!root) return [];
    return [...root.querySelectorAll<T>(selector)];
  }

  static queryById<T extends Element = HTMLElement>(id: string): T | null {
    return (document.getElementById(id) as unknown as T) ?? null;
  }

  static queryByClass<T extends Element = HTMLElement>(className: string, parent: ElementSelector = document): T[] {
    return this.queryAll<T>(`.${className}`, parent);
  }

  static queryByTag<T extends Element = HTMLElement>(tag: string, parent: ElementSelector = document): T[] {
    const root = this.resolveRoot(parent);
    if (!root) return [];
    return [...(root as any).getElementsByTagName(tag)];
  }

  static queryByAttribute<T extends Element = HTMLElement>(name: string, value?: string, parent: ElementSelector = document): T[] {
    let selector = value !== undefined ? `[${name}="${value}"]` : `[${name}]`;
    return this.queryAll<T>(selector, parent);
  }

  static queryByData<T extends Element = HTMLElement>(key: string, value?: string, parent: ElementSelector = document): T[] {
    return this.queryByAttribute<T>(`data-${key}`, value, parent);
  }

  static closest<T extends Element = HTMLElement>(element: Element, selector: string): T | null {
    return element.closest<T>(selector);
  }

  static matches(element: Element, selector: string): boolean {
    return element.matches(selector);
  }

  static contains(parent: Element, child: Node): boolean {
    return parent.contains(child);
  }

  static isDescendant(parent: Element, child: Node): boolean {
    return parent !== child && parent.contains(child);
  }

  static isAncestor(child: Node, ancestor: Element): boolean {
    return ancestor.contains(child);
  }

  static create<K extends keyof HTMLElementTagNameMap>(tag: K, attributes?: Record<string, string>, children?: Node[]): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (attributes) {
      this.setAttributes(element, attributes);
    }
    if (children) {
      for (const child of children) {
        element.appendChild(child);
      }
    }
    return element;
  }

  static createText(text: string): Text {
    return document.createTextNode(text);
  }

  static createComment(text: string): Comment {
    return document.createComment(text);
  }

  static createFragment(children?: Node[]): DocumentFragment {
    const fragment = document.createDocumentFragment();
    if (children) {
      for (const child of children) {
        fragment.appendChild(child);
      }
    }
    return fragment;
  }

  static createFromHTML(html: string): HTMLElement {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild as HTMLElement;
  }

  static createFromHTMLAll(html: string): HTMLElement[] {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return [...template.content.children] as HTMLElement[];
  }

  static append(parent: Node, ...children: Node[]): Node {
    for (const child of children) {
      parent.appendChild(child);
    }
    return parent;
  }

  static prepend(parent: Node, ...children: Node[]): Node {
    for (const child of children) {
      parent.insertBefore(child, parent.firstChild);
    }
    return parent;
  }

  static insertBefore(parent: Node, child: Node, reference: Node | null): Node {
    parent.insertBefore(child, reference);
    return parent;
  }

  static insertAfter(parent: Node, child: Node, reference: Node | null): Node {
    if (reference && reference.nextSibling) {
      parent.insertBefore(child, reference.nextSibling);
    } else {
      parent.appendChild(child);
    }
    return parent;
  }

  static remove(element: Node): Node | null {
    if (element.parentNode) {
      return element.parentNode.removeChild(element);
    }
    return null;
  }

  static removeAll(elements: Node[]): void {
    for (const element of elements) {
      this.remove(element);
    }
  }

  static replace(oldElement: Node, newElement: Node): Node | null {
    if (oldElement.parentNode) {
      return oldElement.parentNode.replaceChild(newElement, oldElement);
    }
    return null;
  }

  static swap(element1: Node, element2: Node): void {
    const parent1 = element1.parentNode;
    const parent2 = element2.parentNode;
    if (!parent1 || !parent2) return;
    const temp = document.createComment("swap");
    parent1.replaceChild(temp, element1);
    parent2.replaceChild(element1, element2);
    parent1.replaceChild(element2, temp);
  }

  static clone(element: Node, deep: boolean = true): Node {
    return element.cloneNode(deep);
  }

  static wrap(element: Node, wrapper: Node): void {
    const parent = element.parentNode;
    if (parent) {
      parent.replaceChild(wrapper, element);
      wrapper.appendChild(element);
    }
  }

  static unwrap(element: Node): void {
    const parent = element.parentNode;
    if (!parent) return;
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
  }

  static empty(element: Node): void {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  static setAttribute(element: Element, name: string, value: string): void {
    element.setAttribute(name, value);
  }

  static getAttribute(element: Element, name: string): string | null {
    return element.getAttribute(name);
  }

  static removeAttribute(element: Element, name: string): void {
    element.removeAttribute(name);
  }

  static hasAttribute(element: Element, name: string): boolean {
    return element.hasAttribute(name);
  }

  static setAttributes(element: Element, attributes: Record<string, string>): void {
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }
  }

  static getAttributes(element: Element): Record<string, string> {
    const result: Record<string, string> = {};
    for (const attr of element.attributes) {
      result[attr.name] = attr.value;
    }
    return result;
  }

  static removeAttributes(element: Element, names: string[]): void {
    for (const name of names) {
      element.removeAttribute(name);
    }
  }

  static toggleAttribute(element: Element, name: string, force?: boolean): boolean {
    if (force === undefined) {
      if (element.hasAttribute(name)) {
        element.removeAttribute(name);
        return false;
      } else {
        element.setAttribute(name, "");
        return true;
      }
    }
    if (force) {
      element.setAttribute(name, "");
    } else {
      element.removeAttribute(name);
    }
    return force;
  }

  static setData(element: HTMLElement, key: string, value: string): void {
    element.dataset[key] = value;
  }

  static getData(element: HTMLElement, key: string): string | undefined {
    return element.dataset[key];
  }

  static removeData(element: HTMLElement, key: string): void {
    delete element.dataset[key];
  }

  static hasData(element: HTMLElement, key: string): boolean {
    return key in element.dataset;
  }

  static getAllData(element: HTMLElement): Record<string, string> {
    return { ...element.dataset };
  }

  static addClass(element: Element, ...classNames: string[]): void {
    element.classList.add(...classNames);
  }

  static removeClass(element: Element, ...classNames: string[]): void {
    element.classList.remove(...classNames);
  }

  static toggleClass(element: Element, className: string, force?: boolean): boolean {
    return element.classList.toggle(className, force);
  }

  static hasClass(element: Element, className: string): boolean {
    return element.classList.contains(className);
  }

  static replaceClass(element: Element, oldClass: string, newClass: string): void {
    element.classList.replace(oldClass, newClass);
  }

  static setStyle(element: HTMLElement, property: string, value: string): void {
    element.style.setProperty(property, value);
  }

  static getStyle(element: HTMLElement, property: string): string {
    return getComputedStyle(element).getPropertyValue(property);
  }

  static removeStyle(element: HTMLElement, property: string): void {
    element.style.removeProperty(property);
  }

  static setStyles(element: HTMLElement, styles: Record<string, string>): void {
    for (const [property, value] of Object.entries(styles)) {
      element.style.setProperty(property, value);
    }
  }

  static getStyles(element: HTMLElement, properties: string[]): Record<string, string> {
    const computed = getComputedStyle(element);
    const result: Record<string, string> = {};
    for (const prop of properties) {
      result[prop] = computed.getPropertyValue(prop);
    }
    return result;
  }

  static removeAllStyles(element: HTMLElement): void {
    element.style.cssText = "";
  }

  static setInnerHTML(element: Element, html: string): void {
    element.innerHTML = html;
  }

  static getInnerHTML(element: Element): string {
    return element.innerHTML;
  }

  static setTextContent(element: Node, text: string): void {
    element.textContent = text;
  }

  static getTextContent(element: Node): string {
    return element.textContent ?? "";
  }

  static setOuterHTML(element: Element, html: string): void {
    element.outerHTML = html;
  }

  static getOuterHTML(element: Element): string {
    return element.outerHTML;
  }

  static setText(element: HTMLElement, text: string): void {
    element.textContent = text;
  }

  static getText(element: HTMLElement): string {
    return element.textContent ?? "";
  }

  static setHTML(element: HTMLElement, html: string): void {
    element.innerHTML = html;
  }

  static getHTML(element: HTMLElement): string {
    return element.innerHTML;
  }

  static getValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
    return element.value;
  }

  static setValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
    element.value = value;
  }

  static getChecked(element: HTMLInputElement): boolean {
    return element.checked;
  }

  static setChecked(element: HTMLInputElement, checked: boolean): void {
    element.checked = checked;
  }

  static getDisabled(element: HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
    return element.disabled;
  }

  static setDisabled(element: HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement, disabled: boolean): void {
    element.disabled = disabled;
  }

  static getReadOnly(element: HTMLInputElement | HTMLTextAreaElement): boolean {
    return element.readOnly;
  }

  static setReadOnly(element: HTMLInputElement | HTMLTextAreaElement, readOnly: boolean): void {
    element.readOnly = readOnly;
  }

  static focus(element: HTMLElement): void {
    element.focus();
  }

  static blur(element: HTMLElement): void {
    element.blur();
  }

  static select(element: HTMLInputElement | HTMLTextAreaElement): void {
    element.select();
  }

  static click(element: HTMLElement): void {
    element.click();
  }

  static scrollIntoView(element: Element, options?: ScrollIntoViewOptions): void {
    element.scrollIntoView(options ?? { behavior: "smooth", block: "start", inline: "nearest" });
  }

  static scrollTo(element: Element, x: number, y: number, behavior: ScrollBehavior = "smooth"): void {
    element.scrollTo({ left: x, top: y, behavior });
  }

  static scrollBy(element: Element, x: number, y: number, behavior: ScrollBehavior = "smooth"): void {
    element.scrollBy({ left: x, top: y, behavior });
  }

  static getScrollPosition(element: Element): { x: number; y: number } {
    return { x: element.scrollLeft, y: element.scrollTop };
  }

  static setScrollPosition(element: Element, x: number, y: number): void {
    element.scrollLeft = x;
    element.scrollTop = y;
  }

  static getScrollWidth(element: Element): number {
    return element.scrollWidth;
  }

  static getScrollHeight(element: Element): number {
    return element.scrollHeight;
  }

  static getClientWidth(element: Element): number {
    return element.clientWidth;
  }

  static getClientHeight(element: Element): number {
    return element.clientHeight;
  }

  static getOffsetWidth(element: HTMLElement): number {
    return element.offsetWidth;
  }

  static getOffsetHeight(element: HTMLElement): number {
    return element.offsetHeight;
  }

  static getOffset(element: HTMLElement): { top: number; left: number; width: number; height: number } {
    return { top: element.offsetTop, left: element.offsetLeft, width: element.offsetWidth, height: element.offsetHeight };
  }

  static getBoundingClientRect(element: Element): DOMRect {
    return element.getBoundingClientRect();
  }

  static getPosition(element: HTMLElement): { top: number; left: number } {
    const rect = element.getBoundingClientRect();
    return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };
  }

  static getSize(element: HTMLElement): { width: number; height: number } {
    return { width: element.offsetWidth, height: element.offsetHeight };
  }

  static getCenter(element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  static isVisible(element: HTMLElement): boolean {
    if (!element) return false;
    if (element.style.display === "none") return false;
    if (element.style.visibility === "hidden") return false;
    if (element.offsetWidth === 0 && element.offsetHeight === 0) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity) === 0) return false;
    return true;
  }

  static isHidden(element: HTMLElement): boolean {
    return !this.isVisible(element);
  }

  static isInViewport(element: HTMLElement, threshold: number = 0): boolean {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    const elementTop = rect.top;
    const elementBottom = rect.bottom;
    const elementLeft = rect.left;
    const elementRight = rect.right;
    const visibleHeight = Math.min(elementBottom, windowHeight) - Math.max(elementTop, 0);
    const visibleWidth = Math.min(elementRight, windowWidth) - Math.max(elementLeft, 0);
    const visibleArea = visibleHeight * visibleWidth;
    const totalArea = rect.width * rect.height;
    if (totalArea === 0) return false;
    return visibleArea / totalArea >= threshold;
  }

  static isFullyInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    return rect.top >= 0 && rect.left >= 0 && rect.bottom <= windowHeight && rect.right <= windowWidth;
  }

  static isPartiallyInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    return rect.bottom > 0 && rect.right > 0 && rect.top < windowHeight && rect.left < windowWidth;
  }

  static hide(element: HTMLElement): void {
    element.style.display = "none";
  }

  static show(element: HTMLElement, display: string = ""): void {
    element.style.display = display;
  }

  static toggle(element: HTMLElement): void {
    if (this.isVisible(element)) {
      this.hide(element);
    } else {
      this.show(element);
    }
  }

  static fadeIn(element: HTMLElement, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      element.style.opacity = "0";
      element.style.display = "";
      element.style.transition = `opacity ${duration}ms`;
      requestAnimationFrame(() => {
        element.style.opacity = "1";
      });
      setTimeout(() => {
        element.style.transition = "";
        resolve();
      }, duration);
    });
  }

  static fadeOut(element: HTMLElement, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      element.style.transition = `opacity ${duration}ms`;
      element.style.opacity = "0";
      setTimeout(() => {
        element.style.display = "none";
        element.style.transition = "";
        element.style.opacity = "";
        resolve();
      }, duration);
    });
  }

  static slideUp(element: HTMLElement, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      element.style.height = `${element.scrollHeight}px`;
      element.style.overflow = "hidden";
      element.style.transition = `height ${duration}ms`;
      requestAnimationFrame(() => {
        element.style.height = "0";
      });
      setTimeout(() => {
        element.style.display = "none";
        element.style.height = "";
        element.style.overflow = "";
        element.style.transition = "";
        resolve();
      }, duration);
    });
  }

  static slideDown(element: HTMLElement, duration: number = 300): Promise<void> {
    return new Promise((resolve) => {
      element.style.display = "";
      const height = element.scrollHeight;
      element.style.height = "0";
      element.style.overflow = "hidden";
      element.style.transition = `height ${duration}ms`;
      requestAnimationFrame(() => {
        element.style.height = `${height}px`;
      });
      setTimeout(() => {
        element.style.height = "";
        element.style.overflow = "";
        element.style.transition = "";
        resolve();
      }, duration);
    });
  }

  static animate(element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions = {}): Animation {
    return element.animate(keyframes, options);
  }

  static animateTo(element: HTMLElement, styles: Record<string, string>, duration: number = 300, easing: string = "ease"): Promise<void> {
    return new Promise((resolve) => {
      const transition: string[] = [];
      for (const key of Object.keys(styles)) {
        transition.push(`${key.replace(/([A-Z])/g, "-$1").toLowerCase()} ${duration}ms ${easing}`);
      }
      element.style.transition = transition.join(", ");
      requestAnimationFrame(() => {
        for (const [key, value] of Object.entries(styles)) {
          element.style.setProperty(key.replace(/([A-Z])/g, "-$1").toLowerCase(), value);
        }
      });
      setTimeout(() => {
        element.style.transition = "";
        resolve();
      }, duration);
    });
  }

  static getParent(element: Node): Node | null {
    return element.parentNode;
  }

  static getParents(element: Node, selector?: string): Node[] {
    const parents: Node[] = [];
    let current = element.parentNode;
    while (current) {
      if (!selector || (current instanceof Element && current.matches(selector))) {
        parents.push(current);
      }
      current = current.parentNode;
    }
    return parents;
  }

  static getChildren(element: Node): Node[] {
    return [...element.childNodes];
  }

  static getChildElements(element: Element): Element[] {
    return [...element.children];
  }

  static getFirstChild(element: Node): Node | null {
    return element.firstChild;
  }

  static getLastChild(element: Node): Node | null {
    return element.lastChild;
  }

  static getFirstElementChild(element: Element): Element | null {
    return element.firstElementChild;
  }

  static getLastElementChild(element: Element): Element | null {
    return element.lastElementChild;
  }

  static getNextSibling(element: Node): Node | null {
    return element.nextSibling;
  }

  static getPreviousSibling(element: Node): Node | null {
    return element.previousSibling;
  }

  static getNextElementSibling(element: Element): Element | null {
    return element.nextElementSibling;
  }

  static getPreviousElementSibling(element: Element): Element | null {
    return element.previousElementSibling;
  }

  static getSiblings(element: Node): Node[] {
    const parent = element.parentNode;
    if (!parent) return [];
    return [...parent.childNodes].filter((child) => child !== element);
  }

  static getElementSiblings(element: Element): Element[] {
    const parent = element.parentNode;
    if (!parent) return [];
    return [...parent.children].filter((child) => child !== element);
  }

  static getNthChild(element: Element, n: number): Element | null {
    return element.children[n] ?? null;
  }

  static getChildCount(element: Node): number {
    return element.childNodes.length;
  }

  static getElementChildCount(element: Element): number {
    return element.children.length;
  }

  static hasChildren(element: Node): boolean {
    return element.hasChildNodes();
  }

  static hasElementChildren(element: Element): boolean {
    return element.children.length > 0;
  }

  static getNodeType(element: Node): number {
    return element.nodeType;
  }

  static isElement(node: Node): node is Element {
    return node.nodeType === Node.ELEMENT_NODE;
  }

  static isTextNode(node: Node): node is Text {
    return node.nodeType === Node.TEXT_NODE;
  }

  static isCommentNode(node: Node): node is Comment {
    return node.nodeType === Node.COMMENT_NODE;
  }

  static isDocumentNode(node: Node): node is Document {
    return node.nodeType === Node.DOCUMENT_NODE;
  }

  static isDocumentFragment(node: Node): node is DocumentFragment {
    return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
  }

  static getTagName(element: Element): string {
    return element.tagName.toLowerCase();
  }

  static getID(element: Element): string {
    return element.id;
  }

  static setID(element: Element, id: string): void {
    element.id = id;
  }

  static getClassName(element: Element): string {
    return element.className;
  }

  static setClassName(element: Element, className: string): void {
    element.className = className;
  }

  static getClassList(element: Element): DOMTokenList {
    return element.classList;
  }

  static getRole(element: HTMLElement): string | null {
    return element.getAttribute("role");
  }

  static setRole(element: HTMLElement, role: string): void {
    element.setAttribute("role", role);
  }

  static getTabbableElements(root: Element = document.body): HTMLElement[] {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return [...root.querySelectorAll<HTMLElement>(selector)].filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.offsetWidth > 0;
    });
  }

  static getFocusableElements(root: Element = document.body): HTMLElement[] {
    const selector = 'a[href], button, input, textarea, select, [tabindex]';
    return [...root.querySelectorAll<HTMLElement>(selector)].filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  static getFormElements(form: HTMLFormElement): HTMLInputElement[] {
    return [...form.elements].filter((el) => el instanceof HTMLInputElement) as HTMLInputElement[];
  }

  static serializeForm(form: HTMLFormElement): Record<string, string> {
    const result: Record<string, string> = {};
    const formData = new FormData(form);
    formData.forEach((value, key) => {
      result[key] = String(value);
    });
    return result;
  }

  static serializeFormToQueryString(form: HTMLFormElement): string {
    const params = new URLSearchParams();
    const formData = new FormData(form);
    formData.forEach((value, key) => {
      params.set(key, String(value));
    });
    return params.toString();
  }

  static setFormValues(form: HTMLFormElement, values: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(values)) {
      const element = form.elements.namedItem(key);
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        element.value = String(value);
      }
    }
  }

  static resetForm(form: HTMLFormElement): void {
    form.reset();
  }

  static submitForm(form: HTMLFormElement): void {
    form.submit();
  }

  static validateForm(form: HTMLFormElement): { valid: boolean; errors: Array<{ field: string; message: string }> } {
    const errors: Array<{ field: string; message: string }> = [];
    const elements = this.getFormElements(form);
    for (const element of elements) {
      if (element.required && !element.value) {
        errors.push({ field: element.name, message: `${element.name} is required` });
      }
      if (element.type === "email" && element.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(element.value)) {
        errors.push({ field: element.name, message: `${element.name} must be a valid email` });
      }
      if (element.minLength > 0 && element.value.length < element.minLength) {
        errors.push({ field: element.name, message: `${element.name} must be at least ${element.minLength} characters` });
      }
      if (element.maxLength > 0 && element.value.length > element.maxLength) {
        errors.push({ field: element.name, message: `${element.name} must be at most ${element.maxLength} characters` });
      }
      if (element.pattern && element.value && !new RegExp(element.pattern).test(element.value)) {
        errors.push({ field: element.name, message: `${element.name} format is invalid` });
      }
    }
    return { valid: errors.length === 0, errors };
  }

  private static resolveRoot(parent: ElementSelector): Element | Document | ShadowRoot | null {
    if (typeof parent === "string") {
      return document.querySelector(parent);
    }
    return parent ?? null;
  }

  static ready(callback: () => void): void {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  static waitForSelector(selector: string, timeout: number = 5000): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      const element = this.query<HTMLElement>(selector);
      if (element) {
        resolve(element);
        return;
      }
      const observer = new MutationObserver(() => {
        const el = this.query<HTMLElement>(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  static waitForSelectorAll(selector: string, count: number = 1, timeout: number = 5000): Promise<HTMLElement[]> {
    return new Promise((resolve) => {
      const elements = this.queryAll<HTMLElement>(selector);
      if (elements.length >= count) {
        resolve(elements);
        return;
      }
      const observer = new MutationObserver(() => {
        const els = this.queryAll<HTMLElement>(selector);
        if (els.length >= count) {
          observer.disconnect();
          resolve(els);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(this.queryAll<HTMLElement>(selector));
      }, timeout);
    });
  }

  static observe(element: Element, callback: MutationCallback, options: MutationObserverInit = { childList: true, subtree: true }): MutationObserver {
    const observer = new MutationObserver(callback);
    observer.observe(element, options);
    return observer;
  }

  static observeAttributes(element: Element, callback: MutationCallback, attributeFilter?: string[]): MutationObserver {
    return this.observe(element, callback, { attributes: true, attributeFilter });
  }

  static observeChildren(element: Element, callback: MutationCallback): MutationObserver {
    return this.observe(element, callback, { childList: true });
  }

  static observeSubtree(element: Element, callback: MutationCallback): MutationObserver {
    return this.observe(element, callback, { childList: true, subtree: true });
  }

  static observeText(element: Element, callback: MutationCallback): MutationObserver {
    return this.observe(element, callback, { characterData: true, subtree: true });
  }

  static scrollToTop(smooth: boolean = true): void {
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  }

  static scrollToBottom(smooth: boolean = true): void {
    window.scrollTo({ top: document.body.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  static scrollToElement(element: HTMLElement, offset: number = 0, smooth: boolean = true): void {
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }

  static getScrollPosition2(): { x: number; y: number } {
    return { x: window.scrollX, y: window.scrollY };
  }

  static setScrollPosition2(x: number, y: number, smooth: boolean = true): void {
    window.scrollTo({ left: x, top: y, behavior: smooth ? "smooth" : "auto" });
  }

  static getViewportSize(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  static getViewportWidth(): number {
    return window.innerWidth;
  }

  static getViewportHeight(): number {
    return window.innerHeight;
  }

  static getDocumentSize(): { width: number; height: number } {
    return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
  }

  static getDocumentWidth(): number {
    return document.documentElement.scrollWidth;
  }

  static getDocumentHeight(): number {
    return document.documentElement.scrollHeight;
  }

  static isAtTop(): boolean {
    return window.scrollY === 0;
  }

  static isAtBottom(): boolean {
    return window.scrollY + window.innerHeight >= document.body.scrollHeight;
  }

  static getScrollPercentage(): number {
    const max = document.body.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return (window.scrollY / max) * 100;
  }

  static lockScroll(): void {
    document.body.style.overflow = "hidden";
  }

  static unlockScroll(): void {
    document.body.style.overflow = "";
  }

  static toggleScrollLock(): void {
    if (document.body.style.overflow === "hidden") {
      this.unlockScroll();
    } else {
      this.lockScroll();
    }
  }

  static copyToClipboard(text: string): Promise<void> {
    if (navigator.clipboard) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve) => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      resolve();
    });
  }

  static readFromClipboard(): Promise<string> {
    if (navigator.clipboard) {
      return navigator.clipboard.readText();
    }
    return Promise.resolve("");
  }

  static download(filename: string, content: string, type: string = "text/plain"): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static upload(accept?: string, multiple: boolean = false): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      if (accept) input.accept = accept;
      if (multiple) input.multiple = true;
      input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", () => {
        const files = [...(input.files ?? [])];
        document.body.removeChild(input);
        resolve(files);
      });
      input.click();
    });
  }

  static readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  static readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  static readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  static readFileAsBinaryString(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsBinaryString(file);
    });
  }

  static getSelectedText(): string {
    return window.getSelection()?.toString() ?? "";
  }

  static selectElement(element: HTMLElement): Selection | null {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return selection;
  }

  static clearSelection(): void {
    window.getSelection()?.removeAllRanges();
  }

  static getElementIndex(element: Element): number {
    return [...element.parentNode?.children ?? []].indexOf(element);
  }

  static getElementPath(element: HTMLElement): string {
    const parts: string[] = [];
    let current: HTMLElement | null = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        parts.unshift(selector);
        break;
      }
      const className = current.className.trim().split(/\s+/).join(".");
      if (className) {
        selector += `.${className}`;
      }
      const index = this.getElementIndex(current);
      if (index > 0) {
        selector += `:nth-child(${index + 1})`;
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  static getElementDepth(element: Node): number {
    let depth = 0;
    let current = element.parentNode;
    while (current) {
      depth++;
      current = current.parentNode;
    }
    return depth;
  }

  static getCommonAncestor(element1: Node, element2: Node): Node | null {
    const ancestors1 = this.getParents(element1).reverse();
    const ancestors2 = this.getParents(element2).reverse();
    let common: Node | null = null;
    for (let i = 0; i < Math.min(ancestors1.length, ancestors2.length); i++) {
      if (ancestors1[i] === ancestors2[i]) {
        common = ancestors1[i];
      } else {
        break;
      }
    }
    return common;
  }

  static contains2(parent: Node, child: Node): boolean {
    return parent.contains(child);
  }

  static equals(node1: Node, node2: Node): boolean {
    return node1.isSameNode(node2);
  }

  static isEqualNode(node1: Node, node2: Node): boolean {
    return node1.isEqualNode(node2);
  }

  static cloneNode(node: Node, deep: boolean = true): Node {
    return node.cloneNode(deep);
  }

  static normalize(node: Node): void {
    node.normalize();
  }

  static compareDocumentPosition(node1: Node, node2: Node): number {
    return node1.compareDocumentPosition(node2);
  }

  static lookupPrefix(node: Node, namespaceURI: string): string | null {
    return node.lookupPrefix(namespaceURI);
  }

  static lookupNamespaceURI(node: Node, prefix: string): string | null {
    return node.lookupNamespaceURI(prefix);
  }

  static isDefaultNamespace(node: Node, namespaceURI: string): boolean {
    return node.isDefaultNamespace(namespaceURI);
  }

  static insertAdjacentHTML(element: Element, position: InsertPosition, html: string): void {
    element.insertAdjacentHTML(position, html);
  }

  static insertAdjacentElement(element: Element, position: InsertPosition, adjacent: Element): Element | null {
    return element.insertAdjacentElement(position, adjacent);
  }

  static insertAdjacentText(element: Element, position: InsertPosition, text: string): void {
    element.insertAdjacentText(position, text);
  }

  static before(element: Element, ...nodes: (Node | string)[]): void {
    element.before(...nodes);
  }

  static after(element: Element, ...nodes: (Node | string)[]): void {
    element.after(...nodes);
  }

  static replaceWith(element: Element, ...nodes: (Node | string)[]): void {
    element.replaceWith(...nodes);
  }

  static remove2(element: Element): void {
    element.remove();
  }

  static prepend2(element: Element, ...nodes: (Node | string)[]): void {
    element.prepend(...nodes);
  }

  static append2(element: Element, ...nodes: (Node | string)[]): void {
    element.append(...nodes);
  }

  static getRootNode(node: Node): Node {
    return node.getRootNode();
  }

  static getHost(node: Node): Element | null {
    return (node as ShadowRoot).host ?? null;
  }

  static getShadowRoot(element: Element): ShadowRoot | null {
    return element.shadowRoot;
  }

  static attachShadow(element: HTMLElement, options: ShadowRootInit = { mode: "open" }): ShadowRoot {
    return element.attachShadow(options);
  }

  static createShadow(element: HTMLElement, html: string, options?: ShadowRootInit): ShadowRoot {
    const shadow = this.attachShadow(element, options);
    shadow.innerHTML = html;
    return shadow;
  }

  static addStyleToShadow(shadow: ShadowRoot, css: string): HTMLStyleElement {
    const style = document.createElement("style");
    style.textContent = css;
    shadow.appendChild(style);
    return style;
  }

  static adoptedStyleSheets(root: Document | ShadowRoot, sheets: CSSStyleSheet[]): void {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...sheets];
  }

  static createCSSStyleSheet(rules: string[]): CSSStyleSheet {
    const sheet = new CSSStyleSheet();
    for (const rule of rules) {
      sheet.insertRule(rule, sheet.cssRules.length);
    }
    return sheet;
  }

  static fullscreen(element: HTMLElement): Promise<void> {
    if (element.requestFullscreen) {
      return element.requestFullscreen();
    }
    if ((element as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
      return (element as HTMLElement & { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
    }
    return Promise.reject(new Error("Fullscreen not supported"));
  }

  static exitFullscreen(): Promise<void> {
    if (document.exitFullscreen) {
      return document.exitFullscreen();
    }
    return Promise.reject(new Error("Exit fullscreen not supported"));
  }

  static isFullscreen(): boolean {
    return !!document.fullscreenElement;
  }

  static toggleFullscreen(element: HTMLElement): Promise<void> {
    if (this.isFullscreen()) {
      return this.exitFullscreen();
    }
    return this.fullscreen(element);
  }

  static onFullscreenChange(callback: () => void): () => void {
    const handler = () => callback();
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }

  static pointerLock(element: HTMLElement): Promise<void> {
    if (element.requestPointerLock) {
      return Promise.resolve(element.requestPointerLock());
    }
    return Promise.reject(new Error("Pointer lock not supported"));
  }

  static exitPointerLock(): void {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  static isPointerLocked(): boolean {
    return !!document.pointerLockElement;
  }

  static onPointerLockChange(callback: () => void): () => void {
    const handler = () => callback();
    document.addEventListener("pointerlockchange", handler);
    return () => document.removeEventListener("pointerlockchange", handler);
  }

  static vibrate(pattern: number | number[]): boolean {
    if ("vibrate" in navigator) {
      return navigator.vibrate(pattern);
    }
    return false;
  }

  static cancelVibration(): void {
    navigator.vibrate(0);
  }

  static share(data: { title?: string; text?: string; url?: string; files?: File[] }): Promise<void> {
    if (navigator.share) {
      return navigator.share(data);
    }
    return Promise.reject(new Error("Web Share not supported"));
  }

  static canShare(data?: ShareData): boolean {
    return !!navigator.canShare?.(data);
  }

  static getBattery(): Promise<{ level: number; charging: boolean; chargingTime: number; dischargingTime: number }> {
    return (navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; chargingTime: number; dischargingTime: number }> }).getBattery?.() ?? Promise.reject(new Error("Battery API not supported"));
  }

  static getGeolocation(): Promise<{ latitude: number; longitude: number; accuracy: number; altitude: number | null; speed: number | null; heading: number | null }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
        }),
        (error) => reject(error),
      );
    });
  }

  static watchGeolocation(callback: (position: { latitude: number; longitude: number; accuracy: number }) => void): number {
    if (!navigator.geolocation) return -1;
    return navigator.geolocation.watchPosition((position) => {
      callback({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    });
  }

  static clearGeolocationWatch(watchId: number): void {
    if (navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
  }

  static getNotifications(): Promise<Notification[]> {
    if ("serviceWorker" in navigator && Notification.permission === "granted") {
      return navigator.serviceWorker.ready.then((reg) => reg.getNotifications());
    }
    return Promise.resolve([]);
  }

  static requestNotificationPermission(): Promise<NotificationPermission> {
    if ("Notification" in window) {
      return Notification.requestPermission();
    }
    return Promise.resolve("denied");
  }

  static showNotification(title: string, options?: NotificationOptions): Promise<void> {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, options);
      return Promise.resolve();
    }
    return this.requestNotificationPermission().then((permission) => {
      if (permission === "granted") {
        new Notification(title, options);
      }
    });
  }

  static getNetworkStatus(): { online: boolean; effectiveType?: string; downlink?: number; rtt?: number } {
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
    return {
      online: navigator.onLine,
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
    };
  }

  static onOnline(callback: () => void): () => void {
    window.addEventListener("online", callback);
    return () => window.removeEventListener("online", callback);
  }

  static onOffline(callback: () => void): () => void {
    window.addEventListener("offline", callback);
    return () => window.removeEventListener("offline", callback);
  }

  static onResize(callback: (width: number, height: number) => void): () => void {
    const handler = () => callback(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }

  static onScroll(callback: (x: number, y: number) => void): () => void {
    const handler = () => callback(window.scrollX, window.scrollY);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }

  static onVisibilityChange(callback: (visible: boolean) => void): () => void {
    const handler = () => callback(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }

  static isPageVisible(): boolean {
    return !document.hidden;
  }

  static isPageHidden(): boolean {
    return document.hidden;
  }

  static getVisibilityState(): VisibilityState {
    return document.visibilityState as any;
  }

  static onBeforeUnload(callback: (event: BeforeUnloadEvent) => void): () => void {
    const handler = (event: BeforeUnloadEvent) => callback(event);
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }

  static onUnload(callback: () => void): () => void {
    const handler = () => callback();
    window.addEventListener("unload", handler);
    return () => window.removeEventListener("unload", handler);
  }

  static onLoad(callback: () => void): () => void {
    if (document.readyState === "complete") {
      callback();
      return () => {};
    }
    const handler = () => callback();
    window.addEventListener("load", handler);
    return () => window.removeEventListener("load", handler);
  }

  static onDOMContentLoaded(callback: () => void): () => void {
    if (document.readyState !== "loading") {
      callback();
      return () => {};
    }
    const handler = () => callback();
    document.addEventListener("DOMContentLoaded", handler);
    return () => document.removeEventListener("DOMContentLoaded", handler);
  }

  static onHashChange(callback: (hash: string) => void): () => void {
    const handler = () => callback(window.location.hash);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }

  static onPopState(callback: (state: unknown) => void): () => void {
    const handler = (event: PopStateEvent) => callback(event.state);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }

  static onPageShow(callback: (persisted: boolean) => void): () => void {
    const handler = (event: PageTransitionEvent) => callback(event.persisted);
    window.addEventListener("pageshow", handler);
    return () => window.removeEventListener("pageshow", handler);
  }

  static onPageHide(callback: (persisted: boolean) => void): () => void {
    const handler = (event: PageTransitionEvent) => callback(event.persisted);
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }

  static onMessage(callback: (event: MessageEvent) => void): () => void {
    const handler = (event: MessageEvent) => callback(event);
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }

  static postMessage(message: unknown, targetOrigin: string = "*", target?: Window): void {
    (target ?? window).postMessage(message, targetOrigin);
  }

  static onError(callback: (message: string, source: string, lineno: number, colno: number, error: Error) => void): () => void {
    const handler = (event: ErrorEvent) => {
      callback(event.message, event.filename, event.lineno, event.colno, event.error);
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }

  static onUnhandledRejection(callback: (reason: unknown) => void): () => void {
    const handler = (event: PromiseRejectionEvent) => callback(event.reason);
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }

  static onLanguageChange(callback: (language: string) => void): () => void {
    const handler = () => callback(navigator.language);
    window.addEventListener("languagechange", handler);
    return () => window.removeEventListener("languagechange", handler);
  }

  static getLanguage(): string {
    return navigator.language;
  }

  static getLanguages(): string[] {
    return [...navigator.languages];
  }

  static getUserAgent(): string {
    return navigator.userAgent;
  }

  static getPlatform(): string {
    return navigator.platform;
  }

  static isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  static isDesktop(): boolean {
    return !this.isMobile();
  }

  static isTouch(): boolean {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  static getTouchPoints(): number {
    return navigator.maxTouchPoints;
  }

  static isRetina(): boolean {
    return window.devicePixelRatio > 1;
  }

  static getDevicePixelRatio(): number {
    return window.devicePixelRatio;
  }

  static getColorDepth(): number {
    return window.screen.colorDepth;
  }

  static getScreenSize(): { width: number; height: number } {
    return { width: window.screen.width, height: window.screen.height };
  }

  static getAvailableScreenSize(): { width: number; height: number } {
    return { width: window.screen.availWidth, height: window.screen.availHeight };
  }

  static getScreenOrientation(): string {
    return window.screen.orientation?.type ?? "unknown";
  }

  static isLandscape(): boolean {
    return window.innerWidth > window.innerHeight;
  }

  static isPortrait(): boolean {
    return window.innerHeight > window.innerWidth;
  }

  static matchMedia(query: string): MediaQueryList {
    return window.matchMedia(query);
  }

  static prefersDarkMode(): boolean {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  static prefersLightMode(): boolean {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  }

  static prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  static prefersReducedTransparency(): boolean {
    return window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
  }

  static prefersContrastMore(): boolean {
    return window.matchMedia("(prefers-contrast: more)").matches;
  }

  static prefersContrastLess(): boolean {
    return window.matchMedia("(prefers-contrast: less)").matches;
  }

  static prefersForcedColors(): boolean {
    return window.matchMedia("(forced-colors: active)").matches;
  }

  static isInvertedColors(): boolean {
    return window.matchMedia("(inverted-colors: inverted)").matches;
  }

  static isStandalone(): boolean {
    return window.matchMedia("(display-mode: standalone)").matches;
  }

  static isFullscreenMode(): boolean {
    return window.matchMedia("(display-mode: fullscreen)").matches;
  }

  static isMinimalUI(): boolean {
    return window.matchMedia("(display-mode: minimal-ui)").matches;
  }

  static isBrowserUI(): boolean {
    return window.matchMedia("(display-mode: browser)").matches;
  }

  static onMediaQueryChange(query: string, callback: (matches: boolean) => void): () => void {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => callback(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }

  static supportsCSS(property: string, value?: string): boolean {
    if (typeof CSS === "undefined" || !CSS.supports) return false;
    return value ? CSS.supports(property, value) : CSS.supports(property);
  }

  static supportsAPI(api: string): boolean {
    return api in window;
  }

  static supportsFeature(feature: string): boolean {
    switch (feature) {
      case "serviceWorker": return "serviceWorker" in navigator;
      case "webWorker": return typeof Worker !== "undefined";
      case "sharedWorker": return typeof SharedWorker !== "undefined";
      case "broadcastChannel": return typeof BroadcastChannel !== "undefined";
      case "webSocket": return typeof WebSocket !== "undefined";
      case "eventSource": return typeof EventSource !== "undefined";
      case "fetch": return typeof fetch !== "undefined";
      case "intersectionObserver": return typeof IntersectionObserver !== "undefined";
      case "resizeObserver": return typeof ResizeObserver !== "undefined";
      case "mutationObserver": return typeof MutationObserver !== "undefined";
      case "performanceObserver": return typeof PerformanceObserver !== "undefined";
      case "customElements": return "customElements" in window;
      case "shadowDOM": return "attachShadow" in Element.prototype;
      case "webAssembly": return typeof WebAssembly !== "undefined";
      case "webGL": return typeof WebGLRenderingContext !== "undefined";
      case "webGL2": return typeof WebGL2RenderingContext !== "undefined";
      case "webRTC": return typeof RTCPeerConnection !== "undefined";
      case "webAudio": return typeof AudioContext !== "undefined";
      case "webSpeech": return "speechSynthesis" in window;
      case "webVR": return "getVRDisplays" in navigator;
      case "webXR": return "xr" in navigator;
      case "geolocation": return "geolocation" in navigator;
      case "notifications": return "Notification" in window;
      case "push": return "PushManager" in window;
      case "bluetooth": return "bluetooth" in navigator;
      case "usb": return "usb" in navigator;
      case "hid": return "hid" in navigator;
      case "serial": return "serial" in navigator;
      case "canShare": return "canShare" in navigator;
      case "credentials": return "credentials" in navigator;
      case "clipboard": return "clipboard" in navigator;
      case "wakeLock": return "wakeLock" in navigator;
      case "indexedDB": return "indexedDB" in window;
      case "cacheStorage": return "caches" in window;
      case "cookieStore": return "cookieStore" in window;
      case "contentIndex": return "serviceWorker" in navigator && "index" in ServiceWorkerRegistration.prototype;
      case "contacts": return "contacts" in navigator;
      case "scheduler": return "scheduler" in navigator;
      case "animationFrame": return "requestAnimationFrame" in window;
      case "idleCallback": return "requestIdleCallback" in window;
      case "broadcastChannel": return "BroadcastChannel" in window;
      case "messageChannel": return "MessageChannel" in window;
      default: return false;
    }
  }

  static supportsAll(features: string[]): boolean {
    return features.every((feature) => this.supportsFeature(feature));
  }

  static supportsAny(features: string[]): boolean {
    return features.some((feature) => this.supportsFeature(feature));
  }

  static getUnsupportedFeatures(features: string[]): string[] {
    return features.filter((feature) => !this.supportsFeature(feature));
  }

  static polyfill(feature: string, polyfill: () => void): void {
    if (!this.supportsFeature(feature)) {
      polyfill();
    }
  }

  static debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }

  static throttle<T extends (...args: unknown[]) => unknown>(fn: T, limit: number): (...args: Parameters<T>) => void {
    let inThrottle = false;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        fn(...args);
        inThrottle = true;
        setTimeout(() => { inThrottle = false; }, limit);
      }
    };
  }

  static raf<T extends () => unknown>(fn: T): number {
    return requestAnimationFrame(() => fn());
  }

  static rafAsync(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  static idle<T extends () => unknown>(fn: T, options?: IdleRequestOptions): number {
    if ("requestIdleCallback" in window) {
      return requestIdleCallback(() => fn(), options);
    }
    return setTimeout(() => fn(), 1) as unknown as number;
  }

  static idleAsync(options?: IdleRequestOptions): Promise<void> {
    return new Promise((resolve) => {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => resolve(), options);
      } else {
        setTimeout(() => resolve(), 1);
      }
    });
  }

  static cancelRaf(id: number): void {
    cancelAnimationFrame(id);
  }

  static cancelIdle(id: number): void {
    if ("cancelIdleCallback" in window) {
      cancelIdleCallback(id);
    } else {
      clearTimeout(id);
    }
  }

  static nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  static nextFrames(count: number): Promise<void> {
    return new Promise((resolve) => {
      let remaining = count;
      const tick = () => {
        remaining--;
        if (remaining <= 0) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static timeout<T>(promise: Promise<T>, ms: number, message: string = "Timeout"): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
  }

  static interval(callback: () => void, ms: number): () => void {
    const id = setInterval(callback, ms);
    return () => clearInterval(id);
  }

  static measure(fn: () => void): number {
    const start = performance.now();
    fn();
    return performance.now() - start;
  }

  static measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    return fn().then((result) => ({ result, duration: performance.now() - start }));
  }

  static profile<T>(name: string, fn: () => T): T {
    console.profile(name);
    const result = fn();
    console.profileEnd(name);
    return result;
  }

  static async profileAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    console.profile(name);
    const result = await fn();
    console.profileEnd(name);
    return result;
  }

  static toString2(element: Element): string {
    return element.toString();
  }

  static toJSON2(element: Element): string {
    return JSON.stringify({
      tag: element.tagName,
      id: element.id,
      class: element.className,
      attributes: this.getAttributes(element),
      children: element.children.length,
      text: element.textContent?.slice(0, 100),
    }, null, 2);
  }

  static toJSON(): string {
    return JSON.stringify({ methods: Object.getOwnPropertyNames(DOMManipulator).filter((m) => typeof (DOMManipulator as unknown as Record<string, unknown>)[m as string] === "function").length }, null, 2);
  }
}

export function createDOMManipulator(): typeof DOMManipulator {
  return DOMManipulator;
}

export class EventBinder {
  private bindings: Map<string, Array<{ element: EventTarget; event: string; handler: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }>> = new Map();

  on(element: EventTarget, event: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): this {
    const key = `${event}_${element instanceof Element ? element.tagName : "window"}`;
    if (!this.bindings.has(key)) {
      this.bindings.set(key, []);
    }
    this.bindings.get(key)!.push({ element, event, handler, options });
    element.addEventListener(event, handler, options);
    return this;
  }

  off(element: EventTarget, event: string, handler: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): this {
    element.removeEventListener(event, handler, options);
    const key = `${event}_${element instanceof Element ? element.tagName : "window"}`;
    const bindings = this.bindings.get(key);
    if (bindings) {
      const index = bindings.findIndex((b) => b.element === element && b.handler === handler);
      if (index !== -1) bindings.splice(index, 1);
      if (bindings.length === 0) this.bindings.delete(key);
    }
    return this;
  }

  once(element: EventTarget, event: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): this {
    const onceHandler: EventListener = (e: Event) => {
      (handler as EventListener)(e);
      this.off(element, event, onceHandler as EventListenerOrEventListenerObject);
    };
    return this.on(element, event, onceHandler as EventListenerOrEventListenerObject, { ...(options as object), once: true });
  }

  delegate(element: Element, selector: string, event: string, handler: (target: Element, event: Event) => void): this {
    const delegateHandler: EventListener = (e: Event) => {
      const target = e.target as Element;
      const matched = target.closest(selector);
      if (matched && element.contains(matched)) {
        handler(matched, e);
      }
    };
    return this.on(element, event, delegateHandler);
  }

  trigger(element: EventTarget, event: string, data?: unknown): this {
    const customEvent = new CustomEvent(event, { detail: data, bubbles: true, cancelable: true });
    element.dispatchEvent(customEvent);
    return this;
  }

  triggerNative(element: EventTarget, event: string): this {
    const nativeEvent = new Event(event, { bubbles: true, cancelable: true });
    element.dispatchEvent(nativeEvent);
    return this;
  }

  click(element: HTMLElement): this {
    return this.triggerNative(element, "click");
  }

  focus(element: HTMLElement): this {
    return this.triggerNative(element, "focus");
  }

  blur(element: HTMLElement): this {
    return this.triggerNative(element, "blur");
  }

  input(element: HTMLInputElement): this {
    return this.triggerNative(element, "input");
  }

  change(element: HTMLElement): this {
    return this.triggerNative(element, "change");
  }

  submit(form: HTMLFormElement): this {
    return this.triggerNative(form, "submit");
  }

  reset(form: HTMLFormElement): this {
    return this.triggerNative(form, "reset");
  }

  select(element: HTMLInputElement | HTMLTextAreaElement): this {
    return this.triggerNative(element, "select");
  }

  hover(element: HTMLElement): this {
    this.triggerNative(element, "mouseenter");
    this.triggerNative(element, "mouseover");
    return this;
  }

  unhover(element: HTMLElement): this {
    this.triggerNative(element, "mouseleave");
    this.triggerNative(element, "mouseout");
    return this;
  }

  keypress(element: HTMLElement, key: string): this {
    const event = new KeyboardEvent("keypress", { key, bubbles: true });
    element.dispatchEvent(event);
    return this;
  }

  keydown(element: HTMLElement, key: string): this {
    const event = new KeyboardEvent("keydown", { key, bubbles: true });
    element.dispatchEvent(event);
    return this;
  }

  keyup(element: HTMLElement, key: string): this {
    const event = new KeyboardEvent("keyup", { key, bubbles: true });
    element.dispatchEvent(event);
    return this;
  }

  scrollIntoView2(element: HTMLElement): this {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    return this;
  }

  scrollTo(element: HTMLElement, x: number, y: number): this {
    element.scrollTo(x, y);
    return this;
  }

  scrollToTop2(element: HTMLElement): this {
    element.scrollTo({ top: 0, behavior: "smooth" });
    return this;
  }

  scrollToBottom2(element: HTMLElement): this {
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    return this;
  }

  scrollToStart(element: HTMLElement): this {
    element.scrollTo({ left: 0, behavior: "smooth" });
    return this;
  }

  scrollToEnd(element: HTMLElement): this {
    element.scrollTo({ left: element.scrollWidth, behavior: "smooth" });
    return this;
  }

  getBindingCount(): number {
    let count = 0;
    for (const bindings of this.bindings.values()) {
      count += bindings.length;
    }
    return count;
  }

  getBindings(): Array<{ event: string; element: EventTarget }> {
    const result: Array<{ event: string; element: EventTarget }> = [];
    for (const bindings of this.bindings.values()) {
      for (const binding of bindings) {
        result.push({ event: binding.event, element: binding.element });
      }
    }
    return result;
  }

  clear(): this {
    for (const bindings of this.bindings.values()) {
      for (const { element, event, handler, options } of bindings) {
        element.removeEventListener(event, handler, options);
      }
    }
    this.bindings.clear();
    return this;
  }

  destroy(): void {
    this.clear();
  }

  toJSON(): string {
    return JSON.stringify({ bindings: this.getBindingCount() }, null, 2);
  }
}

export function createEventBinder(): EventBinder {
  return new EventBinder();
}

export class DragDropManager {
  private dragging: HTMLElement | null = null;
  private dragData: unknown = null;
  private dragHandle: HTMLElement | null = null;
  private ghost: HTMLElement | null = null;
  private offset: { x: number; y: number } = { x: 0, y: 0 };
  private position: { x: number; y: number } = { x: 0, y: 0 };
  private draggables: Set<HTMLElement> = new Set();
  private dropZones: Set<HTMLElement> = new Set();
  private handlers: Map<string, Set<(event: DragEvent) => void>> = new Map();
  private isDragging: boolean = false;

  makeDraggable(element: HTMLElement, options: { handle?: HTMLElement; data?: unknown; ghost?: boolean; axis?: "x" | "y" | "both"; bounds?: HTMLElement; onStart?: (event: DragEvent) => void; onDrag?: (event: DragEvent) => void; onEnd?: (event: DragEvent) => void; onDrop?: (target: HTMLElement, data: unknown) => void } = {}): () => void {
    this.draggables.add(element);
    const handle = options.handle ?? element;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.dragging = element;
      this.dragData = options.data;
      this.dragHandle = handle;
      this.offset = { x: e.clientX - element.getBoundingClientRect().left, y: e.clientY - element.getBoundingClientRect().top };
      this.position = { x: e.clientX, y: e.clientY };
      this.isDragging = true;
      if (options.onStart) {
        const dragEvent = this.createDragEvent("dragstart", e);
        options.onStart(dragEvent);
      }
      if (options.ghost) {
        this.ghost = element.cloneNode(true) as HTMLElement;
        this.ghost.style.position = "fixed";
        this.ghost.style.pointerEvents = "none";
        this.ghost.style.opacity = "0.7";
        this.ghost.style.zIndex = "9999";
        this.ghost.style.left = `${e.clientX - this.offset.x}px`;
        this.ghost.style.top = `${e.clientY - this.offset.y}px`;
        document.body.appendChild(this.ghost);
      }
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging || !this.dragging) return;
      this.position = { x: e.clientX, y: e.clientY };
      let newX = e.clientX - this.offset.x;
      let newY = e.clientY - this.offset.y;
      if (options.axis === "x") newY = parseFloat(this.dragging.style.top) || this.dragging.getBoundingClientRect().top;
      if (options.axis === "y") newX = parseFloat(this.dragging.style.left) || this.dragging.getBoundingClientRect().left;
      if (options.bounds) {
        const bounds = options.bounds.getBoundingClientRect();
        const dragRect = this.dragging.getBoundingClientRect();
        newX = Math.max(bounds.left, Math.min(newX, bounds.right - dragRect.width));
        newY = Math.max(bounds.top, Math.min(newY, bounds.bottom - dragRect.height));
      }
      if (this.ghost) {
        this.ghost.style.left = `${newX}px`;
        this.ghost.style.top = `${newY}px`;
      } else {
        this.dragging.style.position = "fixed";
        this.dragging.style.left = `${newX}px`;
        this.dragging.style.top = `${newY}px`;
      }
      if (options.onDrag) {
        const dragEvent = this.createDragEvent("drag", e);
        options.onDrag(dragEvent);
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!this.isDragging || !this.dragging) return;
      this.isDragging = false;
      let droppedOn: HTMLElement | null = null;
      for (const zone of this.dropZones) {
        const rect = zone.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          droppedOn = zone;
          break;
        }
      }
      if (droppedOn && options.onDrop) {
        options.onDrop(droppedOn, this.dragData);
      }
      if (this.ghost) {
        this.ghost.remove();
        this.ghost = null;
      }
      if (options.onEnd) {
        const dragEvent = this.createDragEvent("dragend", e);
        options.onEnd(dragEvent);
      }
      this.dragging = null;
      this.dragData = null;
      this.dragHandle = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    handle.addEventListener("mousedown", onMouseDown);
    return () => {
      handle.removeEventListener("mousedown", onMouseDown);
      this.draggables.delete(element);
    };
  }

  makeDropZone(element: HTMLElement, options: { onEnter?: (event: DragEvent) => void; onLeave?: (event: DragEvent) => void; onOver?: (event: DragEvent) => void; onDrop?: (data: unknown, event: DragEvent) => void } = {}): () => void {
    this.dropZones.add(element);
    const onDragEnter = (e: DragEvent) => {
      if (options.onEnter) options.onEnter(e);
      element.classList.add("drag-over");
    };
    const onDragLeave = (e: DragEvent) => {
      if (options.onLeave) options.onLeave(e);
      element.classList.remove("drag-over");
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (options.onOver) options.onOver(e);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      element.classList.remove("drag-over");
      if (options.onDrop) options.onDrop(this.dragData, e);
    };
    element.addEventListener("dragenter", onDragEnter);
    element.addEventListener("dragleave", onDragLeave);
    element.addEventListener("dragover", onDragOver);
    element.addEventListener("drop", onDrop);
    return () => {
      element.removeEventListener("dragenter", onDragEnter);
      element.removeEventListener("dragleave", onDragLeave);
      element.removeEventListener("dragover", onDragOver);
      element.removeEventListener("drop", onDrop);
      this.dropZones.delete(element);
    };
  }

  on(event: string, handler: (event: DragEvent) => void): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler?: (event: DragEvent) => void): void {
    if (handler) {
      this.handlers.get(event)?.delete(handler);
    } else {
      this.handlers.delete(event);
    }
  }

  isDraggingCheck(): boolean {
    return this.isDragging;
  }

  getDragging(): HTMLElement | null {
    return this.dragging;
  }

  getDragData(): unknown {
    return this.dragData;
  }

  getDraggables(): HTMLElement[] {
    return [...this.draggables];
  }

  getDropZones(): HTMLElement[] {
    return [...this.dropZones];
  }

  getDraggableCount(): number {
    return this.draggables.size;
  }

  getDropZoneCount(): number {
    return this.dropZones.size;
  }

  clear(): void {
    this.draggables.clear();
    this.dropZones.clear();
    this.handlers.clear();
    this.dragging = null;
    this.dragData = null;
    this.dragHandle = null;
    if (this.ghost) {
      this.ghost.remove();
      this.ghost = null;
    }
    this.isDragging = false;
  }

  private createDragEvent(type: string, source: MouseEvent): DragEvent {
    return new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: source.clientX,
      clientY: source.clientY,
      screenX: source.screenX,
      screenY: source.screenY,
      dataTransfer: new DataTransfer(),
    });
  }

  toJSON(): string {
    return JSON.stringify({
      draggables: this.draggables.size,
      dropZones: this.dropZones.size,
      isDragging: this.isDragging,
    }, null, 2);
  }
}

export function createDragDropManager(): DragDropManager {
  return new DragDropManager();
}

export class ObserverManager {
  private intersectionObservers: Map<string, IntersectionObserver> = new Map();
  private resizeObservers: Map<string, ResizeObserver> = new Map();
  private mutationObservers: Map<string, MutationObserver> = new Map();
  private performanceObservers: Map<string, PerformanceObserver> = new Map();

  createIntersectionObserver(name: string, callback: IntersectionObserverCallback, options: IntersectionObserverInit = { threshold: 0.1 }): IntersectionObserver {
    const observer = new IntersectionObserver(callback, options);
    this.intersectionObservers.set(name, observer);
    return observer;
  }

  observeIntersection(name: string, element: Element): void {
    this.intersectionObservers.get(name)?.observe(element);
  }

  unobserveIntersection(name: string, element: Element): void {
    this.intersectionObservers.get(name)?.unobserve(element);
  }

  disconnectIntersection(name: string): void {
    this.intersectionObservers.get(name)?.disconnect();
    this.intersectionObservers.delete(name);
  }

  createResizeObserver(name: string, callback: ResizeObserverCallback): ResizeObserver {
    const observer = new ResizeObserver(callback);
    this.resizeObservers.set(name, observer);
    return observer;
  }

  observeResize(name: string, element: Element): void {
    this.resizeObservers.get(name)?.observe(element);
  }

  unobserveResize(name: string, element: Element): void {
    this.resizeObservers.get(name)?.unobserve(element);
  }

  disconnectResize(name: string): void {
    this.resizeObservers.get(name)?.disconnect();
    this.resizeObservers.delete(name);
  }

  createMutationObserver(name: string, callback: MutationCallback, options: MutationObserverInit = { childList: true, subtree: true }): MutationObserver {
    const observer = new MutationObserver(callback);
    this.mutationObservers.set(name, observer);
    return observer;
  }

  observeMutation(name: string, element: Element, options?: MutationObserverInit): void {
    this.mutationObservers.get(name)?.observe(element, options ?? { childList: true, subtree: true });
  }

  disconnectMutation(name: string): void {
    this.mutationObservers.get(name)?.disconnect();
    this.mutationObservers.delete(name);
  }

  createPerformanceObserver(name: string, callback: PerformanceObserverCallback, entryTypes: string[]): PerformanceObserver {
    const observer = new PerformanceObserver(callback);
    observer.observe({ entryTypes });
    this.performanceObservers.set(name, observer);
    return observer;
  }

  disconnectPerformance(name: string): void {
    this.performanceObservers.get(name)?.disconnect();
    this.performanceObservers.delete(name);
  }

  disconnectAll(): void {
    for (const observer of this.intersectionObservers.values()) observer.disconnect();
    for (const observer of this.resizeObservers.values()) observer.disconnect();
    for (const observer of this.mutationObservers.values()) observer.disconnect();
    for (const observer of this.performanceObservers.values()) observer.disconnect();
    this.intersectionObservers.clear();
    this.resizeObservers.clear();
    this.mutationObservers.clear();
    this.performanceObservers.clear();
  }

  getObserverCount(): number {
    return this.intersectionObservers.size + this.resizeObservers.size + this.mutationObservers.size + this.performanceObservers.size;
  }

  getIntersectionObserverCount(): number {
    return this.intersectionObservers.size;
  }

  getResizeObserverCount(): number {
    return this.resizeObservers.size;
  }

  getMutationObserverCount(): number {
    return this.mutationObservers.size;
  }

  getPerformanceObserverCount(): number {
    return this.performanceObservers.size;
  }

  hasObserver(name: string): boolean {
    return this.intersectionObservers.has(name) || this.resizeObservers.has(name) || this.mutationObservers.has(name) || this.performanceObservers.has(name);
  }

  getObserverNames(): string[] {
    return [...new Set([...this.intersectionObservers.keys(), ...this.resizeObservers.keys(), ...this.mutationObservers.keys(), ...this.performanceObservers.keys()])];
  }

  toJSON(): string {
    return JSON.stringify({
      intersection: this.intersectionObservers.size,
      resize: this.resizeObservers.size,
      mutation: this.mutationObservers.size,
      performance: this.performanceObservers.size,
      total: this.getObserverCount(),
    }, null, 2);
  }
}

export function createObserverManager(): ObserverManager {
  return new ObserverManager();
}
