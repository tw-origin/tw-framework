/**
 * Lazy loader -- deferred loading of components, images, and modules.
 * @module runtime/utils
 */

export interface LazyLoadOptions {
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
  once?: boolean;
  delay?: number;
  placeholder?: unknown;
  fallback?: unknown;
  retry?: number;
  retryDelay?: number;
}

export interface LazyLoadResult<T> {
  loaded: boolean;
  loading: boolean;
  error: Error | null;
  data: T | null;
  reload: () => Promise<void>;
}

export class LazyLoader {
  private observers: Map<string, IntersectionObserver> = new Map();
  private loadedElements: Set<Element> = new Set();
  private defaultOptions: LazyLoadOptions;

  constructor(defaultOptions: LazyLoadOptions = {}) {
    this.defaultOptions = {
      root: defaultOptions.root ?? null,
      rootMargin: defaultOptions.rootMargin ?? "0px",
      threshold: defaultOptions.threshold ?? 0.1,
      once: defaultOptions.once ?? true,
      delay: defaultOptions.delay ?? 0,
      retry: defaultOptions.retry ?? 0,
      retryDelay: defaultOptions.retryDelay ?? 1000,
    };
  }

  observe(element: Element, callback: (entry: IntersectionObserverEntry) => void, options?: LazyLoadOptions): () => void {
    const opts = { ...this.defaultOptions, ...options };
    const observerKey = `${opts.root?.tagName ?? "document"}_${opts.rootMargin}_${JSON.stringify(opts.threshold)}`;
    let observer = this.observers.get(observerKey);
    if (!observer) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          callback(entry);
          if (opts.once && entry.isIntersecting) {
            this.loadedElements.add(entry.target);
          }
        }
      }, { root: opts.root, rootMargin: opts.rootMargin, threshold: opts.threshold });
      this.observers.set(observerKey, observer);
    }
    observer.observe(element);
    return () => {
      observer?.unobserve(element);
    };
  }

  unobserve(element: Element): void {
    for (const observer of this.observers.values()) {
      observer.unobserve(element);
    }
    this.loadedElements.delete(element);
  }

  isLoaded(element: Element): boolean {
    return this.loadedElements.has(element);
  }

  loadImage(src: string, options?: { srcset?: string; sizes?: string; alt?: string; crossOrigin?: string }): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (options?.crossOrigin) img.crossOrigin = options.crossOrigin;
      if (options?.srcset) img.srcset = options.srcset;
      if (options?.sizes) img.sizes = options.sizes;
      if (options?.alt) img.alt = options.alt;
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  lazyLoadImage(element: HTMLImageElement, src: string, options?: LazyLoadOptions): () => void {
    return this.observe(element, (entry) => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        const tempImg = new Image();
        tempImg.onload = () => {
          img.src = src;
          if (options?.delay) {
            setTimeout(() => { img.src = src; }, options.delay);
          } else {
            img.src = src;
          }
        };
        tempImg.src = src;
      }
    }, options);
  }

  lazyLoadComponent<T>(loader: () => Promise<T>, options?: LazyLoadOptions & { element?: Element }): Promise<T> {
    if (options?.element) {
      return new Promise((resolve, reject) => {
        this.observe(options.element!, (entry) => {
          if (entry.isIntersecting) {
            loader().then(resolve).catch(reject);
          }
        }, options);
      });
    }
    return loader();
  }

  async lazyLoadModule<T>(loader: () => Promise<{ default: T } | T>): Promise<T> {
    const module = await loader();
    return module instanceof Promise ? (module as unknown as T) : (module as { default: T }).default ?? (module as T);
  }

  async lazyLoadWithRetry<T>(loader: () => Promise<T>, options: { retry?: number; retryDelay?: number } = {}): Promise<T> {
    const { retry = 3, retryDelay = 1000 } = options;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retry; attempt++) {
      try {
        return await loader();
      } catch (error) {
        lastError = error as Error;
        if (attempt < retry) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  disconnect(): void {
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();
    this.loadedElements.clear();
  }

  getObservedCount(): number {
    let count = 0;
    for (const observer of this.observers.values()) {
      count += (observer as unknown as { _observationTargets?: unknown[] })._observationTargets?.length ?? 0;
    }
    return count;
  }

  getLoadedCount(): number {
    return this.loadedElements.size;
  }

  getObserverCount(): number {
    return this.observers.size;
  }
}

export function createLazyLoader(options?: LazyLoadOptions): LazyLoader {
  return new LazyLoader(options);
}

export class VirtualScroller {
  private container: HTMLElement;
  private items: unknown[] = [];
  private itemHeight: number = 50;
  private visibleCount: number = 0;
  private scrollTop: number = 0;
  private startIndex: number = 0;
  private endIndex: number = 0;
  private renderCallback: ((items: unknown[], startIndex: number, endIndex: number) => void) | null = null;
  private scrollHandler: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private bufferSize: number = 5;
  private totalHeight: number = 0;
  private offsetY: number = 0;

  constructor(container: HTMLElement, options: { itemHeight?: number; bufferSize?: number; render?: (items: unknown[], startIndex: number, endIndex: number) => void } = {}) {
    this.container = container;
    this.itemHeight = options.itemHeight ?? 50;
    this.bufferSize = options.bufferSize ?? 5;
    this.renderCallback = options.render ?? null;
    this.setup();
  }

  private setup(): void {
    this.container.style.overflowY = "auto";
    this.container.style.position = "relative";
    this.scrollHandler = () => this.onScroll();
    this.container.addEventListener("scroll", this.scrollHandler);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.calculateVisible());
      this.resizeObserver.observe(this.container);
    }
    this.calculateVisible();
  }

  setItems(items: unknown[]): void {
    this.items = items;
    this.totalHeight = items.length * this.itemHeight;
    this.calculateVisible();
  }

  getItems(): unknown[] {
    return this.items;
  }

  setItemHeight(height: number): void {
    this.itemHeight = height;
    this.totalHeight = this.items.length * this.itemHeight;
    this.calculateVisible();
  }

  getItemHeight(): number {
    return this.itemHeight;
  }

  setBufferSize(size: number): void {
    this.bufferSize = size;
    this.calculateVisible();
  }

  getBufferSize(): number {
    return this.bufferSize;
  }

  setRenderCallback(callback: (items: unknown[], startIndex: number, endIndex: number) => void): void {
    this.renderCallback = callback;
    this.render();
  }

  private onScroll(): void {
    this.scrollTop = this.container.scrollTop;
    this.calculateVisible();
  }

  private calculateVisible(): void {
    const containerHeight = this.container.clientHeight;
    this.visibleCount = Math.ceil(containerHeight / this.itemHeight);
    this.startIndex = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.bufferSize);
    this.endIndex = Math.min(this.items.length, this.startIndex + this.visibleCount + this.bufferSize * 2);
    this.offsetY = this.startIndex * this.itemHeight;
    this.render();
  }

  private render(): void {
    if (this.renderCallback) {
      const visibleItems = this.items.slice(this.startIndex, this.endIndex);
      this.renderCallback(visibleItems, this.startIndex, this.endIndex);
    }
  }

  getStartIndex(): number {
    return this.startIndex;
  }

  getEndIndex(): number {
    return this.endIndex;
  }

  getVisibleCount(): number {
    return this.visibleCount;
  }

  getOffsetY(): number {
    return this.offsetY;
  }

  getTotalHeight(): number {
    return this.totalHeight;
  }

  scrollToIndex(index: number, smooth: boolean = false): void {
    const targetScroll = index * this.itemHeight;
    this.container.scrollTo({ top: targetScroll, behavior: smooth ? "smooth" : "auto" });
  }

  scrollToTop(smooth: boolean = false): void {
    this.container.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  }

  scrollToBottom(smooth: boolean = false): void {
    this.container.scrollTo({ top: this.totalHeight, behavior: smooth ? "smooth" : "auto" });
  }

  getItemIndexAtScrollTop(): number {
    return Math.floor(this.scrollTop / this.itemHeight);
  }

  getItemIndexAtScrollBottom(): number {
    return Math.min(this.items.length - 1, Math.floor((this.scrollTop + this.container.clientHeight) / this.itemHeight));
  }

  isAtTop(): boolean {
    return this.scrollTop === 0;
  }

  isAtBottom(): boolean {
    return this.scrollTop + this.container.clientHeight >= this.totalHeight;
  }

  getScrollPercentage(): number {
    if (this.totalHeight === 0) return 0;
    return (this.scrollTop / (this.totalHeight - this.container.clientHeight)) * 100;
  }

  destroy(): void {
    if (this.scrollHandler) {
      this.container.removeEventListener("scroll", this.scrollHandler);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}

export function createVirtualScroller(container: HTMLElement, options?: { itemHeight?: number; bufferSize?: number; render?: (items: unknown[], startIndex: number, endIndex: number) => void }): VirtualScroller {
  return new VirtualScroller(container, options);
}

export class InfiniteScroller {
  private container: HTMLElement;
  private loading: boolean = false;
  private hasMore: boolean = true;
  private loadMoreCallback: (() => Promise<void>) | null = null;
  private sentinel: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;
  private threshold: number = 100;
  private loadCount: number = 0;

  constructor(container: HTMLElement, loadMore: () => Promise<void>, options: { threshold?: number; rootMargin?: string; sentinel?: HTMLElement } = {}) {
    this.container = container;
    this.loadMoreCallback = loadMore;
    this.threshold = options.threshold ?? 100;
    this.sentinel = options.sentinel ?? null;
    if (!this.sentinel) {
      this.sentinel = document.createElement("div");
      this.sentinel.style.height = "1px";
      this.sentinel.setAttribute("data-infinite-scroll-sentinel", "");
      this.container.appendChild(this.sentinel);
    }
    this.setup();
  }

  private setup(): void {
    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && !this.loading && this.hasMore) {
          this.load();
        }
      }, { root: this.container, rootMargin: `${this.threshold}px` });
      this.observer.observe(this.sentinel!);
    } else {
      this.container.addEventListener("scroll", this.onScroll);
    }
  }

  private onScroll = (): void => {
    if (this.loading || !this.hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = this.container;
    if (scrollHeight - scrollTop - clientHeight < this.threshold) {
      this.load();
    }
  };

  private async load(): Promise<void> {
    this.loading = true;
    try {
      await this.loadMoreCallback?.();
      this.loadCount++;
    } catch (error) {
      console.error("Infinite scroll load error:", error);
    } finally {
      this.loading = false;
    }
  }

  setHasMore(hasMore: boolean): void {
    this.hasMore = hasMore;
    if (!hasMore && this.observer && this.sentinel) {
      this.observer.unobserve(this.sentinel);
    }
  }

  getHasMore(): boolean {
    return this.hasMore;
  }

  isLoading(): boolean {
    return this.loading;
  }

  getLoadCount(): number {
    return this.loadCount;
  }

  reset(): void {
    this.loading = false;
    this.hasMore = true;
    this.loadCount = 0;
    if (this.observer && this.sentinel) {
      this.observer.observe(this.sentinel);
    }
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.container.removeEventListener("scroll", this.onScroll);
    if (this.sentinel && this.sentinel.parentNode) {
      this.sentinel.parentNode.removeChild(this.sentinel);
    }
  }
}

export function createInfiniteScroller(container: HTMLElement, loadMore: () => Promise<void>, options?: { threshold?: number; rootMargin?: string; sentinel?: HTMLElement }): InfiniteScroller {
  return new InfiniteScroller(container, loadMore, options);
}

export class PaginationManager<T> {
  private items: T[] = [];
  private currentPage: number = 1;
  private pageSize: number = 10;
  private maxPages: number = 1;
  private totalItems: number = 0;
  private changeHandlers: Set<(page: number, items: T[]) => void> = new Set();

  constructor(items: T[] = [], pageSize: number = 10) {
    this.items = items;
    this.pageSize = pageSize;
    this.totalItems = items.length;
    this.maxPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
  }

  setItems(items: T[]): void {
    this.items = items;
    this.totalItems = items.length;
    this.maxPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
    if (this.currentPage > this.maxPages) {
      this.currentPage = this.maxPages;
    }
    this.notifyChange();
  }

  getItems(): T[] {
    return this.items;
  }

  setPage(page: number): void {
    const clamped = Math.max(1, Math.min(page, this.maxPages));
    if (clamped !== this.currentPage) {
      this.currentPage = clamped;
      this.notifyChange();
    }
  }

  nextPage(): void {
    this.setPage(this.currentPage + 1);
  }

  prevPage(): void {
    this.setPage(this.currentPage - 1);
  }

  firstPage(): void {
    this.setPage(1);
  }

  lastPage(): void {
    this.setPage(this.maxPages);
  }

  setPageSize(size: number): void {
    this.pageSize = size;
    this.maxPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
    if (this.currentPage > this.maxPages) {
      this.currentPage = this.maxPages;
    }
    this.notifyChange();
  }

  getPageSize(): number {
    return this.pageSize;
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  getMaxPages(): number {
    return this.maxPages;
  }

  getTotalItems(): number {
    return this.totalItems;
  }

  getPageItems(): T[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.items.slice(start, end);
  }

  hasNext(): boolean {
    return this.currentPage < this.maxPages;
  }

  hasPrev(): boolean {
    return this.currentPage > 1;
  }

  isFirstPage(): boolean {
    return this.currentPage === 1;
  }

  isLastPage(): boolean {
    return this.currentPage === this.maxPages;
  }

  getPageRange(range: number = 3): number[] {
    const start = Math.max(1, this.currentPage - range);
    const end = Math.min(this.maxPages, this.currentPage + range);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  getFullPageRange(): number[] {
    const pages: number[] = [];
    for (let i = 1; i <= this.maxPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  getStartIndex(): number {
    return (this.currentPage - 1) * this.pageSize;
  }

  getEndIndex(): number {
    return Math.min(this.getStartIndex() + this.pageSize, this.totalItems);
  }

  onChange(handler: (page: number, items: T[]) => void): () => void {
    this.changeHandlers.add(handler);
    return () => {
      this.changeHandlers.delete(handler);
    };
  }

  private notifyChange(): void {
    const items = this.getPageItems();
    this.changeHandlers.forEach((handler) => handler(this.currentPage, items));
  }

  reset(): void {
    this.currentPage = 1;
    this.notifyChange();
  }

  getStats(): { currentPage: number; maxPages: number; pageSize: number; totalItems: number; startIndex: number; endIndex: number } {
    return {
      currentPage: this.currentPage,
      maxPages: this.maxPages,
      pageSize: this.pageSize,
      totalItems: this.totalItems,
      startIndex: this.getStartIndex() + 1,
      endIndex: this.getEndIndex(),
    };
  }

  goToItem(index: number): void {
    const page = Math.floor(index / this.pageSize) + 1;
    this.setPage(page);
  }

  indexOf(item: T): number {
    return this.items.indexOf(item);
  }

  pageOf(item: T): number {
    const index = this.indexOf(item);
    if (index === -1) return -1;
    return Math.floor(index / this.pageSize) + 1;
  }

  hasItems(): boolean {
    return this.items.length > 0;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.items.filter(predicate);
  }

  map<R>(mapper: (item: T) => R): R[] {
    return this.items.map(mapper);
  }

  reduce<R>(reducer: (acc: R, item: T) => R, initial: R): R {
    return this.items.reduce(reducer, initial);
  }

  find(predicate: (item: T) => boolean): T | undefined {
    return this.items.find(predicate);
  }

  some(predicate: (item: T) => boolean): boolean {
    return this.items.some(predicate);
  }

  every(predicate: (item: T) => boolean): boolean {
    return this.items.every(predicate);
  }

  sort(compare: (a: T, b: T) => number): T[] {
    this.items.sort(compare);
    this.notifyChange();
    return this.items;
  }

  reverse(): T[] {
    this.items.reverse();
    this.notifyChange();
    return this.items;
  }

  add(item: T): void {
    this.items.push(item);
    this.totalItems++;
    this.maxPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
    this.notifyChange();
  }

  addAll(items: T[]): void {
    this.items.push(...items);
    this.totalItems = this.items.length;
    this.maxPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
    this.notifyChange();
  }

  remove(item: T): boolean {
    const index = this.items.indexOf(item);
    if (index !== -1) {
      this.items.splice(index, 1);
      this.totalItems--;
      this.maxPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
      if (this.currentPage > this.maxPages) {
        this.currentPage = this.maxPages;
      }
      this.notifyChange();
      return true;
    }
    return false;
  }

  removeAt(index: number): T | undefined {
    if (index < 0 || index >= this.items.length) return undefined;
    const item = this.items.splice(index, 1)[0];
    this.totalItems--;
    this.maxPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
    if (this.currentPage > this.maxPages) {
      this.currentPage = this.maxPages;
    }
    this.notifyChange();
    return item;
  }

  clear(): void {
    this.items = [];
    this.totalItems = 0;
    this.maxPages = 1;
    this.currentPage = 1;
    this.notifyChange();
  }

  toJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }
}

export function createPaginationManager<T>(items?: T[], pageSize?: number): PaginationManager<T> {
  return new PaginationManager(items, pageSize);
}

export class FocusTrap {
  private container: HTMLElement;
  private firstFocusable: HTMLElement | null = null;
  private lastFocusable: HTMLElement | null = null;
  private previouslyFocused: HTMLElement | null = null;
  private isActive: boolean = false;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  activate(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.previouslyFocused = document.activeElement as HTMLElement;
    this.updateFocusableElements();
    if (this.firstFocusable) {
      this.firstFocusable.focus();
    }
    this.keydownHandler = (e: KeyboardEvent) => this.onKeydown(e);
    this.container.addEventListener("keydown", this.keydownHandler);
  }

  deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.keydownHandler) {
      this.container.removeEventListener("keydown", this.keydownHandler);
    }
    if (this.previouslyFocused) {
      this.previouslyFocused.focus();
    }
  }

  updateFocusableElements(): void {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = this.container.querySelectorAll(selector);
    const visible = [...focusables].filter((el) => {
      const style = window.getComputedStyle(el as HTMLElement);
      return style.display !== "none" && style.visibility !== "hidden" && (el as HTMLElement).offsetWidth > 0;
    }) as HTMLElement[];
    this.firstFocusable = visible[0] ?? null;
    this.lastFocusable = visible[visible.length - 1] ?? null;
  }

  private onKeydown(e: KeyboardEvent): void {
    if (e.key !== "Tab") return;
    this.updateFocusableElements();
    if (!this.firstFocusable || !this.lastFocusable) {
      e.preventDefault();
      return;
    }
    if (e.shiftKey) {
      if (document.activeElement === this.firstFocusable) {
        e.preventDefault();
        this.lastFocusable.focus();
      }
    } else {
      if (document.activeElement === this.lastFocusable) {
        e.preventDefault();
        this.firstFocusable.focus();
      }
    }
  }

  isActiveCheck(): boolean {
    return this.isActive;
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  getFirstFocusable(): HTMLElement | null {
    return this.firstFocusable;
  }

  getLastFocusable(): HTMLElement | null {
    return this.lastFocusable;
  }

  getPreviouslyFocused(): HTMLElement | null {
    return this.previouslyFocused;
  }
}

export function createFocusTrap(container: HTMLElement): FocusTrap {
  return new FocusTrap(container);
}

export class ScrollSpy {
  private sections: Map<string, HTMLElement> = new Map();
  private activeSection: string | null = null;
  private observer: IntersectionObserver | null = null;
  private changeHandlers: Set<(section: string) => void> = new Set();
  private options: { rootMargin?: string; threshold?: number | number[]; root?: Element | null };

  constructor(options: { rootMargin?: string; threshold?: number | number[]; root?: Element | null } = {}) {
    this.options = {
      rootMargin: options.rootMargin ?? "-50% 0px -50% 0px",
      threshold: options.threshold ?? 0,
      root: options.root ?? null,
    };
  }

  register(id: string, element: HTMLElement): () => void {
    this.sections.set(id, element);
    if (!this.observer) {
      this.setupObserver();
    }
    this.observer?.observe(element);
    return () => {
      this.unregister(id);
    };
  }

  unregister(id: string): void {
    const element = this.sections.get(id);
    if (element) {
      this.observer?.unobserve(element);
      this.sections.delete(id);
    }
  }

  private setupObserver(): void {
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = this.findSectionId(entry.target as HTMLElement);
          if (id && id !== this.activeSection) {
            this.activeSection = id;
            this.notifyChange(id);
          }
        }
      }
    }, { root: this.options.root, rootMargin: this.options.rootMargin, threshold: this.options.threshold });
  }

  private findSectionId(element: HTMLElement): string | null {
    for (const [id, el] of this.sections) {
      if (el === element) return id;
    }
    return null;
  }

  getActiveSection(): string | null {
    return this.activeSection;
  }

  onChange(handler: (section: string) => void): () => void {
    this.changeHandlers.add(handler);
    return () => {
      this.changeHandlers.delete(handler);
    };
  }

  private notifyChange(section: string): void {
    this.changeHandlers.forEach((handler) => handler(section));
  }

  getSections(): string[] {
    return [...this.sections.keys()];
  }

  getSectionCount(): number {
    return this.sections.size;
  }

  hasSection(id: string): boolean {
    return this.sections.has(id);
  }

  scrollToSection(id: string, smooth: boolean = true): boolean {
    const element = this.sections.get(id);
    if (!element) return false;
    element.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    return true;
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.sections.clear();
    this.changeHandlers.clear();
  }
}

export function createScrollSpy(options?: { rootMargin?: string; threshold?: number | number[]; root?: Element | null }): ScrollSpy {
  return new ScrollSpy(options);
}

export class HistoryManager {
  private history: string[] = [];
  private currentIndex: number = -1;
  private maxHistory: number = 100;

  constructor(maxHistory: number = 100) {
    this.maxHistory = maxHistory;
  }

  push(url: string): void {
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }
    this.history.push(url);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
  }

  back(): string | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return null;
  }

  forward(): string | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
    return null;
  }

  canGoBack(): boolean {
    return this.currentIndex > 0;
  }

  canGoForward(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  getCurrent(): string | null {
    return this.currentIndex >= 0 ? this.history[this.currentIndex] : null;
  }

  getHistory(): string[] {
    return [...this.history];
  }

  getLength(): number {
    return this.history.length;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  go(n: number): string | null {
    const newIndex = this.currentIndex + n;
    if (newIndex >= 0 && newIndex < this.history.length) {
      this.currentIndex = newIndex;
      return this.history[newIndex];
    }
    return null;
  }

  replace(url: string): void {
    if (this.currentIndex >= 0) {
      this.history[this.currentIndex] = url;
    }
  }

  getMaxHistory(): number {
    return this.maxHistory;
  }

  setMaxHistory(max: number): void {
    this.maxHistory = max;
    while (this.history.length > max) {
      this.history.shift();
      this.currentIndex--;
    }
  }
}

export function createHistoryManager(maxHistory?: number): HistoryManager {
  return new HistoryManager(maxHistory);
}

export class ToastManager {
  private container: HTMLElement | null = null;
  private toasts: Map<string, { id: string; message: string; type: "info" | "success" | "warning" | "error"; duration: number; element?: HTMLElement }> = new Map();
  private maxToasts: number = 5;
  private defaultDuration: number = 3000;

  constructor(options: { container?: HTMLElement; maxToasts?: number; defaultDuration?: number } = {}) {
    this.container = options.container ?? null;
    this.maxToasts = options.maxToasts ?? 5;
    this.defaultDuration = options.defaultDuration ?? 3000;
    if (!this.container && typeof document !== "undefined") {
      this.container = document.createElement("div");
      this.container.style.cssText = "position:fixed;top:20px;right:20px;z-index:99999;pointer-events:none;";
      document.body.appendChild(this.container);
    }
  }

  show(message: string, type: "info" | "success" | "warning" | "error" = "info", duration?: number): string {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const actualDuration = duration ?? this.defaultDuration;
    this.toasts.set(id, { id, message, type, duration: actualDuration });
    this.renderToast(id);
    while (this.toasts.size > this.maxToasts) {
      const firstId = this.toasts.keys().next().value;
      if (firstId) this.dismiss(firstId);
    }
    if (actualDuration > 0) {
      setTimeout(() => this.dismiss(id), actualDuration);
    }
    return id;
  }

  info(message: string, duration?: number): string {
    return this.show(message, "info", duration);
  }

  success(message: string, duration?: number): string {
    return this.show(message, "success", duration);
  }

  warning(message: string, duration?: number): string {
    return this.show(message, "warning", duration);
  }

  error(message: string, duration?: number): string {
    return this.show(message, "error", duration ?? 5000);
  }

  dismiss(id: string): boolean {
    const toast = this.toasts.get(id);
    if (!toast) return false;
    if (toast.element && toast.element.parentNode) {
      toast.element.style.opacity = "0";
      toast.element.style.transform = "translateX(100%)";
      setTimeout(() => {
        toast.element?.parentNode?.removeChild(toast.element);
      }, 300);
    }
    this.toasts.delete(id);
    return true;
  }

  dismissAll(): void {
    for (const id of [...this.toasts.keys()]) {
      this.dismiss(id);
    }
  }

  private renderToast(id: string): void {
    const toast = this.toasts.get(id);
    if (!toast || !this.container) return;
    const colors: Record<string, string> = {
      info: "#2196F3",
      success: "#4CAF50",
      warning: "#FF9800",
      error: "#F44336",
    };
    const element = document.createElement("div");
    element.style.cssText = `background:${colors[toast.type]};color:#fff;padding:12px 20px;border-radius:4px;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,0.2);transition:opacity 300ms,transform 300ms;pointer-events:auto;cursor:pointer;min-width:250px;max-width:400px;font-family:sans-serif;font-size:14px;`;
    element.textContent = toast.message;
    element.onclick = () => this.dismiss(id);
    this.container.appendChild(element);
    toast.element = element;
    requestAnimationFrame(() => {
      element.style.opacity = "1";
    });
  }

  getToastCount(): number {
    return this.toasts.size;
  }

  getMaxToasts(): number {
    return this.maxToasts;
  }

  setMaxToasts(max: number): void {
    this.maxToasts = max;
    while (this.toasts.size > max) {
      const firstId = this.toasts.keys().next().value;
      if (firstId) this.dismiss(firstId);
    }
  }

  getDefaultDuration(): number {
    return this.defaultDuration;
  }

  setDefaultDuration(duration: number): void {
    this.defaultDuration = duration;
  }

  hasToasts(): boolean {
    return this.toasts.size > 0;
  }

  destroy(): void {
    this.dismissAll();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

export function createToastManager(options?: { container?: HTMLElement; maxToasts?: number; defaultDuration?: number }): ToastManager {
  return new ToastManager(options);
}

export class ClipboardManager {
  private history: Array<{ text: string; timestamp: number }> = [];
  private maxHistory: number = 50;

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory;
  }

  async copy(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      this.history.push({ text, timestamp: Date.now() });
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      return true;
    } catch {
      return false;
    }
  }

  async paste(): Promise<string> {
    try {
      if (navigator.clipboard) {
        return await navigator.clipboard.readText();
      }
      return "";
    } catch {
      return "";
    }
  }

  getHistory(): Array<{ text: string; timestamp: number }> {
    return [...this.history];
  }

  getLastCopied(): string | null {
    return this.history.length > 0 ? this.history[this.history.length - 1].text : null;
  }

  clearHistory(): void {
    this.history = [];
  }

  getHistoryCount(): number {
    return this.history.length;
  }

  getMaxHistory(): number {
    return this.maxHistory;
  }

  setMaxHistory(max: number): void {
    this.maxHistory = max;
    while (this.history.length > max) {
      this.history.shift();
    }
  }
}

export function createClipboardManager(maxHistory?: number): ClipboardManager {
  return new ClipboardManager(maxHistory);
}

export class FullscreenManager {
  private element: HTMLElement | null = null;
  private isFullscreen: boolean = false;
  private changeHandlers: Set<(isFullscreen: boolean) => void> = new Set();

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("fullscreenchange", () => {
        this.isFullscreen = !!document.fullscreenElement;
        this.notifyChange();
      });
    }
  }

  async request(element?: HTMLElement): Promise<boolean> {
    try {
      this.element = element ?? document.documentElement;
      await this.element.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  async exit(): Promise<boolean> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      return true;
    } catch {
      return false;
    }
  }

  async toggle(element?: HTMLElement): Promise<boolean> {
    if (this.isFullscreen) {
      return this.exit();
    }
    return this.request(element);
  }

  getIsFullscreen(): boolean {
    return this.isFullscreen;
  }

  getElement(): HTMLElement | null {
    return this.element;
  }

  onChange(handler: (isFullscreen: boolean) => void): () => void {
    this.changeHandlers.add(handler);
    return () => {
      this.changeHandlers.delete(handler);
    };
  }

  private notifyChange(): void {
    this.changeHandlers.forEach((handler) => handler(this.isFullscreen));
  }

  isSupported(): boolean {
    return typeof document !== "undefined" && "requestFullscreen" in document.documentElement;
  }
}

export function createFullscreenManager(): FullscreenManager {
  return new FullscreenManager();
}

export class GeolocationManager {
  private watchId: number | null = null;
  private positionHandlers: Set<(position: GeolocationPosition) => void> = new Set();
  private errorHandlers: Set<(error: GeolocationPositionError) => void> = new Set();

  async getCurrent(options?: PositionOptions): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  watch(options?: PositionOptions): number {
    if (!navigator.geolocation) return -1;
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.notifyPosition(position),
      (error) => this.notifyError(error),
      options,
    );
    return this.watchId;
  }

  clearWatch(): void {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  onPosition(handler: (position: GeolocationPosition) => void): () => void {
    this.positionHandlers.add(handler);
    return () => {
      this.positionHandlers.delete(handler);
    };
  }

  onError(handler: (error: GeolocationPositionError) => void): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  private notifyPosition(position: GeolocationPosition): void {
    this.positionHandlers.forEach((handler) => handler(position));
  }

  private notifyError(error: GeolocationPositionError): void {
    this.errorHandlers.forEach((handler) => handler(error));
  }

  isWatching(): boolean {
    return this.watchId !== null;
  }

  isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.geolocation;
  }
}

export function createGeolocationManager(): GeolocationManager {
  return new GeolocationManager();
}

export class NotificationManager2 {
  private permission: NotificationPermission = "default";
  private notifications: Map<string, Notification> = new Map();

  constructor() {
    if (typeof Notification !== "undefined") {
      this.permission = Notification.permission;
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof Notification === "undefined") return "denied";
    this.permission = await Notification.requestPermission();
    return this.permission;
  }

  show(title: string, options?: NotificationOptions): string | null {
    if (this.permission !== "granted") return null;
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const notification = new Notification(title, options);
    this.notifications.set(id, notification);
    notification.onclose = () => {
      this.notifications.delete(id);
    };
    return id;
  }

  close(id: string): boolean {
    const notification = this.notifications.get(id);
    if (!notification) return false;
    notification.close();
    this.notifications.delete(id);
    return true;
  }

  closeAll(): void {
    for (const notification of this.notifications.values()) {
      notification.close();
    }
    this.notifications.clear();
  }

  getPermission(): NotificationPermission {
    return this.permission;
  }

  isSupported(): boolean {
    return typeof Notification !== "undefined";
  }

  getActiveCount(): number {
    return this.notifications.size;
  }
}

export function createNotificationManager2(): NotificationManager2 {
  return new NotificationManager2();
}
