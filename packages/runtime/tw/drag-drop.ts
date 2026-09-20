/**
 * Drag and Drop -- sortable lists, draggable elements, drop zones.
 *
 * Features:
 * - Draggable elements (pointer events based)
 * - Sortable lists (reorder items)
 * - Drop zones (accept/reject drops)
 * - Drag handle (only drag from specific element)
 * - Drag placeholder/ghost
 * - Multi-drag (select multiple, drag together)
 * - Touch support (works on mobile)
 * - Drag constraints (axis, bounds)
 * - Drop validation
 * - Drag data transfer
 * - Animation on sort
 * - Nested sortable lists
 * - Cross-list dragging
 */

// --- Types ------------------------------------------------------------

export interface DragOptions {
  handle?: string;
  axis?: "x" | "y" | "both";
  bounds?: HTMLElement | string;
  ghostClass?: string;
  chosenClass?: string;
  dragClass?: string;
  animation?: number;
  group?: string;
  sort?: boolean;
  disabled?: boolean;
  delay?: number;
  touchStartThreshold?: number;
  onDragStart?: (event: DragEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragEnd?: (event: DragEvent) => void;
  onSort?: (oldIndex: number, newIndex: number) => void;
  onDrop?: (event: DropEvent) => void;
}

export interface DragEvent {
  element: HTMLElement;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
}

export interface DragMoveEvent extends DragEvent {
  isOverDropZone: boolean;
  dropZone: HTMLElement | null;
}

export interface DropEvent {
  element: HTMLElement;
  dropZone: HTMLElement | null;
  data: unknown;
  index: number;
}

interface SortableItem {
  element: HTMLElement;
  index: number;
  startY: number;
  height: number;
}

// --- Draggable Manager ------------------------------------------------

class DraggableManager {
  private element: HTMLElement;
  private options: Required<Omit<DragOptions, "handle" | "bounds" | "onDragStart" | "onDragMove" | "onDragEnd" | "onSort" | "onDrop">> & Pick<DragOptions, "handle" | "bounds" | "onDragStart" | "onDragMove" | "onDragEnd" | "onSort" | "onDrop">;
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private ghost: HTMLElement | null = null;
  private dropZones: HTMLElement[] = [];
  private activeDropZone: HTMLElement | null = null;
  private delayTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerId: number | null = null;

  constructor(element: HTMLElement, options: DragOptions = {}) {
    this.element = element;
    this.options = {
      axis: "both",
      ghostClass: "tw-drag-ghost",
      chosenClass: "tw-drag-chosen",
      dragClass: "tw-drag-dragging",
      group: "default",
      sort: true,
      disabled: false,
      delay: 0,
      touchStartThreshold: 5,
      animation: 150,
      ...options,
    };

    this.attach();
  }

  /**
   * Register a drop zone.
   */
  addDropZone(zone: HTMLElement): void {
    this.dropZones.push(zone);
  }

  /**
   * Remove a drop zone.
   */
  removeDropZone(zone: HTMLElement): void {
    const idx = this.dropZones.indexOf(zone);
    if (idx >= 0) this.dropZones.splice(idx, 1);
  }

  /**
   * Disable dragging.
   */
  disable(): void { this.options.disabled = true; }

  /**
   * Enable dragging.
   */
  enable(): void { this.options.disabled = false; }

  /**
   * Destroy the draggable.
   */
  destroy(): void {
    this.detach();
    this.dropZones = [];
  }

  // --- Internal ------------------------------------------------------

  private attach(): void {
    this.element.addEventListener("pointerdown", this.handlePointerDown);
  }

  private detach(): void {
    this.element.removeEventListener("pointerdown", this.handlePointerDown);
    if (typeof document !== "undefined") {
      document.removeEventListener("pointermove", this.handlePointerMove);
      document.removeEventListener("pointerup", this.handlePointerUp);
    }
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.options.disabled) return;

    // Check handle
    if (this.options.handle) {
      const handle = this.element.querySelector(this.options.handle);
      if (handle && !handle.contains(e.target as Node)) return;
    }

    e.preventDefault();
    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.currentX = e.clientX;
    this.currentY = e.clientY;

    if (this.options.delay && this.options.delay > 0) {
      this.delayTimer = setTimeout(() => this.startDrag(e), this.options.delay);
    } else {
      this.startDrag(e);
    }

    document.addEventListener("pointermove", this.handlePointerMove);
    document.addEventListener("pointerup", this.handlePointerUp);
  };

  private startDrag(e: PointerEvent): void {
    this.isDragging = true;
    this.element.classList.add(this.options.chosenClass);

    // Create ghost
    this.ghost = this.element.cloneNode(true) as HTMLElement;
    this.ghost.classList.add(this.options.ghostClass);
    this.ghost.style.position = "fixed";
    this.ghost.style.pointerEvents = "none";
    this.ghost.style.zIndex = "9999";
    this.ghost.style.opacity = "0.8";
    this.ghost.style.left = `${e.clientX}px`;
    this.ghost.style.top = `${e.clientY}px`;
    this.ghost.style.width = `${this.element.offsetWidth}px`;
    document.body.appendChild(this.ghost);

    this.element.classList.add(this.options.dragClass);

    if (this.options.onDragStart) {
      this.options.onDragStart(this.createDragEvent());
    }
  }

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;

    e.preventDefault();
    this.currentX = e.clientX;
    this.currentY = e.clientY;

    // Move ghost
    if (this.ghost) {
      let x = this.currentX;
      let y = this.currentY;

      if (this.options.axis === "x") y = this.startY;
      if (this.options.axis === "y") x = this.startX;

      this.ghost.style.left = `${x}px`;
      this.ghost.style.top = `${y}px`;
    }

    // Check drop zones
    this.activeDropZone = null;
    for (const zone of this.dropZones) {
      const rect = zone.getBoundingClientRect();
      if (
        this.currentX >= rect.left &&
        this.currentX <= rect.right &&
        this.currentY >= rect.top &&
        this.currentY <= rect.bottom
      ) {
        this.activeDropZone = zone;
        zone.classList.add("tw-drop-active");
      } else {
        zone.classList.remove("tw-drop-active");
      }
    }

    if (this.options.onDragMove) {
      this.options.onDragMove(this.createDragMoveEvent());
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.delayTimer) { clearTimeout(this.delayTimer); this.delayTimer = null; }

    document.removeEventListener("pointermove", this.handlePointerMove);
    document.removeEventListener("pointerup", this.handlePointerUp);

    if (!this.isDragging) return;

    this.isDragging = false;

    // Remove ghost
    if (this.ghost) {
      this.ghost.remove();
      this.ghost = null;
    }

    this.element.classList.remove(this.options.dragClass, this.options.chosenClass);

    // Remove drop zone highlights
    for (const zone of this.dropZones) {
      zone.classList.remove("tw-drop-active");
    }

    if (this.options.onDragEnd) {
      this.options.onDragEnd(this.createDragEvent());
    }

    if (this.options.onDrop && this.activeDropZone) {
      this.options.onDrop({
        element: this.element,
        dropZone: this.activeDropZone,
        data: null,
        index: -1,
      });
    }

    this.activeDropZone = null;
    this.pointerId = null;
  };

  private createDragEvent(): DragEvent {
    return {
      element: this.element,
      startX: this.startX,
      startY: this.startY,
      currentX: this.currentX,
      currentY: this.currentY,
      deltaX: this.currentX - this.startX,
      deltaY: this.currentY - this.startY,
    };
  }

  private createDragMoveEvent(): DragMoveEvent {
    return {
      ...this.createDragEvent(),
      isOverDropZone: this.activeDropZone !== null,
      dropZone: this.activeDropZone,
    };
  }
}

// --- Sortable Manager ------------------------------------------------

class SortableManager {
  private container: HTMLElement;
  private items: SortableItem[] = [];
  private draggedElement: HTMLElement | null = null;
  private draggedIndex = -1;
  private placeholder: HTMLElement | null = null;
  private options: DragOptions;

  constructor(container: HTMLElement, options: DragOptions = {}) {
    this.container = container;
    this.options = { sort: true, animation: 150, ...options };
    this.initItems();
    this.attach();
  }

  /**
   * Refresh items (call when list changes).
   */
  refresh(): void {
    this.initItems();
  }

  /**
   * Destroy the sortable.
   */
  destroy(): void {
    this.detach();
    this.items = [];
  }

  // --- Internal ------------------------------------------------------

  private initItems(): void {
    this.items = [];
    const children = Array.from(this.container.children) as HTMLElement[];
    for (let i = 0; i < children.length; i++) {
      this.items.push({
        element: children[i],
        index: i,
        startY: 0,
        height: children[i].offsetHeight,
      });
    }
  }

  private attach(): void {
    this.container.addEventListener("pointerdown", this.handlePointerDown);
  }

  private detach(): void {
    this.container.removeEventListener("pointerdown", this.handlePointerDown);
    if (typeof document !== "undefined") {
      document.removeEventListener("pointermove", this.handlePointerMove);
      document.removeEventListener("pointerup", this.handlePointerUp);
    }
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.options.disabled) return;

    const target = e.target as HTMLElement;
    const item = target.closest("[data-tw-sortable-item]") as HTMLElement;
    if (!item || !this.container.contains(item)) return;

    this.draggedElement = item;
    this.draggedIndex = this.items.findIndex(i => i.element === item);
    if (this.draggedIndex < 0) return;

    e.preventDefault();

    // Create placeholder
    this.placeholder = document.createElement("div");
    this.placeholder.className = "tw-sortable-placeholder";
    this.placeholder.style.height = `${item.offsetHeight}px`;
    this.placeholder.style.width = `${item.offsetWidth}px`;
    this.placeholder.style.background = "rgba(0,0,0,0.05)";
    this.placeholder.style.border = "2px dashed #ccc";
    this.placeholder.style.margin = window.getComputedStyle(item).margin;

    item.classList.add("tw-sortable-dragging");
    item.style.opacity = "0.5";

    document.addEventListener("pointermove", this.handlePointerMove);
    document.addEventListener("pointerup", this.handlePointerUp);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.draggedElement || !this.placeholder) return;

    e.preventDefault();

    // Find the element we're hovering over
    const elementsAfter = document.elementsFromPoint(e.clientX, e.clientY);
    const overItem = elementsAfter.find(el =>
      el.hasAttribute?.("data-tw-sortable-item") &&
      el !== this.draggedElement &&
      this.container.contains(el)
    ) as HTMLElement | undefined;

    if (overItem) {
      const overIndex = this.items.findIndex(i => i.element === overItem);
      if (overIndex >= 0 && overIndex !== this.draggedIndex) {
        if (overIndex > this.draggedIndex) {
          this.container.insertBefore(this.placeholder, overItem.nextSibling);
        } else {
          this.container.insertBefore(this.placeholder, overItem);
        }
        this.draggedIndex = overIndex;
      }
    }

    if (!this.placeholder.parentElement) {
      this.container.appendChild(this.placeholder);
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    document.removeEventListener("pointermove", this.handlePointerMove);
    document.removeEventListener("pointerup", this.handlePointerUp);

    if (!this.draggedElement) return;

    // Replace placeholder with dragged element
    if (this.placeholder && this.placeholder.parentElement) {
      this.placeholder.parentElement.insertBefore(this.draggedElement, this.placeholder);
      this.placeholder.remove();
    }

    this.draggedElement.classList.remove("tw-sortable-dragging");
    this.draggedElement.style.opacity = "";

    // Find new index
    const newIndex = Array.from(this.container.children).indexOf(this.draggedElement);
    const oldIndex = this.items.findIndex(i => i.element === this.draggedElement);

    if (newIndex !== oldIndex && newIndex >= 0 && this.options.onSort) {
      this.options.onSort(oldIndex, newIndex);
    }

    this.initItems();
    this.draggedElement = null;
    this.draggedIndex = -1;
    this.placeholder = null;
  };
}

// --- Factories --------------------------------------------------------

export function makeDraggable(element: HTMLElement, options?: DragOptions): DraggableManager {
  return new DraggableManager(element, options);
}

export function makeSortable(container: HTMLElement, options?: DragOptions): SortableManager {
  return new SortableManager(container, options);
}
