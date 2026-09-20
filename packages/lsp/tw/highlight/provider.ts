/**
 * Document Highlight Provider -- highlights symbol occurrences.
 * @module lsp/highlight/provider
 */
import type { Position, LSPDocument, Range } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export enum DocumentHighlightKind { Text = 1, Read = 2, Write = 3 }
export interface DocumentHighlight { range: Range; kind?: DocumentHighlightKind; }

export class HighlightProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getHighlights(uri: string, position: Position): DocumentHighlight[] {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return [];
    const word = this.docManager.getWordAtPosition(doc, position);
    if (!word) return [];
    const highlights: DocumentHighlight[] = [];
    const esc = word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${esc}\\b`, "g");
    for (let i = 0; i < doc.lines.length; i++) { let m: RegExpExecArray | null; while ((m = regex.exec(doc.lines[i])) !== null) { highlights.push({ range: { start: { line: i, character: m.index }, end: { line: i, character: m.index + word.word.length } }, kind: this.determineKind(doc.lines[i], m.index, word.word) }); } }
    return highlights;
  }

  private determineKind(line: string, index: number, word: string): DocumentHighlightKind {
    const before = line.slice(0, index);
    if (/=\s*$/.test(before) || /(?:const|let|var|function|class)\s+$/.test(before)) return DocumentHighlightKind.Write;
    return DocumentHighlightKind.Read;
  }
}
export function createHighlightProvider(docManager: DocumentSyncManager): HighlightProvider { return new HighlightProvider(docManager); }
