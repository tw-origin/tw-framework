/**
 * TWLSPServer -- a simple synchronous facade over the document-sync manager
 * and the completion/hover/format providers, for embedders that want a
 * single small class rather than the full JSON-RPC server in ./server/.
 */
import { DocumentSyncManager } from "./document-sync/manager";
import { CompletionProvider } from "./completion/provider";
import { HoverProvider } from "./hover/provider";
import { CodeFormatter } from "./format/formatter";
import type { LSPDocument, Position, TextEdit, Hover, CompletionItem } from "./types";

export class TWLSPServer {
  private rootPath: string;
  private docManager: DocumentSyncManager;
  private completionProvider: CompletionProvider;
  private hoverProvider: HoverProvider;
  private formatter: CodeFormatter;
  private versions: Map<string, number> = new Map();

  constructor(rootPath?: string) {
    this.rootPath = rootPath ?? "";
    this.docManager = new DocumentSyncManager();
    this.completionProvider = new CompletionProvider(this.docManager);
    this.hoverProvider = new HoverProvider(this.docManager);
    this.formatter = new CodeFormatter();
  }

  start(port?: number): Promise<void> { return Promise.resolve(); }
  stop(): void {}

  // -- Document lifecycle --------------------------------------------

  openDocument(uri: string, content: string, languageId = "tw"): LSPDocument {
    this.versions.set(uri, 1);
    return this.docManager.openDocument(uri, languageId, 1, content);
  }

  updateDocument(uri: string, content: string, version?: number): LSPDocument | null {
    const nextVersion = version ?? (this.versions.get(uri) ?? 1) + 1;
    this.versions.set(uri, nextVersion);
    return this.docManager.updateDocument(uri, nextVersion, content);
  }

  closeDocument(uri: string): boolean {
    this.versions.delete(uri);
    return this.docManager.closeDocument(uri);
  }

  getDocument(uri: string): LSPDocument | undefined {
    return this.docManager.getDocument(uri) ?? undefined;
  }

  // -- Legacy JSON-RPC-style aliases -----------------------------------
  didOpen(uri: string, text: string): void { this.openDocument(uri, text); }
  didChange(uri: string, text: string, version?: number): void { this.updateDocument(uri, text, version); }
  didClose(uri: string): void { this.closeDocument(uri); }

  // -- Language features -------------------------------------------

  getCompletion(uri: string, position: Position): CompletionItem[] {
    return this.completionProvider.getCompletions(uri, position).items;
  }
  completion(uri: string, position: Position): CompletionItem[] { return this.getCompletion(uri, position); }

  getHover(uri: string, position: Position): Hover | null {
    return this.hoverProvider.getHover(uri, position);
  }
  hover(uri: string, position: Position): Hover | null { return this.getHover(uri, position); }

  formatDocument(uri: string): TextEdit[] {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return [];
    return this.formatter.formatDocument(doc);
  }
  formatting(uri: string): TextEdit[] { return this.formatDocument(uri); }

  getDiagnostics(uri: string): any[] { return []; }
  definition(uri: string, position: Position): any { return null; }
  references(uri: string, position: Position): any[] { return []; }
  rename(uri: string, position: Position, newName: string): any { return null; }
}
