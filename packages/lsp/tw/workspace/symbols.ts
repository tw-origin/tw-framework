/**
 * Workspace Symbol Provider -- document and workspace symbol search.
 * @module lsp/workspace/symbols
 */
import type { DocumentSymbol, SymbolInformation, LSPDocument } from "../types";
import { SymbolKind } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export class WorkspaceSymbolProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getDocumentSymbols(uri: string): DocumentSymbol[] {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return [];
    const symbols: DocumentSymbol[] = [];
    // Round 4: collect ALL script blocks (the old first-match-only regex
    // lost every script after the first).
    const scriptMatches = [...doc.content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
    const scriptMatch = scriptMatches.length
      ? ([scriptMatches.map((m: any) => m[1]).join('\n')] as any)
      : null;
    const scriptContent = scriptMatch ? scriptMatch[0] : '';
    if (scriptMatch) symbols.push(...this.parseScriptSymbols(scriptContent, this.findScriptStart(doc)));
    symbols.push(...this.parseTemplateSymbols(doc));
    return symbols;
  }

  searchWorkspaceSymbols(query: string): SymbolInformation[] {
    const results: SymbolInformation[] = []; const q = query.toLowerCase();
    for (const doc of this.docManager.getAllDocuments()) {
      for (const sym of this.getDocumentSymbols(doc.uri)) {
        if (sym.name.toLowerCase().includes(q)) results.push({ name: sym.name, kind: sym.kind, location: { uri: doc.uri, range: sym.selectionRange } });
      }
    }
    return results;
  }

  private parseScriptSymbols(content: string, baseLine: number): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = []; const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]; const ln = baseLine + i;
      const vm = /(?:const|let|var)\s+(\w+)/.exec(line); if (vm) symbols.push({ name: vm[1], kind: SymbolKind.Variable, range: { start: { line: ln, character: 0 }, end: { line: ln, character: line.length } }, selectionRange: { start: { line: ln, character: vm.index }, end: { line: ln, character: vm.index + vm[0].length } } });
      const fm = /function\s+(\w+)/.exec(line); if (fm) symbols.push({ name: fm[1], kind: SymbolKind.Function, range: { start: { line: ln, character: 0 }, end: { line: ln, character: line.length } }, selectionRange: { start: { line: ln, character: fm.index }, end: { line: ln, character: fm.index + fm[0].length } } });
      const cm = /class\s+(\w+)/.exec(line); if (cm) symbols.push({ name: cm[1], kind: SymbolKind.Class, range: { start: { line: ln, character: 0 }, end: { line: ln, character: line.length } }, selectionRange: { start: { line: ln, character: cm.index }, end: { line: ln, character: cm.index + cm[0].length } } });
    }
    return symbols;
  }

  private parseTemplateSymbols(doc: LSPDocument): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];
      const cm = /<component\s+name=["'](\w+)["']/.exec(line); if (cm) symbols.push({ name: cm[1], kind: SymbolKind.Class, range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } }, selectionRange: { start: { line: i, character: cm.index }, end: { line: i, character: cm.index + cm[0].length } } });
      const sm = /<slot\s+name=["'](\w+)["']/.exec(line); if (sm) symbols.push({ name: `slot:${sm[1]}`, kind: SymbolKind.Property, range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } }, selectionRange: { start: { line: i, character: sm.index }, end: { line: i, character: sm.index + sm[0].length } } });
    }
    return symbols;
  }

  private findScriptStart(doc: LSPDocument): number { for (let i = 0; i < doc.lines.length; i++) if (/<script\b/i.test(doc.lines[i])) return i + 1; return 0; }
}
export function createWorkspaceSymbolProvider(docManager: DocumentSyncManager): WorkspaceSymbolProvider { return new WorkspaceSymbolProvider(docManager); }
