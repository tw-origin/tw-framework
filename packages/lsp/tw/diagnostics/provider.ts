/**
 * Diagnostics Provider -- analyzes TW files and produces diagnostics.
 * @module lsp/diagnostics/provider
 */
import type { Diagnostic, Range, LSPDocument } from "../types";
import { DiagnosticSeverity, DiagnosticTag } from "../types";

export interface DiagnosticRule { id: string; name: string; severity: DiagnosticSeverity; enabled: boolean; description: string; }

const BUILTIN_RULES: DiagnosticRule[] = [
  { id: "TW001", name: "unclosed-tag", severity: DiagnosticSeverity.Error, enabled: true, description: "Unclosed HTML tag" },
  { id: "TW002", name: "mismatched-tag", severity: DiagnosticSeverity.Error, enabled: true, description: "Mismatched opening/closing tag" },
  { id: "TW003", name: "missing-key", severity: DiagnosticSeverity.Warning, enabled: true, description: "Missing :key in list rendering" },
  { id: "TW004", name: "deprecated-directive", severity: DiagnosticSeverity.Warning, enabled: true, description: "Deprecated directive usage" },
  { id: "TW005", name: "empty-attribute", severity: DiagnosticSeverity.Hint, enabled: true, description: "Empty attribute value" },
  { id: "TW006", name: "invalid-expression", severity: DiagnosticSeverity.Error, enabled: true, description: "Invalid expression syntax" },
  { id: "TW007", name: "missing-alt", severity: DiagnosticSeverity.Warning, enabled: true, description: "Missing alt attribute on img" },
  { id: "TW008", name: "duplicate-attribute", severity: DiagnosticSeverity.Error, enabled: true, description: "Duplicate attribute on element" },
  { id: "TW009", name: "void-element-content", severity: DiagnosticSeverity.Error, enabled: true, description: "Content inside void element" },
  { id: "TW010", name: "unescaped-brace", severity: DiagnosticSeverity.Warning, enabled: true, description: "Unescaped { in text content" },
  { id: "TW011", name: "invalid-directive-value", severity: DiagnosticSeverity.Error, enabled: true, description: "Invalid directive value" },
  { id: "TW014", name: "undefined-variable", severity: DiagnosticSeverity.Error, enabled: true, description: "Undefined variable reference" },
  { id: "TW015", name: "unused-variable", severity: DiagnosticSeverity.Hint, enabled: true, description: "Unused variable" },
  { id: "TW018", name: "hardcoded-string", severity: DiagnosticSeverity.Hint, enabled: true, description: "Hardcoded string -- consider i18n" },
  { id: "TW020", name: "missing-lang", severity: DiagnosticSeverity.Warning, enabled: true, description: "Missing lang attribute on html element" },
];

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const DEPRECATED_DIRECTIVES = new Set(["v-text", "v-html", "v-bind.sync"]);

function makeRange(sl: number, sc: number, el: number, ec: number): Range { return { start: { line: sl, character: sc }, end: { line: el, character: ec } }; }

export class DiagnosticsProvider {
  private rules: Map<string, DiagnosticRule>;
  private customChecks: Array<(doc: LSPDocument) => Diagnostic[]> = [];

  constructor() { this.rules = new Map(BUILTIN_RULES.map(r => [r.id, r])); }

  analyze(doc: LSPDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      diagnostics.push(...this.runRule(doc, rule));
    }
    for (const check of this.customChecks) { try { diagnostics.push(...check(doc)); } catch { /* ignore */ } }
    return diagnostics;
  }

  private runRule(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    switch (rule.id) {
      case "TW001": return this.checkUnclosedTags(doc, rule);
      case "TW003": return this.checkMissingKey(doc, rule);
      case "TW004": return this.checkDeprecatedDirectives(doc, rule);
      case "TW005": return this.checkEmptyAttributes(doc, rule);
      case "TW006": return this.checkInvalidExpressions(doc, rule);
      case "TW007": return this.checkMissingAlt(doc, rule);
      case "TW008": return this.checkDuplicateAttributes(doc, rule);
      case "TW009": return this.checkVoidElementContent(doc, rule);
      case "TW010": return this.checkUnescapedBrace(doc, rule);
      case "TW018": return this.checkHardcodedStrings(doc, rule);
      case "TW020": return this.checkMissingLang(doc, rule);
      default: return [];
    }
  }

  private checkUnclosedTags(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    const results: Diagnostic[] = [];
    const tagStack: Array<{ name: string; line: number; char: number }> = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];
      const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?\/?>/g;
      let match: RegExpExecArray | null;
      while ((match = tagRegex.exec(line)) !== null) {
        const fullMatch = match[0]; const tagName = match[1].toLowerCase();
        const isClosing = fullMatch.startsWith("</");
        const isSelfClosing = fullMatch.endsWith("/>") || VOID_ELEMENTS.has(tagName);
        if (isClosing) {
          if (tagStack.length === 0 || tagStack[tagStack.length - 1].name !== tagName) {
            results.push({ range: makeRange(i, match.index, i, match.index + fullMatch.length), severity: rule.severity, code: rule.id, source: "tw-lsp", message: `Mismatched closing tag: </${tagName}>` });
          } else { tagStack.pop(); }
        } else if (!isSelfClosing) { tagStack.push({ name: tagName, line: i, char: match.index }); }
      }
    }
    for (const tag of tagStack) {
      results.push({ range: makeRange(tag.line, tag.char, tag.line, tag.char + tag.name.length + 1), severity: rule.severity, code: rule.id, source: "tw-lsp", message: `Unclosed tag: <${tag.name}>` });
    }
    return results;
  }

  private checkMissingKey(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    const results: Diagnostic[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const forRegex = /<(?:for|ForEach)\b([^>]*)>/gi;
      let match: RegExpExecArray | null;
      while ((match = forRegex.exec(doc.lines[i])) !== null) {
        if (!/:\s*key\s*=/.test(match[1]) && !/\bkey\s*=/.test(match[1])) {
          results.push({ range: makeRange(i, match.index, i, match.index + match[0].length), severity: rule.severity, code: rule.id, source: "tw-lsp", message: "Missing :key attribute in list rendering" });
        }
      }
    }
    return results;
  }

  private checkDeprecatedDirectives(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    const results: Diagnostic[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const directiveRegex = /(@|:|v-)(\w[\w-]*)/g;
      let match: RegExpExecArray | null;
      while ((match = directiveRegex.exec(doc.lines[i])) !== null) {
        if (DEPRECATED_DIRECTIVES.has(match[0])) {
          results.push({ range: makeRange(i, match.index, i, match.index + match[0].length), severity: rule.severity, code: rule.id, source: "tw-lsp", message: `Deprecated directive: ${match[0]}`, tags: [DiagnosticTag.Deprecated] });
        }
      }
    }
    return results;
  }

  private checkEmptyAttributes(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    const results: Diagnostic[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const attrRegex = /(\w[\w-]*)\s*=\s*['"]['"]/g;
      let match: RegExpExecArray | null;
      while ((match = attrRegex.exec(doc.lines[i])) !== null) {
        results.push({ range: makeRange(i, match.index, i, match.index + match[0].length), severity: rule.severity, code: rule.id, source: "tw-lsp", message: `Empty attribute: ${match[1]}` });
      }
    }
    return results;
  }

  private checkInvalidExpressions(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    const results: Diagnostic[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const exprRegex = /\{\{([^}]*)\}\}/g;
      let match: RegExpExecArray | null;
      while ((match = exprRegex.exec(doc.lines[i])) !== null) {
        const expr = match[1].trim();
        if (!expr) { results.push({ range: makeRange(i, match.index, i, match.index + match[0].length), severity: rule.severity, code: rule.id, source: "tw-lsp", message: "Empty expression in {{}}" }); continue; }
        let pc = 0, bc = 0, cc = 0;
        for (const ch of expr) { if (ch === "(") pc++; if (ch === ")") pc--; if (ch === "[") bc++; if (ch === "]") bc--; if (ch === "{") cc++; if (ch === "}") cc--; }
        if (pc !== 0 || bc !== 0 || cc !== 0) {
          results.push({ range: makeRange(i, match.index, i, match.index + match[0].length), severity: rule.severity, code: rule.id, source: "tw-lsp", message: `Unbalanced brackets in expression: ${expr}` });
        }
      }
    }
    return results;
  }

  private checkMissingAlt(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    const results: Diagnostic[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const imgRegex = /<img\b([^>]*)>/gi;
      let match: RegExpExecArray | null;
      while ((match = imgRegex.exec(doc.lines[i])) !== null) {
        if (!/\balt\s*=/.test(match[1])) {
          results.push({ range: makeRange(i, match.index, i, match.index + match[0].length), severity: rule.severity, code: rule.id, source: "tw-lsp", message: "Missing alt attribute on <img>" });
        }
      }
    }
    return results;
  }

  private checkDuplicateAttributes(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    const results: Diagnostic[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const tagRegex = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
      let match: RegExpExecArray | null;
      while ((match = tagRegex.exec(doc.lines[i])) !== null) {
        const attrsStr = match[2]; const attrRegex = /(\w[\w-]*)\s*=/g; const seen = new Set<string>();
        let attrMatch: RegExpExecArray | null;
        while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
          const attrName = attrMatch[1].toLowerCase();
          if (seen.has(attrName)) { results.push({ range: makeRange(i, match.index + attrMatch.index, i, match.index + attrMatch.index + attrMatch[0].length), severity: rule.severity, code: rule.id, source: "tw-lsp", message: `Duplicate attribute: ${attrName}` }); }
          seen.add(attrName);
        }
      }
    }
    return results;
  }

  private checkVoidElementContent(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    const results: Diagnostic[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const voidRegex = /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b([^>]*?)>([^<]+)/gi;
      let match: RegExpExecArray | null;
      while ((match = voidRegex.exec(doc.lines[i])) !== null) {
        if (match[3].trim()) { results.push({ range: makeRange(i, match.index + match[0].indexOf(">") + 1, i, match.index + match[0].length), severity: rule.severity, code: rule.id, source: "tw-lsp", message: `Content inside void element <${match[1]}>` }); }
      }
    }
    return results;
  }

  private checkUnescapedBrace(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    const results: Diagnostic[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];
      const braceRegex = /(?<!\{)\{(?!\{)/g;
      let match: RegExpExecArray | null;
      while ((match = braceRegex.exec(line)) !== null) {
        const before = line.slice(0, match.index); const lastLt = before.lastIndexOf("<"); const lastGt = before.lastIndexOf(">");
        if (lastLt > lastGt) continue;
        results.push({ range: makeRange(i, match.index, i, match.index + 1), severity: rule.severity, code: rule.id, source: "tw-lsp", message: "Unescaped { in text content -- use {{ for expressions" });
      }
    }
    return results;
  }

  private checkHardcodedStrings(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    const results: Diagnostic[] = [];
    for (let i = 0; i < doc.lines.length; i++) {
      if (/<(script|style)\b/i.test(doc.lines[i])) continue;
      const textRegex = />([^<{}]+)</g;
      let match: RegExpExecArray | null;
      while ((match = textRegex.exec(doc.lines[i])) !== null) {
        const text = match[1].trim();
        if (text.length > 10 && /^[A-Z]/.test(text) && !text.includes("$")) {
          results.push({ range: makeRange(i, match.index + 1, i, match.index + match[0].length - 1), severity: rule.severity, code: rule.id, source: "tw-lsp", message: `Hardcoded string: "${text.slice(0, 30)}" -- consider using i18n` });
        }
      }
    }
    return results;
  }

  private checkMissingLang(doc: LSPDocument, rule: DiagnosticRule): Diagnostic[] {
    for (let i = 0; i < Math.min(doc.lines.length, 10); i++) {
      const htmlTagMatch = /<html\b([^>]*)>/i.exec(doc.lines[i]);
      if (htmlTagMatch && !/\blang\s*=/.test(htmlTagMatch[1])) {
        return [{ range: makeRange(i, htmlTagMatch.index, i, htmlTagMatch.index + htmlTagMatch[0].length), severity: rule.severity, code: rule.id, source: "tw-lsp", message: "Missing lang attribute on <html>" }];
      }
    }
    return [];
  }

  setRuleEnabled(ruleId: string, enabled: boolean): void { const r = this.rules.get(ruleId); if (r) r.enabled = enabled; }
  addCustomCheck(check: (doc: LSPDocument) => Diagnostic[]): void { this.customChecks.push(check); }
  getRules(): DiagnosticRule[] { return Array.from(this.rules.values()); }
  getEnabledRules(): DiagnosticRule[] { return Array.from(this.rules.values()).filter(r => r.enabled); }
}

export function createDiagnosticsProvider(): DiagnosticsProvider { return new DiagnosticsProvider(); }
