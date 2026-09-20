/**
 * Modal Dialog -- modal/dialog management with focus trap and animations.
 *
 * Features:
 * - Modal and non-modal dialogs
 * - Focus trapping
 * - Backdrop (click to close)
 * - Escape key to close
 * - Stack management (multiple modals)
 * - Animations (enter/leave)
 * - Body scroll lock
 * - Promise-based API (await modal close)
 * - Confirm dialogs
 * - Alert dialogs
 * - Custom content
 * - Lazy mounting
 */

import { createFocusTrap, type FocusTrap } from "./focus-trap";

// --- Types ------------------------------------------------------------

export interface ModalOptions {
  backdrop?: boolean;
  backdropClose?: boolean;
  escapeClose?: boolean;
  focusTrap?: boolean;
  lockScroll?: boolean;
  animation?: string;
  onOpen?: () => void;
  onClose?: () => void;
  beforeClose?: () => boolean | Promise<boolean>;
}

export interface ConfirmOptions extends ModalOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger" | "success";
}

// --- Modal Manager ----------------------------------------------------

class ModalManager {
  private modals = new Map<string, {
    element: HTMLElement;
    backdrop: HTMLElement | null;
    options: Required<ModalOptions>;
    focusTrap: FocusTrap | null;
    isOpen: boolean;
    resolve?: (value: boolean) => void;
  }>();
  private modalStack: string[] = [];
  private scrollLockCount = 0;
  private idCounter = 0;

  /**
   * Create a modal.
   */
  create(content: HTMLElement | string, options: ModalOptions = {}): string {
    const id = `modal-${++this.idCounter}`;
    const opts: Required<ModalOptions> = {
      backdrop: true,
      backdropClose: true,
      escapeClose: true,
      focusTrap: true,
      lockScroll: true,
      animation: "fade",
      onOpen: () => {},
      onClose: () => {},
      beforeClose: () => true,
      ...options,
    };

    // Create modal element
    const modal = document.createElement("div");
    modal.className = "tw-modal";
    modal.setAttribute("data-modal-id", id);
    modal.style.cssText = "position:fixed;inset:0;z-index:9998;display:none;align-items:center;justify-content:center;";

    // Create backdrop
    let backdrop: HTMLElement | null = null;
    if (opts.backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "tw-modal-backdrop";
      backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9997;";
      if (opts.backdropClose) {
        backdrop.addEventListener("click", () => this.close(id));
      }
      modal.appendChild(backdrop);
    }

    // Create content wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.className = "tw-modal-content";
    contentWrapper.style.cssText = "position:relative;z-index:9999;background:#fff;border-radius:8px;padding:24px;max-width:90vw;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);";

    if (typeof content === "string") {
      if (typeof content === "string") {
      contentWrapper.textContent = content;
    } else {
      contentWrapper.innerHTML = "";
      contentWrapper.appendChild(content);
    }
    } else {
      contentWrapper.appendChild(content);
    }

    modal.appendChild(contentWrapper);

    // Set up escape handler
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && opts.escapeClose) {
        this.close(id);
      }
    });

    document.body.appendChild(modal);

    this.modals.set(id, {
      element: modal,
      backdrop,
      options: opts,
      focusTrap: null,
      isOpen: false,
    });

    return id;
  }

  /**
   * Open a modal.
   */
  async open(id: string): Promise<void> {
    const modal = this.modals.get(id);
    if (!modal || modal.isOpen) return;

    modal.isOpen = true;
    this.modalStack.push(id);

    if (modal.options.lockScroll) this.lockScroll();

    modal.element.style.display = "flex";

    // Enter animation
    requestAnimationFrame(() => {
      modal.element.style.opacity = "1";
      if (modal.backdrop) {
        modal.backdrop.style.transition = "opacity 0.3s ease";
        modal.backdrop.style.opacity = "1";
      }
      const content = modal.element.querySelector(".tw-modal-content") as HTMLElement;
      if (content) {
        content.style.transition = "transform 0.3s ease, opacity 0.3s ease";
        content.style.transform = "scale(1)";
        content.style.opacity = "1";
      }
    });

    // Set up focus trap
    if (modal.options.focusTrap) {
      const content = modal.element.querySelector(".tw-modal-content") as HTMLElement;
      if (content) {
        modal.focusTrap = createFocusTrap(content);
        modal.focusTrap.activate();
      }
    }

    if (modal.options.onOpen) modal.options.onOpen();
  }

  /**
   * Close a modal.
   */
  async close(id: string): Promise<void> {
    const modal = this.modals.get(id);
    if (!modal || !modal.isOpen) return;

    // Check beforeClose
    if (modal.options.beforeClose) {
      const shouldClose = await modal.options.beforeClose();
      if (!shouldClose) return;
    }

    modal.isOpen = false;

    // Deactivate focus trap
    if (modal.focusTrap) {
      modal.focusTrap.deactivate();
      modal.focusTrap = null;
    }

    // Leave animation
    modal.element.style.opacity = "0";
    if (modal.backdrop) modal.backdrop.style.opacity = "0";
    const content = modal.element.querySelector(".tw-modal-content") as HTMLElement;
    if (content) {
      content.style.transform = "scale(0.95)";
      content.style.opacity = "0";
    }

    setTimeout(() => {
      modal.element.style.display = "none";
      if (modal.options.lockScroll) this.unlockScroll();
      if (modal.options.onClose) modal.options.onClose();
      if (modal.resolve) modal.resolve(false);
    }, 300);

    // Remove from stack
    const idx = this.modalStack.indexOf(id);
    if (idx >= 0) this.modalStack.splice(idx, 1);
  }

  /**
   * Show a confirm dialog (Promise-based).
   */
  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const { title, message, confirmText = "Confirm", cancelText = "Cancel", variant = "default" } = options;

      const content = document.createElement("div");
      content.innerHTML = `
        ${title ? `<h3 style="margin:0 0 12px;font-size:1.125rem;font-weight:600;">${this.escapeHtml(title)}</h3>` : ""}
        <p style="margin:0 0 20px;color:#475569;font-size:0.875rem;">${this.escapeHtml(message)}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button data-action="cancel" style="padding:8px 16px;border:1px solid #e2e8f0;background:#fff;border-radius:6px;cursor:pointer;font-size:0.875rem;">${this.escapeHtml(cancelText)}</button>
          <button data-action="confirm" style="padding:8px 16px;border:none;background:${variant === "danger" ? "#ef4444" : variant === "success" ? "#22c55e" : "#3b82f6"};color:#fff;border-radius:6px;cursor:pointer;font-size:0.875rem;">${this.escapeHtml(confirmText)}</button>
        </div>
      `;

      const id = this.create(content, {
        backdropClose: false,
        escapeClose: true,
        ...options,
      });

      const modal = this.modals.get(id)!;
      modal.resolve = resolve;

      // Button handlers
      content.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
        this.close(id);
        resolve(false);
      });

      content.querySelector('[data-action="confirm"]')?.addEventListener("click", () => {
        this.close(id);
        resolve(true);
      });

      this.open(id);
    });
  }

  /**
   * Show an alert dialog (Promise-based).
   */
  alert(message: string, title?: string, options?: Partial<ModalOptions>): Promise<void> {
    return new Promise((resolve) => {
      const content = document.createElement("div");
      content.innerHTML = `
        ${title ? `<h3 style="margin:0 0 12px;font-size:1.125rem;font-weight:600;">${this.escapeHtml(title)}</h3>` : ""}
        <p style="margin:0 0 20px;color:#475569;font-size:0.875rem;">${this.escapeHtml(message)}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button data-action="ok" style="padding:8px 16px;border:none;background:#3b82f6;color:#fff;border-radius:6px;cursor:pointer;font-size:0.875rem;">OK</button>
        </div>
      `;

      const id = this.create(content, { backdropClose: false, escapeClose: true, ...options });

      content.querySelector('[data-action="ok"]')?.addEventListener("click", () => {
        this.close(id);
        resolve();
      });

      this.open(id);
    });
  }

  /**
   * Close all modals.
   */
  closeAll(): void {
    for (const id of [...this.modalStack]) {
      this.close(id);
    }
  }

  /**
   * Check if a modal is open.
   */
  isOpen(id: string): boolean {
    return this.modals.get(id)?.isOpen || false;
  }

  /**
   * Get the topmost modal ID.
   */
  getTopModal(): string | null {
    return this.modalStack.length > 0 ? this.modalStack[this.modalStack.length - 1] : null;
  }

  /**
   * Destroy a modal.
   */
  destroy(id: string): void {
    const modal = this.modals.get(id);
    if (modal) {
      if (modal.isOpen) this.close(id);
      modal.element.remove();
      this.modals.delete(id);
    }
  }

  // --- Internal ------------------------------------------------------

  private lockScroll(): void {
    this.scrollLockCount++;
    if (this.scrollLockCount === 1) {
      document.body.style.overflow = "hidden";
    }
  }

  private unlockScroll(): void {
    this.scrollLockCount = Math.max(0, this.scrollLockCount - 1);
    if (this.scrollLockCount === 0) {
      document.body.style.overflow = "";
    }
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

// --- Global Modal Manager --------------------------------------------

let globalModalManager: ModalManager | null = null;

export function getModalManager(): ModalManager {
  if (!globalModalManager) globalModalManager = new ModalManager();
  return globalModalManager;
}

export function showModal(content: HTMLElement | string, options?: ModalOptions): string {
  return getModalManager().create(content, options);
}

export function openModal(id: string): Promise<void> {
  return getModalManager().open(id);
}

export function closeModal(id: string): Promise<void> {
  return getModalManager().close(id);
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return getModalManager().confirm(options);
}

export function alertDialog(message: string, title?: string, options?: Partial<ModalOptions>): Promise<void> {
  return getModalManager().alert(message, title, options);
}

export function closeAllModals(): void {
  getModalManager().closeAll();
}
