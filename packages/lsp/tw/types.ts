/**
 * LSP Types -- Language Server Protocol type definitions.
 * Based on LSP Specification 3.17.
 * @module lsp/types
 */

export interface Position { line: number; character: number; }
export interface Range {
  endLine?: any; start: Position; end: Position; }
export interface TextDocumentIdentifier { uri: string; }
export interface TextDocumentItem { uri: string; languageId: string; version: number; text: string; }
export type TextDocument = TextDocumentItem;
export interface TextDocumentPositionParams { textDocument: TextDocumentIdentifier; position: Position; }
export interface Location { uri: string; range: Range; }

export enum DiagnosticSeverity { Error = 1, Warning = 2, Information = 3, Hint = 4 }
export enum DiagnosticTag { Unnecessary = 1, Deprecated = 2 }

export interface Diagnostic {
  range: Range; severity: DiagnosticSeverity; code?: string | number;
  source?: string; message: string; relatedInformation?: DiagnosticRelatedInformation[]; tags?: DiagnosticTag[];
}
export interface DiagnosticRelatedInformation { location: Location; message: string; }

export enum CompletionItemKind {
  Text = 1, Method = 2, Function = 3, Constructor = 4, Field = 5,
  Variable = 6, Class = 7, Interface = 8, Module = 9, Property = 10,
  Unit = 11, Value = 12, Enum = 13, Keyword = 14, Snippet = 15,
  Color = 16, File = 17, Reference = 18, Folder = 19, EnumMember = 20,
  Constant = 21, Struct = 22, Event = 23, Operator = 24, TypeParameter = 25,
}
export enum InsertTextFormat { PlainText = 1, Snippet = 2 }

export interface CompletionItem {
  label: string; kind?: CompletionItemKind; detail?: string;
  documentation?: string | { kind: "markdown" | "plaintext"; value: string };
  sortText?: string; filterText?: string; insertText?: string;
  insertTextFormat?: InsertTextFormat; textEdit?: TextEdit;
  additionalTextEdits?: TextEdit[]; commitCharacters?: string[];
  deprecated?: boolean; preselect?: boolean; data?: unknown;
}
export interface CompletionList { isIncomplete: boolean; items: CompletionItem[]; }
export interface TextEdit { range: Range; newText: string; }
export interface Command { title: string; command: string; arguments?: unknown[]; }
export interface CodeLens { range: Range; command?: Command; data?: unknown; }
export interface Hover { contents: MarkupContent | string | MarkupContent[]; range?: Range; }
export interface MarkupContent { kind: "plaintext" | "markdown"; value: string; }

export enum SymbolKind {
  File = 1, Module = 2, Namespace = 3, Package = 4, Class = 5,
  Method = 6, Property = 7, Field = 8, Constructor = 9, Enum = 10,
  Interface = 11, Function = 12, Variable = 13, Constant = 14, String = 15,
  Number = 16, Boolean = 17, Array = 18, Object = 19, Key = 20,
  Null = 21, EnumMember = 22, Struct = 23, Event = 24, Operator = 25, TypeParameter = 26,
}
export interface DocumentSymbol {
  name: string; detail?: string; kind: SymbolKind; range: Range;
  selectionRange: Range; children?: DocumentSymbol[]; deprecated?: boolean;
}
export interface SymbolInformation {
  name: string; kind: SymbolKind; location: Location; containerName?: string; deprecated?: boolean;
}

export enum CodeActionKind {
  QuickFix = "quickfix", Refactor = "refactor", RefactorExtract = "refactor.extract",
  RefactorInline = "refactor.inline", RefactorRewrite = "refactor.rewrite",
  Source = "source", SourceOrganizeImports = "source.organizeImports",
}
export interface CodeAction {
  title: string; kind?: CodeActionKind; diagnostics?: Diagnostic[];
  isPreferred?: boolean; edit?: WorkspaceEdit; command?: Command;
}
export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: Array<{ textDocument: TextDocumentIdentifier; edits: TextEdit[] }>;
}
export interface Command { title: string; command: string; arguments?: unknown[]; }

export interface SignatureHelp { signatures: SignatureInformation[]; activeSignature?: number; activeParameter?: number; }
export interface SignatureInformation { label: string; documentation?: string | MarkupContent; parameters?: ParameterInformation[]; }
export interface ParameterInformation { label: string; documentation?: string | MarkupContent; }

export interface FoldingRange { startLine: number; endLine: number; startCharacter?: number; endCharacter?: number; kind?: FoldingRangeKind; }
export enum FoldingRangeKind { Comment = 1, Imports = 2, Region = 3 }

export enum SemanticTokenType {
  Namespace = 0, Class = 1, Enum = 2, Interface = 3, Struct = 4,
  TypeParameter = 5, Parameter = 6, Variable = 7, Property = 8,
  EnumMember = 9, Event = 10, Function = 11, Method = 12, Macro = 13,
  Keyword = 14, Modifier = 15, Comment = 16, String = 17, Number = 18,
  Regexp = 19, Operator = 20, Decorator = 21,
}
export enum SemanticTokenModifier {
  Declaration = 1, Definition = 2, Readonly = 4, Static = 8,
  Deprecated = 16, Abstract = 32, Async = 64, Modification = 128,
  Documentation = 256, DefaultLibrary = 512,
}
export interface SemanticTokensLegend { tokenTypes: string[]; tokenModifiers: string[]; }
export interface SemanticTokens { data: number[]; }

export interface RenameParams { textDocument: TextDocumentIdentifier; position: Position; newName: string; }
export interface CodeActionContext { diagnostics: Diagnostic[]; only?: CodeActionKind[]; }
export interface FormattingOptions { tabSize: number; insertSpaces: boolean; [key: string]: unknown; }
export enum TextDocumentSyncKind { None = 0, Full = 1, Incremental = 2 }
export interface TextDocumentContentChangeEvent { range?: Range; rangeLength?: number; text: string; }
export interface DidChangeTextDocumentParams { textDocument: { uri: string; version: number }; contentChanges: TextDocumentContentChangeEvent[]; }
export interface DidOpenTextDocumentParams { textDocument: TextDocumentItem; }

export interface ServerCapabilities {
  textDocumentSync: TextDocumentSyncKind;
  completionProvider?: { triggerCharacters?: string[]; resolveProvider?: boolean };
  hoverProvider: boolean; definitionProvider: boolean; referencesProvider: boolean;
  documentSymbolProvider: boolean; workspaceSymbolProvider: boolean; codeActionProvider: boolean;
  documentFormattingProvider: boolean; documentRangeFormattingProvider: boolean;
  renameProvider: boolean; signatureHelpProvider?: { triggerCharacters?: string[] };
  foldingRangeProvider: boolean; semanticTokensProvider?: { legend: SemanticTokensLegend; full: boolean; range?: boolean };
  documentLinkProvider?: boolean; colorProvider?: boolean;
  selectionRangeProvider?: boolean; documentHighlightProvider?: boolean;
  inlayHintProvider?: boolean; codeLensProvider?: boolean;
  declarationProvider?: boolean; implementationProvider?: boolean;
  typeDefinitionProvider?: boolean; callHierarchyProvider?: boolean;
  linkedEditingRangeProvider?: boolean;
}

export interface LSPDocument { uri: string; languageId: string; version: number; content: string; lines: string[]; lastModified: number; }
export interface InitializeParams { processId?: number; rootUri?: string; capabilities: Record<string, unknown>; workspaceFolders?: Array<{ uri: string; name: string }>; }
export interface InitializeResult { capabilities: ServerCapabilities; serverInfo?: { name: string; version?: string }; }
export interface DocumentLink { range: Range; target?: string; tooltip?: string; data?: unknown; }
