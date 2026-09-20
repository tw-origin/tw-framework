/**
 * Linked Editing Provider -- synchronized tag name editing.
 * @module lsp/linked-edit/provider
 */
import type { Position, Range } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export interface LinkedEditingRange { ranges: Range[]; wordPattern?: string; }

export class LinkedEditingProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getLinkedEditingRanges(uri: string, position: Position): LinkedEditingRange | null {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return null;
    const word = this.docManager.getWordAtPosition(doc, position);
    if (!word) return null;
    const line = doc.lines[position.line] ?? "";
    if (!/<\/?\w*$/.test(line.slice(0, position.character))) return null;
    const tagName = word.word; const ranges: Range[] = [word.range];
    const esc = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isClosing = line.slice(0, position.character).slice(-2).startsWith("</");
    if (isClosing) { for (let i = position.line; i >= 0; i--) { const m = new RegExp(`<(${esc})\\b`, "i").exec(doc.lines[i]); if (m) { ranges.push({ start: { line: i, character: m.index + 1 }, end: { line: i, character: m.index + 1 + tagName.length } }); break; } } }
    else { for (let i = position.line; i < doc.lines.length; i++) { const m = new RegExp(`</(${esc})\\s*>`, "i").exec(doc.lines[i]); if (m) { ranges.push({ start: { line: i, character: m.index + 2 }, end: { line: i, character: m.index + 2 + tagName.length } }); break; } } }
    return { ranges, wordPattern: "[a-zA-Z][a-zA-Z0-9-]*" };
  }
}
export function createLinkedEditingProvider(docManager: DocumentSyncManager): LinkedEditingProvider { return new LinkedEditingProvider(docManager); }
