/**
 * Implementation Provider -- go-to-implementation.
 * @module lsp/implementation/provider
 */
import type { Location, Position } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export class ImplementationProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getImplementation(uri: string, position: Position): Location | Location[] | null {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return null;
    const word = this.docManager.getWordAtPosition(doc, position);
    if (!word) return null;
    const results: Location[] = [];
    const esc = word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const d of this.docManager.getAllDocuments()) {
      const regex = new RegExp(`(?:implements|extends)\s+${esc}\\b`, "g");
      for (let i = 0; i < d.lines.length; i++) { const m = regex.exec(d.lines[i]); if (m) { const cm = /class\s+(\w+)/.exec(d.lines[i]); if (cm) results.push({ uri: d.uri, range: { start: { line: i, character: cm.index }, end: { line: i, character: cm.index + cm[0].length } } }); } }
    }
    return results.length > 0 ? results : null;
  }
}
export function createImplementationProvider(docManager: DocumentSyncManager): ImplementationProvider { return new ImplementationProvider(docManager); }
