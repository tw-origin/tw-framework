/**
 * Rename Provider -- symbol renaming across documents.
 * @module lsp/rename/provider
 */
import type { WorkspaceEdit, TextEdit, Position, Range } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export class RenameProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  prepareRename(uri: string, position: Position): Range | null {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return null;
    const word = this.docManager.getWordAtPosition(doc, position);
    return word ? word.range : null;
  }

  getRenameEdits(uri: string, position: Position, newName: string): WorkspaceEdit {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return { changes: {} };
    const word = this.docManager.getWordAtPosition(doc, position);
    if (!word) return { changes: {} };
    const edits: Record<string, TextEdit[]> = {};
    for (const d of this.docManager.getAllDocuments()) {
      const docEdits = this.findOccurrences(d, word.word, newName);
      if (docEdits.length > 0) edits[d.uri] = docEdits;
    }
    return { changes: edits };
  }

  private findOccurrences(doc: { lines: string[]; uri: string }, symbol: string, newName: string): TextEdit[] {
    const edits: TextEdit[] = []; const esc = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${esc}\\b`, "g");
    for (let i = 0; i < doc.lines.length; i++) { let m: RegExpExecArray | null; while ((m = regex.exec(doc.lines[i])) !== null) { edits.push({ range: { start: { line: i, character: m.index }, end: { line: i, character: m.index + symbol.length } }, newText: newName }); } }
    return edits;
  }
}
export function createRenameProvider(docManager: DocumentSyncManager): RenameProvider { return new RenameProvider(docManager); }
