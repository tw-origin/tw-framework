/**
 * Clipboard Utils -- copy/paste with rich text and data transfer support.
 *
 * Features:
 * - Copy text to clipboard
 * - Copy rich text (HTML)
 * - Copy structured data (JSON)
 * - Read from clipboard
 * - Fallback for non-secure contexts
 * - Copy with formatting
 * - Copy tables
 * - Copy images (Clipboard API)
 * - Clipboard events
 */

// --- Types ------------------------------------------------------------

export interface ClipboardOptions {
  mimeType?: string;
  fallback?: boolean;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

// --- Clipboard Manager ----------------------------------------------

class ClipboardManager {
  private isSupported = false;

  constructor() {
    this.isSupported = typeof navigator !== "undefined" && !!navigator.clipboard;
  }

  /**
   * Copy text to clipboard.
   */
  async copyText(text: string, options?: ClipboardOptions): Promise<boolean> {
    try {
      if (this.isSupported) {
        await navigator.clipboard.writeText(text);
        options?.onSuccess?.();
        return true;
      }
    } catch (e) {
      console.warn("[TW Clipboard] Clipboard API failed, trying fallback:", e);
    }

    // Fallback
    if (options?.fallback !== false) {
      return this.fallbackCopy(text, options);
    }

    options?.onError?.(new Error("Clipboard not supported"));
    return false;
  }

  /**
   * Copy HTML to clipboard.
   */
  async copyHTML(html: string, plainText?: string, options?: ClipboardOptions): Promise<boolean> {
    try {
      if (this.isSupported && typeof ClipboardItem !== "undefined") {
        const clipboardItem = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText || html.replace(/<[^>]*>/g, "")], { type: "text/plain" }),
        });
        await navigator.clipboard.write([clipboardItem]);
        options?.onSuccess?.();
        return true;
      }
    } catch (e) {
      console.warn("[TW Clipboard] HTML copy failed, trying text:", e);
    }

    // Fallback to plain text
    return this.copyText(plainText || html.replace(/<[^>]*>/g, ""), options);
  }

  /**
   * Copy JSON data to clipboard.
   */
  async copyJSON(data: unknown, options?: ClipboardOptions): Promise<boolean> {
    const json = JSON.stringify(data, null, 2);
    return this.copyText(json, options);
  }

  /**
   * Copy a table to clipboard as HTML.
   */
  async copyTable(headers: string[], rows: string[][], options?: ClipboardOptions): Promise<boolean> {
    let html = '<table><thead><tr>';
    for (const header of headers) {
      html += `<th>${this.escapeHtml(header)}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (const row of rows) {
      html += '<tr>';
      for (const cell of row) {
        html += `<td>${this.escapeHtml(cell)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';

    const plainText = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");

    return this.copyHTML(html, plainText, options);
  }

  /**
   * Copy an image to clipboard.
   */
  async copyImage(blob: Blob, options?: ClipboardOptions): Promise<boolean> {
    try {
      if (typeof ClipboardItem !== "undefined") {
        const clipboardItem = new ClipboardItem({ [blob.type]: blob });
        await navigator.clipboard.write([clipboardItem]);
        options?.onSuccess?.();
        return true;
      }
    } catch (e) {
      console.error("[TW Clipboard] Image copy failed:", e);
      options?.onError?.(e as Error);
    }
    return false;
  }

  /**
   * Read text from clipboard.
   */
  async readText(): Promise<string> {
    try {
      if (this.isSupported) {
        return await navigator.clipboard.readText();
      }
    } catch (e) {
      console.error("[TW Clipboard] Read failed:", e);
    }
    return "";
  }

  /**
   * Read HTML from clipboard.
   */
  async readHTML(): Promise<string> {
    try {
      if (this.isSupported) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes("text/html")) {
            const blob = await item.getType("text/html");
            return await blob.text();
          }
        }
      }
    } catch (e) {
      console.error("[TW Clipboard] Read HTML failed:", e);
    }
    return "";
  }

  /**
   * Check if clipboard API is supported.
   */
  get supported(): boolean { return this.isSupported; }

  // --- Internal ------------------------------------------------------

  private fallbackCopy(text: string, options?: ClipboardOptions): boolean {
    if (typeof document === "undefined") return false;

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const success = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (success) {
        options?.onSuccess?.();
      } else {
        options?.onError?.(new Error("execCommand copy failed"));
      }

      return success;
    } catch (e) {
      options?.onError?.(e as Error);
      return false;
    }
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}

// --- Global Manager --------------------------------------------------

let globalClipboard: ClipboardManager | null = null;

export function getClipboardManager(): ClipboardManager {
  if (!globalClipboard) globalClipboard = new ClipboardManager();
  return globalClipboard;
}

export async function copyToClipboard(text: string, options?: ClipboardOptions): Promise<boolean> {
  return getClipboardManager().copyText(text, options);
}

export async function copyHTML(html: string, plainText?: string, options?: ClipboardOptions): Promise<boolean> {
  return getClipboardManager().copyHTML(html, plainText, options);
}

export async function copyJSON(data: unknown, options?: ClipboardOptions): Promise<boolean> {
  return getClipboardManager().copyJSON(data, options);
}

export async function pasteFromClipboard(): Promise<string> {
  return getClipboardManager().readText();
}
