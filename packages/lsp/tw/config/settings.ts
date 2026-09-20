/**
 * Configuration Manager -- LSP server configuration.
 * @module lsp/config/settings
 */
export interface LSPConfiguration {
  formatting?: { tabSize?: number; insertSpaces?: boolean; maxLineLength?: number; };
  diagnostics?: { enabled?: boolean; rules?: Record<string, boolean>; };
  completion?: { enabled?: boolean; triggerCharacters?: string[]; snippetsEnabled?: boolean; };
  hover?: { enabled?: boolean; format?: "plaintext" | "markdown"; };
  inlayHints?: { enabled?: boolean; showTypes?: boolean; showParameters?: boolean; };
  semanticTokens?: { enabled?: boolean; };
}

const DEFAULT_CONFIG: LSPConfiguration = {
  formatting: { tabSize: 2, insertSpaces: true, maxLineLength: 120 },
  diagnostics: { enabled: true, rules: {} },
  completion: { enabled: true, triggerCharacters: ["<", " ", ":", "@"], snippetsEnabled: true },
  hover: { enabled: true, format: "markdown" },
  inlayHints: { enabled: false, showTypes: true, showParameters: true },
  semanticTokens: { enabled: true },
};

export class ConfigurationManager {
  private config: LSPConfiguration;
  private listeners: Set<(config: LSPConfiguration) => void> = new Set();
  constructor(config?: Partial<LSPConfiguration>) { this.config = { ...DEFAULT_CONFIG, ...config }; }
  getConfig(): LSPConfiguration { return this.config; }
  getSection<K extends keyof LSPConfiguration>(section: K): LSPConfiguration[K] { return this.config[section]; }
  updateConfig(config: Partial<LSPConfiguration>): void { this.config = { ...this.config, ...config }; this.notifyListeners(); }
  onChange(listener: (config: LSPConfiguration) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private notifyListeners(): void { for (const l of this.listeners) try { l(this.config); } catch { /* ignore */ } }
  reset(): void { this.config = { ...DEFAULT_CONFIG }; this.notifyListeners(); }
}
export function createConfigurationManager(config?: Partial<LSPConfiguration>): ConfigurationManager { return new ConfigurationManager(config); }
