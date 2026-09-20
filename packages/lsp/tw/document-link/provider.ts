/**
 * Document Link Provider -- clickable links for imports and assets.
 * @module lsp/document-link/provider
 */
import type { DocumentLink, LSPDocument } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export class DocumentLinkProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getDocumentLinks(uri: string): DocumentLink[] {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return [];
    const links: DocumentLink[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];
      const patterns: Array<[RegExp, string]> = [
        [/import\s+(?:[\w{},\s]+)\s+from\s+["']([^"']+)["']/g, "import"],
        [/\bsrc\s*=\s*["']([^"']+)["']/g, "src"],
        [/\bhref\s*=\s*["']([^"']+)["']/g, "href"],
        [/@import\s+["']([^"']+)["']/g, "css-import"],
        [/url\s*\(\s*["']([^"']+)["']\s*\)/g, "url"],
      ];
      for (const [regex, type] of patterns) {
        let m: RegExpExecArray | null;
        while ((m = regex.exec(line)) !== null) {
          const path = m[1];
          if (path.startsWith(".") || path.startsWith("@") || type === "import") {
            const pathStart = m.index + m[0].indexOf('"') + 1;
            links.push({ range: { start: { line: i, character: pathStart }, end: { line: i, character: pathStart + path.length } }, target: this.resolvePath(path, uri), tooltip: "Open file" });
          }
        }
      }
    }
    return links;
  }

  resolveLink(link: DocumentLink): string | undefined { return link.target; }

  private resolvePath(path: string, baseUri: string): string {
    if (path.startsWith("@/")) return "file:///src/" + path.slice(2);
    if (path.startsWith(".")) { const baseDir = baseUri.slice(0, baseUri.lastIndexOf("/")); return new URL(path, baseDir + "/").toString(); }
    return path;
  }
}
export function createDocumentLinkProvider(docManager: DocumentSyncManager): DocumentLinkProvider { return new DocumentLinkProvider(docManager); }
