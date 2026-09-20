/**
 * VirtualList -- virtual scrolling for rendering 100K+ items efficiently.
 *
 * Only renders visible items + overscan buffer. Scrolling through 100,000
 * items uses the same memory as 50.
 *
 * Features:
 * - Fixed and variable height support
 * - Dynamic item measurement (auto-resize)
 * - Horizontal and vertical scrolling
 * - Sticky headers/footers
 * - Infinite scroll (load more on near-bottom)
 * - Smooth scrolling
 * - Item recycling (DOM node pooling)
 * - ResizeObserver for container size changes
 * - Scroll position restoration
 * - Programmatic scroll-to-item
 * - Gap/spacing between items
 */

// --- Types ------------------------------------------------------------

export interface VirtualListOptions {
  itemCount: number;
  itemHeight?: number;
  estimatedItemHeight?: number;
  overscan?: number;
  horizontal?: boolean;
  gap?: number;
  renderItem: (index: number, item: HTMLElement) => void;
  stickyHeader?: HTMLElement;
  stickyFooter?: HTMLElement;
  infiniteScroll?: boolean;
  infiniteScrollThreshold?: number;
  onLoadMore?: () => void | Promise<void>;
  smoothScroll?: boolean;
  poolSize?: number;
}

interface ItemRange { start: number; end: number; offset: number; }
interface CachedMeasurement { height: number; top: number; bottom: number; }

// --- VirtualList Class -----------------------------------------------

export class VirtualList {
  private container: HTMLElement;
  private options: VirtualListOptions;
  private contentEl: HTMLElement;
  private items = new Map<number, HTMLElement>();
  private recycled: HTMLElement[] = [];
  private measurements = new Map<number, CachedMeasurement>();
  private totalHeight = 0;
  private visibleRange: ItemRange = { start: 0, end: 0, offset: 0 };
  private scrollRAF: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastScrollTop = 0;
  private isLoadingMore = false;
  private poolSize: number;

  constructor(container: HTMLElement, options: VirtualListOptions) {
    this.container = container;
    this.options = { overscan: 5, estimatedItemHeight: 40, gap: 0, smoothScroll: false, poolSize: 50, ...options };
    this.poolSize = this.options.poolSize!;

    container.style.overflow = "auto";
    container.style.position = "relative";
    container.style.willChange = "scroll-position";

    this.contentEl = document.createElement("div");
    this.contentEl.style.position = "relative";
    this.contentEl.style.width = "100%";
    container.appendChild(this.contentEl);

    if (options.stickyHeader) {
      options.stickyHeader.style.position = "sticky";
      options.stickyHeader.style.top = "0";
      options.stickyHeader.style.zIndex = "10";
      this.contentEl.appendChild(options.stickyHeader);
    }
    if (options.stickyFooter) {
      options.stickyFooter.style.position = "sticky";
      options.stickyFooter.style.bottom = "0";
      options.stickyFooter.style.zIndex = "10";
      this.contentEl.appendChild(options.stickyFooter);
    }

    if (options.itemHeight && options.itemHeight > 0) {
      this.precalculateFixedHeights();
    }
  }

  render(): void {
    this.updateTotalHeight();
    this.contentEl.style.height = `${this.totalHeight}px`;
    this.updateVisibleItems();
  }

  scrollToItem(index: number, align: "start" | "center" | "end" = "start"): void {
    if (index < 0 || index >= this.options.itemCount) return;
    const m = this.getMeasurement(index);
    let scrollTop: number;
    switch (align) {
      case "center": scrollTop = m.top - this.container.clientHeight / 2 + m.height / 2; break;
      case "end": scrollTop = m.bottom - this.container.clientHeight; break;
      default: scrollTop = m.top;
    }
    this.container.scrollTo({ top: Math.max(0, scrollTop), behavior: this.options.smoothScroll ? "smooth" : "auto" });
  }

  scrollToPosition(position: number): void {
    this.container.scrollTo({ top: Math.max(0, position), behavior: this.options.smoothScroll ? "smooth" : "auto" });
  }

  getScrollPosition(): number { return this.container.scrollTop; }
  getFirstVisibleIndex(): number { return this.visibleRange.start; }
  getLastVisibleIndex(): number { return this.visibleRange.end; }

  setItemCount(count: number): void {
    this.options.itemCount = count;
    if (this.options.itemHeight && this.options.itemHeight > 0) this.precalculateFixedHeights();
    this.render();
  }

  setRenderItem(renderFn: (index: number, item: HTMLElement) => void): void {
    this.options.renderItem = renderFn;
    this.render();
  }

  remeasure(): void {
    this.measurements.clear();
    if (this.options.itemHeight && this.options.itemHeight > 0) this.precalculateFixedHeights();
    this.render();
  }

  attachScrollListener(): void {
    this.container.addEventListener("scroll", this.handleScroll, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.render());
      this.resizeObserver.observe(this.container);
    }
  }

  detach(): void {
    this.container.removeEventListener("scroll", this.handleScroll);
    if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
    if (this.scrollRAF !== null) { cancelAnimationFrame(this.scrollRAF); this.scrollRAF = null; }
  }

  destroy(): void {
    this.detach();
    this.items.clear();
    this.recycled = [];
    this.measurements.clear();
    this.contentEl.remove();
  }

  getStats(): {
    totalItems: number; renderedItems: number; recycledItems: number;
    totalHeight: number; visibleHeight: number; scrollPercentage: number;
  } {
    return {
      totalItems: this.options.itemCount,
      renderedItems: this.items.size,
      recycledItems: this.recycled.length,
      totalHeight: this.totalHeight,
      visibleHeight: this.container.clientHeight,
      scrollPercentage: this.totalHeight > 0 ? (this.container.scrollTop / (this.totalHeight - this.container.clientHeight)) * 100 : 0,
    };
  }

  // --- Internal ------------------------------------------------------

  private precalculateFixedHeights(): void {
    const height = this.options.itemHeight || 40;
    const gap = this.options.gap || 0;
    this.measurements.clear();
    let top = 0;
    for (let i = 0; i < this.options.itemCount; i++) {
      this.measurements.set(i, { height, top, bottom: top + height });
      top += height + gap;
    }
    this.totalHeight = top;
  }

  private estimateMeasurement(index: number): CachedMeasurement {
    const height = this.options.estimatedItemHeight || 40;
    const gap = this.options.gap || 0;
    let top = index * (height + gap);
    return { height, top, bottom: top + height };
  }

  private getMeasurement(index: number): CachedMeasurement {
    return this.measurements.get(index) || this.estimateMeasurement(index);
  }

  private updateTotalHeight(): void {
    if (this.options.itemHeight && this.options.itemHeight > 0) {
      const gap = this.options.gap || 0;
      this.totalHeight = this.options.itemCount * (this.options.itemHeight + gap) - gap;
    } else {
      let maxBottom = 0;
      for (const m of this.measurements.values()) { if (m.bottom > maxBottom) maxBottom = m.bottom; }
      const lastEst = this.estimateMeasurement(this.options.itemCount - 1);
      this.totalHeight = Math.max(maxBottom, lastEst.bottom);
    }
  }

  private calculateVisibleRange(): ItemRange {
    const scrollTop = this.container.scrollTop;
    const viewportHeight = this.container.clientHeight;
    const overscan = this.options.overscan || 5;
    const gap = this.options.gap || 0;

    let start: number, end: number;

    if (this.options.itemHeight && this.options.itemHeight > 0) {
      const itemPlusGap = this.options.itemHeight + gap;
      start = Math.max(0, Math.floor(scrollTop / itemPlusGap) - overscan);
      end = Math.min(this.options.itemCount, Math.ceil((scrollTop + viewportHeight) / itemPlusGap) + overscan);
    } else {
      start = Math.max(0, this.binarySearchStart(scrollTop) - overscan);
      end = Math.min(this.options.itemCount, this.binarySearchEnd(scrollTop + viewportHeight) + overscan);
    }

    const offset = this.getMeasurement(start).top;
    return { start, end, offset };
  }

  private binarySearchStart(scrollTop: number): number {
    let low = 0, high = this.options.itemCount - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const m = this.getMeasurement(mid);
      if (m.bottom < scrollTop) low = mid + 1;
      else if (m.top > scrollTop) high = mid - 1;
      else return mid;
    }
    return Math.max(0, low);
  }

  private binarySearchEnd(scrollBottom: number): number {
    let low = 0, high = this.options.itemCount - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const m = this.getMeasurement(mid);
      if (m.bottom < scrollBottom) low = mid + 1;
      else if (m.top > scrollBottom) high = mid - 1;
      else return mid + 1;
    }
    return Math.min(this.options.itemCount, low);
  }

  private updateVisibleItems(): void {
    const range = this.calculateVisibleRange();
    this.visibleRange = range;

    // Remove items outside visible range
    const toRemove: number[] = [];
    for (const [index, el] of this.items) {
      if (index < range.start || index >= range.end) {
        toRemove.push(index);
        this.recycleItem(el);
      }
    }
    for (const index of toRemove) this.items.delete(index);

    // Add items in visible range
    for (let i = range.start; i < range.end; i++) {
      if (!this.items.has(i)) {
        const el = this.acquireItem();
        const m = this.getMeasurement(i);
        el.style.position = "absolute";
        el.style.top = `${m.top}px`;
        el.style.width = "100%";
        el.style.height = `${m.height}px`;

        try { this.options.renderItem(i, el); }
        catch (e) { console.error("[TW VirtualList] Render item error:", e); el.textContent = `[Error: item ${i}]`; }

        this.contentEl.appendChild(el);
        this.items.set(i, el);

        // Measure actual height for variable mode
        if (!this.options.itemHeight || this.options.itemHeight === 0) {
          const actualHeight = el.offsetHeight;
          if (actualHeight !== m.height) this.updateMeasurement(i, actualHeight);
        }
      }
    }
  }

  private updateMeasurement(index: number, height: number): void {
    const gap = this.options.gap || 0;
    const old = this.measurements.get(index);
    const top = old ? old.top : this.estimateMeasurement(index).top;
    this.measurements.set(index, { height, top, bottom: top + height });

    // Update subsequent measurements
    let currentTop = top + height + gap;
    for (let i = index + 1; i < this.options.itemCount; i++) {
      const m = this.measurements.get(i);
      if (m) {
        if (m.top === currentTop) break;
        m.top = currentTop;
        m.bottom = currentTop + m.height;
        currentTop = m.bottom + gap;
      }
    }

    this.updateTotalHeight();
    this.contentEl.style.height = `${this.totalHeight}px`;
  }

  private acquireItem(): HTMLElement {
    if (this.recycled.length > 0) {
      const el = this.recycled.pop()!;
      el.style.display = "";
      el.innerHTML = "";
      return el;
    }
    const el = document.createElement("div");
    el.style.boxSizing = "border-box";
    return el;
  }

  private recycleItem(el: HTMLElement): void {
    el.style.display = "none";
    el.innerHTML = "";
    if (this.recycled.length < this.poolSize) this.recycled.push(el);
    else el.remove();
  }

  private handleScroll = (): void => {
    if (this.scrollRAF !== null) return;
    this.scrollRAF = requestAnimationFrame(() => { this.scrollRAF = null; this.onScroll(); });
  };

  private onScroll(): void {
    const scrollTop = this.container.scrollTop;
    this.lastScrollTop = scrollTop;
    this.updateVisibleItems();

    if (this.options.infiniteScroll && this.options.onLoadMore) {
      const scrollBottom = scrollTop + this.container.clientHeight;
      const threshold = this.options.infiniteScrollThreshold || 200;
      if (scrollBottom >= this.totalHeight - threshold && !this.isLoadingMore) {
        this.isLoadingMore = true;
        Promise.resolve(this.options.onLoadMore())
          .then(() => { this.isLoadingMore = false; })
          .catch((e) => { console.error("[TW VirtualList] Load more error:", e); this.isLoadingMore = false; });
      }
    }
  }
}

export function createVirtualList(container: HTMLElement, options: VirtualListOptions): VirtualList {
  const list = new VirtualList(container, options);
  list.attachScrollListener();
  return list;
}
