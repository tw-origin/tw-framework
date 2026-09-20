/**
 * Code Formatter -- formats TW files with configurable indentation.
 * @module lsp/format/formatter
 */
import type { TextEdit, Range, FormattingOptions, LSPDocument } from "../types";

export interface FormatterConfig {
  tabSize?: number; insertSpaces?: boolean; maxLineLength?: number;
  sortAttributes?: boolean; trimTrailingWhitespace?: boolean; ensureFinalNewline?: boolean;
}
const DEFAULT_CONFIG: Required<FormatterConfig> = { tabSize: 2, insertSpaces: true, maxLineLength: 120, sortAttributes: false, trimTrailingWhitespace: true, ensureFinalNewline: true };
const VOID_ELEMENTS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);

export class CodeFormatter {
  private config: Required<FormatterConfig>;
  constructor(config: FormatterConfig = {}) { this.config = { ...DEFAULT_CONFIG, ...config }; }

  formatDocument(doc: LSPDocument, options?: FormattingOptions): TextEdit[] {
    const cfg = options ? { ...this.config, tabSize: options.tabSize, insertSpaces: options.insertSpaces } : this.config;
    const formatted = this.formatContent(doc.content, cfg);
    return [{ range: { start: { line: 0, character: 0 }, end: { line: doc.lines.length - 1, character: doc.lines[doc.lines.length - 1]?.length ?? 0 } }, newText: formatted }];
  }

  formatRange(doc: LSPDocument, range: Range, options?: FormattingOptions): TextEdit[] {
    const cfg = options ? { ...this.config, tabSize: options.tabSize, insertSpaces: options.insertSpaces } : this.config;
    const lines = doc.lines.slice(range.start.line, range.end.line + 1);
    const formatted = this.formatContent(lines.join("\n"), cfg);
    return [{ range, newText: formatted }];
  }

  private formatContent(content: string, cfg: Required<FormatterConfig>): string {
    const indent = cfg.insertSpaces ? " ".repeat(cfg.tabSize) : "\t";
    const lines = content.split("\n");
    const formatted: string[] = [];
    let depth = 0; let inScript = false; let inStyle = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/<script\b/i.test(trimmed)) inScript = true;
      if (/<style\b/i.test(trimmed)) inStyle = true;
      if (/<\/script>/i.test(trimmed)) inScript = false;
      if (/<\/style>/i.test(trimmed)) inStyle = false;
      if (inScript || inStyle) { formatted.push(indent.repeat(depth) + trimmed); continue; }
      if (trimmed.startsWith("</") || trimmed.startsWith(":else") || trimmed.startsWith(":elif")) depth = Math.max(0, depth - 1);
      if (trimmed.length > 0) formatted.push(indent.repeat(depth) + trimmed); else formatted.push("");
      const openingTag = trimmed.match(/^<([a-zA-Z][\w-]*)\b[^>]*>/);
      if (openingTag) { const tag = openingTag[1].toLowerCase(); const selfClosing = trimmed.endsWith("/>") || VOID_ELEMENTS.has(tag); if (!selfClosing && !trimmed.startsWith("</")) depth++; }
      if (/^<(if|for|each|component|template|slot)\b/i.test(trimmed) && !trimmed.includes("</")) depth++;
    }
    if (cfg.trimTrailingWhitespace) for (let i = 0; i < formatted.length; i++) formatted[i] = formatted[i].replace(/\s+$/, "");
    if (cfg.ensureFinalNewline && formatted[formatted.length - 1] !== "") formatted.push("");
    return formatted.join("\n");
  }

  updateConfig(config: Partial<FormatterConfig>): void { this.config = { ...this.config, ...config }; }
}
export function createFormatter(config?: FormatterConfig): CodeFormatter { return new CodeFormatter(config); }
