/**
 * LSP Server Main -- wires together all providers into a complete Language Server.
 * @module lsp/server/main
 */
import { MessageHandler, StdioTransport } from "./json-rpc";
import { ServerLifecycle } from "./lifecycle";
import { DocumentSyncManager } from "../document-sync/manager";
import { DiagnosticsProvider } from "../diagnostics/provider";
import { CompletionProvider } from "../completion/provider";
import { HoverProvider } from "../hover/provider";
import { DefinitionProvider } from "../definition/provider";
import { CodeFormatter } from "../format/formatter";
import { SemanticTokensProvider } from "../semantic-tokens/provider";
import { CodeActionProvider } from "../code-action/provider";
import { SignatureHelpProvider } from "../signature-help/provider";
import { RenameProvider } from "../rename/provider";
import { FoldingProvider } from "../folding/provider";
import { WorkspaceSymbolProvider } from "../workspace/symbols";
import { DocumentLinkProvider } from "../document-link/provider";
import { ColorProvider } from "../color/provider";
import { SelectionRangeProvider } from "../selection-range/provider";
import { HighlightProvider } from "../highlight/provider";
import { InlayHintsProvider } from "../inlay-hints/provider";
import { CodeLensProvider } from "../code-lens/provider";
import { DeclarationProvider } from "../declaration/provider";
import { ImplementationProvider } from "../implementation/provider";
import { TypeDefinitionProvider } from "../type-definition/provider";
import { CallHierarchyProvider } from "../call-hierarchy/provider";
import { LinkedEditingProvider } from "../linked-edit/provider";
import { ConfigurationManager } from "../config/settings";
import { FileOperationsProvider } from "../file-operations/provider";
import { ProgressReporter } from "../progress/reporter";
import { PullDiagnosticsProvider } from "../pull-diagnostics/provider";
import type { InitializeParams, Position, Range, DidOpenTextDocumentParams, DidChangeTextDocumentParams } from "../types";

export interface LSPServerOptions { name?: string; version?: string; logLevel?: "debug" | "info" | "warn" | "error" | "none"; }

export class TWLanguageServer {
  private handler: MessageHandler;
  private transport: StdioTransport;
  private lifecycle: ServerLifecycle;
  private docManager: DocumentSyncManager;
  private configManager: ConfigurationManager;
  private diagnosticsProvider: DiagnosticsProvider;
  private completionProvider: CompletionProvider;
  private hoverProvider: HoverProvider;
  private definitionProvider: DefinitionProvider;
  private formatter: CodeFormatter;
  private semanticTokensProvider: SemanticTokensProvider;
  private codeActionProvider: CodeActionProvider;
  private signatureHelpProvider: SignatureHelpProvider;
  private renameProvider: RenameProvider;
  private foldingProvider: FoldingProvider;
  private workspaceSymbolProvider: WorkspaceSymbolProvider;
  private documentLinkProvider: DocumentLinkProvider;
  private colorProvider: ColorProvider;
  private selectionRangeProvider: SelectionRangeProvider;
  private highlightProvider: HighlightProvider;
  private inlayHintsProvider: InlayHintsProvider;
  private codeLensProvider: CodeLensProvider;
  private declarationProvider: DeclarationProvider;
  private implementationProvider: ImplementationProvider;
  private typeDefinitionProvider: TypeDefinitionProvider;
  private callHierarchyProvider: CallHierarchyProvider;
  private linkedEditingProvider: LinkedEditingProvider;
  private fileOpsProvider: FileOperationsProvider;
  private progressReporter: ProgressReporter;
  private pullDiagnosticsProvider: PullDiagnosticsProvider;

  constructor(options?: LSPServerOptions) {
    const sendFn = (msg: string) => { process.stdout.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`); };
    this.handler = new MessageHandler(sendFn);
    this.transport = new StdioTransport(this.handler);
    this.lifecycle = new ServerLifecycle({ name: options?.name ?? "tw-language-server", version: options?.version ?? "0.0.1" });
    this.docManager = new DocumentSyncManager("incremental");
    this.configManager = new ConfigurationManager();
    this.diagnosticsProvider = new DiagnosticsProvider();
    this.completionProvider = new CompletionProvider(this.docManager);
    this.hoverProvider = new HoverProvider(this.docManager);
    this.definitionProvider = new DefinitionProvider(this.docManager);
    this.formatter = new CodeFormatter();
    this.semanticTokensProvider = new SemanticTokensProvider();
    this.codeActionProvider = new CodeActionProvider();
    this.signatureHelpProvider = new SignatureHelpProvider(this.docManager);
    this.renameProvider = new RenameProvider(this.docManager);
    this.foldingProvider = new FoldingProvider();
    this.workspaceSymbolProvider = new WorkspaceSymbolProvider(this.docManager);
    this.documentLinkProvider = new DocumentLinkProvider(this.docManager);
    this.colorProvider = new ColorProvider(this.docManager);
    this.selectionRangeProvider = new SelectionRangeProvider(this.docManager);
    this.highlightProvider = new HighlightProvider(this.docManager);
    this.inlayHintsProvider = new InlayHintsProvider(this.docManager);
    this.codeLensProvider = new CodeLensProvider(this.docManager);
    this.declarationProvider = new DeclarationProvider(this.docManager);
    this.implementationProvider = new ImplementationProvider(this.docManager);
    this.typeDefinitionProvider = new TypeDefinitionProvider(this.docManager);
    this.callHierarchyProvider = new CallHierarchyProvider(this.docManager);
    this.linkedEditingProvider = new LinkedEditingProvider(this.docManager);
    this.fileOpsProvider = new FileOperationsProvider(this.docManager);
    this.progressReporter = new ProgressReporter((notif) => sendFn(JSON.stringify(notif)));
    this.pullDiagnosticsProvider = new PullDiagnosticsProvider(this.docManager, this.diagnosticsProvider);
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.handler.onRequest("initialize", (p: unknown) => this.lifecycle.initialize(p as InitializeParams));
    this.handler.onNotification("initialized", () => this.lifecycle.initialized());
    this.handler.onRequest("shutdown", () => this.lifecycle.shutdown());
    this.handler.onNotification("exit", () => this.lifecycle.exit());

    this.handler.onNotification("textDocument/didOpen", (p: unknown) => {
      const params = p as DidOpenTextDocumentParams;
      const doc = this.docManager.openDocument(params.textDocument.uri, params.textDocument.languageId, params.textDocument.version, params.textDocument.text);
      this.publishDiagnostics(doc.uri);
    });
    this.handler.onNotification("textDocument/didChange", (p: unknown) => {
      const params = p as DidChangeTextDocumentParams;
      const doc = this.docManager.applyChanges(params.textDocument.uri, params.textDocument.version, params.contentChanges);
      if (doc) this.publishDiagnostics(doc.uri);
    });
    this.handler.onNotification("textDocument/didClose", (p: unknown) => {
      const params = p as { textDocument: { uri: string } };
      this.docManager.closeDocument(params.textDocument.uri);
      this.handler.sendNotification("textDocument/publishDiagnostics", { uri: params.textDocument.uri, diagnostics: [] });
    });

    this.handler.onRequest("textDocument/completion", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position };
      return this.completionProvider.getCompletions(params.textDocument.uri, params.position);
    });
    this.handler.onRequest("textDocument/hover", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position };
      return this.hoverProvider.getHover(params.textDocument.uri, params.position);
    });
    this.handler.onRequest("textDocument/definition", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position };
      return this.definitionProvider.getDefinition(params.textDocument.uri, params.position);
    });
    this.handler.onRequest("textDocument/references", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position; context?: { includeDeclaration: boolean } };
      return this.definitionProvider.getReferences(params.textDocument.uri, params.position, params.context?.includeDeclaration ?? true);
    });
    this.handler.onRequest("textDocument/documentSymbol", (p: unknown) => {
      const params = p as { textDocument: { uri: string } };
      return this.workspaceSymbolProvider.getDocumentSymbols(params.textDocument.uri);
    });
    this.handler.onRequest("workspace/symbol", (p: unknown) => {
      const params = p as { query: string };
      return this.workspaceSymbolProvider.searchWorkspaceSymbols(params.query);
    });
    this.handler.onRequest("textDocument/codeAction", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; range: Range; context: { diagnostics: never[] } };
      const doc = this.docManager.getDocument(params.textDocument.uri);
      if (!doc) return [];
      return this.codeActionProvider.getCodeActions(doc, params.range, params.context.diagnostics);
    });
    this.handler.onRequest("textDocument/formatting", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; options: { tabSize: number; insertSpaces: boolean } };
      const doc = this.docManager.getDocument(params.textDocument.uri);
      if (!doc) return [];
      return this.formatter.formatDocument(doc, params.options);
    });
    this.handler.onRequest("textDocument/rangeFormatting", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; range: Range; options: { tabSize: number; insertSpaces: boolean } };
      const doc = this.docManager.getDocument(params.textDocument.uri);
      if (!doc) return [];
      return this.formatter.formatRange(doc, params.range, params.options);
    });
    this.handler.onRequest("textDocument/rename", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position; newName: string };
      return this.renameProvider.getRenameEdits(params.textDocument.uri, params.position, params.newName);
    });
    this.handler.onRequest("textDocument/signatureHelp", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position };
      return this.signatureHelpProvider.getSignatureHelp(params.textDocument.uri, params.position);
    });
    this.handler.onRequest("textDocument/foldingRange", (p: unknown) => {
      const params = p as { textDocument: { uri: string } };
      const doc = this.docManager.getDocument(params.textDocument.uri);
      if (!doc) return [];
      return this.foldingProvider.getFoldingRanges(doc);
    });
    this.handler.onRequest("textDocument/semanticTokens/full", (p: unknown) => {
      const params = p as { textDocument: { uri: string } };
      const doc = this.docManager.getDocument(params.textDocument.uri);
      if (!doc) return { data: [] };
      return this.semanticTokensProvider.getSemanticTokens(doc);
    });
    this.handler.onRequest("textDocument/documentLink", (p: unknown) => {
      const params = p as { textDocument: { uri: string } };
      return this.documentLinkProvider.getDocumentLinks(params.textDocument.uri);
    });
    this.handler.onRequest("textDocument/documentColor", (p: unknown) => {
      const params = p as { textDocument: { uri: string } };
      return this.colorProvider.getDocumentColors(params.textDocument.uri);
    });
    this.handler.onRequest("textDocument/selectionRange", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; positions: Position[] };
      return this.selectionRangeProvider.getSelectionRanges(params.textDocument.uri, params.positions);
    });
    this.handler.onRequest("textDocument/documentHighlight", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position };
      return this.highlightProvider.getHighlights(params.textDocument.uri, params.position);
    });
    this.handler.onRequest("textDocument/inlayHint", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; range: Range };
      return this.inlayHintsProvider.getInlayHints(params.textDocument.uri, params.range);
    });
    this.handler.onRequest("textDocument/codeLens", (p: unknown) => {
      const params = p as { textDocument: { uri: string } };
      return this.codeLensProvider.getCodeLenses(params.textDocument.uri);
    });
    this.handler.onRequest("textDocument/declaration", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position };
      return this.declarationProvider.getDeclaration(params.textDocument.uri, params.position);
    });
    this.handler.onRequest("textDocument/implementation", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position };
      return this.implementationProvider.getImplementation(params.textDocument.uri, params.position);
    });
    this.handler.onRequest("textDocument/typeDefinition", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position };
      return this.typeDefinitionProvider.getTypeDefinition(params.textDocument.uri, params.position);
    });
    this.handler.onRequest("textDocument/prepareCallHierarchy", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position };
      return this.callHierarchyProvider.prepareCallHierarchy(params.textDocument.uri, params.position);
    });
    this.handler.onRequest("textDocument/linkedEditingRange", (p: unknown) => {
      const params = p as { textDocument: { uri: string }; position: Position };
      return this.linkedEditingProvider.getLinkedEditingRanges(params.textDocument.uri, params.position);
    });
    this.handler.onNotification("workspace/didChangeConfiguration", (p: unknown) => {
      const params = p as { settings: Record<string, unknown> };
      const lspConfig = (params.settings?.["tw"] ?? {}) as Record<string, unknown>;
      this.configManager.updateConfig(lspConfig as never);
    });
  }

  private publishDiagnostics(uri: string): void {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return;
    const diagnostics = this.diagnosticsProvider.analyze(doc);
    this.handler.sendNotification("textDocument/publishDiagnostics", { uri, diagnostics });
  }

  start(): void { this.transport.start(); }
  stop(): void { this.transport.stop(); }
}

export function createLanguageServer(options?: LSPServerOptions): TWLanguageServer { return new TWLanguageServer(options); }
export function startLanguageServer(): TWLanguageServer { const s = createLanguageServer(); s.start(); return s; }
