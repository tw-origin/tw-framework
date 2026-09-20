/**
 * Keyboard Shortcuts -- global shortcut manager with key sequences.
 *
 * Features:
 * - Single key shortcuts (Ctrl+S, Cmd+K, etc.)
 * - Key sequences (g then h -> go home)
 * - Key combos (Ctrl+Shift+P)
 * - Modifier keys (Ctrl, Shift, Alt, Meta)
 * - Scoped shortcuts (only active in certain contexts)
 * - Pause/resume shortcuts
 * - Conflict detection
 * - Help text generation
 * - Input field exclusion (don't trigger when typing)
 */

// --- Types ------------------------------------------------------------

export interface ShortcutOptions {
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  scope?: string;
  description?: string;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  repeat?: boolean;
  ignoreInputs?: boolean;
  caseSensitive?: boolean;
}

export interface ShortcutEntry {
  id: string;
  keys: string;
  options: ShortcutOptions;
  handler: (event: KeyboardEvent) => void;
  sequence?: string[];
  sequenceIndex?: number;
}

export interface ShortcutHelpItem {
  keys: string;
  description: string;
  scope: string;
}

// --- Keyboard Shortcut Manager ---------------------------------------

class KeyboardShortcutManager {
  private shortcuts = new Map<string, ShortcutEntry[]>();
  private sequences = new Map<string, ShortcutEntry>();
  private sequenceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private currentScope = "global";
  private paused = false;
  private enabled = true;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", this.handleKeyDown);
    }
  }

  /**
   * Register a keyboard shortcut.
   */
  register(keys: string, handler: (event: KeyboardEvent) => void, options: ShortcutOptions = {}): () => void {
    const id = `shortcut-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const normalizedKeys = this.normalizeKeys(keys);

    // Check for key sequence (e.g., "g h")
    if (normalizedKeys.includes(" ")) {
      return this.registerSequence(normalizedKeys, handler, options, id);
    }

    const entry: ShortcutEntry = {
      id,
      keys: normalizedKeys,
      options: {
        preventDefault: true,
        stopPropagation: false,
        repeat: false,
        ignoreInputs: true,
        caseSensitive: false,
        ...options,
      },
      handler,
    };

    if (!this.shortcuts.has(normalizedKeys)) {
      this.shortcuts.set(normalizedKeys, []);
    }
    this.shortcuts.get(normalizedKeys)!.push(entry);

    return () => this.unregister(id, normalizedKeys);
  }

  /**
   * Unregister a shortcut.
   */
  unregister(id: string, keys?: string): void {
    if (keys) {
      const entries = this.shortcuts.get(keys);
      if (entries) {
        const idx = entries.findIndex(e => e.id === id);
        if (idx >= 0) entries.splice(idx, 1);
        if (entries.length === 0) this.shortcuts.delete(keys);
      }
    } else {
      // Search all shortcuts
      for (const [key, entries] of this.shortcuts) {
        const idx = entries.findIndex(e => e.id === id);
        if (idx >= 0) {
          entries.splice(idx, 1);
          if (entries.length === 0) this.shortcuts.delete(key);
          break;
        }
      }
    }
  }

  /**
   * Set the current scope.
   */
  setScope(scope: string): void {
    this.currentScope = scope;
  }

  /**
   * Pause all shortcuts.
   */
  pause(): void { this.paused = true; }

  /**
   * Resume all shortcuts.
   */
  resume(): void { this.paused = false; }

  /**
   * Enable/disable shortcuts.
   */
  setEnabled(enabled: boolean): void { this.enabled = enabled; }

  /**
   * Generate help text for all registered shortcuts.
   */
  getHelp(): ShortcutHelpItem[] {
    const help: ShortcutHelpItem[] = [];
    for (const [keys, entries] of this.shortcuts) {
      for (const entry of entries) {
        help.push({
          keys: this.formatKeys(keys, entry.options),
          description: entry.options.description || "",
          scope: entry.options.scope || "global",
        });
      }
    }
    return help;
  }

  /**
   * Destroy the manager.
   */
  destroy(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", this.handleKeyDown);
    }
    this.shortcuts.clear();
    this.sequences.clear();
    for (const timer of this.sequenceTimers.values()) clearTimeout(timer);
    this.sequenceTimers.clear();
  }

  // --- Internal ------------------------------------------------------

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || this.paused) return;

    // Ignore when typing in inputs (unless configured otherwise)
    if (this.isInputFocused(event.target) && this.shouldIgnoreInputs(event)) return;

    // Check for key sequences first
    if (this.checkSequences(event)) return;

    // Check for combos
    const key = this.eventToKey(event);
    const entries = this.shortcuts.get(key);

    if (!entries) return;

    for (const entry of entries) {
      if (this.matchesModifiers(event, entry.options) && this.matchesScope(entry.options)) {
        if (!entry.options.repeat && event.repeat) continue;

        if (entry.options.preventDefault) event.preventDefault();
        if (entry.options.stopPropagation) event.stopPropagation();

        try { entry.handler(event); }
        catch (e) { console.error("[TW Keyboard] Shortcut handler error:", e); }

        break; // Only trigger first matching shortcut
      }
    }
  };

  private registerSequence(keys: string, handler: (event: KeyboardEvent) => void, options: ShortcutOptions, id: string): () => void {
    const sequence = keys.split(" ").map(k => this.normalizeKeys(k));
    const entry: ShortcutEntry = {
      id, keys, options: { ...options }, handler, sequence, sequenceIndex: 0,
    };
    this.sequences.set(id, entry);

    return () => { this.sequences.delete(id); };
  }

  private checkSequences(event: KeyboardEvent): boolean {
    const key = this.eventToKey(event);

    for (const [id, entry] of this.sequences) {
      const expectedKey = entry.sequence?.[entry.sequenceIndex || 0];

      if (key === expectedKey) {
        // Check modifiers for first key
        if ((entry.sequenceIndex || 0) === 0 && !this.matchesModifiers(event, entry.options)) continue;

        entry.sequenceIndex = (entry.sequenceIndex || 0) + 1;

        if (entry.sequenceIndex >= (entry.sequence?.length || 0)) {
          // Sequence complete
          if (entry.options.preventDefault) event.preventDefault();
          try { entry.handler(event); }
          catch (e) { console.error("[TW Keyboard] Sequence handler error:", e); }
          entry.sequenceIndex = 0;
        } else {
          // Reset after timeout
          const timer = setTimeout(() => {
            entry.sequenceIndex = 0;
          }, 1000);
          this.sequenceTimers.set(id, timer);
        }

        return true;
      }
    }

    return false;
  }

  private normalizeKeys(keys: string): string {
    return keys.toLowerCase().trim()
      .replace(/ctrl\+/g, "ctrl+")
      .replace(/cmd\+/g, "meta+")
      .replace(/shift\+/g, "shift+")
      .replace(/alt\+/g, "alt+")
      .replace(/option\+/g, "alt+");
  }

  private eventToKey(event: KeyboardEvent): string {
    const parts: string[] = [];
    if (event.ctrlKey) parts.push("ctrl");
    if (event.metaKey) parts.push("meta");
    if (event.shiftKey) parts.push("shift");
    if (event.altKey) parts.push("alt");
    parts.push(event.key.toLowerCase());
    return parts.join("+");
  }

  private matchesModifiers(event: KeyboardEvent, options: ShortcutOptions): boolean {
    if (options.ctrlKey !== undefined && event.ctrlKey !== options.ctrlKey) return false;
    if (options.shiftKey !== undefined && event.shiftKey !== options.shiftKey) return false;
    if (options.altKey !== undefined && event.altKey !== options.altKey) return false;
    if (options.metaKey !== undefined && event.metaKey !== options.metaKey) return false;
    return true;
  }

  private matchesScope(options: ShortcutOptions): boolean {
    if (!options.scope) return true;
    return options.scope === this.currentScope;
  }

  private shouldIgnoreInputs(event: KeyboardEvent): boolean {
    const entries = this.shortcuts.get(this.eventToKey(event));
    if (!entries) return false;
    return entries.some(e => e.options.ignoreInputs);
  }

  private isInputFocused(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
  }

  private formatKeys(keys: string, options: ShortcutOptions): string {
    const parts: string[] = [];
    if (options.ctrlKey) parts.push("Ctrl");
    if (options.metaKey) parts.push("Cmd");
    if (options.shiftKey) parts.push("Shift");
    if (options.altKey) parts.push("Alt");
    parts.push(keys.split("+").pop()!.toUpperCase());
    return parts.join(" + ");
  }
}

// --- Global Manager --------------------------------------------------

let globalKeyboardManager: KeyboardShortcutManager | null = null;

export function getKeyboardManager(): KeyboardShortcutManager {
  if (!globalKeyboardManager) globalKeyboardManager = new KeyboardShortcutManager();
  return globalKeyboardManager;
}

export function registerShortcut(keys: string, handler: (event: KeyboardEvent) => void, options?: ShortcutOptions): () => void {
  return getKeyboardManager().register(keys, handler, options);
}

export function setShortcutScope(scope: string): void {
  getKeyboardManager().setScope(scope);
}

export function getShortcutHelp(): ShortcutHelpItem[] {
  return getKeyboardManager().getHelp();
}
