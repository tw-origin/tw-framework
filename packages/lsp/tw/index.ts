/** LSP package -- full Language Server Protocol implementation for TW. */

export { DocumentHighlights, createDocumentHighlights } from "./providers";
export type { DocumentHighlightsConfig } from "./providers";
export { CodeActionKind, CompletionItemKind, DiagnosticSeverity, DiagnosticTag, FoldingRangeKind, InsertTextFormat, SemanticTokenModifier, SemanticTokenType, SymbolKind, TextDocumentSyncKind } from "./types";
export type { CodeAction, CodeActionContext, Command, CompletionItem, CompletionList, Diagnostic, DiagnosticRelatedInformation, DidChangeTextDocumentParams, DidOpenTextDocumentParams, DocumentLink, DocumentSymbol, FoldingRange, FormattingOptions, Hover, InitializeParams, InitializeResult, LSPDocument, Location, MarkupContent, ParameterInformation, Position, Range, RenameParams, SemanticTokens, SemanticTokensLegend, ServerCapabilities, SignatureHelp, SignatureInformation, SymbolInformation, TextDocumentContentChangeEvent, TextDocumentIdentifier, TextDocumentItem, TextDocumentPositionParams, TextEdit, WorkspaceEdit } from "./types";
export { CallHierarchyProvider, createCallHierarchyProvider } from "./call-hierarchy";
export type { CallHierarchyIncomingCall, CallHierarchyItem, CallHierarchyOutgoingCall } from "./call-hierarchy";
export { CodeActionProvider, createCodeActionProvider } from "./code-action";
export { CodeLensProvider, createCodeLensProvider } from "./code-lens";
export { ColorProvider, createColorProvider } from "./color";
export type { Color, ColorInformation, ColorPresentation } from "./color";
export { CompletionProvider, createCompletionProvider } from "./completion";
export { ConfigurationManager, createConfigurationManager } from "./config";
export type { LSPConfiguration } from "./config";
export { DeclarationProvider, createDeclarationProvider } from "./declaration";
export { DefinitionProvider, createDefinitionProvider } from "./definition";
export { DiagnosticsProvider, createDiagnosticsProvider } from "./diagnostics";
export type { DiagnosticRule } from "./diagnostics";
export { DocumentLinkProvider, createDocumentLinkProvider } from "./document-link";
export { DocumentSyncManager, createDocumentSyncManager } from "./document-sync";
export type { DocumentChangeListener } from "./document-sync";
export { FileOperationsProvider, createFileOperationsProvider } from "./file-operations";
export type { FileCreateParams, FileDeleteParams, FileRenameParams } from "./file-operations";
export { FoldingProvider, createFoldingProvider } from "./folding";
export { CodeFormatter, createFormatter } from "./format";
export type { FormatterConfig } from "./format";
export { DocumentHighlightKind, HighlightProvider, createHighlightProvider } from "./highlight";
export type { DocumentHighlight } from "./highlight";
export { HoverProvider, createHoverProvider } from "./hover";
export { ImplementationProvider, createImplementationProvider } from "./implementation";
export { InlayHintKind, InlayHintsProvider, createInlayHintsProvider } from "./inlay-hints";
export type { InlayHint } from "./inlay-hints";
export { LinkedEditingProvider, createLinkedEditingProvider } from "./linked-edit";
export type { LinkedEditingRange } from "./linked-edit";
export { ProgressReporter, createProgressReporter } from "./progress";
export type { ProgressBegin, ProgressCallback, ProgressEnd, ProgressReport, ProgressToken } from "./progress";
export { PullDiagnosticsProvider, createPullDiagnosticsProvider } from "./pull-diagnostics";
export type { CategorizedDiagnostic, DiagnosticCategory, PullDiagnosticsResult } from "./pull-diagnostics";
export { RenameProvider, createRenameProvider } from "./rename";
export { SelectionRangeProvider, createSelectionRangeProvider } from "./selection-range";
export type { SelectionRange } from "./selection-range";
export { SemanticTokensProvider, TOKEN_MODIFIERS, TOKEN_TYPES, createSemanticTokensProvider, getSemanticTokensLegend } from "./semantic-tokens";
// NOTE: "./server" resolves to the flat server.ts stub (TWLSPServer), not the
// server/ directory -- import the JSON-RPC/lifecycle/main exports explicitly
// from server/index to avoid that ambiguity.
export { MessageHandler, RPCErrorCodes, ServerLifecycle, StdioTransport, TWLanguageServer, createError, createLanguageServer, createServerLifecycle, parseMessage, serializeMessage, startLanguageServer } from "./server/index";
export type { LSPServerOptions, NotificationHandler, RPCError, RPCMessage, RPCNotification, RPCRequest, RPCResponse, RequestHandler, ServerConfig, ServerState } from "./server/index";
export { SignatureHelpProvider, createSignatureHelpProvider } from "./signature-help";
export { TypeDefinitionProvider, createTypeDefinitionProvider } from "./type-definition";
export { WorkspaceSymbolProvider, createWorkspaceSymbolProvider } from "./workspace";

export { TWLSPServer } from "./server";
