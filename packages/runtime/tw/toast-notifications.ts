/**
 * Toast Notifications -- non-intrusive notification system.
 *
 * Features:
 * - Multiple toast types (success, error, warning, info)
 * - Auto-dismiss with configurable duration
 * - Manual dismiss
 * - Stacking (multiple toasts)
 * - Position (top-left, top-right, bottom-left, bottom-right, top-center)
 * - Animations (enter/leave)
 * - Queue (show next when current is dismissed)
 * - Priority (urgent toasts jump the queue)
 * - Rich content (title, message, action button)
 * - Progress bar (time remaining)
 * - Click to dismiss
 * - Max visible limit
 * - SSR-safe
 */

// --- Types ------------------------------------------------------------

export type ToastType = "success" | "error" | "warning" | "info" | "default";
export type ToastPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-center" | "bottom-center";

export interface ToastOptions {
  id?: string;
  type?: ToastType;
  title?: string;
  message: string;
  duration?: number;
  position?: ToastPosition;
  dismissible?: boolean;
  showProgress?: boolean;
  action?: { label: string; handler: () => void };
  priority?: "low" | "normal" | "high";
  onClose?: () => void;
  onClick?: () => void;
}

export interface ToastEntry {
  id: string;
  type: ToastType;
  title: string | undefined;
  message: string;
  duration: number;
  position: ToastPosition;
  dismissible: boolean;
  showProgress: boolean;
  action: { label: string; handler: () => void } | undefined;
  priority: "low" | "normal" | "high";
  createdAt: number;
  element: HTMLElement | null;
  timer: ReturnType<typeof setTimeout> | null;
  onClose: (() => void) | undefined;
  onClick: (() => void) | undefined;
}

// --- Toast Manager --------------------------------------------------

class ToastManager {
  private clickHandlers: Array<{ element: HTMLElement; handler: EventListener }> = [];
  private toasts: ToastEntry[] = [];
  private containers = new Map<ToastPosition, HTMLElement>();
  private maxVisible = 5;
  private defaultDuration = 4000;
  private defaultPosition: ToastPosition = "top-right";
  private idCounter = 0;

  constructor() {
    this.createContainers();
  }

  /**
   * Show a toast notification.
   */
  show(options: ToastOptions): string {
    const id = options.id || `toast-${++this.idCounter}`;
    const entry: ToastEntry = {
      id,
      type: options.type || "default",
      title: options.title,
      message: options.message,
      duration: options.duration ?? this.defaultDuration,
      position: options.position || this.defaultPosition,
      dismissible: options.dismissible ?? true,
      showProgress: options.showProgress ?? false,
      action: options.action,
      priority: options.priority || "normal",
      createdAt: Date.now(),
      element: null,
      timer: null,
      onClose: options.onClose,
      onClick: options.onClick,
    };

    // High priority toasts jump the queue
    if (entry.priority === "high") {
      this.toasts.unshift(entry);
    } else {
      this.toasts.push(entry);
    }

    // Limit visible toasts
    while (this.toasts.length > this.maxVisible) {
      const removed = this.toasts.pop();
      if (removed) this.removeToastElement(removed);
    }

    this.renderToast(entry);

    // Auto-dismiss
    if (entry.duration > 0) {
      entry.timer = setTimeout(() => this.dismiss(id), entry.duration);
    }

    return id;
  }

  /**
   * Show a success toast.
   */
  success(message: string, options?: Partial<ToastOptions>): string {
    return this.show({ ...options, message, type: "success" });
  }

  /**
   * Show an error toast.
   */
  error(message: string, options?: Partial<ToastOptions>): string {
    return this.show({ ...options, message, type: "error", duration: options?.duration ?? 6000 });
  }

  /**
   * Show a warning toast.
   */
  warning(message: string, options?: Partial<ToastOptions>): string {
    return this.show({ ...options, message, type: "warning", duration: options?.duration ?? 5000 });
  }

  /**
   * Show an info toast.
   */
  info(message: string, options?: Partial<ToastOptions>): string {
    return this.show({ ...options, message, type: "info" });
  }

  /**
   * Dismiss a toast by ID.
   */
  dismiss(id: string): void {
    const idx = this.toasts.findIndex(t => t.id === id);
    if (idx < 0) return;

    const entry = this.toasts[idx];
    this.toasts.splice(idx, 1);

    if (entry.timer) clearTimeout(entry.timer);
    this.removeToastElement(entry);

    if (entry.onClose) entry.onClose();
  }

  /**
   * Dismiss all toasts.
   */
  destroy(): void {
    this.clickHandlers.forEach(({ element, handler }) => element.removeEventListener("click", handler));
    this.clickHandlers = [];
    this.dismissAll();
  }

  dismissAll(): void {
    for (const entry of [...this.toasts]) {
      this.dismiss(entry.id);
    }
  }

  /**
   * Get all active toasts.
   */
  getActive(): ToastEntry[] {
    return [...this.toasts];
  }

  /**
   * Set the maximum number of visible toasts.
   */
  setMaxVisible(max: number): void { this.maxVisible = max; }

  // --- Internal ------------------------------------------------------

  private createContainers(): void {
    if (typeof document === "undefined") return;

    const positions: ToastPosition[] = [
      "top-left", "top-right", "top-center",
      "bottom-left", "bottom-right", "bottom-center",
    ];

    for (const position of positions) {
      const container = document.createElement("div");
      container.className = `tw-toast-container tw-toast-${position}`;
      container.style.cssText = this.getContainerStyle(position);
      document.body.appendChild(container);
      this.containers.set(position, container);
    }
  }

  private renderToast(entry: ToastEntry): void {
    const container = this.containers.get(entry.position);
    if (!container) return;

    const el = document.createElement("div");
    el.className = `tw-toast tw-toast-${entry.type}`;
    el.style.cssText = this.getToastStyle(entry.type);
    el.setAttribute("data-toast-id", entry.id);

    // Title
    if (entry.title) {
      const titleEl = document.createElement("div");
      titleEl.className = "tw-toast-title";
      titleEl.style.cssText = "font-weight:600;font-size:0.875rem;margin-bottom:4px;";
      titleEl.textContent = entry.title;
      el.appendChild(titleEl);
    }

    // Message
    const msgEl = document.createElement("div");
    msgEl.className = "tw-toast-message";
    msgEl.style.cssText = "font-size:0.875rem;color:inherit;";
    msgEl.textContent = entry.message;
    el.appendChild(msgEl);

    // Action button
    if (entry.action) {
      const btn = document.createElement("button");
      btn.className = "tw-toast-action";
      btn.style.cssText = "margin-top:8px;padding:4px 12px;border:none;border-radius:4px;cursor:pointer;font-size:0.8125rem;background:rgba(255,255,255,0.2);color:inherit;";
      btn.textContent = entry.action.label;
      btn.onclick = () => {
        entry.action!.handler();
        this.dismiss(entry.id);
      };
      el.appendChild(btn);
    }

    // Close button
    if (entry.dismissible) {
      const closeBtn = document.createElement("button");
      closeBtn.className = "tw-toast-close";
      closeBtn.style.cssText = "position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;font-size:1.25rem;color:inherit;opacity:0.7;padding:0 4px;";
      closeBtn.textContent = "\u00d7";
      closeBtn.onclick = () => this.dismiss(entry.id);
      el.appendChild(closeBtn);
    }

    // Progress bar
    if (entry.showProgress && entry.duration > 0) {
      const progress = document.createElement("div");
      progress.className = "tw-toast-progress";
      progress.style.cssText = "position:absolute;bottom:0;left:0;height:3px;background:rgba(255,255,255,0.5);transition:width linear;";
      progress.style.transitionDuration = `${entry.duration}ms`;
      el.appendChild(progress);

      // Start progress animation
      requestAnimationFrame(() => {
        progress.style.width = "0%";
      });
    }

    // Click handler
    if (entry.onClick) {
      el.style.cursor = "pointer";
      el.addEventListener("click", (e) => {
        if (!(e.target as HTMLElement).classList.contains("tw-toast-close") &&
            !(e.target as HTMLElement).classList.contains("tw-toast-action")) {
          entry.onClick!();
        }
      });
    }

    // Enter animation
    el.style.opacity = "0";
    el.style.transform = "translateY(-10px)";
    el.style.transition = "opacity 0.3s ease, transform 0.3s ease";

    container.appendChild(el);
    entry.element = el;

    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
  }

  private removeToastElement(entry: ToastEntry): void {
    if (!entry.element) return;

    const el = entry.element;
    el.style.opacity = "0";
    el.style.transform = "translateY(-10px)";

    setTimeout(() => {
      el.remove();
    }, 300);

    entry.element = null;
  }

  private getContainerStyle(position: ToastPosition): string {
    const base = "position:fixed;z-index:9999;display:flex;flex-direction:column;gap:8px;padding:1rem;pointer-events:none;max-width:400px;";
    const positions: Record<ToastPosition, string> = {
      "top-left": base + "top:0;left:0;",
      "top-right": base + "top:0;right:0;",
      "top-center": base + "top:0;left:50%;transform:translateX(-50%);",
      "bottom-left": base + "bottom:0;left:0;",
      "bottom-right": base + "bottom:0;right:0;",
      "bottom-center": base + "bottom:0;left:50%;transform:translateX(-50%);",
    };
    return positions[position] || positions["top-right"];
  }

  private getToastStyle(type: ToastType): string {
    const styles: Record<ToastType, string> = {
      success: "position:relative;background:#22c55e;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;min-width:280px;",
      error: "position:relative;background:#ef4444;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;min-width:280px;",
      warning: "position:relative;background:#f59e0b;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;min-width:280px;",
      info: "position:relative;background:#0ea5e9;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;min-width:280px;",
      default: "position:relative;background:#1e293b;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;min-width:280px;",
    };
    return styles[type] || styles.default;
  }
}

// --- Global Toast Manager --------------------------------------------

let globalToastManager: ToastManager | null = null;

export function getToastManager(): ToastManager {
  if (!globalToastManager) globalToastManager = new ToastManager();
  return globalToastManager;
}

export function toast(message: string, options?: Partial<ToastOptions>): string {
  return getToastManager().show({ message, ...options });
}

export function toastSuccess(message: string, options?: Partial<ToastOptions>): string {
  return getToastManager().success(message, options);
}

export function toastError(message: string, options?: Partial<ToastOptions>): string {
  return getToastManager().error(message, options);
}

export function toastWarning(message: string, options?: Partial<ToastOptions>): string {
  return getToastManager().warning(message, options);
}

export function toastInfo(message: string, options?: Partial<ToastOptions>): string {
  return getToastManager().info(message, options);
}

export function dismissToast(id: string): void {
  getToastManager().dismiss(id);
}

export function dismissAllToasts(): void {
  getToastManager().dismissAll();
}
