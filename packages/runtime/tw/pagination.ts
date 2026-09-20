/**
 * Pagination -- pagination logic for large datasets.
 *
 * Features:
 * - Offset-based pagination (page/size)
 * - Cursor-based pagination (for infinite scroll)
 * - Ellipsis computation (smart page range)
 * - Reactive page state
 * - URL sync (query params)
 * - Preloading next page
 * - Jump to page
 * - Items per page change
 */

import { signal, computed, type Signal } from "./dependency-graph";

// --- Types ------------------------------------------------------------

export interface PaginationOptions {
  totalItems: number;
  initialPage?: number;
  initialPageSize?: number;
  pageSizes?: number[];
  siblingCount?: number;
  boundaryCount?: number;
}

export interface PageRange {
  start: number;
  end: number;
}

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  hasPrevious: boolean;
  hasNext: boolean;
  pages: (number | "...")[];
}

export interface CursorPaginationState<T> {
  items: T[];
  hasNext: boolean;
  hasPrevious: boolean;
  nextCursor: string | null;
  previousCursor: string | null;
}

// --- Offset Pagination ----------------------------------------------

class OffsetPagination {
  private currentPage: Signal<number>;
  private pageSize: Signal<number>;
  private totalItems: Signal<number>;
  private siblingCount: number;
  private boundaryCount: number;
  private pageSizes: number[];

  constructor(options: PaginationOptions) {
    this.currentPage = signal(options.initialPage || 1);
    this.pageSize = signal(options.initialPageSize || 10);
    this.totalItems = signal(options.totalItems);
    this.siblingCount = options.siblingCount ?? 1;
    this.boundaryCount = options.boundaryCount ?? 1;
    this.pageSizes = options.pageSizes || [10, 20, 50, 100];
  }

  get state(): PaginationState {
    const page = this.currentPage();
    const size = this.pageSize();
    const total = this.totalItems();
    const totalPages = Math.max(1, Math.ceil(total / size));

    return {
      currentPage: Math.min(page, totalPages),
      pageSize: size,
      totalItems: total,
      totalPages,
      startIndex: total === 0 ? 0 : (page - 1) * size + 1,
      endIndex: Math.min(page * size, total),
      hasPrevious: page > 1,
      hasNext: page < totalPages,
      pages: this.computePages(page, totalPages),
    };
  }

  get currentPageSignal(): Signal<number> { return this.currentPage; }
  get pageSizeSignal(): Signal<number> { return this.pageSize; }
  get totalItemsSignal(): Signal<number> { return this.totalItems; }

  setPage(page: number): void {
    const totalPages = Math.max(1, Math.ceil(this.totalItems.peek() / this.pageSize.peek()));
    this.currentPage.set(Math.max(1, Math.min(page, totalPages)));
  }

  nextPage(): void { this.setPage(this.currentPage.peek() + 1); }
  previousPage(): void { this.setPage(this.currentPage.peek() - 1); }
  firstPage(): void { this.setPage(1); }
  lastPage(): void {
    const totalPages = Math.max(1, Math.ceil(this.totalItems.peek() / this.pageSize.peek()));
    this.setPage(totalPages);
  }

  setPageSize(size: number): void {
    const oldSize = this.pageSize.peek();
    const oldPage = this.currentPage.peek();
    this.pageSize.set(size);
    // Adjust page to show approximately the same items
    const newItem = (oldPage - 1) * oldSize;
    const newPage = Math.floor(newItem / size) + 1;
    this.setPage(newPage);
  }

  setTotalItems(total: number): void {
    this.totalItems.set(total);
    // Clamp current page
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize.peek()));
    if (this.currentPage.peek() > totalPages) {
      this.currentPage.set(totalPages);
    }
  }

  getPageRange(): PageRange {
    const page = this.currentPage.peek();
    const size = this.pageSize.peek();
    return {
      start: (page - 1) * size,
      end: Math.min(page * size, this.totalItems.peek()),
    };
  }

  slice<T>(items: T[]): T[] {
    const { start, end } = this.getPageRange();
    return items.slice(start, end);
  }

  getPageSizes(): number[] { return this.pageSizes; }

  private computePages(currentPage: number, totalPages: number): (number | "...")[] {
    if (totalPages <= 1) return [1];

    const pages: (number | "...")[] = [];
    const sibling = this.siblingCount;
    const boundary = this.boundaryCount;

    // Left boundary
    for (let i = 1; i <= Math.min(boundary, totalPages); i++) {
      pages.push(i);
    }

    // Left sibling + ellipsis
    const leftSiblingStart = Math.max(boundary + 1, currentPage - sibling);
    if (leftSiblingStart > boundary + 1) {
      pages.push("...");
    }
    for (let i = Math.max(boundary + 1, leftSiblingStart); i < currentPage; i++) {
      if (!pages.includes(i)) pages.push(i);
    }

    // Current page
    if (!pages.includes(currentPage)) {
      pages.push(currentPage);
    }

    // Right sibling + ellipsis
    const rightSiblingEnd = Math.min(totalPages - boundary, currentPage + sibling);
    for (let i = currentPage + 1; i <= rightSiblingEnd; i++) {
      if (!pages.includes(i)) pages.push(i);
    }
    if (rightSiblingEnd < totalPages - boundary) {
      pages.push("...");
    }

    // Right boundary
    for (let i = Math.max(totalPages - boundary + 1, rightSiblingEnd + 1); i <= totalPages; i++) {
      if (!pages.includes(i)) pages.push(i);
    }

    return pages;
  }
}

// --- Cursor Pagination ----------------------------------------------

class CursorPagination<T> {
  private loadedPages = new Map<string, T[]>();
  private currentCursor: string | null = null;
  private nextCursor: string | null = null;
  private previousCursor: string | null = null;
  private fetchFn: (cursor: string | null, pageSize: number) => Promise<{
    items: T[];
    nextCursor: string | null;
    previousCursor: string | null;
  }>;
  private pageSize: number;
  private allItems: Signal<T[]> = signal([]);
  private isLoading: Signal<boolean> = signal(false);
  private _hasMore: Signal<boolean> = signal(true);

  constructor(
    fetchFn: (cursor: string | null, pageSize: number) => Promise<{
      items: T[];
      nextCursor: string | null;
      previousCursor: string | null;
    }>,
    pageSize: number = 20,
  ) {
    this.fetchFn = fetchFn;
    this.pageSize = pageSize;
  }

  get items(): Signal<T[]> { return this.allItems; }
  get loading(): Signal<boolean> { return this.isLoading; }
  get hasMore(): Signal<boolean> { return this._hasMore; }

  async loadMore(): Promise<void> {
    if (this.isLoading.peek() || !this.hasMore.peek()) return;

    this.isLoading.set(true);
    try {
      const result = await this.fetchFn(this.nextCursor, this.pageSize);
      this.allItems.set([...this.allItems.peek(), ...result.items]);
      this.previousCursor = this.currentCursor;
      this.currentCursor = this.nextCursor;
      this.nextCursor = result.nextCursor;
      this.hasMore.set(result.nextCursor !== null);
    } catch (e) {
      console.error("[TW Pagination] Load more failed:", e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async refresh(): Promise<void> {
    this.currentCursor = null;
    this.nextCursor = null;
    this.previousCursor = null;
    this.allItems.set([]);
    this.hasMore.set(true);
    await this.loadMore();
  }

  reset(): void {
    this.loadedPages.clear();
    this.currentCursor = null;
    this.nextCursor = null;
    this.previousCursor = null;
    this.allItems.set([]);
    this.hasMore.set(true);
  }
}

// --- Factories --------------------------------------------------------

export function createPagination(options: PaginationOptions): OffsetPagination {
  return new OffsetPagination(options);
}

export function createCursorPagination<T>(
  fetchFn: (cursor: string | null, pageSize: number) => Promise<{
    items: T[];
    nextCursor: string | null;
    previousCursor: string | null;
  }>,
  pageSize?: number,
): CursorPagination<T> {
  return new CursorPagination(fetchFn, pageSize);
}
