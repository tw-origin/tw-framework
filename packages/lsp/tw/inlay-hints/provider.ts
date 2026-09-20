/**
 * Inlay Hints Provider -- inline type/parameter annotations.
 * @module lsp/inlay-hints/provider
 */
import type { Position, LSPDocument, Range } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export enum InlayHintKind { Type = 1, Parameter = 2, Information = 3 }
export interface InlayHint { position: Position; label: string; kind?: InlayHintKind; paddingLeft?: boolean; paddingRight?: boolean; tooltip?: string; }

const TYPE_INFERENCE: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /=\s*["'`]/, type: "string" }, { pattern: /=\s*\d+/, type: "number" },
  { pattern: /=\s*true\b/, type: "boolean" }, { pattern: /=\s*false\b/, type: "boolean" },
  { pattern: /=\s*null\b/, type: "null" }, { pattern: /=\s*undefined\b/, type: "undefined" },
  { pattern: /=\s*\{/, type: "object" }, { pattern: /=\s*\[/, type: "array" },
  { pattern: /=\s*\(\)\s*=>/, type: "function" }, { pattern: /=\s*async\s*\(/, type: "Promise" },
];

export class InlayHintsProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getInlayHints(uri: string, range: Range): InlayHint[] {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return [];
    const hints: InlayHint[] = [];
    for (let i = range.start.line; i <= range.end.line && i < doc.lines.length; i++) {
      const line = doc.lines[i];
      const varRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(.+)/g; let m: RegExpExecArray | null;
      while ((m = varRegex.exec(line)) !== null) {
        const type = this.inferType(m[2].trim());
        if (type) { const pos = line.indexOf(m[1]) + m[1].length; hints.push({ position: { line: i, character: pos }, label: `: ${type}`, kind: InlayHintKind.Type, tooltip: `Inferred type: ${type}` }); }
      }
    }
    return hints;
  }

  private inferType(value: string): string | null { for (const { pattern, type } of TYPE_INFERENCE) if (pattern.test(value)) return type; return null; }
}
export function createInlayHintsProvider(docManager: DocumentSyncManager): InlayHintsProvider { return new InlayHintsProvider(docManager); }
