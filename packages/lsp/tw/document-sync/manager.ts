/**
 * Document Sync Manager -- manages text documents, handles
 * incremental updates, and tracks document versions.
 * @module lsp/document-sync/manager
 */

import type { LSPDocument, TextDocumentContentChangeEvent, Position, Range } from "../types";

export type DocumentChangeListener = (doc: LSPDocument, changes: TextDocumentContentChangeEvent[]) => void;

export class DocumentSyncManager {
  private documents: Map<string, LSPDocument> = new Map();
  private listeners: Set<DocumentChangeListener> = new Set();
  private syncKind: "none" | "full" | "incremental";

  constructor(syncKind: "none" | "full" | "incremental" = "incremental") {
    this.syncKind = syncKind;
  }

  openDocument(uri: string, languageId: string, version: number, content: string): LSPDocument {
    const doc: LSPDocument = { uri, languageId, version, content, lines: content.split("\n"), lastModified: Date.now() };
    this.documents.set(uri, doc);
    this.notifyListeners(doc, [{ text: content }]);
    return doc;
  }

  updateDocument(uri: string, version: number, content: string): LSPDocument | null {
    const doc = this.documents.get(uri);
    if (!doc) return null;
    doc.version = version; doc.content = content; doc.lines = content.split("\n"); doc.lastModified = Date.now();
    this.notifyListeners(doc, [{ text: content }]);
    return doc;
  }

  applyChanges(uri: string, version: number, changes: TextDocumentContentChangeEvent[]): LSPDocument | null {
    const doc = this.documents.get(uri);
    if (!doc) return null;
    let newContent = doc.content;
    for (const change of changes) {
      if (change.range && this.syncKind === "incremental") {
        const startOffset = this.positionToOffset(newContent, change.range.start);
        const endOffset = this.positionToOffset(newContent, change.range.end);
        newContent = newContent.slice(0, startOffset) + change.text + newContent.slice(endOffset);
      } else {
        newContent = change.text;
      }
    }
    doc.content = newContent; doc.lines = newContent.split("\n"); doc.version = version; doc.lastModified = Date.now();
    this.notifyListeners(doc, changes);
    return doc;
  }

  closeDocument(uri: string): boolean { return this.documents.delete(uri); }
  getDocument(uri: string): LSPDocument | null { return this.documents.get(uri) ?? null; }
  getAllDocuments(): LSPDocument[] { return Array.from(this.documents.values()); }

  getLine(doc: LSPDocument, line: number): string {
    if (line < 0 || line >= doc.lines.length) return "";
    return doc.lines[line];
  }

  getWordAtPosition(doc: LSPDocument, position: Position): { word: string; range: Range } | null {
    const line = this.getLine(doc, position.line);
    if (!line) return null;
    let start = position.character; let end = position.character;
    while (start > 0 && /[\w$-]/.test(line[start - 1])) start--;
    while (end < line.length && /[\w$-]/.test(line[end])) end++;
    if (start === end) return null;
    return { word: line.slice(start, end), range: { start: { line: position.line, character: start }, end: { line: position.line, character: end } } };
  }

  positionToOffset(content: string, position: Position): number {
    const lines = content.split("\n");
    let offset = 0;
    for (let i = 0; i < position.line && i < lines.length; i++) offset += lines[i].length + 1;
    if (position.line < lines.length) offset += Math.min(position.character, lines[position.line].length);
    return offset;
  }

  onDidChange(listener: DocumentChangeListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private notifyListeners(doc: LSPDocument, changes: TextDocumentContentChangeEvent[]): void { for (const l of this.listeners) { try { l(doc, changes); } catch { /* ignore */ } } }
  get count(): number { return this.documents.size; }
  isOpen(uri: string): boolean { return this.documents.has(uri); }
}

export function createDocumentSyncManager(syncKind?: "none" | "full" | "incremental"): DocumentSyncManager {
  return new DocumentSyncManager(syncKind);
}
