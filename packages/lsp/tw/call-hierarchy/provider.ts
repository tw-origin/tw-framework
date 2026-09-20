/**
 * Call Hierarchy Provider -- incoming/outgoing calls.
 * @module lsp/call-hierarchy/provider
 */
import type { Location, Position, LSPDocument, Range } from "../types";
import { SymbolKind } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export interface CallHierarchyItem { name: string; kind: SymbolKind; uri: string; range: Range; selectionRange: Range; detail?: string; }
export interface CallHierarchyIncomingCall { from: CallHierarchyItem; fromRanges: Range[]; }
export interface CallHierarchyOutgoingCall { to: CallHierarchyItem; fromRanges: Range[]; }

export class CallHierarchyProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  prepareCallHierarchy(uri: string, position: Position): CallHierarchyItem[] {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return [];
    const word = this.docManager.getWordAtPosition(doc, position);
    if (!word) return [];
    for (let i = 0; i < doc.lines.length; i++) { if (new RegExp(`function\\s+${word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(doc.lines[i])) return [{ name: word.word, kind: SymbolKind.Function, uri, range: { start: { line: i, character: 0 }, end: { line: i, character: doc.lines[i].length } }, selectionRange: word.range, detail: "function" }]; }
    return [];
  }

  getIncomingCalls(item: CallHierarchyItem): CallHierarchyIncomingCall[] {
    const incoming: CallHierarchyIncomingCall[] = [];
    const esc = item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${esc}\\s*\\(`, "g");
    for (const doc of this.docManager.getAllDocuments()) { for (let i = 0; i < doc.lines.length; i++) { let m: RegExpExecArray | null; while ((m = regex.exec(doc.lines[i])) !== null) { const caller = this.findEnclosingFunction(doc, i); if (caller) incoming.push({ from: caller, fromRanges: [{ start: { line: i, character: m.index }, end: { line: i, character: m.index + item.name.length } }] }); } } }
    return incoming;
  }

  getOutgoingCalls(item: CallHierarchyItem): CallHierarchyOutgoingCall[] {
    const outgoing: CallHierarchyOutgoingCall[] = [];
    const doc = this.docManager.getDocument(item.uri);
    if (!doc) return outgoing;
    const callRegex = /\b(\w+)\s*\(/g;
    for (let i = item.range.start.line; i < doc.lines.length; i++) { let m: RegExpExecArray | null; while ((m = callRegex.exec(doc.lines[i])) !== null) { if (["if","for","while","switch","catch","function","return","typeof"].includes(m[1])) continue; const callee = this.findFuncDef(doc, m[1]); if (callee) outgoing.push({ to: callee, fromRanges: [{ start: { line: i, character: m.index }, end: { line: i, character: m.index + m[1].length } }] }); } }
    return outgoing;
  }

  private findEnclosingFunction(doc: LSPDocument, line: number): CallHierarchyItem | null {
    for (let i = line; i >= 0; i--) { const m = /function\s+(\w+)/.exec(doc.lines[i]); if (m) return { name: m[1], kind: SymbolKind.Function, uri: doc.uri, range: { start: { line: i, character: 0 }, end: { line: i, character: doc.lines[i].length } }, selectionRange: { start: { line: i, character: m.index }, end: { line: i, character: m.index + m[0].length } } }; }
    return null;
  }

  private findFuncDef(doc: LSPDocument, name: string): CallHierarchyItem | null {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (let i = 0; i < doc.lines.length; i++) { if (new RegExp(`function\\s+${esc}\\b`).test(doc.lines[i])) return { name, kind: SymbolKind.Function, uri: doc.uri, range: { start: { line: i, character: 0 }, end: { line: i, character: doc.lines[i].length } }, selectionRange: { start: { line: i, character: doc.lines[i].indexOf(name) }, end: { line: i, character: doc.lines[i].indexOf(name) + name.length } } }; }
    return null;
  }
}
export function createCallHierarchyProvider(docManager: DocumentSyncManager): CallHierarchyProvider { return new CallHierarchyProvider(docManager); }
