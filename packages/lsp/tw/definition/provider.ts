/**
 * Definition Provider -- go-to-definition and references.
 * @module lsp/definition/provider
 */
import type { Location, Position, LSPDocument, Range } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export class DefinitionProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getDefinition(uri: string, position: Position): Location | Location[] | null {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return null;
    const word = this.docManager.getWordAtPosition(doc, position);
    if (!word) return null;
    return this.findDefinitionInDocument(doc, word.word);
  }

  getReferences(uri: string, position: Position, includeDeclaration: boolean = true): Location[] {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return [];
    const word = this.docManager.getWordAtPosition(doc, position);
    if (!word) return [];
    const results: Location[] = [];
    for (const d of this.docManager.getAllDocuments()) { results.push(...this.findReferencesInDocument(d, word.word)); }
    return results;
  }

  private findDefinitionInDocument(doc: LSPDocument, symbol: string): Location | null {
    const esc = this.escapeRegExp(symbol);
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];
      for (const [pattern, prefix] of [[`(?:const|let|var)\s+${esc}\b`, ""], [`function\s+${esc}\b`, ""], [`class\s+${esc}\b`, ""], [`import\s+.*\b${esc}\b`, ""], [`<component\s+name=["']${esc}["']`, ""]] as [string, string][]) {
        const m = new RegExp(pattern).exec(line);
        if (m) return { uri: doc.uri, range: { start: { line: i, character: m.index }, end: { line: i, character: m.index + m[0].length } } };
      }
    }
    return null;
  }

  private findReferencesInDocument(doc: LSPDocument, symbol: string): Location[] {
    const results: Location[] = [];
    const regex = new RegExp(`\\b${this.escapeRegExp(symbol)}\\b`, "g");
    for (let i = 0; i < doc.lines.length; i++) {
      let m: RegExpExecArray | null;
      while ((m = regex.exec(doc.lines[i])) !== null) {
        results.push({ uri: doc.uri, range: { start: { line: i, character: m.index }, end: { line: i, character: m.index + symbol.length } } });
      }
    }
    return results;
  }

  private escapeRegExp(str: string): string { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
}
export function createDefinitionProvider(docManager: DocumentSyncManager): DefinitionProvider { return new DefinitionProvider(docManager); }
