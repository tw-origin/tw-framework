/**
 * File Operations Provider -- handles file rename/delete with import updates.
 * @module lsp/file-operations/provider
 */
import type { WorkspaceEdit, TextEdit } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export interface FileRenameParams { oldUri: string; newUri: string; }
export interface FileCreateParams { uri: string; }
export interface FileDeleteParams { uri: string; }

export class FileOperationsProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  willRenameFiles(params: FileRenameParams[]): WorkspaceEdit {
    const changes: Record<string, TextEdit[]> = {};
    const oldBaseName = this.uriToPath(params[0].oldUri).split("/").pop() ?? "";
    const newBaseName = this.uriToPath(params[0].newUri).split("/").pop() ?? "";
    for (const doc of this.docManager.getAllDocuments()) {
      const edits: TextEdit[] = [];
      for (let i = 0; i < doc.lines.length; i++) {
        const importRegex = /import\s+(?:[\w{},\s]+)\s+from\s+["']([^"']+)["']/g; let m: RegExpExecArray | null;
        while ((m = importRegex.exec(doc.lines[i])) !== null) {
          if (m[1].includes(oldBaseName)) { const start = m.index + m[0].indexOf('"') + 1; edits.push({ range: { start: { line: i, character: start }, end: { line: i, character: start + m[1].length } }, newText: m[1].replace(oldBaseName, newBaseName) }); }
        }
      }
      if (edits.length > 0) changes[doc.uri] = edits;
    }
    return { changes };
  }

  willDeleteFiles(params: FileDeleteParams[]): WorkspaceEdit {
    const changes: Record<string, TextEdit[]> = {};
    for (const param of params) {
      const deletedName = this.uriToPath(param.uri).split("/").pop() ?? "";
      for (const doc of this.docManager.getAllDocuments()) {
        const edits: TextEdit[] = [];
        for (let i = 0; i < doc.lines.length; i++) { const importRegex = /import\s+(?:[\w{},\s]+)\s+from\s+["']([^"']+)["']/g; let m: RegExpExecArray | null; while ((m = importRegex.exec(doc.lines[i])) !== null) { if (m[1].includes(deletedName)) edits.push({ range: { start: { line: i, character: 0 }, end: { line: i, character: doc.lines[i].length } }, newText: "" }); } }
        if (edits.length > 0) changes[doc.uri] = edits;
      }
    }
    return { changes };
  }

  didCreateFiles(_params: FileCreateParams[]): void { /* trigger re-indexing */ }
  private uriToPath(uri: string): string { try { return decodeURIComponent(new URL(uri).pathname); } catch { return uri; } }
}
export function createFileOperationsProvider(docManager: DocumentSyncManager): FileOperationsProvider { return new FileOperationsProvider(docManager); }
