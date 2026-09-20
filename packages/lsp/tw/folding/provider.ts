/**
 * Folding Range Provider -- code folding ranges.
 * @module lsp/folding/provider
 */
import type { FoldingRange, LSPDocument } from "../types";
import { FoldingRangeKind } from "../types";
const VOID_ELEMENTS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);

export class FoldingProvider {
  getFoldingRanges(doc: LSPDocument): FoldingRange[] {
    return [...this.getTagFoldingRanges(doc), ...this.getCommentFoldingRanges(doc), ...this.getImportFoldingRanges(doc), ...this.getRegionFoldingRanges(doc)];
  }

  private getTagFoldingRanges(doc: LSPDocument): FoldingRange[] {
    const ranges: FoldingRange[] = []; const stack: Array<{ name: string; line: number }> = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const tagRegex = /<\/?([a-zA-Z][\w-]*)\b[^>]*?\/?>/g; let m: RegExpExecArray | null;
      while ((m = tagRegex.exec(doc.lines[i])) !== null) {
        const tag = m[1].toLowerCase(); const isClosing = m[0].startsWith("</"); const isSelfClosing = m[0].endsWith("/>") || VOID_ELEMENTS.has(tag);
        if (isClosing) { for (let j = stack.length - 1; j >= 0; j--) { if (stack[j].name === tag) { if (stack[j].line < i) ranges.push({ startLine: stack[j].line, endLine: i - 1 }); stack.splice(j, 1); break; } } }
        else if (!isSelfClosing) stack.push({ name: tag, line: i });
      }
    }
    return ranges;
  }

  private getCommentFoldingRanges(doc: LSPDocument): FoldingRange[] {
    const ranges: FoldingRange[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      if (doc.lines[i].trim().startsWith("<!--") && !doc.lines[i].trim().endsWith("-->")) {
        for (let j = i + 1; j < doc.lines.length; j++) { if (doc.lines[j].includes("-->")) { ranges.push({ startLine: i, endLine: j, kind: FoldingRangeKind.Comment }); break; } }
      }
    }
    return ranges;
  }

  private getImportFoldingRanges(doc: LSPDocument): FoldingRange[] {
    const ranges: FoldingRange[] = []; let start = -1; let last = -1;
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i].trim();
      if (line.startsWith("import ")) { if (start === -1) start = i; last = i; }
      else if (start !== -1 && line !== "" && !line.startsWith("//")) { if (last > start) ranges.push({ startLine: start, endLine: last, kind: FoldingRangeKind.Imports }); start = -1; }
    }
    return ranges;
  }

  private getRegionFoldingRanges(doc: LSPDocument): FoldingRange[] {
    const ranges: FoldingRange[] = []; const stack: number[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i].trim();
      if (/<!--\s*#region\b/.test(line) || /\/\/\s*#region\b/.test(line)) stack.push(i);
      if (/<!--\s*#endregion\b/.test(line) || /\/\/\s*#endregion\b/.test(line)) { if (stack.length > 0) { const s = stack.pop()!; if (s < i) ranges.push({ startLine: s, endLine: i, kind: FoldingRangeKind.Region }); } }
    }
    return ranges;
  }
}
export function createFoldingProvider(): FoldingProvider { return new FoldingProvider(); }
