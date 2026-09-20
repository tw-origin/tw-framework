/**
 * LSP Server Lifecycle -- handles initialize/shutdown handshake.
 * @module lsp/server/lifecycle
 */
import type { InitializeParams, InitializeResult, ServerCapabilities, SemanticTokensLegend } from "../types";
import { TextDocumentSyncKind } from "../types";

export type ServerState = "uninitialized" | "initializing" | "initialized" | "shuttingDown" | "shutdown";

export interface ServerConfig {
  name: string; version: string; triggerCharacters?: string[];
  semanticTokenTypes?: string[]; semanticTokenModifiers?: string[];
}

const DEFAULT_CONFIG: ServerConfig = {
  name: "tw-language-server", version: "0.0.1",
  triggerCharacters: ["<", " ", ":", "@", "/", '"', "'"],
  semanticTokenTypes: ["namespace","class","enum","interface","struct","typeParameter","parameter","variable","property","enumMember","event","function","method","macro","keyword","modifier","comment","string","number","regexp","operator","decorator"],
  semanticTokenModifiers: ["declaration","definition","readonly","static","deprecated","abstract","async","modification","documentation","defaultLibrary"],
};

export class ServerLifecycle {
  private state: ServerState = "uninitialized";
  private config: ServerConfig;
  private rootUri: string | null = null;
  private workspaceFolders: Array<{ uri: string; name: string }> = [];
  private clientCapabilities: Record<string, unknown> = {};

  constructor(config: Partial<ServerConfig> = {}) { this.config = { ...DEFAULT_CONFIG, ...config }; }

  initialize(params: InitializeParams): InitializeResult {
    this.state = "initializing"; this.rootUri = params.rootUri ?? null;
    this.workspaceFolders = params.workspaceFolders ?? []; this.clientCapabilities = params.capabilities ?? {};
    const capabilities = this.getServerCapabilities(); this.state = "initialized";
    return { capabilities, serverInfo: { name: this.config.name, version: this.config.version } };
  }

  private getServerCapabilities(): ServerCapabilities {
    const legend: SemanticTokensLegend = { tokenTypes: this.config.semanticTokenTypes ?? [], tokenModifiers: this.config.semanticTokenModifiers ?? [] };
    return {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: this.config.triggerCharacters, resolveProvider: true },
      hoverProvider: true, definitionProvider: true, referencesProvider: true,
      documentSymbolProvider: true, workspaceSymbolProvider: true, codeActionProvider: true,
      documentFormattingProvider: true, documentRangeFormattingProvider: true, renameProvider: true,
      signatureHelpProvider: { triggerCharacters: ["(", ","] }, foldingRangeProvider: true,
      semanticTokensProvider: { legend, full: true, range: true },
      documentLinkProvider: true, colorProvider: true, selectionRangeProvider: true,
      documentHighlightProvider: true, inlayHintProvider: true, codeLensProvider: true,
      declarationProvider: true, implementationProvider: true, typeDefinitionProvider: true,
      callHierarchyProvider: true, linkedEditingRangeProvider: true,
    };
  }

  initialized(): void { if (this.state === "initializing") this.state = "initialized"; }
  shutdown(): null { if (this.state === "initialized") this.state = "shuttingDown"; return null; }
  exit(): void { this.state = "shutdown"; process.exit(0); }
  getState(): ServerState { return this.state; }
  isReady(): boolean { return this.state === "initialized"; }
  getRootUri(): string | null { return this.rootUri; }
  getWorkspaceFolders(): Array<{ uri: string; name: string }> { return this.workspaceFolders; }
  getName(): string { return this.config.name; }
  getVersion(): string { return this.config.version; }
  getClientCapabilities(): Record<string, unknown> { return this.clientCapabilities; }
  hasClientCapability(path: string): boolean {
    const parts = path.split("."); let current: unknown = this.clientCapabilities;
    for (const part of parts) { if (current === null || typeof current !== "object") return false; current = (current as Record<string, unknown>)[part]; }
    return current !== undefined && current !== null;
  }
}

export function createServerLifecycle(config?: Partial<ServerConfig>): ServerLifecycle { return new ServerLifecycle(config); }
