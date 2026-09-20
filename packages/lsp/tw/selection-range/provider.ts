/**
 * Selection Range Provider -- hierarchical smart selection.
 * @module lsp/selection-range/provider
 */
import type { Position, LSPDocument, Range } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export interface SelectionRange { range: Range; parent?: SelectionRange; }

export class SelectionRangeProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getSelectionRanges(uri: string, positions: Position[]): SelectionRange[] {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return [];
    return positions.map(pos => this.getSelectionRange(doc, pos));
  }

  private getSelectionRange(doc: LSPDocument, position: Position): SelectionRange {
    const ranges: Range[] = [];
    const word = this.docManager.getWordAtPosition(doc, position);
    if (word) ranges.push(word.range);
    const line = doc.lines[position.line] ?? "";
    if (line.trim()) { const ts = line.length - line.trimStart().length; ranges.push({ start: { line: position.line, character: ts }, end: { line: position.line, character: ts + line.trim().length } }); }
    const strRange = this.findEnclosingString(doc, position); if (strRange) ranges.push(strRange);
    const exprRange = this.findEnclosingExpression(doc, position); if (exprRange) ranges.push(exprRange);
    const unique: Range[] = []; for (const r of ranges) if (!unique.some(u => u.start.line === r.start.line && u.start.character === r.start.character && u.end.line === r.end.line && u.end.character === r.end.character)) unique.push(r);
    let result: SelectionRange | undefined;
    for (let i = unique.length - 1; i >= 0; i--) result = { range: unique[i], parent: result };
    return result ?? { range: { start: position, end: position } };
  }

  private findEnclosingString(doc: LSPDocument, position: Position): Range | null {
    const line = doc.lines[position.line] ?? ""; let quoteChar: string | null = null; let start = -1;
    for (let i = position.character; i >= 0; i--) { if (line[i] === '"' || line[i] === "'") { if (quoteChar === null) { quoteChar = line[i]; start = i; } else if (line[i] === quoteChar) return { start: { line: position.line, character: i }, end: { line: position.line, character: start + 1 } }; } }
    return null;
  }

  private findEnclosingExpression(doc: LSPDocument, position: Position): Range | null {
    const line = doc.lines[position.line] ?? ""; const before = line.slice(0, position.character); const after = line.slice(position.character);
    const oi = before.lastIndexOf("{{"); if (oi === -1) return null;
    const ci = after.indexOf("}}"); if (ci === -1) return null;
    return { start: { line: position.line, character: oi }, end: { line: position.line, character: position.character + ci + 2 } };
  }
}
export function createSelectionRangeProvider(docManager: DocumentSyncManager): SelectionRangeProvider { return new SelectionRangeProvider(docManager); }
