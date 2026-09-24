/**
 * Code Lens Provider -- clickable code lenses with reference counts.
 * @module lsp/code-lens/provider
 */
import type { CodeLens, LSPDocument, Range, Command } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

// Round 4: strip comments before counting references -- mentions inside
// comments used to inflate the code-lens counts.
function stripLineComments(src: string): string {
  return src.split("\n").map(function (l) { return l.replace(/(^|\s)\/\/.*$/, ""); }).join("\n");
}

export class CodeLensProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getCodeLenses(uri: string): CodeLens[] {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return [];
    const lenses: CodeLens[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];
      const fm = /function\s+(\w+)/.exec(line);
      if (fm) { let count = this.countRefs(doc, fm[1]); lenses.push({ range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } }, command: { title: `${count} reference${count !== 1 ? "s" : ""}`, command: "tw.showReferences", arguments: [doc.uri, { line: i, character: fm.index }] } }); }
      const cm = /<component\s+name=["'](\w+)["']/.exec(line);
      if (cm) { const count = this.countComponentUsage(doc, cm[1]); lenses.push({ range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } }, command: { title: `${count} usage${count !== 1 ? "s" : ""}`, command: "tw.showComponentUsage", arguments: [cm[1]] } }); }
    }
    return lenses;
  }

  private countRefs(doc: LSPDocument, symbol: string): number {
    let count = 0; const esc = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${esc}\\b`, "g");
    for (const d of this.docManager.getAllDocuments()) { const m = stripLineComments(d.content).match(regex); if (m) count += m.length - 1; }
    return Math.max(0, count);
  }

  private countComponentUsage(doc: LSPDocument, name: string): number {
    let count = 0; const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`<${esc}\\b`, "g");
    for (const d of this.docManager.getAllDocuments()) { const m = stripLineComments(d.content).match(regex); if (m) count += m.length; }
    return count;
  }
}
export function createCodeLensProvider(docManager: DocumentSyncManager): CodeLensProvider { return new CodeLensProvider(docManager); }
