/**
 * Signature Help Provider -- function parameter hints.
 * @module lsp/signature-help/provider
 */
import type { SignatureHelp, Position, LSPDocument } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

const BUILTIN_SIGS: Record<string, { label: string; params: Array<{ label: string; doc?: string }>; doc?: string }> = {
  filter: { label: "filter(callback: (item, index) => boolean)", params: [{ label: "callback", doc: "Function that returns true to keep the item" }], doc: "Filters array elements based on a predicate." },
  map: { label: "map(callback: (item, index) => unknown)", params: [{ label: "callback", doc: "Transform function applied to each item" }], doc: "Transforms each element of an array." },
  reduce: { label: "reduce(callback: (acc, item, index) => unknown, initial: unknown)", params: [{ label: "callback", doc: "Reducer function" }, { label: "initial", doc: "Initial accumulator value" }], doc: "Reduces an array to a single value." },
  forEach: { label: "forEach(callback: (item, index) => void)", params: [{ label: "callback", doc: "Function to execute for each element" }] },
  find: { label: "find(callback: (item, index) => boolean)", params: [{ label: "callback", doc: "Predicate function" }] },
  some: { label: "some(callback: (item) => boolean)", params: [{ label: "callback", doc: "Predicate function" }] },
  every: { label: "every(callback: (item) => boolean)", params: [{ label: "callback", doc: "Predicate function" }] },
  sort: { label: "sort(compareFn?: (a, b) => number)", params: [{ label: "compareFn", doc: "Optional comparison function" }] },
  slice: { label: "slice(start?: number, end?: number)", params: [{ label: "start", doc: "Start index" }, { label: "end", doc: "End index" }] },
  join: { label: "join(separator?: string)", params: [{ label: "separator", doc: "Separator string" }] },
  includes: { label: "includes(searchElement: unknown, fromIndex?: number)", params: [{ label: "searchElement", doc: "Element to search for" }] },
};

export class SignatureHelpProvider {
  private docManager: DocumentSyncManager;
  private customSigs: Record<string, { label: string; params: Array<{ label: string; doc?: string }>; doc?: string }> = {};
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getSignatureHelp(uri: string, position: Position): SignatureHelp | null {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return null;
    const funcInfo = this.findFunctionAtPosition(doc, position);
    if (!funcInfo) return null;
    const sig = this.customSigs[funcInfo.name] ?? BUILTIN_SIGS[funcInfo.name];
    if (!sig) return null;
    return { signatures: [{ label: sig.label, documentation: sig.doc, parameters: sig.params.map(p => ({ label: p.label, documentation: p.doc })) }], activeSignature: 0, activeParameter: Math.min(funcInfo.paramIndex, sig.params.length - 1) };
  }

  private findFunctionAtPosition(doc: LSPDocument, position: Position): { name: string; paramIndex: number } | null {
    let parenDepth = 0; let funcName = ""; let paramIndex = 0;
    for (let i = position.line; i >= 0; i--) {
      const line = doc.lines[i]; const startChar = i === position.line ? position.character : line.length;
      for (let j = startChar - 1; j >= 0; j--) {
        const ch = line[j];
        if (ch === ")") parenDepth++;
        else if (ch === "(") { if (parenDepth === 0) { let nameEnd = j; let nameStart = j - 1; while (nameStart >= 0 && /[\w$.]/.test(line[nameStart])) nameStart--; funcName = line.slice(nameStart + 1, nameEnd).trim(); const dotIdx = funcName.lastIndexOf("."); if (dotIdx !== -1) funcName = funcName.slice(dotIdx + 1); return { name: funcName, paramIndex: Math.max(0, paramIndex) }; } parenDepth--; }
        else if (ch === "," && parenDepth === 0) paramIndex++;
      }
    }
    return null;
  }

  addSignature(name: string, sig: { label: string; params: Array<{ label: string; doc?: string }>; doc?: string }): void { this.customSigs[name] = sig; }
}
export function createSignatureHelpProvider(docManager: DocumentSyncManager): SignatureHelpProvider { return new SignatureHelpProvider(docManager); }
